from __future__ import annotations

import json
import unittest
from concurrent.futures import Future
from unittest.mock import Mock, patch

from backend.app.services.prediction_generation_service import PredictionGenerationService
from backend.core.model_config import ModelDefinition


class PredictionGenerationServiceTests(unittest.TestCase):
    def test_generate_for_models_tracks_completed_count_and_retry_failure_reasons(self) -> None:
        service = PredictionGenerationService()
        progress_updates: list[dict] = []
        attempts: dict[str, int] = {}

        def fake_generate_current_for_model(*, model_code: str, **_: object) -> dict[str, int]:
            attempts[model_code] = attempts.get(model_code, 0) + 1
            if model_code == "model-a":
                return {"processed_count": 1, "skipped_count": 0, "failed_count": 0}
            if model_code == "model-b":
                raise ValueError("模型健康检查失败: 缺少 API Key")
            if attempts[model_code] == 1:
                return {"processed_count": 0, "skipped_count": 0, "failed_count": 0}
            return {"processed_count": 1, "skipped_count": 0, "failed_count": 0}

        with patch.object(service, "generate_current_for_model", side_effect=fake_generate_current_for_model):
            summary = service.generate_for_models(
                model_codes=["model-a", "model-b", "model-c"],
                mode="current",
                overwrite=False,
                parallelism=1,
                progress_callback=progress_updates.append,
            )

        self.assertEqual(summary["selected_count"], 3)
        self.assertEqual(summary["completed_count"], 3)
        self.assertEqual(summary["parallelism"], 1)
        self.assertEqual(summary["retry_per_model"], 1)
        self.assertEqual(summary["processed_models"], ["model-a", "model-c"])
        self.assertEqual(summary["failed_models"], ["model-b"])
        self.assertEqual(
            summary["failed_details"],
            [
                {"model_code": "model-b", "reason": "模型健康检查失败: 缺少 API Key"},
            ],
        )
        self.assertEqual(attempts["model-a"], 1)
        self.assertEqual(attempts["model-b"], 2)
        self.assertEqual(attempts["model-c"], 2)
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

    def test_generate_prediction_logs_response_summary(self) -> None:
        service = PredictionGenerationService()
        model = Mock()
        model.predict.return_value = {
            "predictions": [
                {
                    "group_id": index + 1,
                    "red_balls": ["01", "02", "03", "04", "05"],
                    "blue_balls": ["06", "07"],
                    "strategy": "稳健组合",
                    "description": "测试说明",
                }
                for index in range(5)
            ]
        }
        model_def = ModelDefinition(
            id="model-a",
            name="模型A",
            provider="openai_compatible",
            model_id="model-a",
            api_model="gpt-4o-mini",
        )
        prompt_template = "{target_period}|{target_date}|{lottery_history}|{prediction_date}|{model_id}|{model_name}"

        with self.assertLogs("letoume.services.prediction_generation", level="INFO") as logs:
            prediction = service._generate_prediction(
                model=model,
                model_def=model_def,
                lottery_code="dlt",
                prompt_template=prompt_template,
                target_period="2026032",
                prediction_date="2026-03-18",
                history_context=[{"period": "2026031"}],
                target_date="2026-03-19",
            )

        self.assertEqual(len(prediction["predictions"]), 5)
        joined = "\n".join(logs.output)
        self.assertIn("Prediction generation started", joined)
        self.assertIn("Model returned prediction payload", joined)
        self.assertIn("Prediction generation completed", joined)

    def test_generate_prediction_logs_warning_when_validation_fails(self) -> None:
        service = PredictionGenerationService()
        model = Mock()
        model.predict.return_value = {"predictions": []}
        model_def = ModelDefinition(
            id="model-a",
            name="模型A",
            provider="openai_compatible",
            model_id="model-a",
            api_model="gpt-4o-mini",
        )
        prompt_template = "{target_period}|{target_date}|{lottery_history}|{prediction_date}|{model_id}|{model_name}"

        with patch.object(service, "_validate_prediction", return_value=False):
            with self.assertLogs("letoume.services.prediction_generation", level="WARNING") as logs:
                with self.assertRaises(ValueError):
                    service._generate_prediction(
                        model=model,
                        model_def=model_def,
                        lottery_code="dlt",
                        prompt_template=prompt_template,
                        target_period="2026032",
                        prediction_date="2026-03-18",
                        history_context=[{"period": "2026031"}],
                        target_date="2026-03-19",
                    )

        joined = "\n".join(logs.output)
        self.assertIn("Model prediction validation failed", joined)

    def test_payload_preview_truncates_long_response(self) -> None:
        preview = PredictionGenerationService._build_payload_preview(
            {"text": "x" * 2000},
            limit=120,
        )

        self.assertIn("...(truncated,", preview)

    def test_prediction_payload_summary_counts_group_fields(self) -> None:
        summary = PredictionGenerationService._build_prediction_payload_summary(
            {
                "predictions": [
                    {"group_id": 1, "description": "说明1", "strategy": "策略1", "play_type": "direct"},
                    {"group_id": 2, "description": "", "strategy": "策略2", "play_type": "group3"},
                    {"group_id": 3, "play_type": "group6"},
                ]
            }
        )

        self.assertEqual(summary["group_count"], 3)
        self.assertEqual(summary["description_count"], 1)
        self.assertEqual(summary["strategy_count"], 2)
        self.assertEqual(summary["play_types"], "direct,group3,group6")

    def test_normalize_bulk_parallelism_uses_default_and_clamp(self) -> None:
        self.assertEqual(PredictionGenerationService._normalize_bulk_parallelism(None, selected_count=10), 3)
        self.assertEqual(PredictionGenerationService._normalize_bulk_parallelism(6, selected_count=2), 2)

    def test_normalize_single_model_parallelism_uses_default_and_clamp(self) -> None:
        self.assertEqual(PredictionGenerationService._normalize_single_model_parallelism(None, period_count=10), 3)
        self.assertEqual(PredictionGenerationService._normalize_single_model_parallelism(9, period_count=20), 8)
        self.assertEqual(PredictionGenerationService._normalize_single_model_parallelism(6, period_count=2), 2)

    def test_recalculate_history_for_model_processes_periods_with_parallelism(self) -> None:
        service = PredictionGenerationService()
        captured_workers: dict[str, int] = {}

        class InlineExecutor:
            def __init__(self, *, max_workers: int) -> None:
                captured_workers["max_workers"] = max_workers

            def __enter__(self) -> "InlineExecutor":
                return self

            def __exit__(self, exc_type, exc, tb) -> bool:
                return False

            def submit(self, fn, *args, **kwargs) -> Future:
                future: Future = Future()
                try:
                    future.set_result(fn(*args, **kwargs))
                except Exception as error:
                    future.set_exception(error)
                return future

        model_def = ModelDefinition(
            id="model-a",
            name="模型A",
            provider="openai_compatible",
            model_id="model-a",
            api_model="gpt-4o-mini",
        )
        history_payload = {
            "data": [
                {"period": "26052", "date": "2026-03-18", "digits": ["1", "2", "3"], "lottery_code": "pl3"},
                {"period": "26051", "date": "2026-03-17", "digits": ["2", "3", "4"], "lottery_code": "pl3"},
                {"period": "26050", "date": "2026-03-16", "digits": ["3", "4", "5"], "lottery_code": "pl3"},
                {"period": "26049", "date": "2026-03-15", "digits": ["4", "5", "6"], "lottery_code": "pl3"},
            ]
        }

        with (
            patch("backend.app.services.prediction_generation_service.ensure_schema"),
            patch("backend.app.services.prediction_generation_service.ThreadPoolExecutor", InlineExecutor),
            patch.object(service, "_get_model_definition", return_value=model_def),
            patch.object(service, "_prepare_model", return_value=object()),
            patch.object(service, "_load_prompt_template", return_value="{}"),
            patch.object(service, "_load_lottery_history", return_value=history_payload),
            patch.object(
                service,
                "_generate_prediction",
                return_value={
                    "model_id": "model-a",
                    "model_name": "模型A",
                    "model_provider": "openai_compatible",
                    "model_version": "",
                    "model_tags": [],
                    "model_api_model": "gpt-4o-mini",
                    "predictions": [{"group_id": 1, "play_type": "group6", "digits": ["1", "2", "3"]}],
                },
            ),
            patch.object(service.prediction_repository, "get_history_record_detail", return_value=None),
            patch.object(service.prediction_repository, "upsert_history_record") as upsert_history_record_mock,
            patch.object(service.prediction_service, "_invalidate_prediction_cache"),
            patch.object(service.prediction_service, "calculate_hit_result", return_value={"total_hits": 2}),
        ):
            summary = service.recalculate_history_for_model(
                lottery_code="pl3",
                model_code="model-a",
                start_period="26050",
                end_period="26052",
                overwrite=False,
                parallelism=3,
            )

        self.assertEqual(captured_workers["max_workers"], 3)
        self.assertEqual(summary["processed_count"], 3)
        self.assertEqual(summary["failed_count"], 0)
        self.assertEqual(summary["skipped_count"], 0)
        self.assertEqual(summary["failed_periods"], [])
        self.assertEqual(upsert_history_record_mock.call_count, 3)


if __name__ == "__main__":
    unittest.main()
