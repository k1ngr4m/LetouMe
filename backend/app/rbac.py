from __future__ import annotations

from typing import Any
from threading import Lock

from backend.app.db.connection import ensure_schema, get_connection

BASIC_PROFILE_PERMISSION = "basic_profile"
MODEL_MANAGEMENT_PERMISSION = "model_management"
USER_MANAGEMENT_PERMISSION = "user_management"
ROLE_MANAGEMENT_PERMISSION = "role_management"
SCHEDULE_MANAGEMENT_PERMISSION = "schedule_management"

SUPER_ADMIN_ROLE = "super_admin"
NORMAL_USER_ROLE = "normal_user"

DEFAULT_PERMISSIONS = {
    BASIC_PROFILE_PERMISSION: {
        "name": "基础信息",
        "description": "允许进入设置中心的基础信息页，查看账号信息并修改自己的昵称与密码。",
    },
    MODEL_MANAGEMENT_PERMISSION: {
        "name": "模型管理",
        "description": "允许查看、创建、编辑、启停和删除模型配置，以及查看 Provider 列表。",
    },
    USER_MANAGEMENT_PERMISSION: {
        "name": "用户管理",
        "description": "允许查看用户列表、创建用户、调整角色与启用状态，并为其他用户重置密码。",
    },
    ROLE_MANAGEMENT_PERMISSION: {
        "name": "角色管理",
        "description": "允许查看角色、编辑角色权限以及维护权限点说明，是最高级别的后台授权入口之一。",
    },
    SCHEDULE_MANAGEMENT_PERMISSION: {
        "name": "定时任务",
        "description": "允许查看、创建、编辑、启停和执行开奖抓取与预测生成的定时任务。",
    },
}

DEFAULT_ROLES = {
    SUPER_ADMIN_ROLE: {
        "name": "超级管理员",
        "is_system": True,
        "permissions": list(DEFAULT_PERMISSIONS.keys()),
    },
    NORMAL_USER_ROLE: {
        "name": "普通用户",
        "is_system": True,
        "permissions": [BASIC_PROFILE_PERMISSION],
    },
}
_rbac_ready = False
_rbac_lock = Lock()


def ensure_rbac_setup() -> None:
    global _rbac_ready
    if _rbac_ready:
        return
    ensure_schema()
    with _rbac_lock:
        if _rbac_ready:
            return
        with get_connection() as connection:
            with connection.cursor() as cursor:
                for permission_code, meta in DEFAULT_PERMISSIONS.items():
                    cursor.execute(
                        """
                        INSERT INTO app_permission (permission_code, permission_name, permission_description)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE permission_code = VALUES(permission_code)
                        """,
                        (permission_code, meta["name"], meta["description"]),
                    )
                    cursor.execute(
                        """
                        UPDATE app_permission
                        SET
                            permission_name = CASE
                                WHEN permission_name IS NULL OR permission_name = '' THEN ?
                                ELSE permission_name
                            END,
                            permission_description = CASE
                                WHEN permission_description IS NULL OR permission_description = '' THEN ?
                                ELSE permission_description
                            END
                        WHERE permission_code = ?
                        """,
                        (meta["name"], meta["description"], permission_code),
                    )

                permission_ids = _load_permission_ids(cursor)
                role_ids: dict[str, int] = {}
                for role_code, meta in DEFAULT_ROLES.items():
                    cursor.execute(
                        """
                        INSERT INTO app_role (role_code, role_name, is_system)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE role_name = VALUES(role_name), is_system = VALUES(is_system)
                        """,
                        (role_code, meta["name"], 1 if meta["is_system"] else 0),
                    )
                    cursor.execute("SELECT id FROM app_role WHERE role_code = ?", (role_code,))
                    role_ids[role_code] = int(cursor.fetchone()["id"])

                _sync_role_permissions(cursor, role_ids, permission_ids)
                _migrate_legacy_user_roles(cursor)
        _rbac_ready = True


def _load_permission_ids(cursor) -> dict[str, int]:
    cursor.execute("SELECT id, permission_code FROM app_permission")
    return {str(row["permission_code"]): int(row["id"]) for row in cursor.fetchall()}


def _sync_role_permissions(cursor, role_ids: dict[str, int], permission_ids: dict[str, int]) -> None:
    for role_code, meta in DEFAULT_ROLES.items():
        role_id = role_ids[role_code]
        for permission_code in meta["permissions"]:
            cursor.execute(
                """
                INSERT IGNORE INTO app_role_permission (role_id, permission_id)
                VALUES (?, ?)
                """,
                (role_id, permission_ids[permission_code]),
            )


def _migrate_legacy_user_roles(cursor) -> None:
    cursor.execute("UPDATE app_user SET nickname = username WHERE nickname IS NULL OR nickname = ''")
    cursor.execute("SELECT id FROM app_role WHERE role_code = ?", (NORMAL_USER_ROLE,))
    row = cursor.fetchone()
    if not row:
        return
    default_role_id = int(row["id"])
    cursor.execute(
        """
        UPDATE app_user
        SET role_id = ?
        WHERE role_id IS NULL
        """
        ,
        (default_role_id,),
    )


def serialize_role(row: dict[str, Any], permissions: list[str]) -> dict[str, Any]:
    return {
        "role_code": str(row["role_code"]),
        "role_name": str(row["role_name"]),
        "is_system": bool(row.get("is_system")),
        "permissions": permissions,
    }
