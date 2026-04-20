from __future__ import annotations

from datetime import date, datetime
from contextlib import contextmanager
import unittest
from unittest.mock import Mock, patch

from backend.app.repositories.prediction_repository import PredictionRepository


class PredictionRepositoryTests(unittest.TestCase):
    def test_serialize_prediction_date_handles_date_like_values(self) -> None:
        repository = PredictionRepository()

        self.assertEqual(repository._serialize_prediction_date(date(2026, 3, 26)), "2026-03-26")
        self.assertEqual(
            repository._serialize_prediction_date(datetime(2026, 3, 26, 14, 16, 55)),
            "2026-03-26",
        )
        self.assertEqual(repository._serialize_prediction_date("2026-03-26"), "2026-03-26")
        self.assertEqual(repository._serialize_prediction_date(None), "")

    def test_upsert_history_record_retries_retryable_lock_timeout(self) -> None:
        repository = PredictionRepository(log_repository=Mock())
        payload = {
            "lottery_code": "dlt",
            "target_period": "26029",
            "prediction_date": "2026-03-30",
            "models": [],
        }
        connection = Mock()
        attempts = {"count": 0}

        @contextmanager
        def fake_connection():
            yield connection

        def fake_upsert_batch(*args, **kwargs):
            attempts["count"] += 1
            if attempts["count"] < 3:
                raise RuntimeError(1205, "Lock wait timeout exceeded; try restarting transaction")
            return 42

        with (
            patch("backend.app.repositories.prediction_repository.get_connection", fake_connection),
            patch.object(repository, "_sync_registry"),
            patch.object(repository, "_upsert_batch", side_effect=fake_upsert_batch),
            patch("backend.app.repositories.prediction_repository.sleep"),
        ):
            repository.upsert_history_record(payload)

        self.assertEqual(attempts["count"], 3)
        self.assertEqual(repository.log_repository.log_success.call_count, 1)
        self.assertEqual(repository.log_repository.log_failure.call_count, 0)

    def test_upsert_history_record_raises_after_retry_limit(self) -> None:
        repository = PredictionRepository(log_repository=Mock())
        payload = {
            "lottery_code": "dlt",
            "target_period": "26029",
            "prediction_date": "2026-03-30",
            "models": [],
        }
        connection = Mock()

        @contextmanager
        def fake_connection():
            yield connection

        with (
            patch("backend.app.repositories.prediction_repository.get_connection", fake_connection),
            patch.object(repository, "_sync_registry"),
            patch.object(
                repository,
                "_upsert_batch",
                side_effect=RuntimeError(1205, "Lock wait timeout exceeded; try restarting transaction"),
            ),
            patch("backend.app.repositories.prediction_repository.sleep"),
        ):
            with self.assertRaisesRegex(RuntimeError, "Lock wait timeout exceeded"):
                repository.upsert_history_record(payload)

        self.assertEqual(repository.log_repository.log_failure.call_count, 1)

    def test_upsert_batch_uses_atomic_insert_on_duplicate_for_archived(self) -> None:
        repository = PredictionRepository(log_repository=Mock())
        payload = {
            "lottery_code": "pl5",
            "target_period": "26099",
            "prediction_date": "2026-04-18",
            "models": [],
        }

        class _FakeCursor:
            def __init__(self) -> None:
                self.executed: list[tuple[str, tuple | None]] = []
                self.lastrowid = 1202

            def execute(self, query: str, params: tuple | None = None) -> None:
                self.executed.append((" ".join(query.split()), params))

            def fetchone(self):
                return None

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb) -> None:
                return None

        class _FakeConnection:
            def __init__(self) -> None:
                self.cursor_instance = _FakeCursor()

            def cursor(self) -> _FakeCursor:
                return self.cursor_instance

        connection = _FakeConnection()
        with (
            patch("backend.app.repositories.prediction_repository._upsert_issue", return_value=1202),
            patch.object(repository, "_save_model_runs"),
        ):
            batch_id = repository._upsert_batch(
                connection,
                payload=payload,
                status="archived",
                archive_metadata=True,
            )

        self.assertEqual(batch_id, 1202)
        executed_sql = [query for query, _ in connection.cursor_instance.executed]
        self.assertTrue(any("INSERT INTO prediction_batch" in query for query in executed_sql))
        self.assertTrue(any("ON DUPLICATE KEY UPDATE" in query for query in executed_sql))
        self.assertFalse(any("SELECT id FROM prediction_batch" in query for query in executed_sql))
        self.assertTrue(any("DELETE FROM prediction_model_run" in query for query in executed_sql))


if __name__ == "__main__":
    unittest.main()
