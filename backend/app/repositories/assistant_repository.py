from __future__ import annotations

import json
from typing import Any

from backend.app.db.connection import get_connection
from backend.app.time_utils import now_ts


class AssistantRepository:
    def create_conversation(self, payload: dict[str, Any]) -> dict[str, Any]:
        timestamp = now_ts()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO assistant_conversation (
                        conversation_id,
                        user_id,
                        model_code,
                        lottery_code,
                        title,
                        context_summary,
                        context_json,
                        last_active_at,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(payload["conversation_id"]),
                        int(payload["user_id"]),
                        str(payload["model_code"]),
                        str(payload.get("lottery_code") or "dlt"),
                        str(payload.get("title") or "新的对话"),
                        str(payload.get("context_summary") or ""),
                        self._dump_json(payload.get("context") or {}),
                        timestamp,
                        timestamp,
                        timestamp,
                    ),
                )
        conversation = self.get_conversation(user_id=int(payload["user_id"]), conversation_id=str(payload["conversation_id"]))
        if not conversation:
            raise KeyError(payload["conversation_id"])
        return conversation

    def get_conversation(self, *, user_id: int, conversation_id: str, include_deleted: bool = False) -> dict[str, Any] | None:
        where_deleted = "" if include_deleted else "AND deleted_at IS NULL"
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        id,
                        conversation_id,
                        user_id,
                        model_code,
                        lottery_code,
                        title,
                        context_summary,
                        context_json,
                        last_active_at,
                        deleted_at,
                        created_at,
                        updated_at
                    FROM assistant_conversation
                    WHERE user_id = ? AND conversation_id = ? {where_deleted}
                    """,
                    (int(user_id), str(conversation_id)),
                )
                row = cursor.fetchone()
        return self._serialize_conversation(row) if row else None

    def list_conversations(self, *, user_id: int, lottery_code: str | None = None, limit: int = 30, offset: int = 0) -> dict[str, Any]:
        where_clauses = ["user_id = ?", "deleted_at IS NULL"]
        params: list[Any] = [int(user_id)]
        if lottery_code:
            where_clauses.append("lottery_code = ?")
            params.append(str(lottery_code))
        where_sql = " AND ".join(where_clauses)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        id,
                        conversation_id,
                        user_id,
                        model_code,
                        lottery_code,
                        title,
                        context_summary,
                        context_json,
                        last_active_at,
                        deleted_at,
                        created_at,
                        updated_at
                    FROM assistant_conversation
                    WHERE {where_sql}
                    ORDER BY last_active_at DESC, id DESC
                    LIMIT ? OFFSET ?
                    """,
                    (*params, int(limit), int(offset)),
                )
                conversations = cursor.fetchall()
                cursor.execute(
                    f"""
                    SELECT COUNT(*) AS total
                    FROM assistant_conversation
                    WHERE {where_sql}
                    """,
                    tuple(params),
                )
                row = cursor.fetchone() or {}
        return {
            "conversations": [self._serialize_conversation(item) for item in conversations],
            "total_count": int(row.get("total") or 0),
        }

    def list_messages(self, *, conversation_db_id: int, limit: int | None = None) -> list[dict[str, Any]]:
        order_sql = "ORDER BY created_at ASC, id ASC"
        limit_clause = ""
        params: list[Any] = [int(conversation_db_id)]
        if limit is not None:
            order_sql = "ORDER BY created_at DESC, id DESC"
            limit_clause = "LIMIT ?"
            params.append(int(limit))
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        id,
                        conversation_id,
                        role,
                        content,
                        model_code,
                        context_json,
                        status,
                        error_message,
                        created_at
                    FROM assistant_message
                    WHERE conversation_id = ?
                    {order_sql}
                    {limit_clause}
                    """,
                    tuple(params),
                )
                rows = cursor.fetchall()
        messages = [self._serialize_message(row) for row in rows]
        if limit is not None:
            messages.reverse()
        return messages

    def add_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        timestamp = now_ts()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO assistant_message (
                        conversation_id,
                        role,
                        content,
                        model_code,
                        context_json,
                        status,
                        error_message,
                        created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        int(payload["conversation_db_id"]),
                        str(payload["role"]),
                        str(payload.get("content") or ""),
                        str(payload["model_code"]),
                        self._dump_json(payload.get("context") or {}),
                        str(payload.get("status") or "success"),
                        self._optional_str(payload.get("error_message")),
                        timestamp,
                    ),
                )
                message_id = int(cursor.lastrowid)
                cursor.execute(
                    """
                    UPDATE assistant_conversation
                    SET last_active_at = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (timestamp, timestamp, int(payload["conversation_db_id"])),
                )
                cursor.execute(
                    """
                    SELECT
                        id,
                        conversation_id,
                        role,
                        content,
                        model_code,
                        context_json,
                        status,
                        error_message,
                        created_at
                    FROM assistant_message
                    WHERE id = ?
                    """,
                    (message_id,),
                )
                row = cursor.fetchone()
        if not row:
            raise KeyError("assistant_message")
        return self._serialize_message(row)

    def touch_conversation(self, *, conversation_db_id: int, context_summary: str, context: dict[str, Any]) -> None:
        timestamp = now_ts()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE assistant_conversation
                    SET context_summary = ?, context_json = ?, last_active_at = ?, updated_at = ?
                    WHERE id = ? AND deleted_at IS NULL
                    """,
                    (str(context_summary), self._dump_json(context), timestamp, timestamp, int(conversation_db_id)),
                )

    def delete_conversation(self, *, user_id: int, conversation_id: str) -> bool:
        timestamp = now_ts()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE assistant_conversation
                    SET deleted_at = COALESCE(deleted_at, ?), updated_at = ?
                    WHERE user_id = ? AND conversation_id = ? AND deleted_at IS NULL
                    """,
                    (timestamp, timestamp, int(user_id), str(conversation_id)),
                )
                return cursor.rowcount > 0

    @classmethod
    def _serialize_conversation(cls, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": int(row.get("id") or 0),
            "conversation_id": str(row.get("conversation_id") or ""),
            "user_id": int(row.get("user_id") or 0),
            "model_code": str(row.get("model_code") or ""),
            "lottery_code": str(row.get("lottery_code") or "dlt"),
            "title": str(row.get("title") or "新的对话"),
            "context_summary": str(row.get("context_summary") or ""),
            "context": cls._load_json(row.get("context_json"), {}),
            "last_active_at": int(row.get("last_active_at") or 0),
            "deleted_at": int(row.get("deleted_at")) if row.get("deleted_at") is not None else None,
            "created_at": int(row.get("created_at") or 0),
            "updated_at": int(row.get("updated_at") or 0),
        }

    @classmethod
    def _serialize_message(cls, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": int(row.get("id") or 0),
            "conversation_db_id": int(row.get("conversation_id") or 0),
            "role": str(row.get("role") or "assistant"),
            "content": str(row.get("content") or ""),
            "model_code": str(row.get("model_code") or ""),
            "context": cls._load_json(row.get("context_json"), {}),
            "status": str(row.get("status") or "success"),
            "error_message": cls._optional_str(row.get("error_message")),
            "created_at": int(row.get("created_at") or 0),
        }

    @staticmethod
    def _dump_json(value: Any) -> str:
        return json.dumps(value if value is not None else {}, ensure_ascii=False)

    @staticmethod
    def _load_json(value: Any, fallback: Any) -> Any:
        if value is None:
            return fallback
        if isinstance(value, (dict, list)):
            return value
        try:
            return json.loads(str(value))
        except Exception:
            return fallback

    @staticmethod
    def _optional_str(value: Any) -> str | None:
        text = str(value or "").strip()
        return text or None
