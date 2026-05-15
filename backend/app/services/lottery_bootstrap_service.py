from __future__ import annotations

import time
from typing import Any, Callable

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.lotteries import SUPPORTED_LOTTERY_CODES, normalize_lottery_code
from backend.app.repositories.lottery_bootstrap_checkpoint_repository import LotteryBootstrapCheckpointRepository
from backend.app.repositories.maintenance_run_log_repository import MaintenanceRunLogRepository
from backend.app.services.lottery_fetch_service import LotteryFetchService
from backend.app.services.lottery_service import LotteryService
from backend.app.services.task_runner import BackgroundTaskRunner, TaskCancelledError


ProgressCallback = Callable[[dict[str, Any]], None]
CancelCallback = Callable[[], bool]


class LotteryBootstrapService:
    DETAIL_LOTTERY_CODES = {"dlt", "qxc"}
    DETAIL_THROTTLE_SECONDS = 1.5
    DETAIL_RETRY = 2
    DEFAULT_BASE_LIMIT = 100

    def __init__(
        self,
        lottery_service: LotteryService | None = None,
        checkpoint_repository: LotteryBootstrapCheckpointRepository | None = None,
    ) -> None:
        ensure_schema()
        self.lottery_service = lottery_service or LotteryService()
        self.checkpoint_repository = checkpoint_repository or LotteryBootstrapCheckpointRepository()
        self.logger = get_logger("services.lottery_bootstrap")

    def bootstrap(
        self,
        *,
        lottery_codes: list[str] | None = None,
        chunk_size: int = 100,
        detail_mode: str = "main",
        resume: bool = True,
        progress_callback: ProgressCallback | None = None,
        cancel_callback: CancelCallback | None = None,
    ) -> dict[str, Any]:
        started_at = time.perf_counter()
        normalized_codes = self._normalize_lottery_codes(lottery_codes)
        summary = self._build_summary(
            lottery_codes=normalized_codes,
            detail_mode=detail_mode,
            chunk_size=chunk_size,
            resume=resume,
            started_at=started_at,
        )
        self._emit(progress_callback, summary)

        for lottery_index, lottery_code in enumerate(normalized_codes, start=1):
            self._raise_if_cancelled(cancel_callback)
            summary.update(
                {
                    "current_lottery": lottery_code,
                    "current_lottery_index": lottery_index,
                    "phase": "base",
                    "current_period": None,
                }
            )
            if not resume:
                self.checkpoint_repository.reset(lottery_code)
            checkpoint = self.checkpoint_repository.get(lottery_code) if resume else None

            if not checkpoint or not bool(checkpoint.get("base_done")):
                base_summary = self._fetch_base_history(lottery_code, chunk_size=max(1, int(chunk_size)))
                summary["base_fetched"] += int(base_summary.get("fetched_count") or 0)
                summary["base_saved"] += int(base_summary.get("saved_count") or 0)
                summary["fetched_count"] = summary["base_fetched"]
                summary["saved_count"] = summary["base_saved"]
                summary["latest_period"] = base_summary.get("latest_period") or summary.get("latest_period")
                self.checkpoint_repository.upsert(
                    lottery_code,
                    phase="detail" if self._should_backfill_detail(lottery_code, detail_mode) else "done",
                    last_period=None if self._should_backfill_detail(lottery_code, detail_mode) else str(base_summary.get("latest_period") or "") or None,
                    base_done=True,
                    detail_done=not self._should_backfill_detail(lottery_code, detail_mode),
                )
                self._emit(progress_callback, summary)

            if self._should_backfill_detail(lottery_code, detail_mode):
                checkpoint = self.checkpoint_repository.get(lottery_code) if resume else None
                self._backfill_details(
                    lottery_code,
                    checkpoint=checkpoint,
                    summary=summary,
                    progress_callback=progress_callback,
                    cancel_callback=cancel_callback,
                )
            else:
                self.checkpoint_repository.upsert(
                    lottery_code,
                    phase="done",
                    last_period=summary.get("latest_period"),
                    base_done=True,
                    detail_done=True,
                )

        summary.update(
            {
                "phase": "done",
                "current_lottery": None,
                "current_period": None,
                "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
            }
        )
        self._emit(progress_callback, summary)
        self.logger.info("Bootstrapped lottery history", extra={"context": summary})
        return {key: value for key, value in summary.items() if not key.startswith("_")}

    def _fetch_base_history(self, lottery_code: str, *, chunk_size: int) -> dict[str, Any]:
        fetch_service = LotteryFetchService(
            lottery_service=self.lottery_service,
            lottery_code=lottery_code,
            message_service=_NoopBootstrapMessageService(),
        )
        limit = max(chunk_size, self.DEFAULT_BASE_LIMIT)
        return fetch_service.fetch_lskj_and_save(limit=limit)

    def _backfill_details(
        self,
        lottery_code: str,
        *,
        checkpoint: dict[str, Any] | None,
        summary: dict[str, Any],
        progress_callback: ProgressCallback | None,
        cancel_callback: CancelCallback | None,
    ) -> None:
        summary["phase"] = "detail"
        draws = self.lottery_service.repository.list_draws(limit=None, lottery_code=lottery_code)
        periods = [str(draw.get("period") or "").strip() for draw in draws if str(draw.get("period") or "").strip()]
        start_after_period = str((checkpoint or {}).get("last_period") or "").strip()
        if start_after_period:
            periods = self._periods_after_checkpoint(periods, start_after_period)
        fetch_service = LotteryFetchService(lottery_service=self.lottery_service, lottery_code=lottery_code)

        for period in periods:
            self._raise_if_cancelled(cancel_callback)
            summary["current_period"] = period
            summary["latest_period"] = period
            try:
                self._backfill_detail_with_retry(fetch_service, period)
                summary["detail_processed"] += 1
            except Exception as exc:
                summary["detail_failed"] += 1
                self.logger.warning(
                    "Lottery detail backfill failed",
                    extra={"context": {"lottery_code": lottery_code, "period": period, "error": str(exc)}},
                )
            finally:
                self.checkpoint_repository.upsert(
                    lottery_code,
                    phase="detail",
                    last_period=period,
                    base_done=True,
                    detail_done=False,
                )
                summary["processed_count"] = summary["detail_processed"]
                summary["failed_count"] = summary["detail_failed"]
                summary["duration_ms"] = round((time.perf_counter() - float(summary["_started_at"])) * 1000, 2)
                self._emit(progress_callback, summary)
                time.sleep(self.DETAIL_THROTTLE_SECONDS)

        self.checkpoint_repository.upsert(
            lottery_code,
            phase="done",
            last_period=periods[-1] if periods else start_after_period or None,
            base_done=True,
            detail_done=True,
        )

    def _backfill_detail_with_retry(self, fetch_service: LotteryFetchService, period: str) -> None:
        last_error: Exception | None = None
        for _attempt in range(max(1, self.DETAIL_RETRY)):
            try:
                fetch_service.backfill_draw_detail(period)
                return
            except Exception as exc:
                last_error = exc
                time.sleep(0.5)
        if last_error:
            raise last_error

    def _build_summary(
        self,
        *,
        lottery_codes: list[str],
        detail_mode: str,
        chunk_size: int,
        resume: bool,
        started_at: float,
    ) -> dict[str, Any]:
        return {
            "lottery_code": "all",
            "lottery_codes": lottery_codes,
            "total_lotteries": len(lottery_codes),
            "current_lottery": None,
            "current_lottery_index": 0,
            "phase": "queued",
            "detail_mode": detail_mode,
            "chunk_size": chunk_size,
            "resume": resume,
            "base_fetched": 0,
            "base_saved": 0,
            "detail_processed": 0,
            "detail_failed": 0,
            "fetched_count": 0,
            "saved_count": 0,
            "processed_count": 0,
            "failed_count": 0,
            "latest_period": None,
            "current_period": None,
            "duration_ms": 0,
            "_started_at": started_at,
        }

    @staticmethod
    def _emit(progress_callback: ProgressCallback | None, summary: dict[str, Any]) -> None:
        if progress_callback:
            public_summary = {key: value for key, value in summary.items() if not key.startswith("_")}
            progress_callback(public_summary)

    @staticmethod
    def _normalize_lottery_codes(lottery_codes: list[str] | None) -> list[str]:
        requested = lottery_codes or list(SUPPORTED_LOTTERY_CODES)
        result: list[str] = []
        for lottery_code in requested:
            normalized_code = normalize_lottery_code(lottery_code)
            if normalized_code not in result:
                result.append(normalized_code)
        return result or list(SUPPORTED_LOTTERY_CODES)

    @classmethod
    def _should_backfill_detail(cls, lottery_code: str, detail_mode: str) -> bool:
        return str(detail_mode or "all") == "all" and lottery_code in cls.DETAIL_LOTTERY_CODES

    @staticmethod
    def _periods_after_checkpoint(periods: list[str], last_period: str) -> list[str]:
        if last_period not in periods:
            return periods
        return periods[periods.index(last_period) + 1 :]

    @staticmethod
    def _raise_if_cancelled(cancel_callback: CancelCallback | None) -> None:
        if cancel_callback and cancel_callback():
            raise TaskCancelledError()


