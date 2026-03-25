from __future__ import annotations

import unittest

from backend.app.services.prediction_service import PredictionService


class _FakePredictionRepository:
    def __init__(self) -> None:
        self.record = {
            "prediction_date": "2026-03-12",
            "target_period": "2026031",
            "actual_result": {
                "period": "2026031",
                "date": "2026-03-10",
                "red_balls": ["01", "02", "03", "04", "05"],
                "blue_balls": ["06", "07"],
                "previous_jackpot_pool": 1000000,
                "prize_breakdown": [
                    {"prize_level": "三等奖", "prize_type": "basic", "winner_count": 1, "prize_amount": 10000, "total_amount": 10000},
                    {"prize_level": "九等奖", "prize_type": "basic", "winner_count": 1, "prize_amount": 5, "total_amount": 5},
                ],
            },
            "models": [
                {
                    "model_id": "model-a",
                    "model_name": "模型A",
                    "model_provider": "openai",
                    "predictions": [
                        {
                            "group_id": 1,
                            "red_balls": ["01", "02", "03", "04", "05"],
                            "blue_balls": ["08", "09"],
                            "hit_result": {
                                "red_hits": ["01", "02", "03", "04", "05"],
                                "red_hit_count": 5,
                                "blue_hits": [],
                                "blue_hit_count": 0,
                                "total_hits": 5,
                            },
                        },
                        {
                            "group_id": 2,
                            "red_balls": ["11", "12", "13", "14", "15"],
                            "blue_balls": ["08", "09"],
                            "hit_result": {
                                "red_hits": [],
                                "red_hit_count": 0,
                                "blue_hits": [],
                                "blue_hit_count": 0,
                                "total_hits": 0,
                            },
                        },
                    ],
                    "best_group": 1,
                    "best_hit_count": 5,
                },
                {
                    "model_id": "model-b",
                    "model_name": "模型B",
                    "model_provider": "deepseek",
                    "predictions": [
                        {
                            "group_id": 1,
                            "red_balls": ["11", "12", "13", "14", "15"],
                            "blue_balls": ["06", "07"],
                            "hit_result": {
                                "red_hits": [],
                                "red_hit_count": 0,
                                "blue_hits": ["06", "07"],
                                "blue_hit_count": 2,
                                "total_hits": 2,
                            },
                        }
                    ],
                    "best_group": 1,
                    "best_hit_count": 2,
                },
            ],
        }

    def list_history_records(self, limit: int | None = None, offset: int = 0, lottery_code: str = "dlt") -> list[dict]:
        return [self.record]

    def list_history_record_summaries(self, limit: int | None = None, offset: int = 0, lottery_code: str = "dlt") -> list[dict]:
        return [
            {
                "prediction_date": "2026-03-12",
                "target_period": "2026031",
                "actual_result": self.record["actual_result"],
                "models": [
                    {
                        "model_id": "model-a",
                        "model_name": "模型A",
                        "model_provider": "openai",
                        "best_group": 1,
                        "best_hit_count": 5,
                        "group_metrics": [
                            {"group_id": 1, "strategy": "增强型热号追随者", "red_hit_count": 5, "blue_hit_count": 0, "total_hits": 5},
                            {"group_id": 2, "strategy": "AI 组合策略", "red_hit_count": 0, "blue_hit_count": 0, "total_hits": 0},
                        ],
                    },
                    {
                        "model_id": "model-b",
                        "model_name": "模型B",
                        "model_provider": "deepseek",
                        "best_group": 1,
                        "best_hit_count": 2,
                        "group_metrics": [
                            {"group_id": 1, "strategy": "冷号补位", "red_hit_count": 0, "blue_hit_count": 2, "total_hits": 2},
                        ],
                    },
                ],
            }
        ]

    def count_history_records(self, lottery_code: str = "dlt") -> int:
        return 1

    def list_history_strategy_options(self, lottery_code: str = "dlt") -> list[str]:
        return ["增强型热号追随者", "AI 组合策略", "冷号补位"]

    def get_current_prediction(self, lottery_code: str = "dlt") -> dict:
        return {
            "lottery_code": lottery_code,
            "prediction_date": "2026-03-12",
            "target_period": "2026032",
            "models": [
                {
                    "model_id": "model-a",
                    "model_name": "模型A",
                    "model_provider": "openai",
                    "predictions": [],
                },
                {
                    "model_id": "model-b",
                    "model_name": "模型B",
                    "model_provider": "deepseek",
                    "predictions": [],
                },
            ],
        }

    def get_current_prediction_by_period(self, target_period: str, lottery_code: str = "dlt") -> dict:
        payload = self.get_current_prediction(lottery_code=lottery_code)
        payload["target_period"] = target_period
        return payload

    def get_history_record_detail(self, target_period: str, lottery_code: str = "dlt") -> dict | None:
        return self.record if target_period == "2026031" else None


