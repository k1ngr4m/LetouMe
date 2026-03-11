from __future__ import annotations

from typing import Any

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

    def _insert_log(
        self,
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
        entity_type = table_name
        entity_id = target_key.split("=", 1)[1] if "=" in target_key else None
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO write_log (
                    entity_type,
                    entity_id,
                    table_name,
                    action,
                    target_key,
                    status,
                    summary,
                    error_message
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entity_type,
                    entity_id,
                    table_name,
                    action,
                    target_key,
                    status,
                    summary,
                    error_message,
                ),
            )
            log_id = cursor.lastrowid

            if payload:
                for field_name, value in payload.items():
                    if isinstance(value, (dict, list, tuple, set)):
                        continue
                    cursor.execute(
                        """
                        INSERT INTO write_log_detail (log_id, field_name, new_value_text)
                        VALUES (?, ?, ?)
                        """,
                        (log_id, str(field_name), None if value is None else str(value)),
                    )
