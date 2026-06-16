from __future__ import annotations

import json
import unittest

from backend.app.services.worldcup_service import WorldCupService


class _FakeRepository:
    def __init__(self, row: dict) -> None:
        self.row = row

    def get_match(self, match_id: str) -> dict | None:
        return self.row if match_id == self.row.get("match_id") else None


class _FakeBaiduSportsService:
    def __init__(self) -> None:
        self.encoded_match_id: str | None = None
        self.find_called = False

    def fetch_match_context(self, encoded_match_id: str) -> dict:
        self.encoded_match_id = encoded_match_id
        return {
            "status": "available",
            "pre_match_prediction": {"sample_count": "71955"},
            "positive_intelligence": [{"team_name": "法国", "items": ["法国6场比赛5胜1平，状态出色。"]}],
        }

    def find_encoded_match_id(self, *, home_team: str, away_team: str, kickoff_at: str) -> str:
        self.find_called = True
        return "fallback-encoded"


class WorldCupServiceTests(unittest.TestCase):
    def test_get_baidu_analysis_uses_saved_baidu_match_id(self) -> None:
        baidu_service = _FakeBaiduSportsService()
        service = WorldCupService(
            repository=_FakeRepository(
                {
                    "match_id": "sporttery-1",
                    "sporttery_match_id": "1",
                    "home_team": "法国",
                    "away_team": "塞内加尔",
                    "kickoff_at": "2026-06-17 03:00:00",
                    "stage": "世界杯小组赛",
                    "match_status": "scheduled",
                    "score": None,
                    "sell_status": "Selling",
                    "data_sources_json": json.dumps({"baidu_tiyu": {"encoded_match_id": "saved-encoded"}}, ensure_ascii=False),
                }
            ),
            baidu_sports_service=baidu_service,
        )

        result = service.get_baidu_analysis("sporttery-1")

        self.assertEqual(baidu_service.encoded_match_id, "saved-encoded")
        self.assertFalse(baidu_service.find_called)
        self.assertEqual(result["analysis"]["pre_match_prediction"]["sample_count"], "71955")
        self.assertEqual(result["match"]["home_team"], "法国")

    def test_get_baidu_analysis_falls_back_to_schedule_lookup(self) -> None:
        baidu_service = _FakeBaiduSportsService()
        service = WorldCupService(
            repository=_FakeRepository(
                {
                    "match_id": "sporttery-1",
                    "sporttery_match_id": "1",
                    "home_team": "法国",
                    "away_team": "塞内加尔",
                    "kickoff_at": "2026-06-17 03:00:00",
                    "stage": "世界杯小组赛",
                    "match_status": "scheduled",
                    "score": None,
                    "sell_status": "Selling",
                    "data_sources_json": None,
                }
            ),
            baidu_sports_service=baidu_service,
        )

        service.get_baidu_analysis("sporttery-1")

        self.assertTrue(baidu_service.find_called)
        self.assertEqual(baidu_service.encoded_match_id, "fallback-encoded")


if __name__ == "__main__":
    unittest.main()
