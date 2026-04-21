from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any, Callable
from uuid import uuid4

from backend.app.logging_utils import get_logger
from backend.app.lotteries import normalize_lottery_code
from backend.app.repositories.smart_prediction_repository import SmartPredictionRepository
from backend.app.services.prediction_generation_service import PredictionGenerationService
from backend.app.services.prediction_service import PredictionService
from backend.app.services.smart_prediction_task_service import SmartPredictionTaskService, smart_prediction_task_service
from backend.app.services.task_runner import TaskCancelledError

STAGE1_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "dlt_smart_stage1_prompt.md"
STAGE2_PROMPT_PATH = Path(__file__).resolve().parents[2] / "doc" / "dlt_smart_stage2_prompt.md"
SUPPORTED_HISTORY_PERIOD_COUNTS = {30, 50, 100}
SUPPORTED_STRATEGIES = [
    {"code": "hot", "label": "增强型热号追随者"},
    {"code": "cold", "label": "增强型冷号逆向者"},
    {"code": "balanced", "label": "增强型平衡策略师"},
    {"code": "cycle", "label": "增强型周期理论家"},
    {"code": "composite", "label": "增强型综合决策者"},
]
STRATEGY_LABEL_BY_CODE = {item["code"]: item["label"] for item in SUPPORTED_STRATEGIES}
STRATEGY_CODE_BY_LABEL = {item["label"]: item["code"] for item in SUPPORTED_STRATEGIES}


