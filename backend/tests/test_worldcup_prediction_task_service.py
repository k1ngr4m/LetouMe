from __future__ import annotations

import unittest
from unittest.mock import Mock

from backend.app.services.worldcup_prediction_task_service import WorldCupPredictionTaskService


class WorldCupPredictionTaskServiceTests(unittest.TestCase):
    def test_handle_task_update_creates_missing_maintenance_log_before_retry(self) -> None:
        log_repository = Mock()
        log_repository.update_by_task_id.side_effect = [KeyError("task-1"), {}]
        service = WorldCupPredictionTaskService(
            prediction_service=Mock(),
            maintenance_log_repository=log_repository,
        )
        state = {
            "task_id": "task-1",
            "lottery_code": "worldcup",
            "mode": "current",
            "model_code": "worldcup-model",
            "status": "queued",
            "created_at": 123,
            "started_at": None,
            "finished_at": None,
            "progress_summary": {
                "lottery_code": "worldcup",
                "mode": "current",
                "model_code": "worldcup-model",
                "match_date": "2026-06-16",
                "processed_count": 0,
                "skipped_count": 0,
                "failed_count": 0,
            },
            "error_message": None,
        }

        service._handle_task_update(state)

        self.assertEqual(log_repository.update_by_task_id.call_count, 2)
        log_repository.create_log.assert_called_once_with(
            task_id="task-1",
            lottery_code="worldcup",
            schedule_task_code=None,
            trigger_type="manual",
            task_type="worldcup_prediction_generate",
            mode="current",
            model_code="worldcup-model",
            status="queued",
            created_at=123,
        )


if __name__ == "__main__":
    unittest.main()
