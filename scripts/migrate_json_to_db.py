from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.db.connection import ensure_schema
from app.repositories.prediction_repository import PredictionRepository
from app.services.lottery_service import LotteryService


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def sanitize_draw(row: dict) -> dict:
    blue_raw = row.get("blue_balls") or row.get("blue_ball") or []
    if isinstance(blue_raw, str):
        blue_balls = [blue_raw]
    else:
        blue_balls = list(blue_raw)

    return {
        "period": row.get("period"),
        "red_balls": list(row.get("red_balls", [])),
        "blue_balls": blue_balls,
        "date": row.get("date", ""),
    }


def main() -> None:
    ensure_schema()

    lottery_service = LotteryService()
    prediction_repository = PredictionRepository()

    lottery_data = load_json(PROJECT_ROOT / "data" / "dlt_data.json")
    lottery_service.save_draws([sanitize_draw(row) for row in lottery_data.get("data", [])])

    current_predictions = load_json(PROJECT_ROOT / "data" / "dlt_ai_predictions.json")
    prediction_repository.replace_current_prediction(current_predictions)

    predictions_history = load_json(PROJECT_ROOT / "data" / "dlt_predictions_history.json")
    for record in predictions_history.get("predictions_history", []):
        prediction_repository.upsert_history_record(record)

    print("Migration completed successfully.")


if __name__ == "__main__":
    main()
