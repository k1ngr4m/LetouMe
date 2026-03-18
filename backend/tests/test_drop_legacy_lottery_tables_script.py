from __future__ import annotations

import json
import unittest
from argparse import Namespace
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import patch

from backend.scripts import drop_legacy_lottery_tables as script


class _FakeCursor:
    def __init__(self, existing_tables: set[str]) -> None:
        self.existing_tables = existing_tables
        self.executed: list[tuple[str, tuple | None]] = []
        self._rows: list[dict[str, str]] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def execute(self, query: str, params: tuple | None = None) -> None:
        self.executed.append((query, params))
        if "INFORMATION_SCHEMA.TABLES" in query:
            table_names = set(str(item) for item in (params or ())[1:])
            self._rows = [{"TABLE_NAME": table_name} for table_name in table_names if table_name in self.existing_tables]
            return
        self._rows = []

    def fetchall(self) -> list[dict[str, str]]:
        return list(self._rows)


class _FakeConnection:
    def __init__(self, cursor: _FakeCursor) -> None:
        self._cursor = cursor

    def cursor(self) -> _FakeCursor:
        return self._cursor


@contextmanager
def _connection_context(connection: _FakeConnection):
    yield connection


def _build_existing_tables(*, include_legacy: list[str] | None = None) -> set[str]:
    split_tables = set(script.required_split_tables(["dlt", "pl3"]))
    if include_legacy:
        split_tables.update(include_legacy)
    return split_tables


class DropLegacyLotteryTablesScriptTests(unittest.TestCase):
    def test_dry_run_only_reports_tables(self) -> None:
        cursor = _FakeCursor(_build_existing_tables(include_legacy=["draw_issue", "draw_result"]))
        connection = _FakeConnection(cursor)

        with (
            patch.object(script, "parse_args", return_value=Namespace(lottery_codes="dlt,pl3", dry_run=True, skip_backup=True, backup_dir=None)),
            patch.object(script, "ensure_schema"),
            patch.object(script, "backup_mysql_database") as backup_mock,
            patch.object(script, "load_settings", return_value=SimpleNamespace(mysql_database="letoume")),
            patch.object(script, "get_connection", return_value=_connection_context(connection)),
            patch("builtins.print") as print_mock,
        ):
            script.main()

        backup_mock.assert_not_called()
        self.assertFalse(any("DROP TABLE" in query for query, _ in cursor.executed))
        output = print_mock.call_args[0][0]
        payload = json.loads(output)
        self.assertTrue(payload["dry_run"])
        self.assertEqual(payload["legacy_tables_found"], ["draw_issue", "draw_result"])

    def test_missing_split_table_aborts_cleanup(self) -> None:
        cursor = _FakeCursor(set())
        connection = _FakeConnection(cursor)

        with (
            patch.object(script, "parse_args", return_value=Namespace(lottery_codes="dlt,pl3", dry_run=False, skip_backup=True, backup_dir=None)),
            patch.object(script, "ensure_schema"),
            patch.object(script, "load_settings", return_value=SimpleNamespace(mysql_database="letoume")),
            patch.object(script, "get_connection", return_value=_connection_context(connection)),
        ):
            with self.assertRaises(RuntimeError):
                script.main()

    def test_non_dry_run_drops_legacy_tables(self) -> None:
        cursor = _FakeCursor(_build_existing_tables(include_legacy=["draw_issue", "prediction_batch"]))
        connection = _FakeConnection(cursor)

        with (
            patch.object(script, "parse_args", return_value=Namespace(lottery_codes="dlt,pl3", dry_run=False, skip_backup=True, backup_dir=None)),
            patch.object(script, "ensure_schema"),
            patch.object(script, "load_settings", return_value=SimpleNamespace(mysql_database="letoume")),
            patch.object(script, "get_connection", return_value=_connection_context(connection)),
            patch("builtins.print"),
        ):
            script.main()

        executed_sql = [query for query, _ in cursor.executed]
        self.assertIn("SET FOREIGN_KEY_CHECKS = 0", executed_sql)
        self.assertTrue(any("DROP TABLE IF EXISTS `draw_issue`" in query for query in executed_sql))
        self.assertTrue(any("DROP TABLE IF EXISTS `prediction_batch`" in query for query in executed_sql))
        self.assertIn("SET FOREIGN_KEY_CHECKS = 1", executed_sql)


if __name__ == "__main__":
    unittest.main()
