from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ModelSettingsPayload(BaseModel):
    model_code: str | None = None
    display_name: str
    provider: str
    api_model_name: str
    version: str | None = ""
    tags: list[str] = Field(default_factory=list)
    base_url: str | None = ""
    api_key: str | None = ""
    app_code: str | None = ""
    temperature: float | None = None
    is_active: bool = True


class ModelStatusPayload(BaseModel):
    is_active: bool


class ModelResponse(BaseModel):
    model_code: str
    display_name: str
    provider: str
    api_model_name: str
    version: str = ""
    tags: list[str] = Field(default_factory=list)
    base_url: str = ""
    api_key: str = ""
    app_code: str = ""
    temperature: float | None = None
    is_active: bool
    is_deleted: bool
    updated_at: str = ""


class ModelListResponse(BaseModel):
    models: list[ModelResponse] = Field(default_factory=list)


class ProviderListResponse(BaseModel):
    providers: list[dict[str, Any]] = Field(default_factory=list)
