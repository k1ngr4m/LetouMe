from __future__ import annotations

import inspect
from threading import Lock, Thread
from typing import Any, Callable
from uuid import uuid4

from backend.app.logging_utils import get_logger
from backend.app.time_utils import now_ts


class TaskCancelledError(Exception):
    pass


class BackgroundTaskRunner:
    def __init__(self, logger_name: str) -> None:
        self._tasks: dict[str, dict[str, Any]] = {}
        self._task_callbacks: dict[str, Callable[[dict[str, Any]], None] | None] = {}
        self._lock = Lock()
        self.logger = get_logger(logger_name)

    def create_task(
        self,
        *,
        initial_task: dict[str, Any],
        worker: Callable[..., dict[str, Any]],
        on_update: Callable[[dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        task_id = uuid4().hex
        task = {
            "task_id": task_id,
            "status": "queued",
            "created_at": self._timestamp(),
            "started_at": None,
            "finished_at": None,
            "error_message": None,
            "cancel_requested": False,
            **initial_task,
        }
        with self._lock:
            self._tasks[task_id] = task
            self._task_callbacks[task_id] = on_update
        if on_update:
            on_update(dict(task))

        thread = Thread(target=self._run_task, args=(task_id, worker, on_update), daemon=True)
        thread.start()
        return dict(task)

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        with self._lock:
            task = self._tasks.get(task_id)
            return dict(task) if task else None

    def cancel_task(self, task_id: str) -> dict[str, Any] | None:
        callback: Callable[[dict[str, Any]], None] | None = None
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            callback = self._task_callbacks.get(task_id)
            status = str(task.get("status") or "queued")
            if status in {"succeeded", "failed", "cancelled"}:
                return dict(task)
            task["cancel_requested"] = True
            if status == "queued":
                task["status"] = "cancelled"
                task["finished_at"] = self._timestamp()
                task["error_message"] = None
            snapshot = dict(task)
        if callback:
            callback(snapshot)
        return snapshot

    def _run_task(
        self,
        task_id: str,
        worker: Callable[..., dict[str, Any]],
        on_update: Callable[[dict[str, Any]], None] | None = None,
    ) -> None:
        self._update_task(task_id, {"status": "running", "started_at": self._timestamp()}, on_update=on_update)
        if self._is_cancel_requested(task_id):
            self._update_task(
                task_id,
                {
                    "status": "cancelled",
                    "finished_at": self._timestamp(),
                    "error_message": None,
                },
                on_update=on_update,
            )
            self._cleanup_task_callback(task_id)
            return
        try:
            progress_callback = lambda summary: self._update_task(task_id, {"progress_summary": summary}, on_update=on_update)
            supports_cancel = self._worker_supports_cancellation(worker)
            result = (
                worker(progress_callback, lambda: self._is_cancel_requested(task_id))
                if supports_cancel
                else worker(progress_callback)
            )
            if self._is_cancel_requested(task_id):
                self._update_task(
                    task_id,
                    {
                        "status": "cancelled",
                        "finished_at": self._timestamp(),
                        "progress_summary": result,
                        "error_message": None,
                    },
                    on_update=on_update,
                )
                self._cleanup_task_callback(task_id)
                return
            self._update_task(
                task_id,
                {
                    "status": "succeeded",
                    "finished_at": self._timestamp(),
                    "progress_summary": result,
                },
                on_update=on_update,
            )
        except TaskCancelledError:
            self._update_task(
                task_id,
                {
                    "status": "cancelled",
                    "finished_at": self._timestamp(),
                    "error_message": None,
                },
                on_update=on_update,
            )
        except Exception as exc:
            self.logger.exception("Background task failed", extra={"context": {"task_id": task_id}})
            self._update_task(
                task_id,
                {
                    "status": "failed",
                    "finished_at": self._timestamp(),
                    "error_message": str(exc),
                },
                on_update=on_update,
            )
        finally:
            self._cleanup_task_callback(task_id)

    def _update_task(self, task_id: str, updates: dict[str, Any], *, on_update: Callable[[dict[str, Any]], None] | None = None) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return
            task.update(updates)
            snapshot = dict(task)
        if on_update:
            on_update(snapshot)

    def _cleanup_task_callback(self, task_id: str) -> None:
        with self._lock:
            self._task_callbacks.pop(task_id, None)

    def _is_cancel_requested(self, task_id: str) -> bool:
        with self._lock:
            task = self._tasks.get(task_id)
            return bool(task and task.get("cancel_requested"))

    @staticmethod
    def _worker_supports_cancellation(worker: Callable[..., Any]) -> bool:
        try:
            parameters = list(inspect.signature(worker).parameters.values())
        except (ValueError, TypeError):
            return False
        required_params = [
            parameter
            for parameter in parameters
            if parameter.kind in {inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD}
            and parameter.default is inspect.Parameter.empty
        ]
        return len(required_params) >= 2

    @staticmethod
    def _timestamp() -> int:
        return now_ts()
