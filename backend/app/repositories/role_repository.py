from __future__ import annotations

from typing import Any

from backend.app.cache import runtime_cache
from backend.app.db.connection import get_connection
from backend.app.rbac import DEFAULT_PERMISSIONS, DEFAULT_ROLES, SUPER_ADMIN_ROLE


class RoleRepository:
    def list_roles(self) -> list[dict[str, Any]]:
        cached = runtime_cache.get("roles:list")
        if cached is not None:
            return list(cached)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        ar.id,
                        ar.role_code,
                        ar.role_name,
                        ar.is_system,
                        COUNT(au.id) AS member_count
                    FROM app_role ar
                    LEFT JOIN app_user au ON au.role = ar.role_code
                    GROUP BY ar.id, ar.role_code, ar.role_name, ar.is_system
                    ORDER BY ar.is_system DESC, ar.role_name ASC
                    """
                )
                rows = cursor.fetchall()
                permissions = self._load_permissions(cursor)
        roles = [
            {
                "role_code": row["role_code"],
                "role_name": row["role_name"],
                "is_system": bool(row["is_system"]),
                "member_count": int(row.get("member_count") or 0),
                "permissions": permissions.get(str(row["role_code"]), []),
            }
            for row in rows
        ]
        runtime_cache.set("roles:list", roles, ttl_seconds=300)
        return roles

    def get_role(self, role_code: str) -> dict[str, Any] | None:
        roles = self.list_roles()
        return next((role for role in roles if role["role_code"] == role_code), None)

    def list_permissions(self) -> list[dict[str, str]]:
        cached = runtime_cache.get("permissions:list")
        if cached is not None:
            return list(cached)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT permission_code, permission_name, permission_description
                    FROM app_permission
                    ORDER BY permission_code ASC
                    """
                )
                rows = cursor.fetchall()
        permissions = [
            {
                "permission_code": str(row["permission_code"]),
                "permission_name": str(
                    row.get("permission_name")
                    or DEFAULT_PERMISSIONS.get(str(row["permission_code"]), {}).get("name")
                    or row["permission_code"]
                ),
                "permission_description": str(
                    row.get("permission_description")
                    or DEFAULT_PERMISSIONS.get(str(row["permission_code"]), {}).get("description")
                    or ""
                ),
            }
            for row in rows
        ]
        runtime_cache.set("permissions:list", permissions, ttl_seconds=300)
        return permissions

    def update_permission(self, permission_code: str, payload: dict[str, Any]) -> dict[str, str]:
        permission_name = str(payload["permission_name"]).strip()
        permission_description = str(payload.get("permission_description") or "").strip()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM app_permission WHERE permission_code = ?", (permission_code,))
                if not cursor.fetchone():
                    raise KeyError(permission_code)
                cursor.execute(
                    """
                    UPDATE app_permission
                    SET permission_name = ?, permission_description = ?
                    WHERE permission_code = ?
                    """,
                    (permission_name, permission_description, permission_code),
                )
        runtime_cache.invalidate_prefix("permissions:")
        runtime_cache.invalidate_prefix("role-permissions:")
        permission = next((item for item in self.list_permissions() if item["permission_code"] == permission_code), None)
        return permission or {}

    def create_role(self, payload: dict[str, Any]) -> dict[str, Any]:
        role_code = str(payload["role_code"]).strip()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM app_role WHERE role_code = ?", (role_code,))
                if cursor.fetchone():
                    raise ValueError("角色编码已存在")
                cursor.execute(
                    """
                    INSERT INTO app_role (role_code, role_name, is_system)
                    VALUES (?, ?, 0)
                    """,
                    (role_code, str(payload["role_name"]).strip()),
                )
                self._replace_role_permissions(cursor, role_code, payload.get("permissions") or [])
        runtime_cache.invalidate_prefix("roles:")
        return self.get_role(role_code) or {}

    def update_role(self, role_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT role_code, is_system FROM app_role WHERE role_code = ?", (role_code,))
                row = cursor.fetchone()
                if not row:
                    raise KeyError(role_code)
                effective_permissions = payload.get("permissions") or []
                if role_code == SUPER_ADMIN_ROLE:
                    effective_permissions = list(DEFAULT_ROLES[SUPER_ADMIN_ROLE]["permissions"])
                cursor.execute(
                    """
                    UPDATE app_role
                    SET role_name = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE role_code = ?
                    """,
                    (str(payload["role_name"]).strip(), role_code),
                )
                self._replace_role_permissions(cursor, role_code, effective_permissions)
        runtime_cache.invalidate_prefix("roles:")
        runtime_cache.invalidate_prefix("role-permissions:")
        return self.get_role(role_code) or {}

    def delete_role(self, role_code: str) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT is_system FROM app_role WHERE role_code = ?", (role_code,))
                row = cursor.fetchone()
                if not row:
                    raise KeyError(role_code)
                if bool(row["is_system"]):
                    raise ValueError("系统角色不能删除")
                cursor.execute("SELECT 1 FROM app_user WHERE role = ? LIMIT 1", (role_code,))
                if cursor.fetchone():
                    raise ValueError("仍有用户使用该角色，不能删除")
                cursor.execute("DELETE FROM app_role WHERE role_code = ?", (role_code,))
        runtime_cache.invalidate_prefix("roles:")
        runtime_cache.invalidate_prefix("role-permissions:")

    def active_super_admin_count(self) -> int:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) AS total FROM app_user WHERE role = ? AND is_active = 1", (SUPER_ADMIN_ROLE,))
                return int((cursor.fetchone() or {}).get("total") or 0)

    def _load_permissions(self, cursor) -> dict[str, list[str]]:
        cursor.execute(
            """
            SELECT ar.role_code, ap.permission_code
            FROM app_role ar
            LEFT JOIN app_role_permission arp ON arp.role_id = ar.id
            LEFT JOIN app_permission ap ON ap.id = arp.permission_id
            ORDER BY ar.role_code ASC, ap.permission_code ASC
            """
        )
        result: dict[str, list[str]] = {}
        for row in cursor.fetchall():
            role_code = str(row["role_code"])
            permission_code = row.get("permission_code")
            result.setdefault(role_code, [])
            if permission_code:
                result[role_code].append(str(permission_code))
        return result

    def _replace_role_permissions(self, cursor, role_code: str, permissions: list[str]) -> None:
        permissions = [str(permission).strip() for permission in permissions if str(permission).strip()]
        cursor.execute("SELECT id FROM app_role WHERE role_code = ?", (role_code,))
        row = cursor.fetchone()
        if not row:
            raise KeyError(role_code)
        role_id = int(row["id"])
        cursor.execute("DELETE FROM app_role_permission WHERE role_id = ?", (role_id,))
        if not permissions:
            return
        placeholders = ", ".join("?" for _ in permissions)
        cursor.execute(
            f"SELECT id, permission_code FROM app_permission WHERE permission_code IN ({placeholders})",
            tuple(permissions),
        )
        permission_map = {str(item["permission_code"]): int(item["id"]) for item in cursor.fetchall()}
        missing = [permission for permission in permissions if permission not in permission_map]
        if missing:
            raise ValueError(f"未知权限: {', '.join(missing)}")
        for permission in permissions:
            cursor.execute(
                "INSERT INTO app_role_permission (role_id, permission_id) VALUES (?, ?)",
                (role_id, permission_map[permission]),
            )
