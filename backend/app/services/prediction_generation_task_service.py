from __future__ import annotations

from typing import Any, Callable

from backend.app.logging_utils import get_logger
from backend.app.repositories.maintenance_run_log_repository import MaintenanceRunLogRepository
from backend.app.services.task_runner import BackgroundTaskRunner


class PredictionGenerationTaskService:
    def __init__(self, maintenance_log_repository: MaintenanceRunLogRepository | None = None) -> None:
        self.runner = BackgroundTaskRunner("services.prediction_generation_task")
        self.maintenance_log_repository = maintenance_log_repository or MaintenanceRunLogRepository()
        self.logger = get_logger("services.prediction_generation_task")

    def create_task(
        self,
        *,
        lottery_code: str,
        mode: str,
        model_code: str,
        worker: Callable[[Callable[[dict[str, Any]], None]], dict[str, Any]],
        trigger_type: str = "manual",
        on_update: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        task = self.runner.create_task(
            initial_task={
                "lottery_code": lottery_code,
                "mode": mode,
                "model_code": model_code,
                "progress_summary": {
                    "lottery_code": lottery_code,
                    "mode": mode,
                    "model_code": model_code,
                    "processed_count": 0,
                    "skipped_count": 0,
                    "failed_count": 0,
                    "failed_periods": [],
                    "completed_count": 0,
                    "failed_details": [],
                },
                "error_message": None,
            },
            worker=worker,
            on_update=lambda state: self._handle_task_update(state, trigger_type=trigger_type, on_update=on_update),
        )
        self.maintenance_log_repository.create_log(
            task_id=str(task["task_id"]),
            lottery_code=lottery_code,
            trigger_type=trigger_type,
            task_type="prediction_generate",
            mode=mode,
            model_code=model_code,
            status=str(task["status"]),
            created_at=task.get("created_at"),
        )
        return task

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        return self.runner.get_task(task_id)

    def _handle_task_update(self, state: dict[str, Any], *, trigger_type: str, on_update=None) -> None:
        task_id = str(state.get("task_id") or "")
        if not task_id:
            return
        summary = state.get("progress_summary") if isinstance(state.get("progress_summary"), dict) else {}
        mode_value = str(state.get("mode") or summary.get("mode") or "").strip() or None
        model_code_value = str(state.get("model_code") or summary.get("model_code") or "").strip() or None
        payload = {
            "task_type": "prediction_generate",
            "mode": mode_value,
            "model_code": model_code_value,
            "status": str(state.get("status") or "queued"),
            "started_at": state.get("started_at"),
            "finished_at": state.get("finished_at"),
            "fetched_count": 0,
            "saved_count": 0,
            "processed_count": int(summary.get("processed_count") or 0),
            "skipped_count": int(summary.get("skipped_count") or 0),
            "failed_count": int(summary.get("failed_count") or 0),
            "latest_period": None,
            "duration_ms": 0,
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
                    task_type="prediction_generate",
                    mode=mode_value,
                    model_code=model_code_value,
                    status=payload["status"],
                    created_at=state.get("created_at"),
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


prediction_generation_task_service = PredictionGenerationTaskService()
