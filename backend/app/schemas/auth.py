from __future__ import annotations

from pydantic import BaseModel, Field


class LoginPayload(BaseModel):
    identifier: str
    password: str


class RegisterPayload(BaseModel):
    username: str
    email: str
    password: str


class ForgotPasswordSendCodePayload(BaseModel):
    email: str


class ForgotPasswordResetPayload(BaseModel):
    email: str
    code: str
    new_password: str


class OAuthStartResponse(BaseModel):
    provider: str
    enabled: bool
    auth_url: str | None = None
    message: str | None = None


class AuthUserResponse(BaseModel):
    id: int
    username: str
    email: str | None = None
    nickname: str
    avatar_url: str | None = None
    role: str
    role_name: str
    is_active: bool
    permissions: list[str] = Field(default_factory=list)
    last_login_at: str | None = None
    created_at: str | None = None


class CurrentUserResponse(BaseModel):
    user: AuthUserResponse | None = None


class UserListResponse(BaseModel):
    users: list[AuthUserResponse] = Field(default_factory=list)


class RoleResponse(BaseModel):
    role_code: str
    role_name: str
    is_system: bool
    member_count: int = 0
    permissions: list[str] = Field(default_factory=list)


class RoleListResponse(BaseModel):
    roles: list[RoleResponse] = Field(default_factory=list)


class PermissionResponse(BaseModel):
    permission_code: str
    permission_name: str
    permission_description: str


class PermissionListResponse(BaseModel):
    permissions: list[PermissionResponse] = Field(default_factory=list)


class UserCreatePayload(BaseModel):
    username: str
    email: str | None = None
    nickname: str | None = None
    password: str
    role: str = "normal_user"
    is_active: bool = True


class UserUpdatePayload(BaseModel):
    user_id: int
    role: str
    is_active: bool


class ResetPasswordPayload(BaseModel):
    user_id: int
    password: str
