from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.app.services.worldcup_prediction_service import WORLDCUP_PROMPT_PATH, WorldCupPredictionService


class _FakeModelDefinition:
    name = "Fake WorldCup Model"

    @staticmethod
    def supports_lottery(lottery_code: str) -> bool:
        return lottery_code == "worldcup"


class _FakeModel:
    def __init__(self, payload: dict) -> None:
        self.payload = payload
        self.prompt = ""

    @staticmethod
    def health_check() -> tuple[bool, str]:
        return True, "ok"

    def predict(self, prompt: str) -> dict:
        self.prompt = prompt
        return self.payload


class _FakeModelFactory:
    def __init__(self, model: _FakeModel) -> None:
        self.model = model

    def create(self, model_def: _FakeModelDefinition) -> _FakeModel:
        return self.model


class _FakeModelRepository:
    @staticmethod
    def get_model(model_code: str) -> dict:
        return {
            "model_code": model_code,
            "display_name": "Fake Display Model",
            "is_deleted": False,
            "is_active": True,
            "lottery_codes": ["worldcup"],
        }


class _FakeWorldCupRepository:
    def __init__(self) -> None:
        self.saved_recommendations: list[dict] = []
        self.last_match_date: str | None = None
        self.last_match_ids: list[str] | None = None

    def list_recent_matches_with_odds(self, *, limit: int, match_date: str | None = None, match_ids: list[str] | None = None) -> list[dict]:
        self.last_match_date = match_date
        self.last_match_ids = match_ids
        return [
            {
                "match_id": "match-1",
                "home_team": "西班牙",
                "away_team": "佛得角",
                "kickoff_at": "2026-06-16 00:00:00",
                "stage": "世界杯",
                "match_num_str": "周一013",
                "remark": "",
                "play_type": "win_draw_win",
                "odds_json": '{"胜": "1.80", "平": "3.20", "负": "4.60"}',
                "goal_line": None,
                "single_status": "1",
                "odds_sell_status": "Selling",
                "sell_status": "Selling",
                "odds_fetched_at": "2026-06-15 11:00:00",
            }
        ]

    def upsert_recommendations(self, recommendations: list[dict]) -> int:
        self.saved_recommendations = recommendations
        return len(recommendations)

    def replace_recommendations(self, recommendations: list[dict]) -> int:
        self.saved_recommendations = recommendations
        return len(recommendations)


class _FakeNewsSearchService:
    def __init__(self) -> None:
        self.called = False

    def enrich_matches(self, matches: list[dict]) -> list[dict]:
        self.called = True
        for match in matches:
            match["team_context"]["news"] = {
                "status": "available",
                "query": "西班牙 佛得角 世界杯 阵容 伤停 最新 team news",
                "provider": "fake",
                "fetched_at": "2026-06-15 12:00:00",
                "results": [
                    {
                        "title": "Spain injury update before Cape Verde match",
                        "snippet": "Spain report no new injuries.",
                        "source": "Fixture News",
                        "published_at": "2026-06-15 10:00:00",
                        "url": "https://example.com/spain",
                    }
                ],
            }
            match["team_context"]["status"] = "已接入球队最新资讯搜索；官方赔率仅用于玩法校验、赔率展示和风险提示。"
        return matches


class _FailingNewsSearchService:
    @staticmethod
    def enrich_matches(matches: list[dict]) -> list[dict]:
        raise RuntimeError("news backend unavailable")


