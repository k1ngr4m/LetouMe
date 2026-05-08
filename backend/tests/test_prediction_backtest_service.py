from __future__ import annotations

import unittest

from backend.app.services.prediction_service import PredictionService


class _BacktestRepository:
    def __init__(self, records: list[dict] | None = None) -> None:
        self.records = records if records is not None else _build_records()

    def list_history_record_summaries_with_metrics(
        self,
        limit: int | None = None,
        offset: int = 0,
        lottery_code: str = "dlt",
        **_: object,
    ) -> dict:
        rows = [record for record in self.records if record.get("lottery_code", "dlt") == lottery_code]
        sliced = rows[offset:]
        if limit is not None:
            sliced = sliced[:limit]
        return {"records": sliced, "metrics": {"batch_count": len(sliced)}}

    def count_history_records(self, lottery_code: str = "dlt", **_: object) -> int:
        return len([record for record in self.records if record.get("lottery_code", "dlt") == lottery_code])

    def list_history_strategy_options(self, lottery_code: str = "dlt") -> list[str]:
        strategies = set()
        for record in self.records:
            if record.get("lottery_code", "dlt") != lottery_code:
                continue
            for model in record.get("models", []):
                for metric in model.get("group_metrics", []):
                    strategies.add(str(metric.get("strategy") or "AI 组合策略"))
        return sorted(strategies)


def _actual(period: str) -> dict:
    return {
        "lottery_code": "dlt",
        "period": period,
        "date": "2026-03-01",
        "red_balls": ["01", "02", "03", "04", "05"],
        "blue_balls": ["06", "07"],
        "prize_breakdown": [
            {"prize_level": "三等奖", "prize_type": "basic", "winner_count": 1, "prize_amount": 10000, "total_amount": 10000},
            {"prize_level": "九等奖", "prize_type": "basic", "winner_count": 1, "prize_amount": 5, "total_amount": 5},
        ],
    }


def _build_records() -> list[dict]:
    return [
        {
            "lottery_code": "dlt",
            "prediction_date": "2026-03-01",
            "target_period": "26002",
            "actual_result": _actual("26002"),
            "models": [
                {
                    "model_id": "model-a",
                    "prediction_play_mode": "direct",
                    "model_name": "模型A",
                    "model_provider": "openai",
                    "group_metrics": [
                        {"group_id": 1, "strategy": "热号", "red_hit_count": 0, "blue_hit_count": 0, "total_hits": 0}
                    ],
                },
            ],
        },
        {
            "lottery_code": "dlt",
            "prediction_date": "2026-02-28",
            "target_period": "26001",
            "actual_result": _actual("26001"),
            "models": [
                {
                    "model_id": "model-a",
                    "prediction_play_mode": "direct",
                    "model_name": "模型A",
                    "model_provider": "openai",
                    "group_metrics": [
                        {"group_id": 1, "strategy": "热号", "red_hit_count": 5, "blue_hit_count": 0, "total_hits": 5}
                    ],
                },
                {
                    "model_id": "model-a",
                    "prediction_play_mode": "compound",
                    "model_name": "模型A",
                    "model_provider": "openai",
                    "group_metrics": [
                        {
                            "group_id": 1,
                            "play_type": "dlt_compound",
                            "strategy": "复式",
                            "red_balls": ["01", "02", "03", "04", "05", "08"],
                            "blue_balls": ["06", "09"],
                            "red_hit_count": 5,
                            "blue_hit_count": 1,
                            "total_hits": 6,
                        }
                    ],
                },
            ],
        },
    ]


class PredictionBacktestServiceTests(unittest.TestCase):
    def test_recent_period_count_limits_records(self) -> None:
        service = PredictionService(prediction_repository=_BacktestRepository())

        payload = service.get_backtest_summary_payload(recent_period_count=1, include_inactive_models=True)

        self.assertEqual(payload["overview"]["period_count"], 1)
        self.assertEqual(payload["periods"][0]["target_period"], "26002")

    def test_model_rankings_keep_play_modes_separated(self) -> None:
        service = PredictionService(prediction_repository=_BacktestRepository())

        payload = service.get_backtest_summary_payload(recent_period_count=None, include_inactive_models=True)
        ranking_keys = {(item["model_id"], item["prediction_play_mode"]) for item in payload["model_rankings"]}

        self.assertIn(("model-a", "direct"), ranking_keys)
        self.assertIn(("model-a", "compound"), ranking_keys)

    def test_model_filter_and_strategy_breakdown(self) -> None:
        service = PredictionService(prediction_repository=_BacktestRepository())

        payload = service.get_backtest_summary_payload(
            recent_period_count=None,
            model_codes=["model-a"],
            strategy_filters=["热号"],
            include_inactive_models=True,
        )

        self.assertEqual(payload["overview"]["model_count"], 1)
        self.assertEqual(payload["strategy_breakdown"][0]["strategy"], "热号")
        self.assertGreaterEqual(payload["strategy_breakdown"][0]["period_count"], 1)

    def test_empty_history_returns_empty_payload(self) -> None:
        service = PredictionService(prediction_repository=_BacktestRepository(records=[]))

        payload = service.get_backtest_summary_payload(include_inactive_models=True)

        self.assertEqual(payload["overview"]["period_count"], 0)
        self.assertEqual(payload["model_rankings"], [])
        self.assertEqual(payload["periods"], [])


if __name__ == "__main__":
    unittest.main()