class _FakePl3PredictionRepository:
    def __init__(self) -> None:
        self.record = {
            "lottery_code": "pl3",
            "prediction_date": "2026-03-12",
            "target_period": "26060",
            "actual_result": {
                "lottery_code": "pl3",
                "period": "26060",
                "date": "2026-03-11",
                "digits": ["01", "01", "08"],
                "prize_breakdown": [
                    {"prize_level": "直选", "prize_type": "basic", "winner_count": 1, "prize_amount": 1040, "total_amount": 1040},
                    {"prize_level": "组选3", "prize_type": "basic", "winner_count": 1, "prize_amount": 346, "total_amount": 346},
                ],
            },
            "models": [
                {
                    "model_id": "deepseek-pl3",
                    "model_name": "DeepSeek-PL3",
                    "model_provider": "deepseek",
                    "predictions": [
                        {
                            "group_id": 1,
                            "play_type": "direct",
                            "digits": ["01", "02", "08"],
                            "hit_result": {"digit_hits": ["01", "08"], "digit_hit_count": 2, "is_exact_match": False},
                        },
                        {
                            "group_id": 2,
                            "play_type": "group3",
                            "digits": ["01", "01", "08"],
                            "hit_result": {"digit_hits": ["01", "01", "08"], "digit_hit_count": 3, "is_exact_match": True},
                        },
                        {
                            "group_id": 3,
                            "play_type": "group6",
                            "digits": ["01", "03", "09"],
                            "hit_result": {"digit_hits": ["01"], "digit_hit_count": 1, "is_exact_match": False},
                        },
                    ],
                }
            ],
        }

    def list_history_records(self, limit: int | None = None, offset: int = 0, lottery_code: str = "pl3") -> list[dict]:
        return [self.record]

    def list_history_record_summaries(self, limit: int | None = None, offset: int = 0, lottery_code: str = "pl3") -> list[dict]:
        return [
            {
                "lottery_code": "pl3",
                "prediction_date": "2026-03-12",
                "target_period": "26060",
                "actual_result": self.record["actual_result"],
                "models": [
                    {
                        "model_id": "deepseek-pl3",
                        "model_name": "DeepSeek-PL3",
                        "model_provider": "deepseek",
                        "best_group": 1,
                        "best_hit_count": 3,
                        "group_metrics": [
                            {
                                "group_id": 1,
                                "play_type": "direct",
                                "digits": ["01", "02", "08"],
                                "red_hit_count": 0,
                                "blue_hit_count": 0,
                                "total_hits": 3,
                                "hit_result": {"digit_hit_count": 2, "is_exact_match": False},
                            },
                            {
                                "group_id": 2,
                                "play_type": "group3",
                                "digits": ["01", "01", "08"],
                                "red_hit_count": 0,
                                "blue_hit_count": 0,
                                "total_hits": 3,
                                "hit_result": {"digit_hit_count": 2, "is_exact_match": False},
                            },
                            {
                                "group_id": 3,
                                "play_type": "group6",
                                "digits": ["01", "03", "09"],
                                "red_hit_count": 0,
                                "blue_hit_count": 0,
                                "total_hits": 3,
                                "hit_result": {"digit_hit_count": 1, "is_exact_match": False},
                            },
                        ],
                    }
                ],
            }
        ]

    def count_history_records(self, lottery_code: str = "pl3") -> int:
        return 1

    def get_history_record_detail(self, target_period: str, lottery_code: str = "pl3") -> dict | None:
        return self.record if target_period == "26060" else None


