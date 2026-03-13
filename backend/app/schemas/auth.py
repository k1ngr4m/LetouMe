from __future__ import annotations

from pydantic import BaseModel, Field


class LoginPayload(BaseModel):
    username: str
    password: str


class RegisterPayload(BaseModel):
    username: str
    password: str


class AuthUserResponse(BaseModel):
    id: int
    username: str
    role: str
    is_active: bool
    last_login_at: str | None = None
    created_at: str | None = None


class CurrentUserResponse(BaseModel):
    user: AuthUserResponse | None = None


class UserListResponse(BaseModel):
    users: list[AuthUserResponse] = Field(default_factory=list)


class UserCreatePayload(BaseModel):
    username: str
    password: str
    role: str = "user"
    is_active: bool = True


class UserUpdatePayload(BaseModel):
    user_id: int
    role: str
    is_active: bool


class ResetPasswordPayload(BaseModel):
    user_id: int
    password: str
