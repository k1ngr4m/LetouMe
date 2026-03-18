from __future__ import annotations

from typing import Any, Callable

from backend.app.services.task_runner import BackgroundTaskRunner


class PredictionGenerationTaskService:
    def __init__(self) -> None:
        self.runner = BackgroundTaskRunner("services.prediction_generation_task")

    def create_task(
        self,
        *,
        lottery_code: str,
        mode: str,
        model_code: str,
        worker: Callable[[Callable[[dict[str, Any]], None]], dict[str, Any]],
    ) -> dict[str, Any]:
        return self.runner.create_task(
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
        )

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        return self.runner.get_task(task_id)


prediction_generation_task_service = PredictionGenerationTaskService()
