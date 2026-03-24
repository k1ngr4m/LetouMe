from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ModelSettingsPayload(BaseModel):
    model_code: str | None = None
    display_name: str
    provider: str
    provider_model_id: int | None = None
    provider_model_name: str | None = ""
    api_format: str | None = "openai_compatible"
    api_model_name: str
    version: str | None = ""
    tags: list[str] = Field(default_factory=list)
    base_url: str | None = ""
    api_key: str | None = ""
    app_code: str | None = ""
    temperature: float | None = None
    is_active: bool = True
    lottery_codes: list[str] = Field(default_factory=lambda: ["dlt"])


class ModelStatusPayload(BaseModel):
    is_active: bool


class ModelResponse(BaseModel):
    model_code: str
    display_name: str
    provider: str
    provider_model_id: int | None = None
    provider_model_name: str = ""
    api_format: str = "openai_compatible"
    api_model_name: str
    version: str = ""
    tags: list[str] = Field(default_factory=list)
    base_url: str = ""
    api_key: str = ""
    app_code: str = ""
    temperature: float | None = None
    is_active: bool
    is_deleted: bool
    lottery_codes: list[str] = Field(default_factory=lambda: ["dlt"])
    updated_at: str = ""


class ModelListResponse(BaseModel):
    models: list[ModelResponse] = Field(default_factory=list)


class ProviderListResponse(BaseModel):
    providers: list[dict[str, Any]] = Field(default_factory=list)


class ProviderModelConfigPayload(BaseModel):
    id: int | None = None
    model_id: str
    display_name: str


class ProviderSettingsPayload(BaseModel):
    code: str | None = None
    name: str
    api_format: str = "openai_compatible"
    remark: str | None = ""
    website_url: str | None = ""
    api_key: str | None = ""
    base_url: str | None = ""
    extra_options: dict[str, Any] = Field(default_factory=dict)
    model_configs: list[ProviderModelConfigPayload] = Field(default_factory=list)
