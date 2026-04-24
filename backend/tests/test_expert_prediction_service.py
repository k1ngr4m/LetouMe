from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from backend.app.services.expert_prediction_service import ExpertPredictionService


class ExpertPredictionServiceTests(unittest.TestCase):
    def _build_service(self) -> ExpertPredictionService:
        repository = Mock()
        repository.upsert_batch.return_value = {"id": 7, "task_id": "batch-task"}
        repository.list_results_by_period.return_value = []
        repository.update_batch.return_value = {}
        repository.upsert_result.return_value = {}

        expert_service = Mock()
        expert_service.get_expert.return_value = {
            "id": 3,
            "expert_code": "wei-rong-jie",
            "display_name": "魏荣杰",
            "bio": "",
            "model_code": "deepseek-v3.2",
            "lottery_code": "dlt",
            "is_active": True,
            "is_deleted": False,
            "config": {},
        }

        lottery_service = Mock()
        lottery_service.get_recent_draws.return_value = [
            {"period": "26032", "red_balls": ["01", "02", "03", "04", "05"], "blue_balls": ["01", "02"]}
        ]
        lottery_service.get_history_payload.return_value = {
            "data": [
                {
                    "period": "26033",
                    "date": "2026-03-15",
                    "red_balls": ["01", "02", "03", "04", "05"],
                    "blue_balls": ["01", "02"],
                },
                {
                    "period": "26032",
                    "date": "2026-03-12",
                    "red_balls": ["11", "12", "13", "14", "15"],
                    "blue_balls": ["03", "04"],
                },
            ]
        }

        prediction_generation_service = Mock()
        prediction_generation_service._normalize_prompt_history_period_count.side_effect = lambda value: value or 50
        prediction_generation_service._normalize_parallelism.side_effect = lambda value, task_count, default_parallelism: min(value or default_parallelism, task_count)

        prediction_service = Mock()
        prediction_service.get_current_payload.return_value = {"target_period": "26033"}

        service = ExpertPredictionService(
            repository=repository,
            expert_service=expert_service,
            lottery_service=lottery_service,
            prediction_service=prediction_service,
            prediction_generation_service=prediction_generation_service,
        )
        return service

    def test_generate_for_expert_current_skips_existing_result_without_overwrite(self) -> None:
        service = self._build_service()
        service.repository.list_results_by_period.return_value = [
            {"expert_id": 3, "expert_code": "wei-rong-jie", "status": "succeeded"}
        ]

        with patch("backend.app.services.expert_prediction_service.ensure_schema"):
            summary = service.generate_for_expert(
                expert_code="wei-rong-jie",
                lottery_code="dlt",
                mode="current",
                overwrite=False,
            )

        self.assertEqual(summary["processed_count"], 0)
        self.assertEqual(summary["skipped_count"], 1)
        service.repository.upsert_result.assert_not_called()

    def test_generate_for_expert_current_overwrites_existing_result(self) -> None:
        service = self._build_service()
        service.repository.list_results_by_period.return_value = [
            {"expert_id": 3, "expert_code": "wei-rong-jie", "status": "succeeded"}
        ]

        with (
            patch("backend.app.services.expert_prediction_service.ensure_schema"),
            patch.object(service, "_generate_first_tier_with_model", return_value={"front_pool": ["01", "02"], "back_pool": ["01"]}),
        ):
            summary = service.generate_for_expert(
                expert_code="wei-rong-jie",
                lottery_code="dlt",
                mode="current",
                overwrite=True,
                prompt_history_period_count=30,
            )

        self.assertEqual(summary["processed_count"], 1)
        self.assertEqual(summary["skipped_count"], 0)
        service.repository.upsert_result.assert_called_once()

    def test_list_history_experts_filters_to_draws_and_builds_tier_hits(self) -> None:
        service = self._build_service()
        service.repository.list_history_results.return_value = [
            {
                "expert_code": "wei-rong-jie",
                "display_name": "魏荣杰",
                "bio": "稳健专家",
                "model_code": "deepseek-v3.2",
                "target_period": "26033",
                "status": "succeeded",
                "generated_at": 1770000000,
                "tiers": {
                    "tier1": {"front": ["01", "06"], "back": ["02"]},
                    "tier5": {"front": ["01", "02", "03", "09", "10"], "back": ["01", "12"]},
                },
            },
            {
                "expert_code": "wei-rong-jie",
                "display_name": "魏荣杰",
                "target_period": "99999",
                "status": "succeeded",
                "tiers": {"tier1": {"front": ["01"], "back": ["01"]}},
            },
        ]

        payload = service.list_history_experts(lottery_code="dlt", limit=10, offset=0)

        self.assertEqual(payload["total_count"], 1)
        record = payload["records"][0]
        self.assertEqual(record["target_period"], "26033")
        expert = record["experts"][0]
        self.assertEqual(expert["tier_hits"]["tier1"]["front_hits"], ["01"])
        self.assertEqual(expert["tier_hits"]["tier1"]["back_hits"], ["02"])
        self.assertEqual(expert["tier_hits"]["tier5"]["total_hit_count"], 4)

    def test_get_history_expert_detail_returns_none_when_missing(self) -> None:
        service = self._build_service()
        service.repository.list_results_by_period.return_value = []

        detail = service.get_history_expert_detail(lottery_code="dlt", target_period="26033", expert_code="wei-rong-jie")

        self.assertIsNone(detail)

    def test_algorithm_weights_change_candidate_sorting(self) -> None:
        service = self._build_service()
        precompute = {
            "score_map": {
                "front": {
                    "01": {
                        "algo_big_small_ratio_signal": 0.0,
                        "algo_frequency_probability_signal": 1.0,
                        "strategy_avg_omit_signal": 0.0,
                    },
                    "18": {
                        "algo_big_small_ratio_signal": 1.0,
                        "algo_frequency_probability_signal": 0.0,
                        "strategy_avg_omit_signal": 0.0,
                    },
                }
            }
        }
        big_small_expert = {
            "config": {
                "dlt_front_weights": {"big_small_ratio": 100},
                "strategy_preferences": {"avg_omit": 100},
            }
        }
        frequency_expert = {
            "config": {
                "dlt_front_weights": {"frequency_probability": 100},
                "strategy_preferences": {"avg_omit": 100},
            }
        }

        self.assertEqual(
            service._sort_by_score(["01", "18"], zone="front", precompute=precompute, expert=big_small_expert),
            ["18", "01"],
        )
        self.assertEqual(
            service._sort_by_score(["01", "18"], zone="front", precompute=precompute, expert=frequency_expert),
            ["01", "18"],
        )


if __name__ == "__main__":
    unittest.main()
