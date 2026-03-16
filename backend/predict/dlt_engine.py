# -*- coding: utf-8 -*-
"""大乐透 AI 预测自动生成脚本。"""

from __future__ import annotations

from typing import Any

from backend.app.logging_utils import get_logger
from backend.app.services.prediction_generation_service import PredictionGenerationService
from backend.app.services.prediction_service import PredictionService
from backend.core.model_config import load_model_registry


logger = get_logger("predict.dlt_engine")
prediction_generation_service = PredictionGenerationService()
prediction_service = PredictionService()


def validate_prediction(prediction: dict[str, Any]) -> bool:
    return prediction_generation_service._validate_prediction(prediction)


def finalize_prediction(
    prediction: dict[str, Any],
    model_def: Any,
    prediction_date: str,
    target_period: str,
) -> dict[str, Any]:
    return prediction_generation_service._finalize_prediction(prediction, model_def, prediction_date, target_period)


def calculate_hit_result(prediction_group: dict[str, Any], actual_result: dict[str, Any]) -> dict[str, Any]:
    return prediction_service.calculate_hit_result(prediction_group, actual_result)


def generate_predictions() -> dict[str, Any] | None:
    registry = load_model_registry()
    generated_count = 0
    skipped_count = 0
    last_target_period = ""
    for model_def in registry.select():
        summary = prediction_generation_service.generate_current_for_model(
            model_code=model_def.model_id,
            overwrite=False,
        )
        last_target_period = str(summary.get("target_period") or last_target_period)
        generated_count += int(summary.get("processed_count") or 0)
        skipped_count += int(summary.get("skipped_count") or 0)

    if not last_target_period and not registry.select():
        logger.warning("No active models available")
        return None

    payload = prediction_service.get_current_payload()
    logger.info(
        "Prediction generation complete",
        extra={
            "context": {
                "target_period": payload.get("target_period"),
                "generated_count": generated_count,
                "skipped_count": skipped_count,
            }
        },
    )
    return payload


def save_predictions(predictions: dict[str, Any]) -> None:
    logger.info(
        "Predictions already persisted",
        extra={"context": {"target_period": predictions.get("target_period"), "model_count": len(predictions.get("models", []))}},
    )


def main() -> None:
    predictions = generate_predictions()
    if not predictions:
        logger.error("Prediction generation failed")


if __name__ == "__main__":
    main()