class LotteryBootstrapTaskService:
    def __init__(
        self,
        bootstrap_service: LotteryBootstrapService | None = None,
        maintenance_log_repository: MaintenanceRunLogRepository | None = None,
    ) -> None:
        self.bootstrap_service = bootstrap_service
        self.runner = BackgroundTaskRunner("services.lottery_bootstrap_task")
        self.maintenance_log_repository = maintenance_log_repository or MaintenanceRunLogRepository()
        self.logger = get_logger("services.lottery_bootstrap_task")

    def create_task(
        self,
        *,
        lottery_codes: list[str] | None = None,
        chunk_size: int = 100,
        detail_mode: str = "main",
        resume: bool = True,
        on_update=None,
    ) -> dict[str, Any]:
        normalized_codes = LotteryBootstrapService._normalize_lottery_codes(lottery_codes)
        bootstrap_service = self.bootstrap_service or LotteryBootstrapService()
        task = self.runner.create_task(
            initial_task={
                "lottery_code": "all",
                "progress_summary": {
                    "lottery_code": "all",
                    "lottery_codes": normalized_codes,
                    "total_lotteries": len(normalized_codes),
                    "current_lottery": None,
                    "current_lottery_index": 0,
                    "phase": "queued",
                    "detail_mode": detail_mode,
                    "chunk_size": chunk_size,
                    "resume": resume,
                    "base_fetched": 0,
                    "base_saved": 0,
                    "detail_processed": 0,
                    "detail_failed": 0,
                    "fetched_count": 0,
                    "saved_count": 0,
                    "processed_count": 0,
                    "failed_count": 0,
                    "latest_period": None,
                    "current_period": None,
                    "duration_ms": 0,
                },
            },
            worker=lambda progress_callback, cancel_callback: bootstrap_service.bootstrap(
                lottery_codes=normalized_codes,
                chunk_size=chunk_size,
                detail_mode=detail_mode,
                resume=resume,
                progress_callback=progress_callback,
                cancel_callback=cancel_callback,
            ),
            on_update=lambda state: self._handle_task_update(state, on_update=on_update),
        )
        self.maintenance_log_repository.create_log(
            task_id=str(task["task_id"]),
            lottery_code="all",
            schedule_task_code=None,
            trigger_type="manual",
            task_type="lottery_bootstrap",
            status=str(task["status"]),
            created_at=task.get("created_at"),
        )
        return task

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        return self.runner.get_task(task_id)

    def _handle_task_update(self, state: dict[str, Any], *, on_update=None) -> None:
        task_id = str(state.get("task_id") or "")
        if not task_id:
            return
        summary = state.get("progress_summary") if isinstance(state.get("progress_summary"), dict) else {}
        payload = {
            "task_type": "lottery_bootstrap",
            "status": str(state.get("status") or "queued"),
            "started_at": state.get("started_at"),
            "finished_at": state.get("finished_at"),
            "fetched_count": int(summary.get("base_fetched") or summary.get("fetched_count") or 0),
            "saved_count": int(summary.get("base_saved") or summary.get("saved_count") or 0),
            "processed_count": int(summary.get("detail_processed") or summary.get("processed_count") or 0),
            "failed_count": int(summary.get("detail_failed") or summary.get("failed_count") or 0),
            "latest_period": summary.get("current_period") or summary.get("latest_period"),
            "duration_ms": float(summary.get("duration_ms") or 0),
            "error_message": state.get("error_message"),
        }
        try:
            self.maintenance_log_repository.update_by_task_id(task_id, payload)
        except KeyError:
            try:
                self.maintenance_log_repository.create_log(
                    task_id=task_id,
                    lottery_code="all",
                    schedule_task_code=None,
                    trigger_type="manual",
                    task_type="lottery_bootstrap",
                    status=payload["status"],
                    created_at=state.get("created_at"),
                )
                self.maintenance_log_repository.update_by_task_id(task_id, payload)
            except Exception:
                self.logger.exception("Persist bootstrap maintenance log failed after create fallback", extra={"context": {"task_id": task_id}})
        except Exception:
            self.logger.exception("Persist bootstrap maintenance log failed", extra={"context": {"task_id": task_id}})
        if on_update:
            on_update(dict(state))


lottery_bootstrap_task_service = LotteryBootstrapTaskService()


class _NoopBootstrapMessageService:
    def generate_messages_for_periods(self, **_: Any) -> int:
        return 0

    def generate_messages_for_recent_draws(self, **_: Any) -> int:
        return 0
