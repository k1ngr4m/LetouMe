from __future__ import annotations

from typing import Any

from backend.app.logging_utils import get_logger
from backend.app.repositories.maintenance_run_log_repository import MaintenanceRunLogRepository
from backend.app.services.lottery_fetch_service import LotteryFetchService
from backend.app.services.task_runner import BackgroundTaskRunner


class LotteryFetchTaskService:
    def __init__(
        self,
        fetch_service: LotteryFetchService | None = None,
        maintenance_log_repository: MaintenanceRunLogRepository | None = None,
    ) -> None:
        self.fetch_service = fetch_service
        self.runner = BackgroundTaskRunner("services.lottery_fetch_task")
        self.maintenance_log_repository = maintenance_log_repository or MaintenanceRunLogRepository()
        self.logger = get_logger("services.lottery_fetch_task")

    def create_task(
        self,
        lottery_code: str = "dlt",
        *,
        limit: int | None = 30,
        trigger_type: str = "manual",
        on_update=None,
    ) -> dict:
        fetch_service = self.fetch_service or LotteryFetchService(lottery_code=lottery_code)
        task = self.runner.create_task(
            initial_task={
                "lottery_code": lottery_code,
                "progress_summary": {
                    "lottery_code": lottery_code,
                    "limit": limit,
                    "fetched_count": 0,
                    "saved_count": 0,
                    "latest_period": None,
                    "duration_ms": 0,
                }
            },
            worker=lambda _progress_callback: fetch_service.fetch_and_save(limit=limit),
            on_update=lambda state: self._handle_task_update(state, trigger_type=trigger_type, on_update=on_update),
        )
        self.maintenance_log_repository.create_log(
            task_id=str(task["task_id"]),
            lottery_code=lottery_code,
            trigger_type=trigger_type,
            task_type="lottery_fetch",
            status=str(task["status"]),
            created_at=str(task.get("created_at") or ""),
        )
        return task

    def get_task(self, task_id: str) -> dict | None:
        return self.runner.get_task(task_id)

    def list_logs(self, *, lottery_code: str | None = None, limit: int = 20, offset: int = 0) -> dict[str, Any]:
        return self.maintenance_log_repository.list_logs(lottery_code=lottery_code, limit=limit, offset=offset)

    def _handle_task_update(self, state: dict[str, Any], *, trigger_type: str, on_update=None) -> None:
        task_id = str(state.get("task_id") or "")
        if not task_id:
            return
        summary = state.get("progress_summary") if isinstance(state.get("progress_summary"), dict) else {}
        payload = {
            "task_type": "lottery_fetch",
            "status": str(state.get("status") or "queued"),
            "started_at": state.get("started_at"),
            "finished_at": state.get("finished_at"),
            "fetched_count": int(summary.get("fetched_count") or 0),
            "saved_count": int(summary.get("saved_count") or 0),
            "latest_period": summary.get("latest_period"),
            "duration_ms": float(summary.get("duration_ms") or 0),
            "error_message": state.get("error_message"),
        }
        try:
            self.maintenance_log_repository.update_by_task_id(task_id, payload)
        except KeyError:
            try:
                self.maintenance_log_repository.create_log(
                    task_id=task_id,
                    lottery_code=str(state.get("lottery_code") or "dlt"),
                    trigger_type=trigger_type,
                    task_type="lottery_fetch",
                    status=payload["status"],
                    created_at=str(state.get("created_at") or ""),
                )
                self.maintenance_log_repository.update_by_task_id(task_id, payload)
            except Exception:
                self.logger.exception(
                    "Persist maintenance run log failed after create fallback",
                    extra={"context": {"task_id": task_id, "trigger_type": trigger_type}},
                )
        except Exception:
            self.logger.exception(
                "Persist maintenance run log failed",
                extra={"context": {"task_id": task_id, "trigger_type": trigger_type}},
            )
        if on_update:
            on_update(dict(state))


lottery_fetch_task_service = LotteryFetchTaskService()
