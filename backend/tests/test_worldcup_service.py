from __future__ import annotations

import json
import unittest

from backend.app.services.worldcup_service import WorldCupService


class _FakeRepository:
    def __init__(self, row: dict) -> None:
        self.row = row

    def get_match(self, match_id: str) -> dict | None:
        return self.row if match_id == self.row.get("match_id") else None


class _FakeMatchListRepository:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def list_matches(self, **_: object) -> list[dict]:
        return self.rows


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

    def test_list_matches_dedupes_same_kickoff_and_teams(self) -> None:
        rows = [
            {
                "match_id": "sporttery-2040174",
                "sporttery_match_id": "2040174",
                "match_num_str": "周二017",
                "home_team": "法国",
                "away_team": "塞内加尔",
                "kickoff_at": "2026-06-17 03:00:00",
                "stage": "世界杯",
                "match_status": "scheduled",
                "score": None,
                "sell_status": "Selling",
                "recommendation_count": 0,
                "odds_count": 1,
                "odds_snapshots": [
                    {
                        "play_type": "win_draw_win",
                        "odds_json": json.dumps({"胜": "1.32", "平": "4.20", "负": "7.45"}, ensure_ascii=False),
                        "fetched_at": "2026-06-16 11:00:00",
                    }
                ],
            },
            {
                "match_id": "baidu-france-senegal",
                "sporttery_match_id": "",
                "match_num_str": "",
                "home_team": "法国",
                "away_team": "塞内加尔",
                "kickoff_at": "2026-06-17 03:00:00",
                "stage": "小组赛I组第1轮",
                "match_status": "scheduled",
                "score": None,
                "sell_status": "",
                "recommendation_count": 0,
                "odds_count": 0,
                "odds_snapshots": [],
            },
        ]
        service = WorldCupService(repository=_FakeMatchListRepository(rows))

        result = service.list_matches({})

        self.assertEqual(result["total_count"], 1)
        self.assertEqual(result["matches"][0]["match_id"], "sporttery-2040174")
        self.assertEqual(result["matches"][0]["match_num_str"], "周二017")
        self.assertEqual(result["matches"][0]["latest_odds"]["胜"], "1.32")


if __name__ == "__main__":
    unittest.main()
