from __future__ import annotations

import unittest
from contextlib import contextmanager
from unittest.mock import MagicMock, Mock, patch

from backend.app.repositories.lottery_repository import LotteryRepository
from backend.app.repositories.prediction_repository import PredictionRepository
from backend.app.repositories.write_log_repository import WriteLogRepository


@contextmanager
def connection_context(connection):
    yield connection


class WriteLogRepositoryTests(unittest.TestCase):
    def test_log_failure_uses_dedicated_connection(self) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor

        with patch(
            "backend.app.repositories.write_log_repository.get_connection",
            return_value=connection_context(connection),
        ):
            repository = WriteLogRepository()
            repository.log_failure(
                table_name="draw_issue",
                action="upsert",
                target_key="period=2025001",
                summary="upsert draw_issue period=2025001",
                error_message="RuntimeError: boom",
            )

        self.assertGreaterEqual(cursor.execute.call_count, 1)
        sql, params = cursor.execute.call_args.args
        self.assertIn("INSERT INTO write_log", sql)
        self.assertEqual(
            params,
            (
                "draw_issue",
                "2025001",
                "draw_issue",
                "upsert",
                "period=2025001",
                "failed",
                "upsert draw_issue period=2025001",
                "RuntimeError: boom",
            ),
        )


class LotteryRepositoryLoggingTests(unittest.TestCase):
    def test_upsert_draw_logs_success(self) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        log_repository = Mock()

        with patch(
            "backend.app.repositories.lottery_repository.get_connection",
            return_value=connection_context(connection),
        ):
            repository = LotteryRepository(log_repository=log_repository)
            repository.upsert_draw(
                {
                    "period": "2025001",
                    "date": "2025-01-01",
                    "red_balls": ["01"],
                    "blue_balls": ["02"],
                }
            )

        self.assertTrue(cursor.execute.called)
        log_repository.log_success.assert_called_once_with(
            connection,
            table_name="draw_issue",
            action="upsert",
            target_key="period=2025001",
            summary="upsert draw_issue period=2025001",
        )
        log_repository.log_failure.assert_not_called()

    def test_upsert_draw_logs_failure(self) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        cursor.execute.side_effect = RuntimeError("boom")
        connection.cursor.return_value.__enter__.return_value = cursor
        log_repository = Mock()

        with patch(
            "backend.app.repositories.lottery_repository.get_connection",
            return_value=connection_context(connection),
        ):
            repository = LotteryRepository(log_repository=log_repository)
            with self.assertRaises(RuntimeError):
                repository.upsert_draw(
                    {
                        "period": "2025001",
                        "date": "2025-01-01",
                        "red_balls": ["01"],
                        "blue_balls": ["02"],
                    }
                )

        log_repository.log_failure.assert_called_once()
        kwargs = log_repository.log_failure.call_args.kwargs
        self.assertEqual(kwargs["table_name"], "draw_issue")
        self.assertEqual(kwargs["target_key"], "period=2025001")
        self.assertIn("RuntimeError: boom", kwargs["error_message"])


class PredictionRepositoryLoggingTests(unittest.TestCase):
    def test_upsert_current_prediction_logs_success(self) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        log_repository = Mock()
        payload = {
            "target_period": "2025002",
            "prediction_date": "2025-01-02",
            "models": [],
        }

        with patch(
            "backend.app.repositories.prediction_repository.get_connection",
            return_value=connection_context(connection),
        ):
            repository = PredictionRepository(log_repository=log_repository)
            repository.upsert_current_prediction(payload)

        log_repository.log_success.assert_called_once_with(
            connection,
            table_name="prediction_batch",
            action="upsert",
            target_key="target_period=2025002",
            summary="upsert prediction_batch(current) target_period=2025002",
            payload={
                "target_period": "2025002",
                "prediction_date": "2025-01-02",
                "batch_id": unittest.mock.ANY,
            },
        )
        log_repository.log_failure.assert_not_called()

    def test_log_success_persists_structured_log(self) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        connection.cursor.return_value.__enter__.return_value = cursor
        cursor.lastrowid = 99
        payload = {"target_period": "2025002", "models": [{"model_id": "glm-5"}]}

        repository = WriteLogRepository()
        repository.log_success(
            connection,
            table_name="prediction_batch",
            action="upsert",
            target_key="target_period=2025002",
            summary="upsert prediction_batch(current) target_period=2025002",
            payload=payload,
        )

        sql, params = cursor.execute.call_args_list[0].args
        self.assertIn("INSERT INTO write_log", sql)
        self.assertEqual(params[0:4], (
            "prediction_batch",
            "2025002",
            "prediction_batch",
            "upsert",
        ))
        self.assertEqual(params[4], "target_period=2025002")
        self.assertEqual(params[5], "success")
        self.assertEqual(params[6], "upsert prediction_batch(current) target_period=2025002")
        self.assertIsNone(params[7])


if __name__ == "__main__":
    unittest.main()
