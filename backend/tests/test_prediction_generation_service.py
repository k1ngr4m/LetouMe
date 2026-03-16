from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.app.services.prediction_generation_service import PredictionGenerationService


class PredictionGenerationServiceTests(unittest.TestCase):
    def test_generate_for_models_tracks_completed_count_and_failure_reasons(self) -> None:
        service = PredictionGenerationService()
        progress_updates: list[dict] = []

        with (
            patch.object(
                service,
                "generate_current_for_model",
                side_effect=[
                    {"processed_count": 1, "skipped_count": 0, "failed_count": 0},
                    ValueError("模型健康检查失败: 缺少 API Key"),
                    {"processed_count": 0, "skipped_count": 0, "failed_count": 0},
                ],
            ),
        ):
            summary = service.generate_for_models(
                model_codes=["model-a", "model-b", "model-c"],
                mode="current",
                overwrite=False,
                progress_callback=progress_updates.append,
            )

        self.assertEqual(summary["selected_count"], 3)
        self.assertEqual(summary["completed_count"], 3)
        self.assertEqual(summary["processed_models"], ["model-a"])
        self.assertEqual(summary["failed_models"], ["model-b", "model-c"])
        self.assertEqual(
            summary["failed_details"],
            [
                {"model_code": "model-b", "reason": "模型健康检查失败: 缺少 API Key"},
                {"model_code": "model-c", "reason": "模型未生成结果"},
            ],
        )
        self.assertEqual([update["completed_count"] for update in progress_updates], [1, 2, 3])


if __name__ == "__main__":
    unittest.main()
