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


class _FakeHistoryRepository:
    def __init__(self, rows: list[dict]) -> None:
        self.rows = rows

    def list_history_rows(self, **_: object) -> list[dict]:
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

    def test_list_matches_hides_baidu_only_rows(self) -> None:
        rows = [
            {
                "match_id": "sporttery-2040188",
                "sporttery_match_id": "2040188",
                "match_num_str": "周三021",
                "home_team": "葡萄牙",
                "away_team": "刚果(金)",
                "kickoff_at": "2026-06-18 01:00:00",
                "stage": "世界杯",
                "match_status": "scheduled",
                "score": None,
                "sell_status": "Selling",
                "recommendation_count": 0,
                "odds_count": 1,
                "odds_snapshots": [
                    {
                        "play_type": "win_draw_win",
                        "odds_json": json.dumps({"胜": "1.13", "平": "5.86", "负": "13.50"}, ensure_ascii=False),
                        "fetched_at": "2026-06-17 11:00:00",
                    }
                ],
            },
            {
                "match_id": "baidu-portugal-congo",
                "sporttery_match_id": "",
                "match_num_str": "",
                "home_team": "葡萄牙",
                "away_team": "刚果民主共和国",
                "kickoff_at": "2026-06-18 01:00:00",
                "stage": "小组赛K组第1轮",
                "match_status": "scheduled",
                "score": None,
                "sell_status": "",
                "recommendation_count": 0,
                "odds_count": 0,
                "odds_snapshots": [],
                "data_sources_json": json.dumps({"sources": ["baidu_tiyu"]}, ensure_ascii=False),
            },
        ]
        service = WorldCupService(repository=_FakeMatchListRepository(rows))

        result = service.list_matches({})

        self.assertEqual(result["total_count"], 1)
        self.assertEqual(result["matches"][0]["match_id"], "sporttery-2040188")
        self.assertEqual(result["matches"][0]["away_team"], "刚果(金)")

    def test_list_history_groups_accuracy_by_play_type_and_model(self) -> None:
        rows = [
            _history_row(
                recommendation_id="rec-wdw-hit",
                match_id="match-1",
                play_type="win_draw_win",
                selection="胜",
                model_code="model-a",
                model_name="模型A",
                match_status="finished",
                score="1:0",
            ),
            _history_row(
                recommendation_id="rec-goals-miss",
                match_id="match-1",
                play_type="total_goals",
                selection="2",
                model_code="model-a",
                model_name="模型A",
                match_status="finished",
                score="1:0",
            ),
            _history_row(
                recommendation_id="rec-goals-hit",
                match_id="match-1",
                play_type="total_goals",
                selection="1",
                model_code="model-b",
                model_name="模型B",
                match_status="finished",
                score="1:0",
            ),
            _history_row(
                recommendation_id="rec-wdw-pending",
                match_id="match-2",
                play_type="win_draw_win",
                selection="胜",
                model_code="model-a",
                model_name="模型A",
                match_status="scheduled",
                score=None,
            ),
            _history_row(
                recommendation_id="rec-half-unknown",
                match_id="match-3",
                play_type="half_full_time",
                selection="胜胜",
                model_code="model-a",
                model_name="模型A",
                match_status="finished",
                score="2:1",
            ),
        ]
        service = WorldCupService(repository=_FakeHistoryRepository(rows))

        result = service.list_history(1, {})

        self.assertEqual(result["summary"]["total_count"], 5)
        self.assertEqual(result["summary"]["settled_count"], 3)
        self.assertEqual(result["summary"]["hit_count"], 2)
        self.assertEqual(result["summary"]["miss_count"], 1)
        self.assertEqual(result["summary"]["pending_count"], 1)
        self.assertEqual(result["summary"]["unknown_count"], 1)
        self.assertAlmostEqual(result["summary"]["accuracy"], 0.6667)

        groups = {group["play_type"]: group for group in result["play_type_groups"]}
        self.assertEqual(groups["win_draw_win"]["settled_count"], 1)
        self.assertEqual(groups["win_draw_win"]["pending_count"], 1)
        self.assertEqual(groups["win_draw_win"]["accuracy"], 1.0)
        self.assertEqual(groups["total_goals"]["hit_count"], 1)
        self.assertEqual(groups["total_goals"]["miss_count"], 1)
        self.assertEqual(groups["total_goals"]["accuracy"], 0.5)
        self.assertIsNone(groups["half_full_time"]["accuracy"])

        total_goals_models = {model["model_code"]: model for model in groups["total_goals"]["models"]}
        self.assertEqual(total_goals_models["model-a"]["miss_count"], 1)
        self.assertEqual(total_goals_models["model-a"]["accuracy"], 0.0)
        self.assertEqual(total_goals_models["model-b"]["hit_count"], 1)
        self.assertEqual(total_goals_models["model-b"]["accuracy"], 1.0)


def _history_row(
    *,
    recommendation_id: str,
    match_id: str,
    play_type: str,
    selection: str,
    model_code: str,
    model_name: str,
    match_status: str,
    score: str | None,
) -> dict:
    return {
        "recommendation_id": recommendation_id,
        "match_id": match_id,
        "sporttery_match_id": match_id,
        "match_num_str": "周一013",
        "home_team": "西班牙",
        "away_team": "佛得角",
        "kickoff_at": "2026-06-16 00:00:00",
        "stage": "世界杯",
        "match_status": match_status,
        "score": score,
        "sell_status": "Selling",
        "play_type": play_type,
        "selection": selection,
        "model_code": model_code,
        "model_name": model_name,
        "confidence_level": "medium",
        "risk_level": "low",
        "budget_min": 10,
        "budget_max": 20,
        "reason": "测试推荐。",
        "model_sources_json": "[]",
        "risk_tags_json": "[]",
        "status": "published",
        "compliance_notice": "预测仅供参考研究，不保证命中。",
        "updated_at": "2026-06-15 12:00:00",
        "created_at": "2026-06-15 12:00:00",
        "is_favorite": 0,
    }


if __name__ == "__main__":
    unittest.main()
