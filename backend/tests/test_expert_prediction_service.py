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


if __name__ == "__main__":
    unittest.main()
