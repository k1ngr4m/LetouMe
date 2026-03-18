from __future__ import annotations

import json
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

    def test_pl3_prompt_template_can_be_formatted(self) -> None:
        template = PredictionGenerationService._load_prompt_template("pl3")
        rendered = template.format(
            target_period="26068",
            target_date="2026年03月19日",
            lottery_history=json.dumps(
                [
                    {"period": "26067", "date": "2026-03-18", "digits": ["0", "1", "2"]},
                    {"period": "26066", "date": "2026-03-17", "digits": ["3", "4", "5"]},
                ],
                ensure_ascii=False,
                indent=2,
            ),
            prediction_date="2026-03-18",
            model_id="pl3_model_demo",
            model_name="PL3 Demo Model",
        )
        self.assertIn("目标期号：26068", rendered)
        self.assertIn("模型：PL3 Demo Model (pl3_model_demo)", rendered)
        self.assertIn('"period": "26067"', rendered)

    def test_pl3_prompt_template_has_required_output_constraints(self) -> None:
        template = PredictionGenerationService._load_prompt_template("pl3")
        required_phrases = [
            "必须正好输出 5 组",
            "`play_type` 只能是 `direct`、`group3`、`group6`",
            "`digits` 必须是长度为 3 的数组",
            "group3",
            "group6",
            "只输出纯 JSON",
        ]
        for phrase in required_phrases:
            self.assertIn(phrase, template)


if __name__ == "__main__":
    unittest.main()
