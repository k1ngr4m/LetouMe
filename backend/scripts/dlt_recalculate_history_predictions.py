#!/usr/bin/env python3
"""Batch recalculate historical AI predictions and persist them into normalized MySQL tables."""

from __future__ import annotations

import argparse

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.services.prediction_generation_service import PredictionGenerationService
from backend.core.model_config import load_model_registry


logger = get_logger("scripts.recalculate_history")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Batch recalculate historical AI predictions")
    parser.add_argument("--start-period", required=True, help="Start target period, inclusive")
    parser.add_argument("--end-period", required=True, help="End target period, inclusive")
    parser.add_argument("--force", action="store_true", help="Overwrite existing model predictions")
    parser.add_argument("--models", default="", help="Comma-separated model IDs")
    parser.add_argument("--include-tags", default="", help="Comma-separated tags")
    return parser.parse_args()


def parse_csv(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def main() -> None:
    args = parse_args()
    ensure_schema()
    service = PredictionGenerationService()
    registry = load_model_registry()
    model_ids = parse_csv(args.models)
    include_tags = parse_csv(args.include_tags)
    model_definitions = registry.select(model_ids=model_ids or None, include_tags=include_tags)

    for model_def in model_definitions:
        summary = service.recalculate_history_for_model(
            model_code=model_def.model_id,
            start_period=args.start_period,
            end_period=args.end_period,
            overwrite=args.force,
        )
        logger.info(
            "Historical prediction generation complete",
            extra={
                "context": {
                    "model_code": model_def.model_id,
                    "processed_count": summary.get("processed_count"),
                    "skipped_count": summary.get("skipped_count"),
                    "failed_count": summary.get("failed_count"),
                }
            },
        )


if __name__ == "__main__":
    main()
