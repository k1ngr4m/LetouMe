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


class GenerateModelPredictionsPayload(BaseModel):
    model_code: str
    mode: str
    overwrite: bool = False
    start_period: str | None = None
    end_period: str | None = None


class BulkModelActionPayload(BaseModel):
    model_codes: list[str] = Field(default_factory=list)
    action: str
    updates: dict[str, object] | None = None


class BulkGenerateModelPredictionsPayload(BaseModel):
    model_codes: list[str] = Field(default_factory=list)
    mode: str
    overwrite: bool = False
    start_period: str | None = None
    end_period: str | None = None


class PredictionGenerationTaskPayload(BaseModel):
    task_id: str


class LotteryFetchTaskPayload(BaseModel):
    task_id: str


class SettingsPredictionRecordDetailPayload(BaseModel):
    record_type: str
    target_period: str


class PredictionHistoryDetailPayload(BaseModel):
    target_period: str


class SimulationTicketPayload(BaseModel):
    front_numbers: list[str] = Field(default_factory=list)
    back_numbers: list[str] = Field(default_factory=list)


class SimulationTicketDeletePayload(BaseModel):
    ticket_id: int = Field(ge=1)


class ProfileUpdatePayload(BaseModel):
    nickname: str


class PasswordChangePayload(BaseModel):
    current_password: str
    new_password: str


class RoleCodePayload(BaseModel):
    role_code: str


class RolePayload(BaseModel):
    role_code: str
    role_name: str
    permissions: list[str] = Field(default_factory=list)


class PermissionUpdatePayload(BaseModel):
    permission_code: str
    permission_name: str
    permission_description: str
