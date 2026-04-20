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


class _FakeSchemaCursor:
    def __init__(self, column_type: str) -> None:
        self._column_type = column_type

    def execute(self, query: str, params=None):
        return 1

    def fetchone(self):
        return {"Type": self._column_type}


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

    def test_resolve_meta_time_storage_mode_uses_current_schema(self) -> None:
        MyBetRepository._meta_time_storage_mode = "epoch"

        mode = MyBetRepository._resolve_meta_time_storage_mode(_FakeSchemaCursor("datetime"))

        self.assertEqual(mode, "datetime")
        self.assertEqual(MyBetRepository._meta_time_storage_mode, "datetime")

    def test_upsert_meta_converts_epoch_to_datetime_when_column_is_datetime(self) -> None:
        cursor = _FakeCursor()
        payload = {
            "source_type": "ocr",
            "ticket_purchased_at": "1776592860",
            "ocr_recognized_at": "1776592860",
        }

        original_execute = cursor.execute

        def execute_with_schema(query: str, params=None):
            cursor.executed.append((" ".join(query.split()), params))
            if "SHOW COLUMNS FROM my_bet_record_meta LIKE 'ticket_purchased_at'" in query:
                return 1
            return original_execute(query, params)

        def fetchone_with_schema():
            if cursor.executed and "SHOW COLUMNS FROM my_bet_record_meta LIKE 'ticket_purchased_at'" in cursor.executed[-1][0]:
                return {"Type": "datetime"}
            return _FakeCursor.fetchone(cursor)

        cursor.execute = execute_with_schema  # type: ignore[method-assign]
        cursor.fetchone = fetchone_with_schema  # type: ignore[method-assign]
        MyBetRepository._meta_time_storage_mode = "epoch"

        MyBetRepository._upsert_meta(cursor, record_id=12, lottery_code="pl5", payload=payload)

        insert_sql, insert_params = next((item for item in cursor.executed if "INSERT INTO my_bet_record_meta" in item[0]), ("", None))
        self.assertIn("INSERT INTO my_bet_record_meta", insert_sql)
        self.assertEqual(insert_params[5], "2026-04-19 18:01:00")
        self.assertEqual(insert_params[6], "2026-04-19 18:01:00")

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
