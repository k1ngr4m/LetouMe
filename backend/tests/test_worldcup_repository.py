from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.app.repositories.worldcup_repository import WorldCupRepository


class _Cursor:
    def __init__(self) -> None:
        self.queries: list[str] = []
        self.params: list[tuple] = []

    def execute(self, query: str, params=None) -> None:
        self.queries.append(query)
        self.params.append(tuple(params or ()))

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

    def test_recent_matches_with_odds_filters_by_kickoff_date_range(self) -> None:
        cursor = _Cursor()
        with patch("backend.app.repositories.worldcup_repository.get_connection", return_value=_ConnectionContext(cursor)):
            WorldCupRepository().list_recent_matches_with_odds(limit=20, match_date="2026-06-16")

        rendered_sql = "\n".join(cursor.queries)
        self.assertIn("m.kickoff_at >= ?", rendered_sql)
        self.assertIn("m.kickoff_at < ?", rendered_sql)
        self.assertEqual(cursor.params[-1], ("2026-06-16 00:00:00", "2026-06-17 00:00:00", 20))

    def test_recent_matches_with_odds_filters_by_match_ids(self) -> None:
        cursor = _Cursor()
        with patch("backend.app.repositories.worldcup_repository.get_connection", return_value=_ConnectionContext(cursor)):
            WorldCupRepository().list_recent_matches_with_odds(limit=20, match_date="2026-06-16", match_ids=["match-a", "match-b"])

        rendered_sql = "\n".join(cursor.queries)
        self.assertIn("m.match_id IN (?, ?)", rendered_sql)
        self.assertEqual(cursor.params[-1], ("2026-06-16 00:00:00", "2026-06-17 00:00:00", "match-a", "match-b", 20))

    def test_replace_recommendations_deletes_stale_scope_rows_before_upsert(self) -> None:
        cursor = _Cursor()
        recommendations = [
            {
                "recommendation_id": "wc-ai-model-a-match-1-total_goals-1",
                "match_id": "match-1",
                "play_type": "total_goals",
                "selection": "3",
                "model_code": "model-a",
                "reason": "new pick",
                "compliance_notice": "notice",
            },
            {
                "recommendation_id": "wc-ai-model-a-match-1-total_goals-2",
                "match_id": "match-1",
                "play_type": "total_goals",
                "selection": "2",
                "model_code": "model-a",
                "reason": "new pick",
                "compliance_notice": "notice",
            },
        ]

        with patch("backend.app.repositories.worldcup_repository.get_connection", return_value=_ConnectionContext(cursor)):
            saved_count = WorldCupRepository().replace_recommendations(recommendations)

        self.assertEqual(saved_count, 2)
        self.assertIn("DELETE FROM worldcup_recommendation", cursor.queries[0])
        self.assertIn("recommendation_id NOT IN (?, ?)", cursor.queries[0])
        self.assertEqual(
            cursor.params[0],
            (
                "match-1",
                "total_goals",
                "model-a",
                "wc-ai-model-a-match-1-total_goals-1",
                "wc-ai-model-a-match-1-total_goals-2",
            ),
        )

    def test_replace_recommendations_scopes_deletion_by_model_code(self) -> None:
        cursor = _Cursor()
        recommendations = [
            {
                "recommendation_id": "wc-ai-model-a-match-1-win_draw_win",
                "match_id": "match-1",
                "play_type": "win_draw_win",
                "selection": "胜",
                "model_code": "model-a",
                "reason": "new pick",
                "compliance_notice": "notice",
            }
        ]

        with patch("backend.app.repositories.worldcup_repository.get_connection", return_value=_ConnectionContext(cursor)):
            saved_count = WorldCupRepository().replace_recommendations(recommendations)

        self.assertEqual(saved_count, 1)
        self.assertIn("AND model_code = ?", cursor.queries[0])
        self.assertEqual(cursor.params[0], ("match-1", "win_draw_win", "model-a", "wc-ai-model-a-match-1-win_draw_win"))
        self.assertNotIn("model-b", cursor.params[0])


if __name__ == "__main__":
    unittest.main()
