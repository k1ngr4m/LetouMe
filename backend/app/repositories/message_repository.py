from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.app.db.connection import get_connection


class MessageRepository:
    def create_settlement_message(self, payload: dict[str, Any]) -> bool:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO site_message (
                        user_id,
                        lottery_code,
                        target_period,
                        my_bet_record_id,
                        message_type,
                        title,
                        content,
                        snapshot_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE id = id
                    """,
                    (
                        int(payload.get("user_id") or 0),
                        str(payload.get("lottery_code") or "dlt"),
                        str(payload.get("target_period") or ""),
                        int(payload.get("my_bet_record_id") or 0),
                        str(payload.get("message_type") or "bet_settlement"),
                        str(payload.get("title") or ""),
                        str(payload.get("content") or ""),
                        payload.get("snapshot_json"),
                    ),
                )
                return cursor.rowcount > 0

    def list_messages(
        self,
        *,
        user_id: int,
        lottery_code: str | None = None,
        status_filter: str = "all",
        result_filter: str = "all",
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        where_clauses = ["user_id = ?", "deleted_at IS NULL"]
        params: list[Any] = [int(user_id)]
        if lottery_code:
            where_clauses.append("lottery_code = ?")
            params.append(str(lottery_code))
        if status_filter == "unread":
            where_clauses.append("read_at IS NULL")
        elif status_filter == "read":
            where_clauses.append("read_at IS NOT NULL")
        if result_filter == "won":
            where_clauses.append(
                "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(snapshot_json, '$.winning_bet_count')) AS SIGNED), 0) > 0"
            )
        elif result_filter == "lost":
            where_clauses.append(
                "COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(snapshot_json, '$.winning_bet_count')) AS SIGNED), 0) <= 0"
            )
        where_sql = " AND ".join(where_clauses)

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        id,
                        user_id,
                        lottery_code,
                        target_period,
                        my_bet_record_id,
                        message_type,
                        title,
                        content,
                        snapshot_json,
                        read_at,
                        created_at
                    FROM site_message
                    WHERE {where_sql}
                    ORDER BY created_at DESC, id DESC
                    LIMIT ? OFFSET ?
                    """,
                    (*params, int(limit), int(offset)),
                )
                messages = cursor.fetchall()
                cursor.execute(
                    f"""
                    SELECT COUNT(*) AS total
                    FROM site_message
                    WHERE {where_sql}
                    """,
                    tuple(params),
                )
                row = cursor.fetchone() or {}
        return {"messages": messages, "total_count": int(row.get("total") or 0)}

    def get_unread_count(self, *, user_id: int, lottery_code: str | None = None) -> int:
        where_clauses = ["user_id = ?", "deleted_at IS NULL", "read_at IS NULL"]
        params: list[Any] = [int(user_id)]
        if lottery_code:
            where_clauses.append("lottery_code = ?")
            params.append(str(lottery_code))
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT COUNT(*) AS total
                    FROM site_message
                    WHERE {" AND ".join(where_clauses)}
                    """,
                    tuple(params),
                )
                row = cursor.fetchone() or {}
        return int(row.get("total") or 0)

    def mark_read(self, *, message_id: int, user_id: int) -> bool:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE site_message
                    SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
                    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
                    """,
                    (int(message_id), int(user_id)),
                )
                return cursor.rowcount > 0

    def mark_all_read(self, *, user_id: int, lottery_code: str | None = None) -> int:
        where_clauses = ["user_id = ?", "deleted_at IS NULL", "read_at IS NULL"]
        params: list[Any] = [int(user_id)]
        if lottery_code:
            where_clauses.append("lottery_code = ?")
            params.append(str(lottery_code))
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE site_message
                    SET read_at = ?
                    WHERE {" AND ".join(where_clauses)}
                    """,
                    (datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"), *params),
                )
                return int(cursor.rowcount or 0)

    def delete_message(self, *, message_id: int, user_id: int) -> bool:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE site_message
                    SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP)
                    WHERE id = ? AND user_id = ? AND deleted_at IS NULL
                    """,
                    (int(message_id), int(user_id)),
                )
                return cursor.rowcount > 0
