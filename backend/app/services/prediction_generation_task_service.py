from __future__ import annotations

from datetime import datetime
from threading import Lock, Thread
from uuid import uuid4
from typing import Any, Callable

from backend.app.logging_utils import get_logger


class PredictionGenerationTaskService:
    def __init__(self) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}
        self._lock = Lock()
        self.logger = get_logger("services.prediction_generation_task")

    def create_task(
        self,
        *,
        mode: str,
        model_code: str,
        worker: Callable[[Callable[[dict[str, Any]], None]], dict[str, Any]],
    ) -> dict[str, Any]:
        task_id = uuid4().hex
        task = {
            "task_id": task_id,
            "status": "queued",
            "mode": mode,
            "model_code": model_code,
            "created_at": self._timestamp(),
            "started_at": None,
            "finished_at": None,
            "progress_summary": {
                "mode": mode,
                "model_code": model_code,
                "processed_count": 0,
                "skipped_count": 0,
                "failed_count": 0,
                "failed_periods": [],
            },
            "error_message": None,
        }
        with self._lock:
            self._tasks[task_id] = task

        thread = Thread(target=self._run_task, args=(task_id, worker), daemon=True)
        thread.start()
        return dict(task)

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        with self._lock:
            task = self._tasks.get(task_id)
            return dict(task) if task else None

    def _run_task(
        self,
        task_id: str,
        worker: Callable[[Callable[[dict[str, Any]], None]], dict[str, Any]],
    ) -> None:
        self._update_task(task_id, {"status": "running", "started_at": self._timestamp()})
        try:
            result = worker(lambda summary: self._update_task(task_id, {"progress_summary": summary}))
            self._update_task(
                task_id,
                {
                    "status": "succeeded",
                    "finished_at": self._timestamp(),
                    "progress_summary": result,
                },
            )
        except Exception as exc:
            self.logger.exception("Prediction generation task failed", extra={"context": {"task_id": task_id}})
            self._update_task(
                task_id,
                {
                    "status": "failed",
                    "finished_at": self._timestamp(),
                    "error_message": str(exc),
                },
            )

    def _update_task(self, task_id: str, updates: dict[str, Any]) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return
            task.update(updates)

    @staticmethod
    def _timestamp() -> str:
        return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


prediction_generation_task_service = PredictionGenerationTaskService()
