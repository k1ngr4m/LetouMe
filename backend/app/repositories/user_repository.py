from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.app.db.connection import ensure_schema, get_connection


class UserRepository:
    def has_any_admin(self) -> bool:
        ensure_schema()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM app_user WHERE role = 'admin' LIMIT 1")
                return cursor.fetchone() is not None

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        ensure_schema()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM app_user WHERE username = ?", (payload["username"],))
                if cursor.fetchone():
                    raise ValueError(f"用户名已存在: {payload['username']}")
                cursor.execute(
                    """
                    INSERT INTO app_user (username, password_hash, role, is_active)
                    VALUES (?, ?, ?, ?)
                    """,
                    (payload["username"], payload["password_hash"], payload["role"], 1 if payload.get("is_active", True) else 0),
                )
                user_id = int(cursor.lastrowid)
        return self.get_user_by_id(user_id) or {}

    def list_users(self) -> list[dict[str, Any]]:
        ensure_schema()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, username, role, is_active, last_login_at, created_at
                    FROM app_user
                    ORDER BY role DESC, created_at ASC
                    """
                )
                return cursor.fetchall()

    def get_user_by_username(self, username: str) -> dict[str, Any] | None:
        return self._get_user("username = ?", (username,))

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        return self._get_user("id = ?", (user_id,))

    def update_user(self, user_id: int, *, role: str, is_active: bool) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE app_user
                    SET role = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (role, 1 if is_active else 0, user_id),
                )
                if cursor.rowcount == 0:
                    raise KeyError(user_id)
        return self.get_user_by_id(user_id) or {}

    def update_password(self, user_id: int, password_hash: str) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE app_user
                    SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (password_hash, user_id),
                )
                if cursor.rowcount == 0:
                    raise KeyError(user_id)
        return self.get_user_by_id(user_id) or {}

    def touch_last_login(self, user_id: int) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("UPDATE app_user SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))

    def create_session(
        self,
        *,
        user_id: int,
        session_token: str,
        expires_at: datetime,
        user_agent: str,
        ip_address: str,
    ) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO user_session (user_id, session_token, expires_at, user_agent, ip_address)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (user_id, session_token, expires_at.strftime("%Y-%m-%d %H:%M:%S"), user_agent[:255], ip_address[:64]),
                )

    def get_session(self, session_token: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, user_id, session_token, expires_at, last_seen_at
                    FROM user_session
                    WHERE session_token = ?
                    LIMIT 1
                    """,
                    (session_token,),
                )
                return cursor.fetchone()

    def touch_session(self, session_token: str) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE user_session SET last_seen_at = CURRENT_TIMESTAMP WHERE session_token = ?",
                    (session_token,),
                )

    def delete_session(self, session_token: str) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM user_session WHERE session_token = ?", (session_token,))

    def delete_sessions_for_user(self, user_id: int) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM user_session WHERE user_id = ?", (user_id,))

    def _get_user(self, where_clause: str, params: tuple[Any, ...]) -> dict[str, Any] | None:
        ensure_schema()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT id, username, password_hash, role, is_active, last_login_at, created_at
                    FROM app_user
                    WHERE {where_clause}
                    LIMIT 1
                    """,
                    params,
                )
                return cursor.fetchone()