class _FakeBaiduSportsService:
    def __init__(self) -> None:
        self.called = False

    def enrich_matches(self, matches: list[dict]) -> list[dict]:
        self.called = True
        for match in matches:
            match["team_context"]["baidu_sports"] = {
                "status": "available",
                "provider": "baidu_tiyu",
                "recent_records": [{"team_name": "西班牙", "result": "4胜1平1负"}],
                "pre_match_prediction": {"sample_count": "12504", "percentage": {"victory": "65%", "draw": "20%", "lost": "15%"}},
                "positive_intelligence": [{"team_name": "西班牙", "items": ["西班牙近期控球稳定。"]}],
                "negative_intelligence": [{"team_name": "佛得角", "items": ["佛得角客场防守波动。"]}],
                "squad_status": {"status": "阵容名单已获取，首发待确认"},
                "index_reference": {"note": "Baidu/第三方指数仅作赛前分析参考；官方投注赔率仍以中国竞彩网为准。"},
            }
        return matches


class WorldCupPredictionServiceTests(unittest.TestCase):
    def test_worldcup_prompt_template_renders_with_json_example(self) -> None:
        rendered = WORLDCUP_PROMPT_PATH.read_text(encoding="utf-8").format(
            prediction_date="2026-06-15",
            model_name="fake",
            match_context="[]",
        )

        self.assertIn('"recommendations"', rendered)
        self.assertIn("2026-06-15", rendered)
        self.assertIn("赔率不得影响 `selection`", rendered)
        self.assertIn("不得用赔率高低", rendered)
        self.assertIn("总进球数 `total_goals`、比分 `correct_score`、半全场 `half_full_time` 每场每个玩法必须输出 2-3 条不同推荐", rendered)
        self.assertIn('"confidence_score"', rendered)

    def test_generate_injects_news_context_and_preserves_news_evidence(self) -> None:
        repository = _FakeWorldCupRepository()
        news_service = _FakeNewsSearchService()
        fake_model = _FakeModel(
            {
                "recommendations": [
                    {
                        "match_id": "match-1",
                        "play_type": "win_draw_win",
                        "selection": "胜",
                        "odds_value": "1.80",
                        "confidence_level": "medium",
                        "risk_level": "low",
                        "budget_min": 10,
                        "budget_max": 30,
                        "reason": "输入新闻显示西班牙暂无新增伤病，赛程背景相对稳定；赔率仅作展示参考。",
                        "news_evidence": [
                            {
                                "title": "Spain injury update before Cape Verde match",
                                "source": "Fixture News",
                                "published_at": "2026-06-15 10:00:00",
                            }
                        ],
                    }
                ]
            }
        )
        service = WorldCupPredictionService(
            repository=repository,
            model_repository=_FakeModelRepository(),
            news_search_service=news_service,
        )

        with patch("backend.app.services.worldcup_prediction_service.ensure_schema"), patch(
            "backend.app.services.worldcup_prediction_service.load_model_registry",
            return_value={"model-a": _FakeModelDefinition()},
        ), patch(
            "backend.app.services.worldcup_prediction_service.ModelFactory",
            return_value=_FakeModelFactory(fake_model),
        ):
            summary = service.generate_for_model(model_code="model-a", match_date="2026-06-16", match_ids=["match-1"])

        self.assertTrue(news_service.called)
        self.assertEqual(repository.last_match_date, "2026-06-16")
        self.assertEqual(repository.last_match_ids, ["match-1"])
        self.assertEqual(summary["match_date"], "2026-06-16")
        self.assertEqual(summary["match_ids"], ["match-1"])
        self.assertEqual(summary["processed_count"], 1)
        self.assertIn("Spain injury update before Cape Verde match", fake_model.prompt)
        saved = repository.saved_recommendations[0]
        self.assertEqual(saved["input_summary"]["team_context"]["news"]["status"], "available")
        self.assertEqual(saved["ai_payload"]["news_evidence"][0]["source"], "Fixture News")
        self.assertIn("球队最新资讯", saved["model_sources"])

    def test_normalize_preserves_multiple_correct_score_recommendations(self) -> None:
        service = WorldCupPredictionService(
            repository=_FakeWorldCupRepository(),
            model_repository=_FakeModelRepository(),
        )

        recommendations = service._normalize_ai_recommendations(
            {
                "recommendations": [
                    {
                        "match_id": "match-1",
                        "play_type": "correct_score",
                        "selection": "1:0",
                        "odds_value": "6.00",
                        "confidence_score": 64,
                        "confidence_level": "medium",
                        "risk_level": "medium",
                    },
                    {
                        "match_id": "match-1",
                        "play_type": "correct_score",
                        "selection": "1:1",
                        "odds_value": "7.50",
                        "confidence_score": 58,
                        "confidence_level": "medium",
                        "risk_level": "medium",
                    },
                    {
                        "match_id": "match-1",
                        "play_type": "correct_score",
                        "selection": "2:1",
                        "odds_value": "8.00",
                        "confidence_score": 52,
                        "confidence_level": "low",
                        "risk_level": "high",
                    },
                    {
                        "match_id": "match-1",
                        "play_type": "correct_score",
                        "selection": "2:0",
                        "odds_value": "9.00",
                        "confidence_score": 45,
                        "confidence_level": "low",
                        "risk_level": "high",
                    },
                ]
            },
            match_context=[{"match_id": "match-1", "team_context": {}, "odds": {"correct_score": {"odds": {"1:0": "6.00"}}}}],
            model_code="model-a",
            model_name="Fake Display Model",
            overwrite=False,
        )

        self.assertEqual([item["selection"] for item in recommendations], ["1:0", "1:1", "2:1"])
        self.assertEqual(
            [item["recommendation_id"] for item in recommendations],
            [
                "wc-ai-model-a-match-1-correct_score-1",
                "wc-ai-model-a-match-1-correct_score-2",
                "wc-ai-model-a-match-1-correct_score-3",
            ],
        )
        self.assertEqual(recommendations[0]["confidence_score"], 64.0)

    def test_normalize_preserves_multiple_total_goals_and_half_full_time_recommendations(self) -> None:
        service = WorldCupPredictionService(
            repository=_FakeWorldCupRepository(),
            model_repository=_FakeModelRepository(),
        )

        rows = []
        for play_type, selections in {
            "total_goals": ["1", "2", "3", "4"],
            "half_full_time": ["胜胜", "胜平", "平平", "平负"],
        }.items():
            for index, selection in enumerate(selections):
                rows.append(
                    {
                        "match_id": "match-1",
                        "play_type": play_type,
                        "selection": selection,
                        "odds_value": str(4 + index),
                        "confidence_score": 60 - index,
                        "confidence_level": "medium",
                        "risk_level": "medium",
                    }
                )

        recommendations = service._normalize_ai_recommendations(
            {"recommendations": rows},
            match_context=[
                {
                    "match_id": "match-1",
                    "team_context": {},
                    "odds": {
                        "total_goals": {"odds": {"1": "4.00", "2": "5.00", "3": "6.00"}},
                        "half_full_time": {"odds": {"胜胜": "4.00", "胜平": "5.00", "平平": "6.00"}},
                    },
                }
            ],
            model_code="model-a",
            model_name="Fake Display Model",
            overwrite=False,
        )

        self.assertEqual(
            [item["recommendation_id"] for item in recommendations],
            [
                "wc-ai-model-a-match-1-total_goals-1",
                "wc-ai-model-a-match-1-total_goals-2",
                "wc-ai-model-a-match-1-total_goals-3",
                "wc-ai-model-a-match-1-half_full_time-1",
                "wc-ai-model-a-match-1-half_full_time-2",
                "wc-ai-model-a-match-1-half_full_time-3",
            ],
        )

    def test_generate_replaces_previous_worldcup_recommendation_scope(self) -> None:
        repository = _FakeWorldCupRepository()
        fake_model = _FakeModel(
            {
                "recommendations": [
                    {
                        "match_id": "match-1",
                        "play_type": "win_draw_win",
                        "selection": "胜",
                        "odds_value": "1.80",
                        "confidence_level": "medium",
                        "risk_level": "low",
                        "budget_min": 10,
                        "budget_max": 30,
                    }
                ]
            }
        )
        service = WorldCupPredictionService(
            repository=repository,
            model_repository=_FakeModelRepository(),
            news_search_service=_FakeNewsSearchService(),
        )

        with patch("backend.app.services.worldcup_prediction_service.ensure_schema"), patch(
            "backend.app.services.worldcup_prediction_service.load_model_registry",
            return_value={"model-a": _FakeModelDefinition()},
        ), patch(
            "backend.app.services.worldcup_prediction_service.ModelFactory",
            return_value=_FakeModelFactory(fake_model),
        ):
            service.generate_for_model(model_code="model-a")

        self.assertEqual(
            [item["recommendation_id"] for item in repository.saved_recommendations],
            ["wc-ai-model-a-match-1-win_draw_win"],
        )

    def test_generate_continues_when_news_service_fails(self) -> None:
        repository = _FakeWorldCupRepository()
        fake_model = _FakeModel(
            {
                "recommendations": [
                    {
                        "match_id": "match-1",
                        "play_type": "win_draw_win",
                        "selection": "胜",
                        "odds_value": "1.80",
                        "confidence_level": "low",
                        "risk_level": "medium",
                        "budget_min": 0,
                        "budget_max": 10,
                        "reason": "新闻不可用，仅参考赛程背景；赔率仅作展示参考。",
                    }
                ]
            }
        )
        service = WorldCupPredictionService(
            repository=repository,
            model_repository=_FakeModelRepository(),
            news_search_service=_FailingNewsSearchService(),
        )

        with patch("backend.app.services.worldcup_prediction_service.ensure_schema"), patch(
            "backend.app.services.worldcup_prediction_service.load_model_registry",
            return_value={"model-a": _FakeModelDefinition()},
        ), patch(
            "backend.app.services.worldcup_prediction_service.ModelFactory",
            return_value=_FakeModelFactory(fake_model),
        ):
            summary = service.generate_for_model(model_code="model-a")

        self.assertEqual(summary["processed_count"], 1)
        saved = repository.saved_recommendations[0]
        news = saved["input_summary"]["team_context"]["news"]
        self.assertEqual(news["status"], "unavailable")
        self.assertIn("news backend unavailable", news["error"])

    def test_generate_injects_baidu_sports_context(self) -> None:
        repository = _FakeWorldCupRepository()
        baidu_service = _FakeBaiduSportsService()
        fake_model = _FakeModel(
            {
                "recommendations": [
                    {
                        "match_id": "match-1",
                        "play_type": "win_draw_win",
                        "selection": "胜",
                        "odds_value": "1.80",
                        "confidence_level": "medium",
                        "risk_level": "low",
                        "budget_min": 10,
                        "budget_max": 30,
                        "reason": "参考百度体育赛前分析与官方赔率，赔率仅作展示参考。",
                    }
                ]
            }
        )
        service = WorldCupPredictionService(
            repository=repository,
            model_repository=_FakeModelRepository(),
            news_search_service=_FakeNewsSearchService(),
            baidu_sports_service=baidu_service,
        )

        with patch("backend.app.services.worldcup_prediction_service.ensure_schema"), patch(
            "backend.app.services.worldcup_prediction_service.load_model_registry",
            return_value={"model-a": _FakeModelDefinition()},
        ), patch(
            "backend.app.services.worldcup_prediction_service.ModelFactory",
            return_value=_FakeModelFactory(fake_model),
        ):
            service.generate_for_model(model_code="model-a", match_date="2026-06-16")

        self.assertTrue(baidu_service.called)
        self.assertIn("西班牙近期控球稳定", fake_model.prompt)
        saved = repository.saved_recommendations[0]
        self.assertEqual(saved["input_summary"]["team_context"]["baidu_sports"]["status"], "available")
        self.assertIn("百度体育赛前分析", saved["model_sources"])


if __name__ == "__main__":
    unittest.main()
