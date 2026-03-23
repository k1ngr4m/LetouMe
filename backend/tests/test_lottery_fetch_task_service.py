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
        service.runner.create_task.return_value = {"task_id": "task-1"}

        result = service.create_task("pl5")

        self.assertEqual(result["task_id"], "task-1")
        call_kwargs = service.runner.create_task.call_args.kwargs
        self.assertEqual(call_kwargs["initial_task"]["progress_summary"]["limit"], 30)
        worker = call_kwargs["worker"]
        worker(None)
        fetch_service.fetch_and_save.assert_called_once_with(limit=30)


if __name__ == "__main__":
    unittest.main()
