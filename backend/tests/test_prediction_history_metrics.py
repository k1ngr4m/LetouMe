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

    def list_history_records(self, limit: int | None = None, offset: int = 0) -> list[dict]:
        return [self.record]

    def list_history_record_summaries(self, limit: int | None = None, offset: int = 0) -> list[dict]:
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
                            {"group_id": 1, "red_hit_count": 5, "blue_hit_count": 0, "total_hits": 5},
                            {"group_id": 2, "red_hit_count": 0, "blue_hit_count": 0, "total_hits": 0},
                        ],
                    },
                    {
                        "model_id": "model-b",
                        "model_name": "模型B",
                        "model_provider": "deepseek",
                        "best_group": 1,
                        "best_hit_count": 2,
                        "group_metrics": [
                            {"group_id": 1, "red_hit_count": 0, "blue_hit_count": 2, "total_hits": 2},
                        ],
                    },
                ],
            }
        ]

    def count_history_records(self) -> int:
        return 1

    def get_history_record_detail(self, target_period: str) -> dict | None:
        return self.record if target_period == "2026031" else None


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
        self.assertEqual(group["prize_level"], "九等奖")
        self.assertEqual(group["prize_amount"], 5)
        self.assertEqual(group["prize_source"], "official")

    def test_resolve_prize_amount_falls_back_for_fixed_prizes_only(self) -> None:
        fixed = self.service.resolve_prize_amount({"prize_breakdown": []}, "三等奖")
        floating = self.service.resolve_prize_amount({"prize_breakdown": []}, "一等奖")

        self.assertEqual(fixed, {"amount": 10000, "source": "fallback"})
        self.assertEqual(floating, {"amount": 0, "source": "missing"})


if __name__ == "__main__":
    unittest.main()
