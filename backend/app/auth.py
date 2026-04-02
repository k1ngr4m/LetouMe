from __future__ import annotations

import hashlib
import hmac
import secrets
import string
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode

from backend.app.cache import runtime_cache
from fastapi import Depends, HTTPException, Request, Response, status
import requests

from backend.app.config import Settings, load_settings
from backend.app.logging_utils import get_logger
from backend.app.rbac import (
    BASIC_PROFILE_PERMISSION,
    MODEL_MANAGEMENT_PERMISSION,
    NORMAL_USER_ROLE,
    ROLE_MANAGEMENT_PERMISSION,
    SCHEDULE_MANAGEMENT_PERMISSION,
    SUPER_ADMIN_ROLE,
    USER_MANAGEMENT_PERMISSION,
    ensure_rbac_setup,
)
from backend.app.repositories.role_repository import RoleRepository
from backend.app.repositories.user_repository import UserRepository
from backend.app.services.email_service import EmailService


logger = get_logger("auth")
PASSWORD_RESET_EMAIL_PURPOSE = "password_reset"
REGISTER_EMAIL_PURPOSE = "register"


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
        self.email_service = EmailService(settings=self.settings)

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

    def login(self, identifier: str, password: str, *, user_agent: str = "", ip_address: str = "") -> tuple[dict[str, Any], str]:
        normalized_identifier = identifier.strip()
        if "@" in normalized_identifier:
            user = self.repository.get_user_by_email(normalized_identifier.lower())
        else:
            user = self.repository.get_user_by_username(normalized_identifier)
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

    def register(self, username: str, email: str, password: str, code: str, *, user_agent: str = "", ip_address: str = "") -> tuple[dict[str, Any], str]:
        normalized_username = username.strip()
        normalized_email = email.strip().lower()
        normalized_code = code.strip()
        if not normalized_email:
            raise ValueError("邮箱不能为空")
        if not _is_valid_email(normalized_email):
            raise ValueError("邮箱格式不正确")
        if not normalized_code:
            raise ValueError("验证码不能为空")
        code_id = self._validate_email_code(normalized_email, normalized_code, purpose=REGISTER_EMAIL_PURPOSE)
        created = self.create_user(
            {
                "username": normalized_username,
                "email": normalized_email,
                "nickname": normalized_username,
                "password": password,
                "role": NORMAL_USER_ROLE,
                "is_active": True,
            }
        )
        self.repository.consume_email_verification_code(code_id)
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
        user = self.repository.get_user_by_session_token(session_token)
        if not user:
            return None
        expires_at = user.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.strptime(expires_at, "%Y-%m-%d %H:%M:%S")
        if not isinstance(expires_at, datetime) or expires_at <= datetime.utcnow():
            self.repository.delete_session(session_token)
            return None
        if not user or not user.get("is_active"):
            self.repository.delete_session(session_token)
            return None
        touch_key = f"auth:touch:{session_token}"
        if runtime_cache.get(touch_key) is None:
            self.repository.touch_session(session_token)
            runtime_cache.set(touch_key, True, ttl_seconds=60)
        return self._serialize_user(user)

    def list_users(self) -> list[dict[str, Any]]:
        return [self._serialize_user(user) for user in self.repository.list_users()]

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        username = str(payload.get("username") or "").strip()
        email = str(payload.get("email") or "").strip().lower()
        nickname = str(payload.get("nickname") or username).strip() or username
        password = str(payload.get("password") or "")
        role_code = self._normalize_role_code(payload.get("role"))
        if not username:
            raise ValueError("用户名不能为空")
        if email and not _is_valid_email(email):
            raise ValueError("邮箱格式不正确")
        if len(password) < 8:
            raise ValueError("密码长度至少为 8 位")
        if not self.role_repository.get_role(role_code):
            raise ValueError("角色不存在")
        created = self.repository.create_user(
            {
                "username": username,
                "email": email or None,
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

    def send_password_reset_code(self, email: str) -> None:
        normalized_email = email.strip().lower()
        if not _is_valid_email(normalized_email):
            raise ValueError("邮箱格式不正确")
        user = self.repository.get_user_by_email(normalized_email)
        if not user or not user.get("is_active"):
            raise ValueError("该邮箱未绑定可用账号")
        self._send_email_code(normalized_email, purpose=PASSWORD_RESET_EMAIL_PURPOSE)

    def send_registration_code(self, email: str) -> None:
        normalized_email = email.strip().lower()
        if not _is_valid_email(normalized_email):
            raise ValueError("邮箱格式不正确")
        existing_user = self.repository.get_user_by_email(normalized_email)
        if existing_user:
            raise ValueError("该邮箱已注册")
        self._send_email_code(normalized_email, purpose=REGISTER_EMAIL_PURPOSE)

    def _send_email_code(self, email: str, *, purpose: str) -> None:
        latest_code = self.repository.get_latest_active_email_verification_code(
            email=email,
            purpose=purpose,
        )
        if latest_code:
            expires_at = _to_datetime(latest_code.get("expires_at"))
            sent_at = (
                expires_at - timedelta(minutes=self.settings.auth_email_code_expire_minutes)
                if expires_at
                else None
            )
            if sent_at and sent_at + timedelta(seconds=self.settings.auth_email_code_cooldown_seconds) > datetime.utcnow():
                raise ValueError("验证码发送过于频繁，请稍后再试")

        code = "".join(secrets.choice(string.digits) for _ in range(6))
        code_hash = _hash_email_code(code, email)
        self.email_service.send_password_reset_code(email, code)
        self.repository.create_email_verification_code(
            email=email,
            purpose=purpose,
            code_hash=code_hash,
            expires_at=datetime.utcnow() + timedelta(minutes=self.settings.auth_email_code_expire_minutes),
        )

    def reset_password_by_email_code(self, email: str, code: str, new_password: str) -> None:
        normalized_email = email.strip().lower()
        normalized_code = code.strip()
        if not _is_valid_email(normalized_email):
            raise ValueError("邮箱格式不正确")
        if len(new_password) < 8:
            raise ValueError("密码长度至少为 8 位")
        code_id = self._validate_email_code(normalized_email, normalized_code, purpose=PASSWORD_RESET_EMAIL_PURPOSE)
        user = self.repository.get_user_by_email(normalized_email)
        if not user or not user.get("is_active"):
            raise ValueError("该邮箱未绑定可用账号")
        self.repository.consume_email_verification_code(code_id)
        self.repository.update_password(int(user["id"]), hash_password(new_password))
        self.repository.delete_sessions_for_user(int(user["id"]))

    def _validate_email_code(self, email: str, code: str, *, purpose: str) -> int:
        latest_code = self.repository.get_latest_active_email_verification_code(
            email=email,
            purpose=purpose,
        )
        if not latest_code:
            raise ValueError("验证码不存在或已失效")
        code_id = int(latest_code["id"])
        if int(latest_code.get("attempt_count") or 0) >= 5:
            self.repository.consume_email_verification_code(code_id)
            raise ValueError("验证码错误次数过多，请重新获取")
        expires_at = _to_datetime(latest_code.get("expires_at"))
        if not expires_at or expires_at <= datetime.utcnow():
            self.repository.consume_email_verification_code(code_id)
            raise ValueError("验证码已过期")
        expected_hash = str(latest_code.get("code_hash") or "")
        candidate_hash = _hash_email_code(code, email)
        if not expected_hash or not hmac.compare_digest(candidate_hash, expected_hash):
            self.repository.increment_email_verification_code_attempt(code_id)
            raise ValueError("验证码错误")
        return code_id

    def get_oauth_provider_start(self, provider: str) -> dict[str, Any]:
        normalized_provider = provider.strip().lower()
        if normalized_provider not in {"google", "github"}:
            raise ValueError("不支持的 OAuth Provider")
        oauth_config = self._get_oauth_config(normalized_provider)
        client_id = str(oauth_config["client_id"])
        authorize_url = str(oauth_config["authorize_url"])
        redirect_uri = str(oauth_config["redirect_uri"])
        scope = str(oauth_config["scope"])
        if not client_id or not authorize_url or not redirect_uri or not str(oauth_config["client_secret"]):
            return {
                "provider": normalized_provider,
                "enabled": False,
                "auth_url": None,
                "message": "OAuth 未配置，请联系管理员",
            }
        state = secrets.token_urlsafe(24)
        runtime_cache.set(
            f"auth:oauth:state:{normalized_provider}:{state}",
            True,
            ttl_seconds=max(60, self.settings.auth_oauth_state_ttl_seconds),
        )
        query = urlencode(
            {
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": scope,
                "state": state,
            }
        )
        return {
            "provider": normalized_provider,
            "enabled": True,
            "auth_url": f"{authorize_url}?{query}",
            "message": None,
        }

    def complete_oauth_login(
        self,
        provider: str,
        code: str,
        state: str,
        *,
        user_agent: str = "",
        ip_address: str = "",
    ) -> tuple[dict[str, Any], str]:
        normalized_provider = provider.strip().lower()
        oauth_config = self._get_oauth_config(normalized_provider)
        if not str(oauth_config["client_id"]) or not str(oauth_config["client_secret"]):
            raise ValueError("OAuth 未配置，请联系管理员")
        state_key = f"auth:oauth:state:{normalized_provider}:{state.strip()}"
        if runtime_cache.get(state_key) is None:
            raise ValueError("OAuth 状态已失效，请重新发起登录")
        runtime_cache.delete(state_key)

        access_token = self._exchange_oauth_access_token(normalized_provider, oauth_config, code.strip())
        oauth_user = self._fetch_oauth_user_profile(normalized_provider, oauth_config, access_token)
        email = str(oauth_user.get("email") or "").strip().lower()
        if not _is_valid_email(email):
            raise ValueError("第三方账号未返回可用邮箱")
        user = self.repository.get_user_by_email(email)
        if not user:
            username = self._build_unique_oauth_username(
                preferred_username=str(oauth_user.get("username") or ""),
                email=email,
                provider=normalized_provider,
            )
            display_name = str(oauth_user.get("display_name") or username).strip() or username
            user = self.create_user(
                {
                    "username": username,
                    "email": email,
                    "nickname": display_name[:128],
                    "password": secrets.token_urlsafe(24),
                    "role": NORMAL_USER_ROLE,
                    "is_active": True,
                }
            )
        if not user.get("is_active"):
            raise ValueError("该账号已被禁用")
        session_token = secrets.token_urlsafe(32)
        self.repository.create_session(
            user_id=int(user["id"]),
            session_token=session_token,
            expires_at=datetime.utcnow() + timedelta(days=self.settings.auth_session_days),
            user_agent=user_agent,
            ip_address=ip_address,
        )
        self.repository.touch_last_login(int(user["id"]))
        logger.info("OAuth login succeeded", extra={"context": {"provider": normalized_provider, "email": email}})
        return self._serialize_user(user), session_token

    def _get_oauth_config(self, provider: str) -> dict[str, str]:
        normalized_provider = provider.strip().lower()
        if normalized_provider == "google":
            redirect_uri = self.settings.auth_oauth_google_redirect_uri.strip() or self._build_default_oauth_redirect_uri("google")
            return {
                "provider": "google",
                "client_id": self.settings.auth_oauth_google_client_id.strip(),
                "client_secret": self.settings.auth_oauth_google_client_secret.strip(),
                "authorize_url": self.settings.auth_oauth_google_authorize_url.strip(),
                "token_url": self.settings.auth_oauth_google_token_url.strip(),
                "userinfo_url": self.settings.auth_oauth_google_userinfo_url.strip(),
                "emails_url": "",
                "redirect_uri": redirect_uri,
                "scope": "openid email profile",
            }
        if normalized_provider == "github":
            redirect_uri = self.settings.auth_oauth_github_redirect_uri.strip() or self._build_default_oauth_redirect_uri("github")
            return {
                "provider": "github",
                "client_id": self.settings.auth_oauth_github_client_id.strip(),
                "client_secret": self.settings.auth_oauth_github_client_secret.strip(),
                "authorize_url": self.settings.auth_oauth_github_authorize_url.strip(),
                "token_url": self.settings.auth_oauth_github_token_url.strip(),
                "userinfo_url": self.settings.auth_oauth_github_userinfo_url.strip(),
                "emails_url": self.settings.auth_oauth_github_emails_url.strip(),
                "redirect_uri": redirect_uri,
                "scope": "read:user user:email",
            }
        raise ValueError("不支持的 OAuth Provider")

    def _build_default_oauth_redirect_uri(self, provider: str) -> str:
        base_url = self.settings.auth_oauth_base_url.strip()
        if not base_url:
            return ""
        return f"{base_url.rstrip('/')}/api/auth/oauth/{provider}/callback"

    def _exchange_oauth_access_token(self, provider: str, oauth_config: dict[str, str], code: str) -> str:
        payload = {
            "client_id": oauth_config["client_id"],
            "client_secret": oauth_config["client_secret"],
            "code": code,
            "redirect_uri": oauth_config["redirect_uri"],
            "grant_type": "authorization_code",
        }
        headers = {"Accept": "application/json"}
        try:
            response = requests.post(
                oauth_config["token_url"],
                data=payload,
                headers=headers,
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as exc:
            raise RuntimeError(f"OAuth 令牌请求失败: {exc}") from exc
        access_token = str(data.get("access_token") or "").strip()
        if not access_token:
            message = str(data.get("error_description") or data.get("error") or "未知错误")
            raise ValueError(f"OAuth 授权失败: {message}")
        return access_token

    def _fetch_oauth_user_profile(self, provider: str, oauth_config: dict[str, str], access_token: str) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
        try:
            profile_response = requests.get(oauth_config["userinfo_url"], headers=headers, timeout=15)
            profile_response.raise_for_status()
            profile = profile_response.json()
        except requests.RequestException as exc:
            raise RuntimeError(f"OAuth 用户信息获取失败: {exc}") from exc
        if provider == "google":
            return {
                "email": str(profile.get("email") or "").strip().lower(),
                "username": str(profile.get("name") or profile.get("given_name") or "").strip(),
                "display_name": str(profile.get("name") or "").strip(),
            }
        email = str(profile.get("email") or "").strip().lower()
        if not email and oauth_config.get("emails_url"):
            try:
                emails_response = requests.get(str(oauth_config["emails_url"]), headers=headers, timeout=15)
                emails_response.raise_for_status()
                email_list = emails_response.json() if isinstance(emails_response.json(), list) else []
                primary_verified = next(
                    (
                        item
                        for item in email_list
                        if isinstance(item, dict) and item.get("primary") and item.get("verified") and item.get("email")
                    ),
                    None,
                )
                any_verified = next(
                    (item for item in email_list if isinstance(item, dict) and item.get("verified") and item.get("email")),
                    None,
                )
                selected = primary_verified or any_verified
                email = str((selected or {}).get("email") or "").strip().lower()
            except requests.RequestException as exc:
                raise RuntimeError(f"GitHub 邮箱信息获取失败: {exc}") from exc
        return {
            "email": email,
            "username": str(profile.get("login") or "").strip(),
            "display_name": str(profile.get("name") or profile.get("login") or "").strip(),
        }

    def _build_unique_oauth_username(self, *, preferred_username: str, email: str, provider: str) -> str:
        base_candidates = [
            _sanitize_username(preferred_username),
            _sanitize_username(email.split("@", 1)[0]),
            f"{provider}_user",
        ]
        base = next((item for item in base_candidates if item), f"{provider}_user")
        for index in range(0, 100):
            candidate = base if index == 0 else f"{base}_{index}"
            if not self.repository.get_user_by_username(candidate):
                return candidate
        return f"{base}_{secrets.token_hex(3)}"

    def update_profile(self, user_id: int, nickname: str) -> dict[str, Any]:
        normalized_nickname = nickname.strip()
        if not normalized_nickname:
            raise ValueError("昵称不能为空")
        updated = self.repository.update_profile(user_id, nickname=normalized_nickname)
        return self._serialize_user(updated)

    def update_profile_avatar(self, user_id: int, avatar_url: str) -> dict[str, Any]:
        normalized_avatar_url = avatar_url.strip()
        if not normalized_avatar_url:
            raise ValueError("头像地址不能为空")
        updated = self.repository.update_avatar_url(user_id, avatar_url=normalized_avatar_url)
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
            "email": str(user["email"]) if user.get("email") else None,
            "nickname": str(user.get("nickname") or user["username"]),
            "avatar_url": str(user["avatar_url"]) if user.get("avatar_url") else None,
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


def _to_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return None


def _is_valid_email(email: str) -> bool:
    return bool(email) and ("@" in email) and ("." in email.rsplit("@", 1)[-1])


def _hash_email_code(code: str, email: str) -> str:
    material = f"{email}:{code}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def _sanitize_username(value: str) -> str:
    normalized = "".join(character for character in value.strip().lower() if character.isalnum() or character in {"_", "-", "."})
    return normalized[:40]


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


def require_schedule_management_permission(current_user: dict[str, Any] = Depends(require_permission(SCHEDULE_MANAGEMENT_PERMISSION))) -> dict[str, Any]:
    return current_user


def require_super_admin(current_user: dict[str, Any] = Depends(require_current_user)) -> dict[str, Any]:
    if str(current_user.get("role") or "") != SUPER_ADMIN_ROLE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="没有权限")
    return current_user
