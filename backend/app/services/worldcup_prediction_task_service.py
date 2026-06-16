from __future__ import annotations

from typing import Any

from backend.app.logging_utils import get_logger
from backend.app.repositories.maintenance_run_log_repository import MaintenanceRunLogRepository
from backend.app.services.task_runner import BackgroundTaskRunner
from backend.app.services.worldcup_prediction_service import WorldCupPredictionService


class WorldCupPredictionTaskService:
    def __init__(
        self,
        prediction_service: WorldCupPredictionService | None = None,
        maintenance_log_repository: MaintenanceRunLogRepository | None = None,
    ) -> None:
        self.prediction_service = prediction_service or WorldCupPredictionService()
        self.runner = BackgroundTaskRunner("services.worldcup_prediction_task")
        self.maintenance_log_repository = maintenance_log_repository or MaintenanceRunLogRepository()
        self.logger = get_logger("services.worldcup_prediction_task")

    def create_task(self, *, model_code: str, play_type: str = "all", overwrite: bool = False, match_date: str | None = None) -> dict[str, Any]:
        task = self.runner.create_task(
            initial_task={
                "lottery_code": "worldcup",
                "mode": "current",
                "model_code": model_code,
                "match_date": match_date,
                "progress_summary": {
                    "lottery_code": "worldcup",
                    "mode": "current",
                    "model_code": model_code,
                    "match_date": match_date,
                    "processed_count": 0,
                    "skipped_count": 0,
                    "failed_count": 0,
                    "failed_periods": [],
                    "completed_count": 0,
                    "failed_details": [],
                },
                "error_message": None,
            },
            worker=lambda progress_callback: self.prediction_service.generate_for_model(
                model_code=model_code,
                play_type=play_type,
                overwrite=overwrite,
                match_date=match_date,
                progress_callback=progress_callback,
            ),
            on_update=self._handle_task_update,
        )
        self.maintenance_log_repository.create_log(
            task_id=str(task["task_id"]),
            lottery_code="worldcup",
            schedule_task_code=None,
            trigger_type="manual",
            task_type="worldcup_prediction_generate",
            mode="current",
            model_code=model_code,
            status=str(task["status"]),
            created_at=task.get("created_at"),
        )
        return task

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        return self.runner.get_task(task_id)

    def _handle_task_update(self, state: dict[str, Any]) -> None:
        task_id = str(state.get("task_id") or "")
        if not task_id:
            return
        summary = state.get("progress_summary") if isinstance(state.get("progress_summary"), dict) else {}
        payload = {
            "task_type": "worldcup_prediction_generate",
            "mode": "current",
            "model_code": str(state.get("model_code") or summary.get("model_code") or ""),
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
                    lottery_code="worldcup",
                    schedule_task_code=None,
                    trigger_type="manual",
                    task_type="worldcup_prediction_generate",
                    mode="current",
                    model_code=payload["model_code"],
                    status=payload["status"],
                    created_at=state.get("created_at"),
                )
                self.maintenance_log_repository.update_by_task_id(task_id, payload)
            except Exception:
                self.logger.exception(
                    "Persist worldcup prediction log failed after create fallback",
                    extra={"context": {"task_id": task_id}},
                )
        except Exception:
            self.logger.exception("Persist worldcup prediction log failed", extra={"context": {"task_id": task_id}})


worldcup_prediction_task_service = WorldCupPredictionTaskService()
