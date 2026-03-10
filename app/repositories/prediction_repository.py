from __future__ import annotations

from datetime import date
from typing import Any

from psycopg2.extras import Json

from app.db.connection import get_connection


class PredictionRepository:
    def get_current_prediction(self) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT target_period, prediction_date, payload_json, updated_at
                    FROM current_predictions
                    ORDER BY target_period DESC
                    LIMIT 1
                    """
                )
                row = cursor.fetchone()
        return self._current_row_to_dict(row) if row else None

    def upsert_current_prediction(self, payload: dict[str, Any]) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO current_predictions (target_period, prediction_date, payload_json)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (target_period) DO UPDATE SET
                        prediction_date = EXCLUDED.prediction_date,
                        payload_json = EXCLUDED.payload_json,
                        updated_at = NOW()
                    """,
                    (
                        payload["target_period"],
                        payload["prediction_date"],
                        Json(payload),
                    ),
                )

    def replace_current_prediction(self, payload: dict[str, Any]) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM current_predictions")
                cursor.execute(
                    """
                    INSERT INTO current_predictions (target_period, prediction_date, payload_json)
                    VALUES (%s, %s, %s)
                    """,
                    (
                        payload["target_period"],
                        payload["prediction_date"],
                        Json(payload),
                    ),
                )

    def upsert_history_record(self, payload: dict[str, Any]) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO prediction_history (target_period, prediction_date, actual_period, payload_json)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (target_period) DO UPDATE SET
                        prediction_date = EXCLUDED.prediction_date,
                        actual_period = EXCLUDED.actual_period,
                        payload_json = EXCLUDED.payload_json
                    """,
                    (
                        payload["target_period"],
                        payload["prediction_date"],
                        payload["target_period"],
                        Json(payload),
                    ),
                )

    def list_history_records(self) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT target_period, prediction_date, actual_period, payload_json, created_at
                    FROM prediction_history
                    ORDER BY target_period DESC
                    """
                )
                rows = cursor.fetchall()
        return [self._history_row_to_dict(row) for row in rows]

    @staticmethod
    def _current_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
        payload = dict(row.get("payload_json") or {})
        prediction_date = row.get("prediction_date")
        if isinstance(prediction_date, date):
            payload["prediction_date"] = prediction_date.isoformat()
        return payload

    @staticmethod
    def _history_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
        payload = dict(row.get("payload_json") or {})
        prediction_date = row.get("prediction_date")
        if isinstance(prediction_date, date):
            payload["prediction_date"] = prediction_date.isoformat()
        return payload
