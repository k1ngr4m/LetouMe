from __future__ import annotations

import unittest
from unittest.mock import MagicMock, call, patch

from backend.app.repositories.maintenance_run_log_repository import MaintenanceRunLogRepository


class MaintenanceRunLogRepositoryTests(unittest.TestCase):
    @patch("backend.app.repositories.maintenance_run_log_repository.get_connection")
    def test_update_by_task_id_accepts_noop_update_when_row_exists(self, get_connection) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        get_connection.return_value.__enter__.return_value = connection
        connection.cursor.return_value.__enter__.return_value = cursor
        cursor.rowcount = 0
        cursor.fetchone.return_value = {"exists": 1}

        repository = MaintenanceRunLogRepository()
        payload = {"status": "queued", "task_type": "lottery_fetch"}

        updated = repository.update_by_task_id("task-1", payload)

        self.assertEqual(updated["task_id"], "task-1")
        self.assertEqual(updated["status"], "queued")
        self.assertEqual(
            cursor.execute.call_args_list[-1],
            call("SELECT 1 FROM maintenance_run_log WHERE task_id = ? LIMIT 1", ("task-1",)),
        )

    @patch("backend.app.repositories.maintenance_run_log_repository.get_connection")
    def test_update_by_task_id_raises_when_task_id_missing(self, get_connection) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        get_connection.return_value.__enter__.return_value = connection
        connection.cursor.return_value.__enter__.return_value = cursor
        cursor.rowcount = 0
        cursor.fetchone.return_value = None

        repository = MaintenanceRunLogRepository()

        with self.assertRaises(KeyError):
            repository.update_by_task_id("task-404", {"status": "queued"})


if __name__ == "__main__":
    unittest.main()
