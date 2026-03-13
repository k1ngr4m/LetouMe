#!/usr/bin/env python3
"""Batch recalculate historical AI predictions and persist them into normalized MySQL tables."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PROJECT_ROOT.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app.db.connection import ensure_schema
from backend.app.repositories.prediction_repository import PredictionRepository
from backend.app.services.lottery_service import LotteryService
from backend.core.model_config import load_model_registry
from backend.core.model_factory import ModelFactory
from backend.predict import dlt_engine as dlt_ai


DEFAULT_PROMPT_PATH = PROJECT_ROOT / "doc" / "dlt_prompt2.0.md"
DEFAULT_CONTEXT_SIZE = 30


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Batch recalculate historical AI predictions")
    parser.add_argument("--start-period", required=True, help="Start target period, inclusive")
    parser.add_argument("--end-period", required=True, help="End target period, inclusive")
    parser.add_argument("--prompt-file", default=str(DEFAULT_PROMPT_PATH), help="Prompt template path")
    parser.add_argument("--context-size", type=int, default=DEFAULT_CONTEXT_SIZE, help="History window size")
    parser.add_argument("--force", action="store_true", help="Overwrite existing model predictions")
    parser.add_argument("--models", default="", help="Comma-separated model IDs")
    parser.add_argument("--include-tags", default="", help="Comma-separated tags")
    parser.add_argument("--no-health-check", action="store_true", help="Disable model health checks")
    return parser.parse_args()


def parse_csv(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def normalize_two_digit(value: str | int) -> str:
    return f"{int(value):02d}"


def build_period_map(history_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    items = history_data.get("data", [])
    if not isinstance(items, list):
        raise ValueError("history data must contain a list in data")

    period_map: dict[str, dict[str, Any]] = {}
    for row in items:
        period = str(row["period"])
        red = sorted(normalize_two_digit(x) for x in row.get("red_balls", []))
        blue_raw = row.get("blue_balls") or row.get("blue_ball") or []
        blue = sorted(normalize_two_digit(x) for x in blue_raw)
        period_map[period] = {
            "period": period,
            "red_balls": red,
            "blue_balls": blue,
            "date": row.get("date"),
        }
    return period_map


def build_prediction_prompt(
    prompt_template: str,
    target_period: str,
    prediction_date: str,
    model_def: Any,
    history_context: list[dict[str, Any]],
) -> str:
    context_json = json.dumps(history_context, ensure_ascii=False, indent=2)
    return prompt_template.format(
        target_period=target_period,
        target_date="",
        lottery_history=context_json,
        prediction_date=prediction_date,
        model_id=model_def.model_id,
        model_name=model_def.name,
    )


def dlt_generate_ai_prediction(
    model: Any,
    prompt_template: str,
    target_period: str,
    prediction_date: str,
    model_def: Any,
    history_context: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = build_prediction_prompt(prompt_template, target_period, prediction_date, model_def, history_context)
    raw_prediction = model.predict(prompt)
    finalized = dlt_ai.finalize_prediction(raw_prediction, model_def, prediction_date, target_period)
    if not dlt_ai.validate_prediction(finalized):
        raise ValueError(f"Invalid prediction structure from {model_def.model_id}")
    return finalized


def make_prediction_date(target_draw_date: str | None) -> str:
    if not target_draw_date:
        return datetime.now().strftime("%Y-%m-%d")
    dt = datetime.strptime(target_draw_date, "%Y-%m-%d")
    return (dt - timedelta(days=1)).strftime("%Y-%m-%d")


def main() -> None:
    args = parse_args()
    ensure_schema()

    lottery_service = LotteryService()
    prediction_repository = PredictionRepository()
    registry = load_model_registry()
    model_ids = parse_csv(args.models)
    include_tags = parse_csv(args.include_tags)
    model_definitions = registry.select(model_ids=model_ids or None, include_tags=include_tags)

    prompt_path = Path(args.prompt_file)
    history_data = lottery_service.get_history_payload()
    period_map = build_period_map(history_data)
    prompt_template = prompt_path.read_text(encoding="utf-8")

    history_records = prediction_repository.list_history_records()
    existing_by_period = {
        str(item.get("target_period")): item
        for item in history_records
        if isinstance(item, dict) and item.get("target_period")
    }

    start_period = int(args.start_period)
    end_period = int(args.end_period)
    if start_period > end_period:
        raise ValueError("start-period cannot be greater than end-period")

    sorted_periods_desc = sorted((int(p), p) for p in period_map.keys())
    all_period_ints = {x[0] for x in sorted_periods_desc}

    factory = ModelFactory()
    model_instances = {}
    for model_def in model_definitions:
        try:
            model = factory.create(model_def)
        except Exception as exc:
            print(f"[skip] model init failed {model_def.model_id}: {exc}")
            continue

        if not args.no_health_check:
            ok, message = model.health_check()
            if not ok:
                print(f"[skip] model health check failed {model_def.model_id}: {message}")
                continue
            print(f"[pass] model health check {model_def.model_id}")
        model_instances[model_def.model_id] = model

    for period_int in range(start_period, end_period + 1):
        target_period = str(period_int)
        if period_int not in all_period_ints:
            print(f"[skip] target period not found: {target_period}")
            continue

        actual_result = period_map[target_period]
        prediction_date = make_prediction_date(actual_result.get("date"))

        candidate_periods = [
            p_str
            for p_int, p_str in sorted(sorted_periods_desc, reverse=True)
            if p_int < period_int
        ]
        history_context = [period_map[p] for p in candidate_periods[: args.context_size]]
        if not history_context:
            print(f"[skip] no usable history context for {target_period}")
            continue

        record = existing_by_period.get(target_period)
        if record is None:
            record = {
                "prediction_date": prediction_date,
                "target_period": target_period,
                "actual_result": actual_result,
                "models": [],
            }
            history_records.append(record)
            existing_by_period[target_period] = record

        existing_models = {
            model["model_id"]: model
            for model in record.get("models", [])
            if isinstance(model, dict) and model.get("model_id")
        }

        for model_def in model_definitions:
            model = model_instances.get(model_def.model_id)
            if model is None:
                continue

            if not args.force and model_def.model_id in existing_models:
                print(f"[skip] {target_period} already has {model_def.model_id}")
                continue

            try:
                prediction = dlt_generate_ai_prediction(
                    model=model,
                    prompt_template=prompt_template,
                    target_period=target_period,
                    prediction_date=prediction_date,
                    model_def=model_def,
                    history_context=history_context,
                )
            except Exception as exc:
                print(f"[error] {target_period} {model_def.model_id}: {exc}")
                continue

            predictions_with_hits = []
            for pred_group in prediction.get("predictions", []):
                hit_result = dlt_ai.calculate_hit_result(pred_group, actual_result)
                group = dict(pred_group)
                group["hit_result"] = hit_result
                predictions_with_hits.append(group)

            best_group = max(
                predictions_with_hits,
                key=lambda item: item["hit_result"]["total_hits"],
            )

            history_model = {
                "model_id": prediction.get("model_id"),
                "model_name": prediction.get("model_name"),
                "model_provider": prediction.get("model_provider"),
                "model_version": prediction.get("model_version"),
                "model_tags": prediction.get("model_tags"),
                "model_api_model": prediction.get("model_api_model"),
                "predictions": predictions_with_hits,
                "best_group": best_group.get("group_id"),
                "best_hit_count": best_group["hit_result"]["total_hits"],
            }

            existing_models[model_def.model_id] = history_model
            print(f"[ok] {target_period} <- {model_def.model_id}")
            time.sleep(0.2)

        record["models"] = list(existing_models.values())
        prediction_repository.upsert_history_record(record)

    print("\n=== batch recalculation complete ===")


if __name__ == "__main__":
    main()
