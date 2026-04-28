from __future__ import annotations

import unittest
from unittest.mock import MagicMock, call, patch

from backend.app.repositories.schedule_repository import ScheduleRepository


class ScheduleRepositoryTests(unittest.TestCase):
    @patch("backend.app.repositories.schedule_repository.get_connection")
    def test_update_run_state_accepts_noop_update_when_task_exists(self, get_connection) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        get_connection.return_value.__enter__.return_value = connection
        connection.cursor.return_value.__enter__.return_value = cursor
        cursor.rowcount = 0
        cursor.fetchone.side_effect = [{"exists": 1}, {"id": 1, "task_code": "sched-1"}]

        repository = ScheduleRepository()
        with patch.object(repository, "get_task", return_value={"task_code": "sched-1"}) as get_task:
            result = repository.update_run_state("sched-1", {"last_run_status": "running"})

        self.assertEqual(result, {"task_code": "sched-1"})
        get_task.assert_called_once_with("sched-1")
        self.assertEqual(
            cursor.execute.call_args_list[-1],
            call("SELECT 1 FROM scheduled_task WHERE task_code = ?", ("sched-1",)),
        )

    @patch("backend.app.repositories.schedule_repository.get_connection")
    def test_update_run_state_raises_when_task_is_missing(self, get_connection) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        get_connection.return_value.__enter__.return_value = connection
        connection.cursor.return_value.__enter__.return_value = cursor
        cursor.rowcount = 0
        cursor.fetchone.return_value = None

        repository = ScheduleRepository()

        with self.assertRaises(KeyError):
            repository.update_run_state("missing-sched", {"last_run_status": "running"})


if __name__ == "__main__":
    unittest.main()
