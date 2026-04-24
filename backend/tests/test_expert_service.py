from __future__ import annotations

import unittest

from backend.app.services.expert_service import ExpertService


class ExpertServiceTests(unittest.TestCase):
    def test_normalize_config_keeps_legacy_weights_and_fills_new_keys(self) -> None:
        service = ExpertService()

        config = service._normalize_config(
            {
                "dlt_front_weights": {
                    "big_small_ratio": 20,
                    "prime_composite_ratio": 20,
                    "five_zone_ratio": 60,
                },
                "dlt_back_weights": {
                    "three_zone_ratio": 50,
                    "big_small": 50,
                },
                "strategy_preferences": {
                    "avg_omit": 50,
                    "current_omit": 50,
                },
            }
        )

        self.assertEqual(config["dlt_front_weights"]["big_small_ratio"], 20)
        self.assertEqual(config["dlt_front_weights"]["mod3_ratio"], 0)
        self.assertEqual(sum(config["dlt_front_weights"].values()), 100)
        self.assertEqual(sum(config["dlt_back_weights"].values()), 100)
        self.assertEqual(sum(config["strategy_preferences"].values()), 100)

    def test_normalize_config_rejects_invalid_group_total(self) -> None:
        service = ExpertService()

        with self.assertRaisesRegex(ValueError, "大乐透前区权重总和必须等于100"):
            service._normalize_config(
                {
                    "dlt_front_weights": {"big_small_ratio": 99},
                    "dlt_back_weights": {"three_zone_ratio": 100},
                    "strategy_preferences": {"avg_omit": 100},
                }
            )


if __name__ == "__main__":
    unittest.main()