class _FakePl3SumMislabelRepository:
    def __init__(self) -> None:
        self.record = {
            "lottery_code": "pl3",
            "prediction_date": "2026-03-13",
            "target_period": "26061",
            "actual_result": {
                "lottery_code": "pl3",
                "period": "26061",
                "date": "2026-03-12",
                "digits": ["01", "02", "07"],
                "prize_breakdown": [
                    {"prize_level": "和值", "prize_type": "basic", "winner_count": 1, "prize_amount": 14, "total_amount": 14},
                ],
            },
            "models": [
                {
                    "model_id": "deepseek-pl3",
                    "prediction_play_mode": "direct",
                    "model_name": "DeepSeek-PL3",
                    "model_provider": "deepseek",
                    "predictions": [
                        {
                            "group_id": 1,
                            "play_type": "direct_sum",
                            "sum_value": "10",
                            "digits": [],
                            "hit_result": {"digit_hit_count": 1, "is_exact_match": True},
                        },
                        {
                            "group_id": 2,
                            "play_type": "direct_sum",
                            "sum_value": "11",
                            "digits": [],
                            "hit_result": {"digit_hit_count": 0, "is_exact_match": False},
                        },
                    ],
                }
            ],
        }

    def list_history_record_summaries(self, limit: int | None = None, offset: int = 0, lottery_code: str = "pl3") -> list[dict]:
        return [
            {
                "lottery_code": "pl3",
                "prediction_date": "2026-03-13",
                "target_period": "26061",
                "actual_result": self.record["actual_result"],
                "models": [
                    {
                        "model_id": "deepseek-pl3",
                        "prediction_play_mode": "direct",
                        "model_name": "DeepSeek-PL3",
                        "model_provider": "deepseek",
                        "best_group": 1,
                        "best_hit_count": 1,
                        "group_metrics": [
                            {
                                "group_id": 1,
                                "play_type": "direct_sum",
                                "sum_value": "10",
                                "digits": [],
                                "red_hit_count": 0,
                                "blue_hit_count": 0,
                                "total_hits": 1,
                                "hit_result": {"digit_hit_count": 1, "is_exact_match": True},
                            },
                            {
                                "group_id": 2,
                                "play_type": "direct_sum",
                                "sum_value": "11",
                                "digits": [],
                                "red_hit_count": 0,
                                "blue_hit_count": 0,
                                "total_hits": 0,
                                "hit_result": {"digit_hit_count": 0, "is_exact_match": False},
                            },
                        ],
                    }
                ],
            }
        ]

    def count_history_records(self, lottery_code: str = "pl3") -> int:
        return 1

    def get_history_record_detail(self, target_period: str, lottery_code: str = "pl3") -> dict | None:
        return self.record if target_period == "26061" else None


class _FakeModelRepository:
    def __init__(self, active_model_codes: set[str]) -> None:
        self.active_model_codes = active_model_codes

    def list_active_model_codes(self) -> set[str]:
        return set(self.active_model_codes)


class PredictionHistoryMetricsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = PredictionService(prediction_repository=_FakePredictionRepository())

    def test_history_list_payload_contains_cost_prize_and_win_rates(self) -> None:
        payload = self.service.get_history_list_payload(limit=20, offset=0)

        self.assertEqual(payload["total_count"], 1)
        record = payload["predictions_history"][0]
        self.assertEqual(record["period_summary"]["total_bet_count"], 3)
        self.assertEqual(record["period_summary"]["total_cost_amount"], 6)
        self.assertEqual(record["period_summary"]["total_prize_amount"], 10005)

        model_a = next(item for item in record["models"] if item["model_id"] == "model-a")
        self.assertEqual(model_a["bet_count"], 2)
        self.assertEqual(model_a["cost_amount"], 4)
        self.assertEqual(model_a["prize_amount"], 10000)
        self.assertAlmostEqual(model_a["win_rate_by_bet"], 0.5)
        self.assertTrue(model_a["hit_period_win"])
        self.assertGreater(model_a["score_profile"]["overall_score"], 0)
        self.assertEqual(model_a["score_profile"]["best_period_snapshot"]["target_period"], "2026031")

        model_stats = next(item for item in payload["model_stats"] if item["model_id"] == "model-b")
        self.assertEqual(model_stats["winning_bet_count"], 1)
        self.assertAlmostEqual(model_stats["win_rate_by_period"], 1.0)
        self.assertAlmostEqual(model_stats["win_rate_by_bet"], 1.0)
        self.assertIn("component_scores", model_stats["score_profile"])
        self.assertGreaterEqual(model_stats["score_profile"]["per_period_score"], 0)

    def test_detail_payload_marks_fixed_prize_sources(self) -> None:
        payload = self.service.get_history_detail_payload("2026031")

        self.assertIsNotNone(payload)
        model_b = next(item for item in payload["models"] if item["model_id"] == "model-b")
        group = model_b["predictions"][0]
        self.assertEqual(group["prize_level"], "七等奖")
        self.assertEqual(group["prize_amount"], 5)
        self.assertEqual(group["prize_source"], "fallback")

    def test_resolve_prize_amount_falls_back_for_fixed_prizes_only(self) -> None:
        fixed = self.service.resolve_prize_amount({"prize_breakdown": []}, "三等奖")
        floating = self.service.resolve_prize_amount({"prize_breakdown": []}, "一等奖")

        self.assertEqual(fixed, {"amount": 10000, "source": "fallback"})
        self.assertEqual(floating, {"amount": 0, "source": "missing"})

    def test_resolve_prize_amount_applies_new_rule_tiers_by_previous_pool(self) -> None:
        low_tier = self.service.resolve_prize_amount(
            {"lottery_code": "dlt", "period": "26014", "previous_jackpot_pool": 799999999, "prize_breakdown": []},
            "三等奖",
        )
        high_tier = self.service.resolve_prize_amount(
            {"lottery_code": "dlt", "period": "26014", "previous_jackpot_pool": 800000000, "prize_breakdown": []},
            "三等奖",
        )

        self.assertEqual(low_tier, {"amount": 5000, "source": "fallback"})
        self.assertEqual(high_tier, {"amount": 6666, "source": "fallback"})

    def test_resolve_prize_amount_returns_missing_for_new_rule_floating_prizes(self) -> None:
        first_prize = self.service.resolve_prize_amount(
            {"lottery_code": "dlt", "period": "26014", "previous_jackpot_pool": 900000000, "prize_breakdown": []},
            "一等奖",
        )

        self.assertEqual(first_prize, {"amount": 0, "source": "missing"})

    def test_history_list_payload_filters_by_single_strategy(self) -> None:
        payload = self.service.get_history_list_payload(strategy_filters=["增强型热号追随者"], strategy_match_mode="all")

        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["strategy_options"], ["AI 组合策略", "冷号补位", "增强型热号追随者"])
        record = payload["predictions_history"][0]
        self.assertEqual(record["period_summary"]["total_bet_count"], 1)
        self.assertEqual(record["period_summary"]["total_cost_amount"], 2)
        self.assertEqual(record["period_summary"]["total_prize_amount"], 10000)
        self.assertEqual(len(record["models"]), 1)
        self.assertEqual(record["models"][0]["model_id"], "model-a")
        self.assertEqual(record["models"][0]["bet_count"], 1)
        self.assertEqual(record["models"][0]["prize_amount"], 10000)

    def test_history_list_payload_filters_by_multi_strategy_with_all_match(self) -> None:
        payload = self.service.get_history_list_payload(
            strategy_filters=["增强型热号追随者", "AI 组合策略"],
            strategy_match_mode="all",
        )

        self.assertEqual(payload["total_count"], 1)
        record = payload["predictions_history"][0]
        self.assertEqual(len(record["models"]), 1)
        self.assertEqual(record["models"][0]["model_id"], "model-a")
        self.assertEqual(record["models"][0]["bet_count"], 2)
        self.assertEqual(record["period_summary"]["total_bet_count"], 2)
        self.assertEqual(record["period_summary"]["total_prize_amount"], 10000)

    def test_pl3_history_list_payload_computes_model_prize_amount(self) -> None:
        service = PredictionService(prediction_repository=_FakePl3PredictionRepository())

        payload = service.get_history_list_payload(limit=5, offset=0, lottery_code="pl3")

        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["lottery_code"], "pl3")
        record = payload["predictions_history"][0]
        model = record["models"][0]
        self.assertEqual(model["bet_count"], 3)
        self.assertEqual(model["prize_amount"], 346)
        self.assertEqual(record["period_summary"]["total_prize_amount"], 346)
        self.assertEqual(payload["strategy_options"], [])

    def test_pl3_history_best_hit_count_uses_new_group_rule(self) -> None:
        service = PredictionService(prediction_repository=_FakePl3PredictionRepository())

        list_payload = service.get_history_list_payload(limit=5, offset=0, lottery_code="pl3")
        list_model = list_payload["predictions_history"][0]["models"][0]
        self.assertEqual(list_model["best_hit_count"], 2)

        detail_payload = service.get_history_detail_payload("26060", lottery_code="pl3")
        self.assertIsNotNone(detail_payload)
        detail_model = detail_payload["models"][0]
        self.assertEqual(detail_model["best_hit_count"], 2)

    def test_pl3_history_list_payload_filters_by_play_type_for_trend(self) -> None:
        service = PredictionService(prediction_repository=_FakePl3PredictionRepository())

        payload = service.get_history_list_payload(limit=5, offset=0, lottery_code="pl3", play_type_filters=["group6"])
        model = payload["predictions_history"][0]["models"][0]

        self.assertEqual(model["bet_count"], 1)
        self.assertEqual(model["best_hit_count"], 1)

    def test_pl3_history_list_payload_infers_sum_mode_from_group_metrics(self) -> None:
        service = PredictionService(prediction_repository=_FakePl3SumMislabelRepository())

        payload = service.get_history_list_payload(limit=5, offset=0, lottery_code="pl3", play_type_filters=["direct_sum"])
        model = payload["predictions_history"][0]["models"][0]

        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(model["bet_count"], 2)
        self.assertEqual(model["prediction_play_mode"], "direct_sum")
        self.assertEqual(payload["model_stats"][0]["prediction_play_mode"], "direct_sum")

    def test_pl3_history_detail_payload_infers_sum_mode_from_predictions(self) -> None:
        service = PredictionService(prediction_repository=_FakePl3SumMislabelRepository())

        payload = service.get_history_detail_payload("26061", lottery_code="pl3")

        self.assertIsNotNone(payload)
        model = payload["models"][0]
        self.assertEqual(model["prediction_play_mode"], "direct_sum")

    def test_pl3_history_list_ignores_strategy_filters(self) -> None:
        service = PredictionService(prediction_repository=_FakePl3PredictionRepository())

        payload = service.get_history_list_payload(
            limit=5,
            offset=0,
            lottery_code="pl3",
            strategy_filters=["AI 组合策略"],
        )

        self.assertEqual(payload["total_count"], 1)
        self.assertEqual(payload["strategy_options"], [])
        model = payload["predictions_history"][0]["models"][0]
        self.assertEqual(model["bet_count"], 3)

    def test_pl3_group6_trend_hit_count_ignores_position(self) -> None:
        hit_count = self.service._calculate_pl3_trend_hit_count(
            {"play_type": "group6", "digits": ["01", "02", "03"]},
            {"lottery_code": "pl3", "digits": ["03", "08", "01"]},
        )

        self.assertEqual(hit_count, 2)

    def test_resolve_pl3_direct_prize_level_accepts_digit_hit_count_when_exact_flag_missing(self) -> None:
        prize_level = self.service.resolve_prize_level(
            {"digit_hit_count": 3},
            actual_result={"lottery_code": "pl3"},
            prediction_group={"play_type": "direct", "digits": ["01", "01", "08"]},
        )

        self.assertEqual(prize_level, "直选")

    def test_calculate_hit_result_pl3_supports_red_ball_fallback(self) -> None:
        hit_result = self.service.calculate_hit_result(
            {"play_type": "direct", "red_balls": ["01", "01", "08"]},
            {"lottery_code": "pl3", "red_balls": ["01", "01", "08"]},
            lottery_code="pl3",
        )

        self.assertEqual(hit_result["digit_hit_count"], 3)
        self.assertTrue(hit_result["is_exact_match"])

    def test_calculate_hit_result_pl3_direct_sum_uses_sum_value(self) -> None:
        hit_result = self.service.calculate_hit_result(
            {"play_type": "direct_sum", "sum_value": "10", "digits": []},
            {"lottery_code": "pl3", "digits": ["01", "02", "07"]},
            lottery_code="pl3",
        )

        self.assertEqual(hit_result["digit_hit_count"], 1)
        self.assertEqual(hit_result["total_hits"], 1)
        self.assertTrue(hit_result["is_exact_match"])

    def test_resolve_pl3_direct_sum_prize_level_accepts_hit(self) -> None:
        prize_level = self.service.resolve_prize_level(
            {"digit_hit_count": 1},
            actual_result={"lottery_code": "pl3"},
            prediction_group={"play_type": "direct_sum", "sum_value": "10", "digits": []},
        )

        self.assertEqual(prize_level, "和值")

    def test_current_payload_hides_inactive_models_when_requested(self) -> None:
        service = PredictionService(
            prediction_repository=_FakePredictionRepository(),
            model_repository=_FakeModelRepository({"model-a"}),
        )

        payload = service.get_current_payload(include_inactive_models=False)

        self.assertEqual([item["model_id"] for item in payload["models"]], ["model-a"])

    def test_history_payload_hides_inactive_models_when_requested(self) -> None:
        service = PredictionService(
            prediction_repository=_FakePredictionRepository(),
            model_repository=_FakeModelRepository({"model-a"}),
        )

        payload = service.get_history_list_payload(include_inactive_models=False)

        self.assertEqual(payload["total_count"], 1)
        self.assertEqual([item["model_id"] for item in payload["predictions_history"][0]["models"]], ["model-a"])
        self.assertEqual([item["model_id"] for item in payload["model_stats"]], ["model-a"])
        self.assertEqual(payload["strategy_options"], ["AI 组合策略", "增强型热号追随者"])

    def test_history_detail_returns_none_when_only_inactive_models_remain(self) -> None:
        service = PredictionService(
            prediction_repository=_FakePredictionRepository(),
            model_repository=_FakeModelRepository(set()),
        )

        payload = service.get_history_detail_payload("2026031", include_inactive_models=False)

        self.assertIsNone(payload)


if __name__ == "__main__":
    unittest.main()