class SmartPredictionService:
    def __init__(
        self,
        *,
        repository: SmartPredictionRepository | None = None,
        prediction_service: PredictionService | None = None,
        prediction_generation_service: PredictionGenerationService | None = None,
        task_service: SmartPredictionTaskService | None = None,
    ) -> None:
        self.repository = repository or SmartPredictionRepository()
        self.prediction_service = prediction_service or PredictionService()
        self.prediction_generation_service = prediction_generation_service or PredictionGenerationService()
        self.task_service = task_service or smart_prediction_task_service
        self.logger = get_logger("services.smart_prediction")
        self._stage2_start_lock = Lock()

    @staticmethod
    def list_supported_strategies() -> list[dict[str, str]]:
        return [*SUPPORTED_STRATEGIES]

    def start_run(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        lottery_code = normalize_lottery_code(payload.get("lottery_code") or "dlt")
        if lottery_code != "dlt":
            raise ValueError("智能预测目前仅支持大乐透")

        data_model_codes = self._normalize_string_list(payload.get("data_model_codes"))
        if not data_model_codes:
            raise ValueError("至少选择一个数据模型")
        strategy_codes = self._normalize_strategy_codes(payload.get("strategy_codes"))
        history_period_count = self._normalize_history_period_count(payload.get("history_period_count"))

        stage1_model_code = str(payload.get("stage1_model_code") or "").strip()
        stage2_model_code = str(payload.get("stage2_model_code") or "").strip()
        if not stage1_model_code:
            raise ValueError("阶段1推理模型不能为空")
        if not stage2_model_code:
            raise ValueError("阶段2推理模型不能为空")
        self.prediction_generation_service.validate_model(stage1_model_code, lottery_code="dlt")
        self.prediction_generation_service.validate_model(stage2_model_code, lottery_code="dlt")

        options = {
            "include_trend": bool(payload.get("include_trend", True)),
            "include_scores": bool(payload.get("include_scores", True)),
            "auto_stage2": bool(payload.get("auto_stage2", True)),
            "retry_once": bool(payload.get("retry_once", True)),
            "strict_validation": bool(payload.get("strict_validation", True)),
        }

        current_payload = self.prediction_service.get_current_payload(lottery_code="dlt", include_inactive_models=False)
        target_period = str(current_payload.get("target_period") or "").strip()
        if not target_period:
            raise ValueError("当前目标期号不存在，无法发起智能预测")

        run_id = uuid4().hex
        self.logger.info(
            "Creating smart prediction run",
            extra={
                "context": {
                    "run_id": run_id,
                    "user_id": int(user_id),
                    "lottery_code": "dlt",
                    "stage1_model_code": stage1_model_code,
                    "stage2_model_code": stage2_model_code,
                    "data_model_codes": data_model_codes,
                    "strategy_codes": strategy_codes,
                    "target_period": target_period,
                }
            },
        )
        self.repository.create_run(
            {
                "run_id": run_id,
                "lottery_code": "dlt",
                "target_period": target_period,
                "created_by_user_id": int(user_id),
                "status": "stage1_queued",
                "stage1_status": "queued",
                "stage2_status": "idle",
                "stage1_model_code": stage1_model_code,
                "stage2_model_code": stage2_model_code,
                "history_period_count": history_period_count,
                "data_model_codes": data_model_codes,
                "strategy_codes": strategy_codes,
                "options": options,
                "warnings": [],
                "stage1_result": None,
                "stage2_result": None,
                "error_message": None,
            }
        )
        self._create_stage1_task(run_id)
        return self.get_run(run_id) or {}

    def start_stage2(self, run_id: str, *, stage2_model_code: str | None = None, force_rerun: bool = False) -> dict[str, Any]:
        run = self.get_run(run_id)
        if not run:
            raise KeyError(run_id)
        if str(run.get("stage1_status") or "") != "succeeded":
            raise ValueError("阶段1尚未成功，不能启动阶段2")
        stage2_status = str(run.get("stage2_status") or "")
        if stage2_status in {"queued", "running"}:
            raise ValueError("阶段2任务正在执行中")
        if run.get("stage2_result") and not force_rerun:
            raise ValueError("阶段2结果已存在，如需重跑请使用强制重跑")
        next_stage2_model_code = str(stage2_model_code or run.get("stage2_model_code") or "").strip()
        if not next_stage2_model_code:
            raise ValueError("阶段2推理模型不能为空")
        self.prediction_generation_service.validate_model(next_stage2_model_code, lottery_code="dlt")
        self.repository.update_run(
            run_id,
            {
                "stage2_model_code": next_stage2_model_code,
                "stage2_status": "queued",
                "status": "stage2_queued",
                "error_message": None,
            },
        )
        self._create_stage2_task(run_id)
        return self.get_run(run_id) or {}

    def cancel_run(self, run_id: str) -> dict[str, Any]:
        run = self.get_run(run_id)
        if not run:
            raise KeyError(run_id)
        cancelled = False
        for stage_key, status_key in (("stage1_task_id", "stage1_status"), ("stage2_task_id", "stage2_status")):
            task_id = str(run.get(stage_key) or "").strip()
            status = str(run.get(status_key) or "").strip().lower()
            if not task_id or status not in {"queued", "running"}:
                continue
            snapshot = self.task_service.cancel_task(task_id)
            if snapshot:
                cancelled = True
        if not cancelled:
            raise ValueError("当前没有可取消的智能预测任务")
        self.repository.update_run(run_id, {"error_message": None})
        return self.get_run(run_id) or {}

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        return self.repository.get_run(run_id)

    def list_runs(self, *, limit: int = 20, offset: int = 0) -> dict[str, Any]:
        return self.repository.list_runs(limit=limit, offset=offset)

    def _create_stage1_task(self, run_id: str) -> dict[str, Any]:
        run = self.get_run(run_id)
        if not run:
            raise KeyError(run_id)

        def worker(progress_callback: Callable[[dict[str, Any]], None], should_cancel: Callable[[], bool]) -> dict[str, Any]:
            progress_callback({"stage": "stage1", "message": "正在准备阶段1上下文", "percent": 10})
            stage1_result = self._execute_stage1(run_id=run_id, should_cancel=should_cancel, progress_callback=progress_callback)
            if should_cancel():
                raise TaskCancelledError("任务已取消")
            return {"stage": "stage1", "stage1_result": stage1_result}

        task = self.task_service.create_task(
            run_id=run_id,
            stage="stage1",
            worker=worker,
            on_update=lambda state: self._handle_stage_task_update(run_id, stage="stage1", state=state),
        )
        self.repository.update_run(
            run_id,
            {
                "stage1_task_id": task.get("task_id"),
                "stage1_status": str(task.get("status") or "queued"),
                "status": "stage1_queued",
            },
        )
        return task

    def _create_stage2_task(self, run_id: str) -> dict[str, Any]:
        run = self.get_run(run_id)
        if not run:
            raise KeyError(run_id)

        def worker(progress_callback: Callable[[dict[str, Any]], None], should_cancel: Callable[[], bool]) -> dict[str, Any]:
            progress_callback({"stage": "stage2", "message": "正在准备阶段2上下文", "percent": 10})
            stage2_result = self._execute_stage2(run_id=run_id, should_cancel=should_cancel, progress_callback=progress_callback)
            if should_cancel():
                raise TaskCancelledError("任务已取消")
            return {"stage": "stage2", "stage2_result": stage2_result}

        task = self.task_service.create_task(
            run_id=run_id,
            stage="stage2",
            worker=worker,
            on_update=lambda state: self._handle_stage_task_update(run_id, stage="stage2", state=state),
        )
        self.repository.update_run(
            run_id,
            {
                "stage2_task_id": task.get("task_id"),
                "stage2_status": str(task.get("status") or "queued"),
                "status": "stage2_queued",
            },
        )
        return task

    def _handle_stage_task_update(self, run_id: str, *, stage: str, state: dict[str, Any]) -> None:
        task_status = str(state.get("status") or "queued").strip().lower()
        progress_summary = state.get("progress_summary") if isinstance(state.get("progress_summary"), dict) else {}
        if stage == "stage1":
            if task_status == "queued":
                self.repository.update_run(run_id, {"stage1_status": "queued", "status": "stage1_queued"})
                return
            if task_status == "running":
                self.repository.update_run(run_id, {"stage1_status": "running", "status": "stage1_running"})
                return
            if task_status == "cancelled":
                self.repository.update_run(
                    run_id,
                    {
                        "stage1_status": "cancelled",
                        "status": "cancelled",
                        "error_message": None,
                    },
                )
                return
            if task_status == "failed":
                self.repository.update_run(
                    run_id,
                    {
                        "stage1_status": "failed",
                        "status": "failed",
                        "error_message": str(state.get("error_message") or "阶段1执行失败"),
                    },
                )
                return
            if task_status == "succeeded":
                stage1_result = progress_summary.get("stage1_result")
                warnings = stage1_result.get("warnings") if isinstance(stage1_result, dict) else []
                self.repository.update_run(
                    run_id,
                    {
                        "stage1_status": "succeeded",
                        "status": "stage1_succeeded",
                        "stage1_result": stage1_result if isinstance(stage1_result, dict) else None,
                        "warnings": warnings if isinstance(warnings, list) else [],
                        "error_message": None,
                    },
                )
                run = self.get_run(run_id) or {}
                options = run.get("options") if isinstance(run.get("options"), dict) else {}
                if bool(options.get("auto_stage2", True)):
                    with self._stage2_start_lock:
                        latest_run = self.get_run(run_id) or {}
                        latest_stage2_status = str(latest_run.get("stage2_status") or "").strip().lower()
                        if latest_stage2_status not in {"queued", "running"}:
                            try:
                                self.start_stage2(run_id, force_rerun=True)
                            except Exception:
                                self.logger.exception(
                                    "Auto stage2 launch failed",
                                    extra={"context": {"run_id": run_id}},
                                )
                else:
                    self.repository.update_run(run_id, {"status": "awaiting_stage2"})
                return
            return

        if task_status == "queued":
            self.repository.update_run(run_id, {"stage2_status": "queued", "status": "stage2_queued"})
            return
        if task_status == "running":
            self.repository.update_run(run_id, {"stage2_status": "running", "status": "stage2_running"})
            return
        if task_status == "cancelled":
            self.repository.update_run(
                run_id,
                {
                    "stage2_status": "cancelled",
                    "status": "partial",
                    "error_message": None,
                },
            )
            return
        if task_status == "failed":
            self.repository.update_run(
                run_id,
                {
                    "stage2_status": "failed",
                    "status": "partial",
                    "error_message": str(state.get("error_message") or "阶段2执行失败"),
                },
            )
            return
        if task_status == "succeeded":
            stage2_result = progress_summary.get("stage2_result")
            self.repository.update_run(
                run_id,
                {
                    "stage2_status": "succeeded",
                    "status": "succeeded",
                    "stage2_result": stage2_result if isinstance(stage2_result, dict) else None,
                    "error_message": None,
                },
            )

    def _execute_stage1(
        self,
        *,
        run_id: str,
        should_cancel: Callable[[], bool],
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        run = self.get_run(run_id)
        if not run:
            raise KeyError(run_id)
        stage1_model_code = str(run.get("stage1_model_code") or "").strip()
        options = run.get("options") if isinstance(run.get("options"), dict) else {}
        strict_validation = bool(options.get("strict_validation", True))
        retry_once = bool(options.get("retry_once", True))
        source_rows, source_warnings = self._build_stage1_source_rows(run)
        if not source_rows:
            raise ValueError("选中的模型和策略没有可用于阶段1的大乐透普通5+2数据")

        context_payload = self._build_stage1_context(run, source_rows=source_rows)
        prompt_template = STAGE1_PROMPT_PATH.read_text(encoding="utf-8")
        prompt = (
            prompt_template.replace("{target_period}", str(run.get("target_period") or ""))
            .replace("{stage1_context_json}", json.dumps(context_payload, ensure_ascii=False, indent=2))
        )
        model_def = self.prediction_generation_service._get_model_definition(stage1_model_code, lottery_code="dlt")
        model = self.prediction_generation_service._prepare_model(model_def)
        max_attempts = 2 if retry_once else 1
        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            if should_cancel():
                raise TaskCancelledError("任务已取消")
            if progress_callback:
                progress_callback({"stage": "stage1", "message": f"阶段1推理中（第 {attempt}/{max_attempts} 次）", "percent": 45})
            try:
                raw_result = model.predict(prompt)
                result = self._merge_stage1_rows(
                    source_rows=source_rows,
                    source_warnings=source_warnings,
                    raw_result=raw_result,
                    strict_validation=strict_validation,
                )
                if progress_callback:
                    progress_callback({"stage": "stage1", "message": "阶段1结果校验完成", "percent": 100})
                return {
                    "target_period": str(run.get("target_period") or ""),
                    "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "rows": result["rows"],
                    "warnings": result["warnings"],
                }
            except TaskCancelledError:
                raise
            except Exception as exc:
                last_error = exc
                if attempt >= max_attempts:
                    break
        raise ValueError(f"阶段1生成失败: {last_error}") from last_error

    def _execute_stage2(
        self,
        *,
        run_id: str,
        should_cancel: Callable[[], bool],
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        run = self.get_run(run_id)
        if not run:
            raise KeyError(run_id)
        stage1_result = run.get("stage1_result")
        if not isinstance(stage1_result, dict):
            raise ValueError("阶段1结果不存在，不能执行阶段2")
        options = run.get("options") if isinstance(run.get("options"), dict) else {}
        strict_validation = bool(options.get("strict_validation", True))
        retry_once = bool(options.get("retry_once", True))
        prompt_template = STAGE2_PROMPT_PATH.read_text(encoding="utf-8")
        stage1_rows = stage1_result.get("rows") if isinstance(stage1_result.get("rows"), list) else []
        stage1_existing_signatures = self._collect_stage1_signatures(stage1_rows)
        stage2_context_payload = {
            "target_period": str(run.get("target_period") or ""),
            "stage1_rows": stage1_rows,
            "stage1_existing_tickets": sorted(stage1_existing_signatures),
            "warnings": stage1_result.get("warnings") or [],
        }
        prompt = (
            prompt_template.replace("{target_period}", str(run.get("target_period") or ""))
            .replace("{stage2_context_json}", json.dumps(stage2_context_payload, ensure_ascii=False, indent=2))
        )
        model_def = self.prediction_generation_service._get_model_definition(str(run.get("stage2_model_code") or "").strip(), lottery_code="dlt")
        model = self.prediction_generation_service._prepare_model(model_def)
        max_attempts = 2 if retry_once else 1
        last_error: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            if should_cancel():
                raise TaskCancelledError("任务已取消")
            if progress_callback:
                progress_callback({"stage": "stage2", "message": f"阶段2推理中（第 {attempt}/{max_attempts} 次）", "percent": 55})
            try:
                raw_result = model.predict(prompt)
                normalized = self._normalize_stage2_result(
                    raw_result,
                    strict_validation=strict_validation,
                    stage1_rows=stage1_rows,
                    stage1_existing_signatures=stage1_existing_signatures,
                )
                if progress_callback:
                    progress_callback({"stage": "stage2", "message": "阶段2结果校验完成", "percent": 100})
                return {
                    "target_period": str(run.get("target_period") or ""),
                    "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    **normalized,
                }
            except TaskCancelledError:
                raise
            except Exception as exc:
                last_error = exc
                if attempt >= max_attempts:
                    break
        raise ValueError(f"阶段2生成失败: {last_error}") from last_error

    def _build_stage1_context(self, run: dict[str, Any], *, source_rows: list[dict[str, Any]]) -> dict[str, Any]:
        options = run.get("options") if isinstance(run.get("options"), dict) else {}
        include_trend = bool(options.get("include_trend", True))
        include_scores = bool(options.get("include_scores", True))
        history_period_count = self._normalize_history_period_count(run.get("history_period_count"))
        data_model_codes = set(self._normalize_string_list(run.get("data_model_codes")))
        strategy_codes = set(self._normalize_strategy_codes(run.get("strategy_codes")))
        trend_rows: list[dict[str, Any]] = []
        if include_trend:
            history_payload = self.prediction_service.get_history_payload(limit=history_period_count, lottery_code="dlt")
            history_records = history_payload.get("predictions_history") if isinstance(history_payload, dict) else []
            sorted_records = sorted(
                history_records if isinstance(history_records, list) else [],
                key=lambda item: int(str((item or {}).get("target_period") or "0") or "0"),
            )
            for record in sorted_records:
                target_period = str(record.get("target_period") or "")
                for model in record.get("models") or []:
                    model_id = str(model.get("model_id") or "").strip()
                    if model_id not in data_model_codes:
                        continue
                    for group in model.get("predictions") or []:
                        strategy_code = self._strategy_code_from_label(str(group.get("strategy") or ""))
                        if not strategy_code or strategy_code not in strategy_codes:
                            continue
                        if not self._is_dlt_direct_group(group):
                            continue
                        hit_result = group.get("hit_result") if isinstance(group.get("hit_result"), dict) else {}
                        total_hits = int(hit_result.get("total_hits") or 0)
                        trend_rows.append(
                            {
                                "period": target_period,
                                "model_id": model_id,
                                "strategy_code": strategy_code,
                                "strategy_label": STRATEGY_LABEL_BY_CODE[strategy_code],
                                "hit_count": total_hits,
                            }
                        )
        model_score_stats: dict[str, dict[str, Any]] = {}
        if include_scores:
            score_payload = self.prediction_service.get_history_list_payload(
                limit=history_period_count,
                offset=0,
                lottery_code="dlt",
                include_inactive_models=False,
            )
            stats = score_payload.get("model_stats") if isinstance(score_payload, dict) else []
            for item in stats if isinstance(stats, list) else []:
                model_id = str(item.get("model_id") or "").strip()
                if model_id not in data_model_codes:
                    continue
                model_score_stats[model_id] = {
                    "periods": int(item.get("periods") or 0),
                    "winning_periods": int(item.get("winning_periods") or 0),
                    "bet_count": int(item.get("bet_count") or 0),
                    "winning_bet_count": int(item.get("winning_bet_count") or 0),
                    "cost_amount": int(item.get("cost_amount") or 0),
                    "prize_amount": int(item.get("prize_amount") or 0),
                    "win_rate_by_period": float(item.get("win_rate_by_period") or 0),
                    "win_rate_by_bet": float(item.get("win_rate_by_bet") or 0),
                    "overall_score": float(((item.get("score_profile") or {}).get("overall_score")) or 0),
                    "recent_score": float(((item.get("score_profile") or {}).get("recent_score")) or 0),
                    "long_term_score": float(((item.get("score_profile") or {}).get("long_term_score")) or 0),
                }
        return {
            "target_period": str(run.get("target_period") or ""),
            "rows": source_rows,
            "trend_rows": trend_rows,
            "model_score_stats": model_score_stats,
            "history_period_count": history_period_count,
            "options": {
                "include_trend": include_trend,
                "include_scores": include_scores,
            },
        }

    def _build_stage1_source_rows(self, run: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
        data_model_codes = self._normalize_string_list(run.get("data_model_codes"))
        strategy_codes = self._normalize_strategy_codes(run.get("strategy_codes"))
        target_period = str(run.get("target_period") or "").strip()
        run_id = str(run.get("run_id") or "").strip()
        current_payload = self.prediction_service.get_current_payload_by_period(
            target_period,
            lottery_code="dlt",
            include_inactive_models=False,
        )
        models = current_payload.get("models") if isinstance(current_payload, dict) else []
        model_candidates_by_id: dict[str, list[dict[str, Any]]] = {}
        for model in (models if isinstance(models, list) else []):
            model_id = str(model.get("model_id") or "").strip()
            if not model_id:
                continue
            model_candidates_by_id.setdefault(model_id, []).append(model)
        self.logger.info(
            "Building stage1 source rows",
            extra={
                "context": {
                    "run_id": run_id,
                    "target_period": target_period,
                    "requested_model_count": len(data_model_codes),
                    "requested_strategy_count": len(strategy_codes),
                    "available_model_record_count": len(models if isinstance(models, list) else []),
                    "distinct_available_model_count": len(model_candidates_by_id),
                }
            },
        )
        rows: list[dict[str, Any]] = []
        warnings: list[str] = []
        for model_id in data_model_codes:
            model_candidates = model_candidates_by_id.get(model_id) or []
            if not model_candidates:
                warnings.append(f"模型 {model_id} 在当前期号无可用预测，已跳过。")
                self.logger.warning(
                    "Smart prediction model not found in current payload",
                    extra={"context": {"run_id": run_id, "target_period": target_period, "model_id": model_id}},
                )
                continue
            model_name = str(model_candidates[0].get("model_name") or model_id)
            for strategy_code in strategy_codes:
                strategy_label = STRATEGY_LABEL_BY_CODE[strategy_code]
                group = None
                for candidate in model_candidates:
                    candidate_group = self._find_direct_group_by_strategy(candidate, strategy_code)
                    if candidate_group:
                        group = candidate_group
                        break
                if not group:
                    warnings.append(f"模型 {model_id} 缺少策略 {strategy_label} 的普通5+2预测，已跳过。")
                    self.logger.warning(
                        "Smart prediction direct group missing for strategy",
                        extra={
                            "context": {
                                "run_id": run_id,
                                "target_period": target_period,
                                "model_id": model_id,
                                "strategy_code": strategy_code,
                                "strategy_label": strategy_label,
                                "candidate_record_count": len(model_candidates),
                            }
                        },
                    )
                    continue
                red_balls = [self._normalize_ball(item) for item in (group.get("red_balls") or [])]
                blue_balls = [self._normalize_ball(item) for item in (group.get("blue_balls") or [])]
                rows.append(
                    {
                        "strategy_code": strategy_code,
                        "strategy_label": strategy_label,
                        "model_id": model_id,
                        "model_name": model_name,
                        "expected_numbers": f"{' '.join(red_balls)} + {' '.join(blue_balls)}",
                        "red_balls": red_balls,
                        "blue_balls": blue_balls,
                    }
                )
        self.logger.info(
            "Stage1 source rows built",
            extra={
                "context": {
                    "run_id": run_id,
                    "target_period": target_period,
                    "source_row_count": len(rows),
                    "warning_count": len(warnings),
                }
            },
        )
        return rows, warnings

    def _merge_stage1_rows(
        self,
        *,
        source_rows: list[dict[str, Any]],
        source_warnings: list[str],
        raw_result: dict[str, Any],
        strict_validation: bool,
    ) -> dict[str, Any]:
        if not isinstance(raw_result, dict):
            raise ValueError("阶段1模型输出格式无效")
        raw_rows = raw_result.get("rows")
        if not isinstance(raw_rows, list):
            raise ValueError("阶段1模型输出缺少 rows")
        predicted_map: dict[tuple[str, str], dict[str, Any]] = {}
        for item in raw_rows:
            if not isinstance(item, dict):
                continue
            strategy_code = str(item.get("strategy_code") or "").strip().lower()
            if not strategy_code:
                strategy_code = self._strategy_code_from_label(str(item.get("strategy_label") or ""))
            model_id = str(item.get("model_id") or "").strip()
            if not strategy_code or not model_id:
                continue
            predicted_map[(strategy_code, model_id)] = item

        warnings = [*source_warnings]
        raw_warnings = raw_result.get("warnings")
        if isinstance(raw_warnings, list):
            warnings.extend(str(item) for item in raw_warnings if str(item).strip())

        merged_rows: list[dict[str, Any]] = []
        for source_row in source_rows:
            key = (str(source_row["strategy_code"]), str(source_row["model_id"]))
            predicted = predicted_map.get(key)
            if not predicted:
                message = f"模型 {source_row['model_id']} 的策略 {source_row['strategy_label']} 缺少阶段1输出。"
                if strict_validation:
                    raise ValueError(message)
                warnings.append(message)
                predicted = self._build_stage1_fallback_output()
            normalized = self._normalize_stage1_row_output(predicted, strict_validation=strict_validation)
            merged_rows.append(
                {
                    "strategy_code": source_row["strategy_code"],
                    "strategy_label": source_row["strategy_label"],
                    "model_id": source_row["model_id"],
                    "model_name": source_row["model_name"],
                    "expected_numbers": source_row["expected_numbers"],
                    **normalized,
                }
            )
        return {"rows": merged_rows, "warnings": warnings}

    @staticmethod
    def _build_stage1_fallback_output() -> dict[str, Any]:
        return {
            "primary_hit": 0,
            "expected_value": 0,
            "high_prob_range": "0-1",
            "interval_probability": 1,
            "p0": 0.5,
            "p1": 0.5,
            "p2": 0,
            "p3": 0,
            "p4": 0,
            "p5": 0,
            "p6": 0,
            "p7": 0,
        }

    @staticmethod
    def _normalize_stage1_row_output(item: dict[str, Any], *, strict_validation: bool) -> dict[str, Any]:
        def read_probability(name: str) -> float:
            value = float(item.get(name, 0) or 0)
            if strict_validation and not 0 <= value <= 1:
                raise ValueError(f"阶段1概率字段 {name} 超出范围")
            return max(0, min(1, value))

        probabilities = [read_probability(f"p{index}") for index in range(8)]
        probability_sum = sum(probabilities)
        if strict_validation and abs(probability_sum - 1) > 0.03:
            raise ValueError("阶段1概率总和必须接近1")
        if probability_sum > 0 and (abs(probability_sum - 1) > 1e-6):
            probabilities = [value / probability_sum for value in probabilities]
        primary_hit = int(item.get("primary_hit", 0) or 0)
        if strict_validation and not 0 <= primary_hit <= 7:
            raise ValueError("阶段1 primary_hit 必须在 0-7 范围内")
        expected_value = float(item.get("expected_value", 0) or 0)
        if strict_validation and not 0 <= expected_value <= 7:
            raise ValueError("阶段1 expected_value 必须在 0-7 范围内")
        interval_probability = float(item.get("interval_probability", 0) or 0)
        if strict_validation and not 0 <= interval_probability <= 1:
            raise ValueError("阶段1 interval_probability 必须在 0-1 范围内")
        high_prob_range = str(item.get("high_prob_range") or "0-1").strip()
        if strict_validation and not high_prob_range:
            raise ValueError("阶段1 high_prob_range 不能为空")
        result = {
            "primary_hit": max(0, min(7, primary_hit)),
            "expected_value": round(max(0, min(7, expected_value)), 3),
            "high_prob_range": high_prob_range or "0-1",
            "interval_probability": round(max(0, min(1, interval_probability)), 4),
        }
        for index, probability in enumerate(probabilities):
            result[f"p{index}"] = round(float(probability), 6)
        return result

    def _normalize_stage2_result(
        self,
        raw_result: dict[str, Any],
        *,
        strict_validation: bool,
        stage1_rows: list[dict[str, Any]],
        stage1_existing_signatures: set[str],
    ) -> dict[str, Any]:
        if not isinstance(raw_result, dict):
            raise ValueError("阶段2模型输出格式无效")
        raw_tickets = raw_result.get("tickets")
        if not isinstance(raw_tickets, list):
            raise ValueError("阶段2输出缺少 tickets")
        if strict_validation and len(raw_tickets) != 5:
            raise ValueError("阶段2 tickets 必须输出 5 注号码")

        tickets: list[dict[str, list[str]]] = []
        ticket_signatures: set[str] = set()
        reused_stage1_ticket_count = 0
        for ticket in raw_tickets:
            if not isinstance(ticket, dict):
                raise ValueError("阶段2 ticket 项格式无效")
            red_balls = self._normalize_zone_numbers(ticket.get("red_balls"), minimum=1, maximum=35, expected_count=5)
            blue_balls = self._normalize_zone_numbers(ticket.get("blue_balls"), minimum=1, maximum=12, expected_count=2)
            signature = f"{','.join(red_balls)}+{','.join(blue_balls)}"
            if strict_validation and signature in ticket_signatures:
                raise ValueError("阶段2 5注单式号码必须互不重复")
            ticket_signatures.add(signature)
            if signature in stage1_existing_signatures:
                reused_stage1_ticket_count += 1
            tickets.append({"red_balls": red_balls, "blue_balls": blue_balls})
        if strict_validation and len(tickets) != 5:
            raise ValueError("阶段2 tickets 必须输出 5 注号码")
        if strict_validation and reused_stage1_ticket_count > 1:
            raise ValueError("阶段2最多允许1注与阶段1已有组合完全重复")

        raw_dantuo = raw_result.get("dantuo")
        if not isinstance(raw_dantuo, dict):
            raise ValueError("阶段2输出缺少 dantuo")
        front_dan = self._normalize_zone_numbers(raw_dantuo.get("front_dan"), minimum=1, maximum=35, expected_count=None)
        front_tuo = self._normalize_zone_numbers(raw_dantuo.get("front_tuo"), minimum=1, maximum=35, expected_count=None)
        back_dan = self._normalize_zone_numbers(raw_dantuo.get("back_dan"), minimum=1, maximum=12, expected_count=None)
        back_tuo = self._normalize_zone_numbers(raw_dantuo.get("back_tuo"), minimum=1, maximum=12, expected_count=None)
        if strict_validation and set(front_dan) & set(front_tuo):
            raise ValueError("阶段2 前区胆拖不能重复")
        if strict_validation and set(back_dan) & set(back_tuo):
            raise ValueError("阶段2 后区胆拖不能重复")
        has_front_dantuo = bool(front_dan and front_tuo)
        has_back_dantuo = bool(back_dan and back_tuo)
        if strict_validation and not (has_front_dantuo or has_back_dantuo):
            raise ValueError("阶段2 胆拖至少一侧需要形成有效胆码+拖码结构")
        top15_numbers = self._build_top15_numbers(
            stage1_rows=stage1_rows,
            top15_candidates=raw_result.get("top15_candidates"),
        )
        return {
            "tickets": tickets[:5],
            "dantuo": {
                "front_dan": front_dan,
                "front_tuo": front_tuo,
                "back_dan": back_dan,
                "back_tuo": back_tuo,
            },
            "top15_numbers": top15_numbers,
        }

    @staticmethod
    def _collect_stage1_signatures(stage1_rows: list[dict[str, Any]]) -> set[str]:
        signatures: set[str] = set()
        for row in stage1_rows:
            if not isinstance(row, dict):
                continue
            front_numbers, back_numbers = SmartPredictionService._extract_expected_numbers(row)
            if len(front_numbers) != 5 or len(back_numbers) != 2:
                continue
            signatures.add(f"{','.join(front_numbers)}+{','.join(back_numbers)}")
        return signatures

    @staticmethod
    def _extract_expected_numbers(row: dict[str, Any]) -> tuple[list[str], list[str]]:
        text = str(row.get("expected_numbers") or "").strip()
        if "+" not in text:
            return [], []
        front_part, back_part = text.split("+", 1)
        front_numbers = [token for token in front_part.strip().split() if token]
        back_numbers = [token for token in back_part.strip().split() if token]
        normalized_front = [SmartPredictionService._normalize_ball(item) for item in front_numbers]
        normalized_back = [SmartPredictionService._normalize_ball(item) for item in back_numbers]
        return normalized_front, normalized_back

    def _build_top15_numbers(self, *, stage1_rows: list[dict[str, Any]], top15_candidates: Any) -> list[dict[str, Any]]:
        stage1_scores: dict[tuple[str, str], float] = {}
        for row in stage1_rows:
            if not isinstance(row, dict):
                continue
            interval_probability = float(row.get("interval_probability") or 0)
            expected_value = float(row.get("expected_value") or 0)
            row_confidence = 0.55 * max(0.0, min(1.0, interval_probability)) + 0.45 * max(0.0, min(1.0, expected_value / 7.0))
            front_numbers, back_numbers = self._extract_expected_numbers(row)
            for number in front_numbers:
                stage1_scores[("front", number)] = float(stage1_scores.get(("front", number), 0.0) + row_confidence)
            for number in back_numbers:
                stage1_scores[("back", number)] = float(stage1_scores.get(("back", number), 0.0) + row_confidence)

        front_sum = sum(score for (zone, _), score in stage1_scores.items() if zone == "front")
        back_sum = sum(score for (zone, _), score in stage1_scores.items() if zone == "back")
        stat_scores: dict[tuple[str, str], float] = {}
        for key, score in stage1_scores.items():
            zone, _ = key
            zone_probability = score / front_sum if zone == "front" and front_sum > 0 else score / back_sum if zone == "back" and back_sum > 0 else 0.0
            zone_weight = 5 / 7 if zone == "front" else 2 / 7
            stat_scores[key] = zone_probability * zone_weight

        llm_scores: dict[tuple[str, str], float] = {}
        if isinstance(top15_candidates, list):
            for index, item in enumerate(top15_candidates):
                if not isinstance(item, dict):
                    continue
                zone = self._normalize_zone(str(item.get("zone") or ""))
                if not zone:
                    continue
                number = self._normalize_ball(item.get("number"))
                if not self._is_valid_zone_ball(zone, number):
                    continue
                probability = item.get("probability")
                if isinstance(probability, (float, int)) and 0 <= float(probability) <= 1:
                    score = float(probability)
                else:
                    score = 1.0 / float(index + 1)
                llm_scores[(zone, number)] = max(float(llm_scores.get((zone, number), 0.0)), score)

        llm_total = sum(llm_scores.values())
        if llm_total > 0:
            llm_scores = {key: value / llm_total for key, value in llm_scores.items()}

        all_keys = set(stat_scores) | set(llm_scores)
        combined_scores: dict[tuple[str, str], float] = {}
        for key in all_keys:
            combined_scores[key] = 0.85 * float(stat_scores.get(key, 0.0)) + 0.15 * float(llm_scores.get(key, 0.0))
        if not combined_scores:
            return []

        total_score = sum(combined_scores.values())
        normalized_scores = (
            {key: score / total_score for key, score in combined_scores.items()} if total_score > 0 else {}
        )
        sorted_items = sorted(
            normalized_scores.items(),
            key=lambda item: (-item[1], 0 if item[0][0] == "front" else 1, int(item[0][1])),
        )
        if len(sorted_items) < 15:
            selected = {key for key, _ in sorted_items}
            for number in range(1, 36):
                key = ("front", f"{number:02d}")
                if key in selected:
                    continue
                sorted_items.append((key, 0.0))
                selected.add(key)
                if len(sorted_items) >= 15:
                    break
            if len(sorted_items) < 15:
                for number in range(1, 13):
                    key = ("back", f"{number:02d}")
                    if key in selected:
                        continue
                    sorted_items.append((key, 0.0))
                    selected.add(key)
                    if len(sorted_items) >= 15:
                        break
        sorted_items = sorted_items[:15]
        result = []
        for (zone, number), probability in sorted_items:
            result.append(
                {
                    "zone": zone,
                    "number": number,
                    "probability": round(float(probability), 4),
                    "source": "hybrid" if (zone, number) in llm_scores else "stat",
                }
            )
        return result

    @staticmethod
    def _normalize_zone(value: str) -> str:
        normalized = str(value or "").strip().lower()
        if normalized in {"front", "red", "前区"}:
            return "front"
        if normalized in {"back", "blue", "后区"}:
            return "back"
        return ""

    @staticmethod
    def _is_valid_zone_ball(zone: str, value: str) -> bool:
        if not str(value or "").isdigit():
            return False
        number = int(value)
        if zone == "front":
            return 1 <= number <= 35
        if zone == "back":
            return 1 <= number <= 12
        return False

    @staticmethod
    def _normalize_zone_numbers(values: Any, *, minimum: int, maximum: int, expected_count: int | None) -> list[str]:
        if not isinstance(values, list):
            values = []
        numbers = []
        for item in values:
            normalized = str(item or "").strip()
            if not normalized:
                continue
            if not normalized.isdigit():
                raise ValueError("号码必须为数字")
            numeric = int(normalized)
            if numeric < minimum or numeric > maximum:
                raise ValueError(f"号码必须在 {minimum:02d}-{maximum:02d} 范围内")
            numbers.append(f"{numeric:02d}")
        unique_numbers = sorted(set(numbers), key=lambda item: int(item))
        if expected_count is not None and len(unique_numbers) != expected_count:
            raise ValueError(f"号码数量应为 {expected_count}")
        return unique_numbers

    @staticmethod
    def _normalize_ball(value: Any) -> str:
        normalized = str(value or "").strip()
        if not normalized.isdigit():
            return normalized
        return f"{int(normalized):02d}"

    @staticmethod
    def _normalize_string_list(values: Any) -> list[str]:
        if not isinstance(values, list):
            return []
        normalized: list[str] = []
        for value in values:
            item = str(value or "").strip()
            if not item or item in normalized:
                continue
            normalized.append(item)
        return normalized

    @staticmethod
    def _normalize_history_period_count(value: Any) -> int:
        normalized = int(value or 50)
        if normalized not in SUPPORTED_HISTORY_PERIOD_COUNTS:
            raise ValueError("历史期数仅支持 30、50、100")
        return normalized

    @staticmethod
    def _strategy_code_from_label(label: str) -> str:
        normalized = str(label or "").strip()
        return STRATEGY_CODE_BY_LABEL.get(normalized, "")

    def _normalize_strategy_codes(self, values: Any) -> list[str]:
        requested = self._normalize_string_list(values)
        if not requested:
            return [item["code"] for item in SUPPORTED_STRATEGIES]
        supported_codes = {item["code"] for item in SUPPORTED_STRATEGIES}
        normalized: list[str] = []
        for value in requested:
            candidate = value.lower()
            if candidate not in supported_codes:
                raise ValueError(f"不支持的策略编码: {value}")
            if candidate not in normalized:
                normalized.append(candidate)
        if not normalized:
            raise ValueError("至少选择一个策略")
        return normalized

    def _find_direct_group_by_strategy(self, model: dict[str, Any], strategy_code: str) -> dict[str, Any] | None:
        strategy_label = STRATEGY_LABEL_BY_CODE[strategy_code]
        candidates = []
        for group in model.get("predictions") or []:
            if not self._is_dlt_direct_group(group):
                continue
            if str(group.get("strategy") or "").strip() != strategy_label:
                continue
            candidates.append(group)
        if not candidates:
            return None
        candidates.sort(key=lambda item: int(item.get("group_id") or 0))
        return candidates[0]

    @staticmethod
    def _is_dlt_direct_group(group: dict[str, Any]) -> bool:
        play_type = str(group.get("play_type") or "direct").strip().lower()
        if play_type not in {"", "direct"}:
            return False
        red_balls = group.get("red_balls") if isinstance(group.get("red_balls"), list) else []
        blue_balls = group.get("blue_balls") if isinstance(group.get("blue_balls"), list) else []
        return len(red_balls) == 5 and len(blue_balls) == 2


smart_prediction_service = SmartPredictionService()
