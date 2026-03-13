# -*- coding: utf-8 -*-
"""大乐透 AI 预测自动生成脚本。"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PROJECT_ROOT.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.db.connection import ensure_schema
from backend.app.services.lottery_service import LotteryService
from backend.app.services.prediction_service import PredictionService
from backend.core.model_config import ModelDefinition, load_model_registry
from backend.core.model_factory import ModelFactory

PROMPT_FILE = os.path.join(PROJECT_ROOT, "doc", "dlt_prompt2.0.md")

lottery_service = LotteryService()
prediction_service = PredictionService()


def load_prompt_template() -> str:
    with open(PROMPT_FILE, "r", encoding="utf-8") as handle:
        return handle.read()


def normalize_blue_balls(value: Any) -> List[str]:
    if isinstance(value, list):
        return sorted(str(item).zfill(2) for item in value)
    if isinstance(value, str) and value:
        return [str(value).zfill(2)]
    return []


def normalize_draw(draw: Dict[str, Any]) -> Dict[str, Any]:
    red_balls = sorted(str(item).zfill(2) for item in draw.get("red_balls", []))
    blue_balls = normalize_blue_balls(draw.get("blue_balls", draw.get("blue_ball")))
    return {
        **draw,
        "red_balls": red_balls,
        "blue_balls": blue_balls,
        "blue_ball": blue_balls[0] if blue_balls else None,
    }


def load_lottery_history() -> Dict[str, Any]:
    data = lottery_service.get_history_payload()
    return {
        **data,
        "data": [normalize_draw(draw) for draw in data.get("data", [])],
    }


def validate_prediction(prediction: Dict[str, Any]) -> bool:
    try:
        required_fields = ["prediction_date", "target_period", "model_id", "model_name", "predictions"]
        for field in required_fields:
            if field not in prediction:
                print(f"    Missing field: {field}")
                return False

        if len(prediction["predictions"]) != 5:
            print(f"    Invalid group count: {len(prediction['predictions'])}")
            return False

        for group in prediction["predictions"]:
            red_balls = group.get("red_balls", [])
            blue_balls = group.get("blue_balls", group.get("blue_ball", []))
            if len(red_balls) != 5:
                return False
            if red_balls != sorted(red_balls):
                return False

            normalized_blue = normalize_blue_balls(blue_balls)
            if len(normalized_blue) != 2:
                return False
            if normalized_blue != sorted(normalized_blue):
                return False
        return True
    except Exception as exc:
        print(f"    Validation error: {exc}")
        return False


def normalize_prediction(prediction: Dict[str, Any]) -> Dict[str, Any]:
    normalized_predictions = []
    for group in prediction.get("predictions", []):
        blue_balls = normalize_blue_balls(group.get("blue_balls", group.get("blue_ball")))
        normalized_predictions.append(
            {
                **group,
                "red_balls": sorted(str(item).zfill(2) for item in group.get("red_balls", [])),
                "blue_balls": blue_balls,
                "blue_ball": blue_balls[0] if blue_balls else None,
            }
        )

    return {
        **prediction,
        "predictions": normalized_predictions,
    }


def calculate_hit_result(prediction_group: Dict[str, Any], actual_result: Dict[str, Any]) -> Dict[str, Any]:
    red_hits = [b for b in prediction_group["red_balls"] if b in actual_result["red_balls"]]
    blue_hits = [b for b in prediction_group["blue_balls"] if b in actual_result["blue_balls"]]
    return {
        "red_hits": red_hits,
        "red_hit_count": len(red_hits),
        "blue_hits": blue_hits,
        "blue_hit_count": len(blue_hits),
        "total_hits": len(red_hits) + len(blue_hits),
    }


def archive_old_prediction(lottery_data: Dict[str, Any]) -> None:
    try:
        prediction_service.archive_current_prediction_if_needed(lottery_data)
    except Exception as exc:
        print(f"  Archive failed: {exc}")


def build_prediction_prompt(
    prompt_template: str,
    target_period: str,
    target_date: str,
    prediction_date: str,
    model_def: ModelDefinition,
    history_json: str,
) -> str:
    return prompt_template.format(
        target_period=target_period,
        target_date=target_date,
        lottery_history=history_json,
        prediction_date=prediction_date,
        model_id=model_def.model_id,
        model_name=model_def.name,
    )


def prepare_models(
    model_definitions: List[ModelDefinition],
    enable_health_check: bool = True,
) -> List[Any]:
    factory = ModelFactory()
    models = []
    for model_def in model_definitions:
        try:
            model = factory.create(model_def)
        except Exception as exc:
            print(f"  Skip {model_def.name}: {exc}")
            continue

        if enable_health_check:
            ok, message = model.health_check()
            if not ok:
                print(f"  Health check failed: {model_def.name} ({message})")
                continue
            print(f"  Health check passed: {model_def.name}")

        models.append(model)
    return models


def finalize_prediction(
    prediction: Dict[str, Any],
    model_def: ModelDefinition,
    prediction_date: str,
    target_period: str,
) -> Dict[str, Any]:
    normalized = normalize_prediction(prediction)
    normalized["prediction_date"] = prediction_date
    normalized["target_period"] = target_period
    normalized["model_id"] = model_def.model_id
    normalized["model_name"] = model_def.name
    normalized["model_provider"] = model_def.provider
    normalized["model_version"] = model_def.version
    normalized["model_tags"] = model_def.tags
    normalized["model_api_model"] = model_def.api_model
    return normalized


def generate_predictions() -> Optional[Dict[str, Any]]:
    print("\n" + "=" * 50)
    print("AI prediction generation")
    print("=" * 50 + "\n")

    ensure_schema()
    prompt_template = load_prompt_template()
    lottery_data = load_lottery_history()
    archive_old_prediction(lottery_data)

    next_draw = lottery_data.get("next_draw", {})
    target_period = next_draw.get("next_period", "")
    target_date = next_draw.get("next_date_display", "")
    if not target_period:
        print("Unable to determine next period.")
        return None

    history_data = lottery_data.get("data", [])[:30]
    history_json = json.dumps(history_data, ensure_ascii=False, indent=2)
    prediction_date = datetime.now().strftime("%Y-%m-%d")

    registry = load_model_registry()
    model_definitions = registry.select()
    current_prediction = prediction_service.get_current_payload_by_period(target_period)
    existing_model_ids = {
        model.get("model_id")
        for model in current_prediction.get("models", [])
        if model.get("model_id")
    }
    pending_definitions = [
        model_def
        for model_def in model_definitions
        if model_def.model_id not in existing_model_ids
    ]

    if existing_model_ids:
        print(f"Existing models for period {target_period}: {len(existing_model_ids)}")

    if not pending_definitions:
        print(f"No missing models for target period {target_period}.")
        return current_prediction

    models = prepare_models(pending_definitions, enable_health_check=True)

    all_predictions = []
    for model in models:
        model_def = model.definition
        try:
            prompt = build_prediction_prompt(
                prompt_template=prompt_template,
                target_period=target_period,
                target_date=target_date,
                prediction_date=prediction_date,
                model_def=model_def,
                history_json=history_json,
            )
            raw_prediction = model.predict(prompt)
            prediction = finalize_prediction(raw_prediction, model_def, prediction_date, target_period)
            if validate_prediction(prediction):
                all_predictions.append(prediction)
                print(f"  Prediction accepted: {model_def.name}")
        except Exception as exc:
            print(f"  Prediction failed for {model_def.name}: {exc}")

    if not all_predictions:
        print("No valid predictions generated.")
        return None

    return {
        "prediction_date": prediction_date,
        "target_period": target_period,
        "models": all_predictions,
    }


def save_predictions(predictions: Dict[str, Any]) -> None:
    print("Saving predictions into normalized MySQL tables...")
    saved = prediction_service.save_current_prediction(predictions)
    print(f"  Saved target period: {saved.get('target_period')}\n")


def main() -> None:
    predictions = generate_predictions()
    if predictions:
        save_predictions(predictions)
        print("=" * 50)
        print("Prediction generation complete")
        print("=" * 50 + "\n")
        print(f"Period: {predictions['target_period']}")
        print(f"Date: {predictions['prediction_date']}")
        print(f"Models: {len(predictions['models'])}")
    else:
        print("Prediction generation failed.")


if __name__ == "__main__":
    main()
