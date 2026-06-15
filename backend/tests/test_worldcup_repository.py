from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.app.repositories.worldcup_repository import WorldCupRepository


class _Cursor:
    def __init__(self) -> None:
        self.queries: list[str] = []

    def execute(self, query: str, params=None) -> None:
        self.queries.append(query)

    def fetchall(self) -> list[dict]:
        return []


class _CursorContext:
    def __init__(self, cursor: _Cursor) -> None:
        self.cursor = cursor

    def __enter__(self) -> _Cursor:
        return self.cursor

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class _Connection:
    def __init__(self, cursor: _Cursor) -> None:
        self.cursor_obj = cursor

    def cursor(self) -> _CursorContext:
        return _CursorContext(self.cursor_obj)


class _ConnectionContext:
    def __init__(self, cursor: _Cursor) -> None:
        self.cursor = cursor

    def __enter__(self) -> _Connection:
        return _Connection(self.cursor)

    def __exit__(self, exc_type, exc, tb) -> None:
        return None


class WorldCupRepositoryTests(unittest.TestCase):
    def test_match_table_alias_avoids_mysql_reserved_word(self) -> None:
        cursor = _Cursor()
        with patch("backend.app.repositories.worldcup_repository.get_connection", return_value=_ConnectionContext(cursor)):
            WorldCupRepository().list_matches(status_filter="scheduled")
            WorldCupRepository().list_recommendations(user_id=1, risk_level_filter="low")

        rendered_sql = "\n".join(cursor.queries)
        self.assertNotIn("worldcup_match match", rendered_sql)
        self.assertIn("worldcup_match m", rendered_sql)


if __name__ == "__main__":
    unittest.main()
