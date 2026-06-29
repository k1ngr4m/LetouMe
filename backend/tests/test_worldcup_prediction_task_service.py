from __future__ import annotations

import unittest
from time import sleep
from unittest.mock import ANY, Mock

from backend.app.services.worldcup_prediction_task_service import WorldCupPredictionTaskService


class WorldCupPredictionTaskServiceTests(unittest.TestCase):
    def test_create_task_uses_bulk_worker_for_multiple_models(self) -> None:
        prediction_service = Mock()
        prediction_service.generate_for_models.return_value = {
            "lottery_code": "worldcup",
            "mode": "current",
            "model_code": "__bulk__",
            "processed_count": 2,
            "skipped_count": 0,
            "failed_count": 0,
        }
        log_repository = Mock()
        service = WorldCupPredictionTaskService(
            prediction_service=prediction_service,
            maintenance_log_repository=log_repository,
        )

        task = service.create_task(
            model_code="__bulk__",
            model_codes=["model-a", "model-b"],
            play_type="all",
            overwrite=False,
            match_date="2026-06-19",
            match_ids=["match-1"],
            parallelism=2,
        )
        for _ in range(20):
            if prediction_service.generate_for_models.called:
                break
            sleep(0.01)

        prediction_service.generate_for_models.assert_called_once()
        call_kwargs = prediction_service.generate_for_models.call_args.kwargs
        self.assertEqual(call_kwargs["model_codes"], ["model-a", "model-b"])
        self.assertEqual(call_kwargs["match_date"], "2026-06-19")
        self.assertEqual(call_kwargs["match_ids"], ["match-1"])
        self.assertEqual(call_kwargs["parallelism"], 2)
        log_repository.create_log.assert_any_call(
            task_id=str(task["task_id"]),
            lottery_code="worldcup",
            schedule_task_code=None,
            trigger_type="manual",
            task_type="worldcup_prediction_generate",
            mode="current",
            model_code="__bulk__",
            status=ANY,
            created_at=task.get("created_at"),
        )

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
