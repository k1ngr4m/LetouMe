from __future__ import annotations

from typing import Any, Callable

from backend.app.logging_utils import get_logger
from backend.app.repositories.maintenance_run_log_repository import MaintenanceRunLogRepository
from backend.app.services.task_runner import BackgroundTaskRunner


class ExpertPredictionTaskService:
    def __init__(self, maintenance_log_repository: MaintenanceRunLogRepository | None = None) -> None:
        self.runner = BackgroundTaskRunner("services.expert_prediction_task")
        self.maintenance_log_repository = maintenance_log_repository or MaintenanceRunLogRepository()
        self.logger = get_logger("services.expert_prediction_task")

    def create_task(
        self,
        *,
        lottery_code: str,
        mode: str = "current",
        expert_code: str = "__experts__",
        worker: Callable[[Callable[[dict[str, Any]], None]], dict[str, Any]],
        on_update: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        normalized_mode = str(mode or "current").strip().lower()
        normalized_expert_code = str(expert_code or "__experts__").strip() or "__experts__"
        task = self.runner.create_task(
            initial_task={
                "lottery_code": lottery_code,
                "mode": normalized_mode,
                "expert_code": normalized_expert_code,
                "progress_summary": {
                    "lottery_code": lottery_code,
                    "mode": normalized_mode,
                    "expert_code": normalized_expert_code,
                    "selected_count": 0,
                    "processed_count": 0,
                    "failed_count": 0,
                    "skipped_count": 0,
                    "failed_experts": [],
                    "processed_experts": [],
                    "failed_periods": [],
                    "failed_details": [],
                    "target_period": "",
                },
                "error_message": None,
            },
            worker=worker,
            on_update=lambda state: self._handle_task_update(state, on_update=on_update),
        )
        self.maintenance_log_repository.create_log(
            task_id=str(task["task_id"]),
            lottery_code=lottery_code,
            schedule_task_code=None,
            trigger_type="manual",
            task_type="expert_generate",
            mode=normalized_mode,
            model_code=normalized_expert_code,
            status=str(task.get("status") or "queued"),
            created_at=task.get("created_at"),
        )
        return task

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        return self.runner.get_task(task_id)

    def _handle_task_update(
        self,
        state: dict[str, Any],
        *,
        on_update: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        task_id = str(state.get("task_id") or "")
        if not task_id:
            return
        summary = state.get("progress_summary") if isinstance(state.get("progress_summary"), dict) else {}
        mode_value = str(state.get("mode") or summary.get("mode") or "current").strip() or "current"
        expert_code_value = str(state.get("expert_code") or summary.get("expert_code") or "__experts__").strip() or "__experts__"
        payload = {
            "task_type": "expert_generate",
            "mode": mode_value,
            "model_code": expert_code_value,
            "status": str(state.get("status") or "queued"),
            "started_at": state.get("started_at"),
            "finished_at": state.get("finished_at"),
            "fetched_count": 0,
            "saved_count": 0,
            "processed_count": int(summary.get("processed_count") or 0),
            "skipped_count": int(summary.get("skipped_count") or 0),
            "failed_count": int(summary.get("failed_count") or 0),
            "latest_period": str(summary.get("target_period") or "") or None,
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
                    schedule_task_code=None,
                    trigger_type="manual",
                    task_type="expert_generate",
                    mode=mode_value,
                    model_code=expert_code_value,
                    status=payload["status"],
                    created_at=state.get("created_at"),
                )
                self.maintenance_log_repository.update_by_task_id(task_id, payload)
            except Exception:
                self.logger.exception("Persist expert maintenance run log failed after create fallback")
        except Exception:
            self.logger.exception("Persist expert maintenance run log failed")
        if on_update:
            on_update(dict(state))


expert_prediction_task_service = ExpertPredictionTaskService()
