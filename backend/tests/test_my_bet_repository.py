from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.app.repositories.my_bet_repository import MyBetRepository


class _FakeCursor:
    def __init__(self) -> None:
        self.rowcount = 0
        self.lastrowid = 0
        self._fetchone_results = [{"id": 24}]
        self.executed: list[tuple[str, tuple | None]] = []

    def execute(self, query: str, params=None):
        self.executed.append((" ".join(query.split()), params))
        if "UPDATE my_bet_record" in query:
            self.rowcount = 0
            return 0
        if "SELECT id FROM my_bet_record" in query:
            self.rowcount = 1
            return 1
        return 1

    def fetchone(self):
        return self._fetchone_results.pop(0) if self._fetchone_results else None

    def fetchall(self):
        return []


class _CursorContext:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self):
        return self._cursor

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class _ConnectionContext:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def cursor(self):
        return _CursorContext(self._cursor)


class MyBetRepositoryTests(unittest.TestCase):
    def test_normalize_datetime_value_formats_mysql_datetime(self) -> None:
        self.assertEqual(MyBetRepository._normalize_datetime_value(1776074095), "2026-04-13 17:54:55")
        self.assertEqual(MyBetRepository._normalize_datetime_value(1776074095000), "2026-04-13 17:54:55")
        self.assertEqual(MyBetRepository._normalize_datetime_value("2026-04-12T19:55:19+08:00"), "2026-04-12 19:55:19")
        self.assertIsNone(MyBetRepository._normalize_datetime_value(True))
        self.assertIsNone(MyBetRepository._normalize_datetime_value(None))

    def test_normalize_meta_time_value_supports_datetime_and_epoch_modes(self) -> None:
        self.assertEqual(
            MyBetRepository._normalize_meta_time_value(1776074095, storage_mode="datetime"),
            "2026-04-13 17:54:55",
        )
        self.assertEqual(
            MyBetRepository._normalize_meta_time_value(1776074095000, storage_mode="epoch"),
            1776074095,
        )
        self.assertIsNone(MyBetRepository._normalize_meta_time_value("bad-time", storage_mode="datetime"))

    def test_update_record_does_not_treat_unchanged_row_as_missing(self) -> None:
        repository = MyBetRepository()
        cursor = _FakeCursor()

        with (
            patch("backend.app.repositories.my_bet_repository.get_connection", return_value=_ConnectionContext(cursor)),
            patch("backend.app.repositories.my_bet_repository.MyBetRepository._replace_lines"),
            patch("backend.app.repositories.my_bet_repository.MyBetRepository._upsert_meta"),
            patch.object(repository, "get_record", return_value={"id": 24, "target_period": "26035"}),
        ):
            result = repository.update_record(
                24,
                7,
                {
                    "lottery_code": "dlt",
                    "target_period": "26035",
                    "play_type": "dlt",
                    "multiplier": 1,
                    "is_append": False,
                    "bet_count": 44,
                    "amount": 88,
                    "discount_amount": 0,
                    "lines": [],
                },
            )

        self.assertEqual(result, {"id": 24, "target_period": "26035"})
        self.assertTrue(any("SELECT id FROM my_bet_record" in query for query, _ in cursor.executed))


if __name__ == "__main__":
    unittest.main()
