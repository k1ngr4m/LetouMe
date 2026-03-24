from __future__ import annotations

import unittest
from unittest.mock import Mock

from backend.app.services.lottery_fetch_task_service import LotteryFetchTaskService


class LotteryFetchTaskServiceTests(unittest.TestCase):
    def test_create_task_defaults_to_limit_30(self) -> None:
        fetch_service = Mock()
        fetch_service.fetch_and_save.return_value = {"saved_count": 30}
        service = LotteryFetchTaskService(fetch_service=fetch_service)
        service.runner = Mock()
        service.runner.create_task.return_value = {"task_id": "task-1", "status": "queued", "created_at": "2026-03-24T00:00:00Z"}
        service.maintenance_log_repository = Mock()

        result = service.create_task("pl5")

        self.assertEqual(result["task_id"], "task-1")
        call_kwargs = service.runner.create_task.call_args.kwargs
        self.assertEqual(call_kwargs["initial_task"]["progress_summary"]["limit"], 30)
        worker = call_kwargs["worker"]
        worker(None)
        fetch_service.fetch_and_save.assert_called_once_with(limit=30)

    def test_handle_task_update_does_not_raise_when_log_update_is_noop(self) -> None:
        fetch_service = Mock()
        log_repository = Mock()
        log_repository.update_by_task_id.return_value = {}
        service = LotteryFetchTaskService(fetch_service=fetch_service, maintenance_log_repository=log_repository)
        state = {
            "task_id": "task-1",
            "lottery_code": "dlt",
            "status": "queued",
            "created_at": "2026-03-24T00:00:00Z",
            "started_at": None,
            "finished_at": None,
            "progress_summary": {"fetched_count": 0, "saved_count": 0, "latest_period": None, "duration_ms": 0},
            "error_message": None,
        }

        service._handle_task_update(state, trigger_type="manual")

        log_repository.update_by_task_id.assert_called_once()

    def test_handle_task_update_swallows_log_error_after_fallback(self) -> None:
        fetch_service = Mock()
        log_repository = Mock()
        log_repository.update_by_task_id.side_effect = [KeyError("task-1"), KeyError("task-1")]
        service = LotteryFetchTaskService(fetch_service=fetch_service, maintenance_log_repository=log_repository)
        state = {
            "task_id": "task-1",
            "lottery_code": "dlt",
            "status": "queued",
            "created_at": "2026-03-24T00:00:00Z",
            "started_at": None,
            "finished_at": None,
            "progress_summary": {"fetched_count": 0, "saved_count": 0, "latest_period": None, "duration_ms": 0},
            "error_message": None,
        }

        service._handle_task_update(state, trigger_type="manual")

        self.assertEqual(log_repository.update_by_task_id.call_count, 2)
        log_repository.create_log.assert_called_once()


if __name__ == "__main__":
    unittest.main()
