from __future__ import annotations

import unittest
from unittest.mock import Mock

from backend.app.services.prediction_generation_task_service import PredictionGenerationTaskService


class PredictionGenerationTaskServiceTests(unittest.TestCase):
    def test_create_task_persists_maintenance_log(self) -> None:
        log_repository = Mock()
        service = PredictionGenerationTaskService(maintenance_log_repository=log_repository)
        service.runner = Mock()
        service.runner.create_task.return_value = {
            "task_id": "task-1",
            "status": "queued",
            "created_at": "2026-03-24T00:00:00Z",
        }

        result = service.create_task(
            lottery_code="pl3",
            mode="current",
            model_code="model-a",
            worker=lambda _progress_callback: {},
        )

        self.assertEqual(result["task_id"], "task-1")
        log_repository.create_log.assert_called_once_with(
            task_id="task-1",
            lottery_code="pl3",
            schedule_task_code=None,
            trigger_type="manual",
            task_type="prediction_generate",
            mode="current",
            model_code="model-a",
            status="queued",
            created_at="2026-03-24T00:00:00Z",
        )

    def test_handle_task_update_updates_prediction_counters(self) -> None:
        log_repository = Mock()
        log_repository.update_by_task_id.return_value = {}
        service = PredictionGenerationTaskService(maintenance_log_repository=log_repository)
        state = {
            "task_id": "task-1",
            "lottery_code": "dlt",
            "mode": "history",
            "model_code": "__bulk__",
            "status": "running",
            "created_at": "2026-03-24T00:00:00Z",
            "started_at": "2026-03-24T00:00:01Z",
            "finished_at": None,
            "progress_summary": {
                "processed_count": 2,
                "skipped_count": 1,
                "failed_count": 0,
            },
            "error_message": None,
        }

        service._handle_task_update(state, schedule_task_code=None, trigger_type="manual")

        args = log_repository.update_by_task_id.call_args.args
        self.assertEqual(args[0], "task-1")
        self.assertEqual(args[1]["task_type"], "prediction_generate")
        self.assertEqual(args[1]["mode"], "history")
        self.assertEqual(args[1]["model_code"], "__bulk__")
        self.assertEqual(args[1]["processed_count"], 2)
        self.assertEqual(args[1]["skipped_count"], 1)
        self.assertEqual(args[1]["failed_count"], 0)

    def test_handle_task_update_swallows_log_error_after_fallback(self) -> None:
        log_repository = Mock()
        log_repository.update_by_task_id.side_effect = [KeyError("task-1"), KeyError("task-1")]
        service = PredictionGenerationTaskService(maintenance_log_repository=log_repository)
        state = {
            "task_id": "task-1",
            "lottery_code": "dlt",
            "mode": "current",
            "model_code": "model-a",
            "status": "queued",
            "created_at": "2026-03-24T00:00:00Z",
            "started_at": None,
            "finished_at": None,
            "progress_summary": {"processed_count": 0, "skipped_count": 0, "failed_count": 0},
            "error_message": None,
        }

        service._handle_task_update(state, schedule_task_code=None, trigger_type="schedule")

        self.assertEqual(log_repository.update_by_task_id.call_count, 2)
        log_repository.create_log.assert_called_once()


if __name__ == "__main__":
    unittest.main()
