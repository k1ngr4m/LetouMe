from __future__ import annotations

from typing import Any

from psycopg2.extras import Json

from app.db.connection import get_connection


class WriteLogRepository:
    def log_success(
        self,
        connection,
        *,
        table_name: str,
        action: str,
        target_key: str,
        summary: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self._insert_log(
            connection,
            table_name=table_name,
            action=action,
            target_key=target_key,
            summary=summary,
            payload=payload,
            status="success",
            error_message=None,
        )

    def log_failure(
        self,
        *,
        table_name: str,
        action: str,
        target_key: str,
        summary: str,
        error_message: str,
        payload: dict[str, Any] | None = None,
    ) -> None:
        with get_connection() as connection:
            self._insert_log(
                connection,
                table_name=table_name,
                action=action,
                target_key=target_key,
                summary=summary,
                payload=payload,
                status="failed",
                error_message=error_message,
            )

    @staticmethod
    def _insert_log(
        connection,
        *,
        table_name: str,
        action: str,
        target_key: str,
        summary: str,
        payload: dict[str, Any] | None,
        status: str,
        error_message: str | None,
    ) -> None:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO data_write_logs (
                    table_name,
                    action,
                    target_key,
                    summary,
                    payload_json,
                    status,
                    error_message
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    table_name,
                    action,
                    target_key,
                    summary,
                    Json(payload) if payload is not None else None,
                    status,
                    error_message,
                ),
            )
