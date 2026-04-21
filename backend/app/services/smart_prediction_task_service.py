from __future__ import annotations

from typing import Any, Callable

from backend.app.services.task_runner import BackgroundTaskRunner


class SmartPredictionTaskService:
    def __init__(self) -> None:
        self.runner = BackgroundTaskRunner("services.smart_prediction_task")

    def create_task(
        self,
        *,
        run_id: str,
        stage: str,
        worker: Callable[..., dict[str, Any]],
        on_update: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        return self.runner.create_task(
            initial_task={
                "run_id": run_id,
                "stage": stage,
                "progress_summary": {
                    "run_id": run_id,
                    "stage": stage,
                },
            },
            worker=worker,
            on_update=on_update,
        )

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        return self.runner.get_task(task_id)

    def cancel_task(self, task_id: str) -> dict[str, Any] | None:
        return self.runner.cancel_task(task_id)


smart_prediction_task_service = SmartPredictionTaskService()
