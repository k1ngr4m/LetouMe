#!/usr/bin/env python3
from __future__ import annotations

import json

from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import get_logger
from backend.app.services.prediction_service import PredictionService
from backend.app.repositories.prediction_repository import PredictionRepository


TARGET_PERIOD = "26032"
TARGET_LOTTERY_CODE = "dlt"
TARGET_MODEL_ID = "dlt_claude-sonnet-4-6"
TARGET_BAD_NUMBER = "36"
TARGET_GOOD_NUMBER = "32"

logger = get_logger("scripts.fix_dlt_26032_claude_front_36")


def _normalize_numbers(values: list[str]) -> list[str]:
    return sorted({str(item).zfill(2) for item in values})


def main() -> None:
    ensure_schema()
    repository = PredictionRepository()
    prediction_service = PredictionService()
    record = repository.get_history_record_detail(TARGET_PERIOD, lottery_code=TARGET_LOTTERY_CODE)
    if not record:
        raise RuntimeError(f"未找到目标期号历史记录: {TARGET_PERIOD}")

    models = record.get("models") or []
    changed_groups: list[tuple[int, int, list[str], list[str]]] = []

    for model_index, model_payload in enumerate(models):
        if str(model_payload.get("model_id") or "").strip() != TARGET_MODEL_ID:
            continue
        groups = model_payload.get("predictions") or []
        for group_index, group in enumerate(groups):
            red_balls = _normalize_numbers(group.get("red_balls") or [])
            if TARGET_BAD_NUMBER not in red_balls:
                continue
            replaced = _normalize_numbers([TARGET_GOOD_NUMBER if item == TARGET_BAD_NUMBER else item for item in red_balls])
            group["red_balls"] = replaced
            changed_groups.append((model_index, group_index, red_balls, replaced))

    if len(changed_groups) != 1:
        raise RuntimeError(f"命中异常组数量不符合预期: {len(changed_groups)}，预期 1 条。")

    actual_result = record.get("actual_result") or {}
    for model_payload in models:
        if str(model_payload.get("model_id") or "").strip() != TARGET_MODEL_ID:
            continue
        groups = model_payload.get("predictions") or []
        for group in groups:
            group["hit_result"] = prediction_service.calculate_hit_result(group, actual_result, lottery_code=TARGET_LOTTERY_CODE)
        if groups:
            best_group = max(groups, key=lambda item: int(((item.get("hit_result") or {}).get("total_hits")) or 0))
            model_payload["best_group"] = int(best_group.get("group_id") or 0)
        else:
            model_payload["best_group"] = None

    repository.upsert_history_record(record)
    prediction_service._invalidate_prediction_cache(target_period=TARGET_PERIOD, lottery_code=TARGET_LOTTERY_CODE)

    model_index, group_index, previous_red_balls, current_red_balls = changed_groups[0]
    logger.info(
        "History record fixed",
        extra={
            "context": {
                "target_period": TARGET_PERIOD,
                "model_id": TARGET_MODEL_ID,
                "model_index": model_index,
                "group_index": group_index,
                "before": previous_red_balls,
                "after": current_red_balls,
            }
        },
    )
    print(
        json.dumps(
            {
                "target_period": TARGET_PERIOD,
                "model_id": TARGET_MODEL_ID,
                "changed_group_count": len(changed_groups),
                "before": previous_red_balls,
                "after": current_red_balls,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
