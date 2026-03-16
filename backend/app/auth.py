from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Any

from fastapi import Depends, HTTPException, Request, Response, status

from backend.app.config import Settings, load_settings
from backend.app.logging_utils import get_logger
from backend.app.rbac import (
    BASIC_PROFILE_PERMISSION,
    MODEL_MANAGEMENT_PERMISSION,
    NORMAL_USER_ROLE,
    ROLE_MANAGEMENT_PERMISSION,
    SUPER_ADMIN_ROLE,
    USER_MANAGEMENT_PERMISSION,
    ensure_rbac_setup,
)
from backend.app.repositories.role_repository import RoleRepository
from backend.app.repositories.user_repository import UserRepository


logger = get_logger("auth")


def hash_password(password: str, salt: str | None = None) -> str:
    active_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), active_salt.encode("utf-8"), 120000)
    return f"{active_salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt, expected = password_hash.split("$", 1)
    except ValueError:
        return False
    candidate = hash_password(password, salt).split("$", 1)[1]
    return hmac.compare_digest(candidate, expected)


class AuthService:
    def __init__(
        self,
        repository: UserRepository | None = None,
        settings: Settings | None = None,
        role_repository: RoleRepository | None = None,
    ) -> None:
        self.repository = repository or UserRepository()
        self.settings = settings or load_settings()
        self.role_repository = role_repository or RoleRepository()

    def ensure_bootstrap_admin(self) -> None:
        ensure_rbac_setup()
        if self.repository.has_any_admin():
            return
        username = self.settings.auth_bootstrap_admin_username.strip()
        password = self.settings.auth_bootstrap_admin_password
        if not username or not password:
            logger.warning("Bootstrap admin skipped because credentials are missing")
            return
        self.repository.create_user(
            {
                "username": username,
                "nickname": username,
                "password_hash": hash_password(password),
                "role": SUPER_ADMIN_ROLE,
                "is_active": True,
            }
        )
        logger.info("Bootstrap admin created", extra={"context": {"username": username}})

    def login(self, username: str, password: str, *, user_agent: str = "", ip_address: str = "") -> tuple[dict[str, Any], str]:
        user = self.repository.get_user_by_username(username.strip())
        if not user or not user.get("is_active"):
            raise ValueError("用户名或密码错误")
        if not verify_password(password, str(user["password_hash"])):
            raise ValueError("用户名或密码错误")
        token = secrets.token_urlsafe(32)
        self.repository.create_session(
            user_id=int(user["id"]),
            session_token=token,
            expires_at=datetime.utcnow() + timedelta(days=self.settings.auth_session_days),
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.repository.touch_last_login(int(user["id"]))
        logger.info("User logged in", extra={"context": {"username": user["username"], "role": user["role"]}})
        return self._serialize_user(user), token

    def register(self, username: str, password: str, *, user_agent: str = "", ip_address: str = "") -> tuple[dict[str, Any], str]:
        normalized_username = username.strip()
        created = self.create_user(
            {
                "username": normalized_username,
                "nickname": normalized_username,
                "password": password,
                "role": NORMAL_USER_ROLE,
                "is_active": True,
            }
        )
        token = secrets.token_urlsafe(32)
        self.repository.create_session(
            user_id=int(created["id"]),
            session_token=token,
            expires_at=datetime.utcnow() + timedelta(days=self.settings.auth_session_days),
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.repository.touch_last_login(int(created["id"]))
        logger.info("User registered", extra={"context": {"username": created["username"], "role": created["role"]}})
        return created, token

    def logout(self, session_token: str | None) -> None:
        if not session_token:
            return
        self.repository.delete_session(session_token)

    def get_current_user(self, session_token: str | None) -> dict[str, Any] | None:
        if not session_token:
            return None
        session = self.repository.get_session(session_token)
        if not session:
            return None
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")
        if not isinstance(expires_at, datetime) or expires_at <= datetime.utcnow():
            self.repository.delete_session(session_token)
            return None
        user = self.repository.get_user_by_id(int(session["user_id"]))
        if not user or not user.get("is_active"):
            self.repository.delete_session(session_token)
            return None
        self.repository.touch_session(session_token)
        return self._serialize_user(user)

    def list_users(self) -> list[dict[str, Any]]:
        return [self._serialize_user(user) for user in self.repository.list_users()]

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        username = str(payload.get("username") or "").strip()
        nickname = str(payload.get("nickname") or username).strip() or username
        password = str(payload.get("password") or "")
        role_code = self._normalize_role_code(payload.get("role"))
        if not username:
            raise ValueError("用户名不能为空")
        if len(password) < 8:
            raise ValueError("密码长度至少为 8 位")
        if not self.role_repository.get_role(role_code):
            raise ValueError("角色不存在")
        created = self.repository.create_user(
            {
                "username": username,
                "nickname": nickname,
                "password_hash": hash_password(password),
                "role": role_code,
                "is_active": bool(payload.get("is_active", True)),
            }
        )
        return self._serialize_user(created)

    def update_user(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        current = self.repository.get_user_by_id(user_id)
        if not current:
            raise KeyError(user_id)
        target_role = self._normalize_role_code(payload.get("role"))
        if not self.role_repository.get_role(target_role):
            raise ValueError("角色不存在")
        if current.get("role") == SUPER_ADMIN_ROLE and target_role != SUPER_ADMIN_ROLE and self.role_repository.active_super_admin_count() <= 1:
            raise ValueError("至少保留一个超级管理员")
        if current.get("role") == SUPER_ADMIN_ROLE and not bool(payload.get("is_active", True)) and self.role_repository.active_super_admin_count() <= 1:
            raise ValueError("至少保留一个超级管理员")
        updated = self.repository.update_user(
            user_id,
            role=target_role,
            is_active=bool(payload.get("is_active", True)),
        )
        return self._serialize_user(updated)

    def reset_password(self, user_id: int, new_password: str) -> dict[str, Any]:
        if len(new_password) < 8:
            raise ValueError("密码长度至少为 8 位")
        updated = self.repository.update_password(user_id, hash_password(new_password))
        self.repository.delete_sessions_for_user(user_id)
        return self._serialize_user(updated)

    def update_profile(self, user_id: int, nickname: str) -> dict[str, Any]:
        normalized_nickname = nickname.strip()
        if not normalized_nickname:
            raise ValueError("昵称不能为空")
        updated = self.repository.update_profile(user_id, nickname=normalized_nickname)
        return self._serialize_user(updated)

    def change_password(self, user_id: int, current_password: str, new_password: str) -> None:
        user = self.repository.get_user_by_id(user_id)
        if not user:
            raise KeyError(user_id)
        if not verify_password(current_password, str(user["password_hash"])):
            raise ValueError("当前密码不正确")
        if len(new_password) < 8:
            raise ValueError("密码长度至少为 8 位")
        self.repository.update_password(user_id, hash_password(new_password))
        self.repository.delete_sessions_for_user(user_id)

    def list_roles(self) -> list[dict[str, Any]]:
        return self.role_repository.list_roles()

    def list_permissions(self) -> list[dict[str, str]]:
        return self.role_repository.list_permissions()

    def update_permission(self, permission_code: str, payload: dict[str, Any]) -> dict[str, str]:
        normalized_name = str(payload.get("permission_name") or "").strip()
        normalized_description = str(payload.get("permission_description") or "").strip()
        if not normalized_name:
            raise ValueError("权限名称不能为空")
        if not normalized_description:
            raise ValueError("权限说明不能为空")
        return self.role_repository.update_permission(
            permission_code,
            {
                "permission_name": normalized_name,
                "permission_description": normalized_description,
            },
        )

    def create_role(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self.role_repository.create_role(payload)

    def update_role(self, role_code: str, payload: dict[str, Any]) -> dict[str, Any]:
        return self.role_repository.update_role(role_code, payload)

    def delete_role(self, role_code: str) -> None:
        self.role_repository.delete_role(role_code)

    @staticmethod
    def _serialize_user(user: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": int(user["id"]),
            "username": str(user["username"]),
            "nickname": str(user.get("nickname") or user["username"]),
            "role": str(user["role"]),
            "role_name": str(user.get("role_name") or user["role"]),
            "is_active": bool(user["is_active"]),
            "permissions": [str(permission) for permission in user.get("permissions", [])],
            "last_login_at": _format_datetime(user.get("last_login_at")),
            "created_at": _format_datetime(user.get("created_at")),
        }

    @staticmethod
    def _normalize_role_code(value: Any) -> str:
        role_code = str(value or NORMAL_USER_ROLE).strip()
        if role_code == "admin":
            return SUPER_ADMIN_ROLE
        if role_code == "user":
            return NORMAL_USER_ROLE
        return role_code


def _format_datetime(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%SZ")
    return str(value)


def set_session_cookie(response: Response, session_token: str, settings: Settings | None = None) -> None:
    active_settings = settings or load_settings()
    response.set_cookie(
        key=active_settings.auth_session_cookie_name,
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=active_settings.app_env == "prod",
        max_age=active_settings.auth_session_days * 24 * 60 * 60,
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings | None = None) -> None:
    active_settings = settings or load_settings()
    response.delete_cookie(active_settings.auth_session_cookie_name, path="/")


def get_auth_service() -> AuthService:
    return AuthService()


def get_optional_current_user(
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict[str, Any] | None:
    settings = load_settings()
    return auth_service.get_current_user(request.cookies.get(settings.auth_session_cookie_name))


def require_current_user(current_user: dict[str, Any] | None = Depends(get_optional_current_user)) -> dict[str, Any]:
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    return current_user


def require_admin_user(current_user: dict[str, Any] = Depends(require_current_user)) -> dict[str, Any]:
    return require_permission(ROLE_MANAGEMENT_PERMISSION)(current_user)


def require_permission(permission_code: str):
    def dependency(current_user: dict[str, Any] = Depends(require_current_user)) -> dict[str, Any]:
        permissions = set(current_user.get("permissions") or [])
        if permission_code not in permissions:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="没有权限")
        return current_user

    return dependency


def require_basic_profile_permission(current_user: dict[str, Any] = Depends(require_permission(BASIC_PROFILE_PERMISSION))) -> dict[str, Any]:
    return current_user


def require_model_management_permission(current_user: dict[str, Any] = Depends(require_permission(MODEL_MANAGEMENT_PERMISSION))) -> dict[str, Any]:
    return current_user


def require_user_management_permission(current_user: dict[str, Any] = Depends(require_permission(USER_MANAGEMENT_PERMISSION))) -> dict[str, Any]:
    return current_user


def require_role_management_permission(current_user: dict[str, Any] = Depends(require_permission(ROLE_MANAGEMENT_PERMISSION))) -> dict[str, Any]:
    return current_user
