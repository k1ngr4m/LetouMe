from __future__ import annotations

from datetime import date
from typing import Any

from psycopg2.extras import Json

from app.db.connection import get_connection
from app.repositories.write_log_repository import WriteLogRepository


class PredictionRepository:
    def __init__(self, log_repository: WriteLogRepository | None = None) -> None:
        self.log_repository = log_repository or WriteLogRepository()

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

    def get_current_prediction_by_period(self, target_period: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT target_period, prediction_date, payload_json, updated_at
                    FROM current_predictions
                    WHERE target_period = %s
                    LIMIT 1
                    """,
                    (target_period,),
                )
                row = cursor.fetchone()
        return self._current_row_to_dict(row) if row else None

    def upsert_current_prediction(self, payload: dict[str, Any]) -> None:
        target_period = str(payload["target_period"])
        target_key = f"target_period={target_period}"
        summary = f"upsert current_predictions {target_key}"
        try:
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
                            target_period,
                            payload["prediction_date"],
                            Json(payload),
                        ),
                    )
                self.log_repository.log_success(
                    connection,
                    table_name="current_predictions",
                    action="upsert",
                    target_key=target_key,
                    summary=summary,
                    payload=payload,
                )
        except Exception as exc:
            self.log_repository.log_failure(
                table_name="current_predictions",
                action="upsert",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
                payload=payload,
            )
            raise

    def replace_current_prediction(self, payload: dict[str, Any]) -> None:
        target_period = str(payload["target_period"])
        target_key = f"target_period={target_period}"
        summary = f"replace current_predictions {target_key}"
        try:
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM current_predictions")
                    cursor.execute(
                        """
                        INSERT INTO current_predictions (target_period, prediction_date, payload_json)
                        VALUES (%s, %s, %s)
                        """,
                        (
                            target_period,
                            payload["prediction_date"],
                            Json(payload),
                        ),
                    )
                self.log_repository.log_success(
                    connection,
                    table_name="current_predictions",
                    action="replace",
                    target_key=target_key,
                    summary=summary,
                    payload=payload,
                )
        except Exception as exc:
            self.log_repository.log_failure(
                table_name="current_predictions",
                action="replace",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
                payload=payload,
            )
            raise

    def upsert_history_record(self, payload: dict[str, Any]) -> None:
        target_period = str(payload["target_period"])
        target_key = f"target_period={target_period}"
        summary = f"upsert prediction_history {target_key}"
        try:
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
                            target_period,
                            payload["prediction_date"],
                            target_period,
                            Json(payload),
                        ),
                    )
                self.log_repository.log_success(
                    connection,
                    table_name="prediction_history",
                    action="upsert",
                    target_key=target_key,
                    summary=summary,
                    payload=payload,
                )
        except Exception as exc:
            self.log_repository.log_failure(
                table_name="prediction_history",
                action="upsert",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
                payload=payload,
            )
            raise

    def list_history_records(
        self,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        sql = """
            SELECT target_period, prediction_date, actual_period, payload_json, created_at
            FROM prediction_history
            ORDER BY target_period DESC
        """
        params: list[Any] = []
        if limit is not None:
            sql += " LIMIT %s"
            params.append(limit)
        if offset:
            sql += " OFFSET %s"
            params.append(offset)

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, tuple(params))
                rows = cursor.fetchall()
        return [self._history_row_to_dict(row) for row in rows]

    def count_history_records(self) -> int:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) AS total FROM prediction_history")
                row = cursor.fetchone() or {}
        return int(row.get("total") or 0)

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
