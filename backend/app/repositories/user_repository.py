from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.app.cache import runtime_cache
from backend.app.db.connection import get_connection
from backend.app.rbac import NORMAL_USER_ROLE, SUPER_ADMIN_ROLE


class UserRepository:
    def has_any_admin(self) -> bool:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM app_user WHERE role = ? AND is_active = 1 LIMIT 1", (SUPER_ADMIN_ROLE,))
                return cursor.fetchone() is not None

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM app_user WHERE username = ?", (payload["username"],))
                if cursor.fetchone():
                    raise ValueError(f"用户名已存在: {payload['username']}")
                cursor.execute(
                    """
                    INSERT INTO app_user (username, nickname, password_hash, role, is_active)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        payload["username"],
                        payload.get("nickname") or payload["username"],
                        payload["password_hash"],
                        payload.get("role") or NORMAL_USER_ROLE,
                        1 if payload.get("is_active", True) else 0,
                    ),
                )
                user_id = int(cursor.lastrowid)
        return self.get_user_by_id(user_id) or {}

    def list_users(self) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT au.id, au.username, au.nickname, au.role, ar.role_name, au.is_active, au.last_login_at, au.created_at
                    FROM app_user au
                    LEFT JOIN app_role ar ON ar.role_code = au.role
                    ORDER BY au.role DESC, au.created_at ASC
                    """
                )
                return cursor.fetchall()

    def get_user_by_username(self, username: str) -> dict[str, Any] | None:
        return self._get_user("au.username = ?", (username,))

    def get_user_by_id(self, user_id: int) -> dict[str, Any] | None:
        return self._get_user("au.id = ?", (user_id,))

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

    def update_profile(self, user_id: int, *, nickname: str) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE app_user
                    SET nickname = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (nickname, user_id),
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

    def get_user_by_session_token(self, session_token: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        us.id AS session_id,
                        us.user_id,
                        us.session_token,
                        us.expires_at,
                        au.id,
                        au.username,
                        au.nickname,
                        au.password_hash,
                        au.role,
                        ar.role_name,
                        au.is_active,
                        au.last_login_at,
                        au.created_at
                    FROM user_session us
                    INNER JOIN app_user au ON au.id = us.user_id
                    LEFT JOIN app_role ar ON ar.role_code = au.role
                    WHERE us.session_token = ?
                    LIMIT 1
                    """,
                    (session_token,),
                )
                user = cursor.fetchone()
                if not user:
                    return None
                user["permissions"] = self._get_permissions_for_role(cursor, str(user["role"]))
                return user

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
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT au.id, au.username, au.nickname, au.password_hash, au.role, ar.role_name, au.is_active, au.last_login_at, au.created_at
                    FROM app_user au
                    LEFT JOIN app_role ar ON ar.role_code = au.role
                    WHERE {where_clause}
                    LIMIT 1
                    """,
                    params,
                )
                user = cursor.fetchone()
                if not user:
                    return None
                user["permissions"] = self._get_permissions_for_role(cursor, str(user["role"]))
                return user

    @staticmethod
    def _get_permissions_for_role(cursor, role_code: str) -> list[str]:
        cache_key = f"role-permissions:{role_code}"
        cached = runtime_cache.get(cache_key)
        if cached is not None:
            return list(cached)
        cursor.execute(
            """
            SELECT ap.permission_code
            FROM app_role ar
            INNER JOIN app_role_permission arp ON arp.role_id = ar.id
            INNER JOIN app_permission ap ON ap.id = arp.permission_id
            WHERE ar.role_code = ?
            ORDER BY ap.permission_code ASC
            """,
            (role_code,),
        )
        permissions = [str(row["permission_code"]) for row in cursor.fetchall()]
        runtime_cache.set(cache_key, permissions, ttl_seconds=300)
        return permissions
