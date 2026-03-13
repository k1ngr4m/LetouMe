from __future__ import annotations

from pydantic import BaseModel, Field

from backend.app.schemas.model_settings import ModelSettingsPayload


class PaginationPayload(BaseModel):
    limit: int | None = Field(default=None, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class ModelListPayload(BaseModel):
    include_deleted: bool = False


class ModelCodePayload(BaseModel):
    model_code: str


class ModelUpdatePayload(ModelSettingsPayload):
    model_code: str


class ModelStatusUpdatePayload(BaseModel):
    model_code: str
    is_active: bool


class PredictionHistoryDetailPayload(BaseModel):
    target_period: str
