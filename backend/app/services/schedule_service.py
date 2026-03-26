from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from threading import Lock, Thread
from time import sleep
from uuid import uuid4
from typing import Any
from zoneinfo import ZoneInfo

from backend.app.logging_utils import get_logger
from backend.app.lotteries import normalize_lottery_code
from backend.app.repositories.schedule_repository import ScheduleRepository
from backend.app.services.lottery_fetch_task_service import lottery_fetch_task_service
from backend.app.services.prediction_generation_service import PredictionGenerationService
from backend.app.services.prediction_generation_task_service import prediction_generation_task_service


TIME_OF_DAY_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
CRON_FIELD_PATTERN = re.compile(r"^\*|\d+(?:-\d+)?(?:/\d+)?(?:,\d+(?:-\d+)?(?:/\d+)?)*|\*/\d+$")
WEEKDAY_LABELS = {0: "周一", 1: "周二", 2: "周三", 3: "周四", 4: "周五", 5: "周六", 6: "周日"}
BEIJING_TIMEZONE = ZoneInfo("Asia/Shanghai")
UTC = timezone.utc


class ScheduleService:
    def __init__(
        self,
        repository: ScheduleRepository | None = None,
        prediction_generation_service: PredictionGenerationService | None = None,
    ) -> None:
        self.repository = repository or ScheduleRepository()
        self.prediction_generation_service = prediction_generation_service or PredictionGenerationService()
        self.logger = get_logger("services.schedule")
        self._thread: Thread | None = None
        self._lock = Lock()
        self._started = False

    def start(self) -> None:
        with self._lock:
            if self._started:
                return
            self._refresh_active_task_next_runs()
            self._thread = Thread(target=self._loop, daemon=True)
            self._thread.start()
            self._started = True

    def list_tasks(self) -> list[dict[str, Any]]:
        return [self._decorate_task(task) for task in self.repository.list_tasks()]

    def get_task(self, task_code: str) -> dict[str, Any]:
        task = self.repository.get_task(task_code)
        if not task:
            raise KeyError(task_code)
        return self._decorate_task(task)

    def create_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_payload(payload, task_code=uuid4().hex[:12])
        return self._decorate_task(self.repository.create_task(normalized))

    def update_task(self, task_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = self._normalize_payload(payload, task_code=task_code)
        return self._decorate_task(self.repository.update_task(task_code, normalized))

    def set_task_active(self, task_code: str, is_active: bool) -> dict[str, Any]:
        task = self.get_task(task_code)
        next_run_at = self._compute_next_run(task, base_time=self._utc_now()) if is_active else None
        return self._decorate_task(self.repository.set_task_active(task_code, is_active, self._format_datetime(next_run_at)))

    def delete_task(self, task_code: str) -> None:
        self.repository.delete_task(task_code)

    def run_task_now(self, task_code: str) -> dict[str, Any]:
        task = self.get_task(task_code)
        self._trigger_task(task, manual=True)
        return self.get_task(task_code)

    def _loop(self) -> None:
        while True:
            try:
                due_tasks = self.repository.list_due_tasks(self._utc_now().replace(tzinfo=None))
                for task in due_tasks:
                    self._trigger_task(task)
            except Exception:
                self.logger.exception("Scheduled task loop failed")
            sleep(15)

    def _trigger_task(self, task: dict[str, Any], manual: bool = False) -> None:
        now = self._utc_now()
        next_run_at = self._compute_next_run(task, base_time=now + timedelta(minutes=1)) if task.get("is_active") and not manual else (
            self._compute_next_run(task, base_time=now + timedelta(minutes=1)) if task.get("is_active") else None
        )
        self.repository.update_run_state(
            task["task_code"],
            {
                "last_run_at": self._format_datetime(now),
                "last_run_status": "queued",
                "last_error_message": None,
                "last_task_id": None,
                "next_run_at": self._format_datetime(next_run_at),
            },
        )

        def handle_update(state: dict[str, Any]) -> None:
            status = str(state.get("status") or "")
            self.repository.update_run_state(
                task["task_code"],
                {
                    "last_run_at": self._format_datetime(now),
                    "last_run_status": status,
                    "last_error_message": state.get("error_message"),
                    "last_task_id": state.get("task_id"),
                    "next_run_at": self._format_datetime(next_run_at),
                },
            )

        if task["task_type"] == "lottery_fetch":
            lottery_fetch_task_service.create_task(task["lottery_code"], trigger_type="schedule", on_update=handle_update)
            return

        model_codes = [str(code).strip() for code in task.get("model_codes") or [] if str(code).strip()]
        active_model_codes = self.prediction_generation_service.model_repository.list_active_model_codes()
        filtered_model_codes = [code for code in model_codes if code in active_model_codes]
        if filtered_model_codes != model_codes:
            refreshed_task = self.repository.set_task_model_codes(
                task["task_code"],
                filtered_model_codes,
                deactivate_if_empty=True,
            )
            task = refreshed_task
            model_codes = [str(code).strip() for code in task.get("model_codes") or [] if str(code).strip()]
        if not model_codes:
            self.repository.update_run_state(
                task["task_code"],
                {
                    "last_run_at": self._format_datetime(now),
                    "last_run_status": "skipped",
                    "last_error_message": "无可用启用模型，任务已自动停用",
                    "last_task_id": None,
                    "next_run_at": None,
                },
            )
            return

        prediction_generation_task_service.create_task(
            lottery_code=task["lottery_code"],
            mode=task.get("generation_mode") or "current",
            model_code="__bulk__",
            trigger_type="schedule",
            on_update=handle_update,
            worker=lambda progress_callback: self.prediction_generation_service.generate_for_models(
                lottery_code=task["lottery_code"],
                model_codes=model_codes,
                mode=task.get("generation_mode") or "current",
                prediction_play_mode=str(task.get("prediction_play_mode") or "direct"),
                overwrite=bool(task.get("overwrite_existing")),
                progress_callback=progress_callback,
            ),
        )

    def _normalize_payload(self, payload: dict[str, Any], *, task_code: str) -> dict[str, Any]:
        task_type = str(payload.get("task_type") or "").strip()
        if task_type not in {"lottery_fetch", "prediction_generate"}:
            raise ValueError("不支持的任务类型")
        task_name = str(payload.get("task_name") or "").strip()
        if not task_name:
            raise ValueError("任务名称不能为空")
        lottery_code = normalize_lottery_code(str(payload.get("lottery_code") or "dlt"))
        schedule_mode = str(payload.get("schedule_mode") or "").strip()
        if schedule_mode not in {"preset", "cron"}:
            raise ValueError("不支持的时间规则")
        generation_mode = str(payload.get("generation_mode") or "current").strip()
        if generation_mode != "current":
            raise ValueError("定时任务暂不支持历史重算")
        model_codes = list(dict.fromkeys(str(code).strip() for code in (payload.get("model_codes") or []) if str(code).strip()))
        if task_type == "prediction_generate" and not model_codes:
            raise ValueError("预测任务至少选择一个模型")
        prediction_play_mode = self._normalize_prediction_play_mode(
            payload.get("prediction_play_mode"),
            lottery_code=lottery_code,
            task_type=task_type,
        )
        preset_type = None
        time_of_day = None
        weekdays: list[int] = []
        cron_expression = None
        if schedule_mode == "preset":
            preset_type = str(payload.get("preset_type") or "").strip()
            if preset_type not in {"daily", "weekly"}:
                raise ValueError("固定时间表仅支持每日或每周")
            time_of_day = str(payload.get("time_of_day") or "").strip()
            if not TIME_OF_DAY_PATTERN.match(time_of_day):
                raise ValueError("执行时间格式应为 HH:MM")
            weekdays = sorted({int(value) for value in (payload.get("weekdays") or [])})
            if preset_type == "weekly" and not weekdays:
                raise ValueError("每周任务至少选择一个执行日")
            if any(value < 0 or value > 6 for value in weekdays):
                raise ValueError("周几配置无效")
        else:
            cron_expression = str(payload.get("cron_expression") or "").strip()
            self._validate_cron_expression(cron_expression)

        normalized = {
            "task_code": task_code,
            "task_name": task_name,
            "task_type": task_type,
            "lottery_code": lottery_code,
            "model_codes": model_codes,
            "generation_mode": generation_mode,
            "prediction_play_mode": prediction_play_mode,
            "overwrite_existing": bool(payload.get("overwrite_existing", False)),
            "schedule_mode": schedule_mode,
            "preset_type": preset_type,
            "time_of_day": time_of_day,
            "weekdays": weekdays,
            "cron_expression": cron_expression,
            "is_active": bool(payload.get("is_active", True)),
        }
        normalized["next_run_at"] = self._format_datetime(
            self._compute_next_run(normalized, base_time=self._utc_now()) if normalized["is_active"] else None
        )
        return normalized

    @staticmethod
    def _normalize_prediction_play_mode(
        prediction_play_mode: Any,
        *,
        lottery_code: str,
        task_type: str,
    ) -> str:
        if task_type != "prediction_generate":
            return "direct"
        normalized_mode = str(prediction_play_mode or "direct").strip().lower() or "direct"
        if lottery_code == "dlt":
            if normalized_mode not in {"direct", "dantuo"}:
                raise ValueError("大乐透预测模式仅支持 direct 或 dantuo")
            return normalized_mode
        if lottery_code != "pl3":
            if normalized_mode != "direct":
                raise ValueError("当前彩种预测模式仅支持 direct")
            return "direct"
        if normalized_mode not in {"direct", "direct_sum"}:
            raise ValueError("排列3预测模式仅支持 direct 或 direct_sum")
        return normalized_mode

    def _compute_next_run(self, task: dict[str, Any], *, base_time: datetime) -> datetime | None:
        if task.get("schedule_mode") == "preset":
            return self._compute_next_preset_run(task, base_time=base_time)
        return self._compute_next_cron_run(str(task.get("cron_expression") or ""), base_time=base_time)

    def _compute_next_preset_run(self, task: dict[str, Any], *, base_time: datetime) -> datetime:
        beijing_base_time = self._to_beijing_time(base_time)
        hour, minute = [int(value) for value in str(task.get("time_of_day") or "00:00").split(":")]
        candidate = beijing_base_time.replace(second=0, microsecond=0, hour=hour, minute=minute)
        if task.get("preset_type") == "daily":
            if candidate <= beijing_base_time.replace(second=0, microsecond=0):
                candidate += timedelta(days=1)
            return candidate.astimezone(UTC)

        weekdays = [int(value) for value in task.get("weekdays") or []]
        for offset in range(0, 8):
            probe = candidate + timedelta(days=offset)
            if probe.weekday() in weekdays and probe > beijing_base_time.replace(second=0, microsecond=0):
                return probe.astimezone(UTC)
        raise ValueError("无法计算下次执行时间")

    def _validate_cron_expression(self, expression: str) -> None:
        fields = expression.split()
        if len(fields) != 5:
            raise ValueError("Cron 表达式需要 5 段")
        ranges = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)]
        for field, (min_value, max_value) in zip(fields, ranges):
            self._parse_cron_values(field, min_value=min_value, max_value=max_value)

    def _compute_next_cron_run(self, expression: str, *, base_time: datetime) -> datetime:
        self._validate_cron_expression(expression)
        minute_values, hour_values, day_values, month_values, weekday_values = [
            self._parse_cron_values(field, min_value=min_value, max_value=max_value)
            for field, (min_value, max_value) in zip(expression.split(), [(0, 59), (0, 23), (1, 31), (1, 12), (0, 6)])
        ]
        probe = self._to_beijing_time(base_time).replace(second=0, microsecond=0) + timedelta(minutes=1)
        max_probe = probe + timedelta(days=366)
        while probe <= max_probe:
            if (
                probe.minute in minute_values
                and probe.hour in hour_values
                and probe.day in day_values
                and probe.month in month_values
                and probe.weekday() in weekday_values
            ):
                return probe.astimezone(UTC)
            probe += timedelta(minutes=1)
        raise ValueError("无法在一年内计算出下次执行时间")

    def _parse_cron_values(self, field: str, *, min_value: int, max_value: int) -> set[int]:
        field = field.strip()
        if not field:
            raise ValueError("Cron 表达式不能为空")
        if field == "*":
            return set(range(min_value, max_value + 1))
        values: set[int] = set()
        for chunk in field.split(","):
            chunk = chunk.strip()
            if not chunk:
                raise ValueError("Cron 表达式格式错误")
            if chunk.startswith("*/"):
                step = int(chunk[2:])
                if step <= 0:
                    raise ValueError("Cron 步长必须大于 0")
                values.update(range(min_value, max_value + 1, step))
                continue
            if "/" in chunk:
                range_part, step_part = chunk.split("/", 1)
                step = int(step_part)
                if step <= 0:
                    raise ValueError("Cron 步长必须大于 0")
                start, end = self._parse_cron_range(range_part, min_value=min_value, max_value=max_value)
                values.update(range(start, end + 1, step))
                continue
            start, end = self._parse_cron_range(chunk, min_value=min_value, max_value=max_value)
            values.update(range(start, end + 1))
        if not values:
            raise ValueError("Cron 表达式未命中有效值")
        return values

    @staticmethod
    def _parse_cron_range(field: str, *, min_value: int, max_value: int) -> tuple[int, int]:
        if field == "*":
            return min_value, max_value
        if "-" in field:
            start_text, end_text = field.split("-", 1)
            start, end = int(start_text), int(end_text)
        else:
            start = end = int(field)
        if start < min_value or end > max_value or start > end:
            raise ValueError("Cron 表达式超出允许范围")
        return start, end

    def _decorate_task(self, task: dict[str, Any]) -> dict[str, Any]:
        rule_summary = self._build_rule_summary(task)
        decorated = dict(task)
        decorated["rule_summary"] = rule_summary
        return decorated

    def _build_rule_summary(self, task: dict[str, Any]) -> str:
        if task.get("schedule_mode") == "cron":
            summary = f"Cron（北京时间）· {task.get('cron_expression') or '-'}"
            return self._append_prediction_play_mode(summary, task)
        time_of_day = task.get("time_of_day") or "--:--"
        if task.get("preset_type") == "weekly":
            weekdays = [WEEKDAY_LABELS.get(int(value), str(value)) for value in task.get("weekdays") or []]
            summary = f"每周 {' / '.join(weekdays)} {time_of_day}（北京时间）"
            return self._append_prediction_play_mode(summary, task)
        summary = f"每日 {time_of_day}（北京时间）"
        return self._append_prediction_play_mode(summary, task)

    @staticmethod
    def _append_prediction_play_mode(summary: str, task: dict[str, Any]) -> str:
        if task.get("task_type") != "prediction_generate":
            return summary
        lottery_code = str(task.get("lottery_code") or "dlt").strip().lower()
        play_mode = str(task.get("prediction_play_mode") or "direct").strip().lower()
        if lottery_code == "pl3":
            play_mode_label = "和值" if play_mode == "direct_sum" else "直选"
        elif lottery_code == "dlt":
            play_mode_label = "胆拖" if play_mode == "dantuo" else "普通"
        else:
            play_mode_label = "直选"
        return f"{summary} · {play_mode_label}"

    @staticmethod
    def _utc_now() -> datetime:
        return datetime.now(UTC)

    @staticmethod
    def _to_beijing_time(value: datetime) -> datetime:
        normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return normalized.astimezone(BEIJING_TIMEZONE)

    @staticmethod
    def _format_datetime(value: datetime | None) -> str | None:
        if not value:
            return None
        normalized = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
        return normalized.strftime("%Y-%m-%dT%H:%M:%SZ")

    def _refresh_active_task_next_runs(self) -> None:
        now = self._utc_now()
        for task in self.repository.list_tasks():
            if not task.get("is_active"):
                continue
            try:
                next_run_at = self._compute_next_run(task, base_time=now)
                self.repository.set_task_active(task["task_code"], True, self._format_datetime(next_run_at))
            except Exception:
                self.logger.exception(
                    "Refresh scheduled task next run failed",
                    extra={"context": {"task_code": task.get("task_code")}},
                )


schedule_service = ScheduleService()
