from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import psycopg2

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.repositories.prediction_repository import PredictionRepository


POSTGRES_CONFIG = {
    "host": "aws-1-ap-southeast-1.pooler.supabase.com",
    "port": 5432,
    "dbname": "postgres",
    "user": "postgres.mzkkarjsurcekiuxauos",
    "password": "o72aDp8FKnQceHWA",
}


def _decode_payload(value: Any) -> dict[str, Any]:
    if isinstance(value, memoryview):
        value = value.tobytes().decode("utf-8")
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        return json.loads(value)
    return dict(value or {})


def main() -> None:
    repository = PredictionRepository()
    repository.sync_model_catalog()

    conn = psycopg2.connect(**POSTGRES_CONFIG)
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT target_period, payload_json
                FROM current_predictions
                ORDER BY target_period DESC
                LIMIT 1
                """
            )
            current_row = cursor.fetchone()

            cursor.execute(
                """
                SELECT target_period, payload_json
                FROM prediction_history
                ORDER BY target_period ASC
                """
            )
            history_rows = cursor.fetchall()
    finally:
        conn.close()

    restored_current_models = 0
    if current_row:
        current_payload = _decode_payload(current_row[1])
        repository.replace_current_prediction(current_payload)
        restored_current_models = len(current_payload.get("models", []))

    restored_history = 0
    restored_history_models = 0
    for _, payload in history_rows:
        decoded = _decode_payload(payload)
        repository.upsert_history_record(decoded)
        restored_history += 1
        restored_history_models += len(decoded.get("models", []))

    print(
        {
            "restored_current_predictions": 1 if current_row else 0,
            "restored_current_models": restored_current_models,
            "restored_history_records": restored_history,
            "restored_history_models": restored_history_models,
        }
    )


if __name__ == "__main__":
    main()
