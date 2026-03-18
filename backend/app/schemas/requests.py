from __future__ import annotations

from pydantic import BaseModel, Field

from backend.app.schemas.model_settings import ModelSettingsPayload


class PaginationPayload(BaseModel):
    lottery_code: str = "dlt"
    limit: int | None = Field(default=None, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class ModelListPayload(BaseModel):
    include_deleted: bool = False
    lottery_code: str | None = None


class ModelCodePayload(BaseModel):
    model_code: str


class ModelUpdatePayload(ModelSettingsPayload):
    model_code: str


class ModelStatusUpdatePayload(BaseModel):
    model_code: str
    is_active: bool


class GenerateModelPredictionsPayload(BaseModel):
    lottery_code: str = "dlt"
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
    lottery_code: str = "dlt"
    model_codes: list[str] = Field(default_factory=list)
    mode: str
    overwrite: bool = False
    start_period: str | None = None
    end_period: str | None = None


class PredictionGenerationTaskPayload(BaseModel):
    task_id: str


class LotteryFetchTaskPayload(BaseModel):
    task_id: str
    lottery_code: str = "dlt"


class SettingsPredictionRecordDetailPayload(BaseModel):
    lottery_code: str = "dlt"
    record_type: str
    target_period: str


class PredictionHistoryDetailPayload(BaseModel):
    lottery_code: str = "dlt"
    target_period: str


class SimulationTicketPayload(BaseModel):
    lottery_code: str = "dlt"
    play_type: str | None = None
    front_numbers: list[str] = Field(default_factory=list)
    back_numbers: list[str] = Field(default_factory=list)
    direct_hundreds: list[str] = Field(default_factory=list)
    direct_tens: list[str] = Field(default_factory=list)
    direct_units: list[str] = Field(default_factory=list)
    group_numbers: list[str] = Field(default_factory=list)


class SimulationTicketListPayload(BaseModel):
    lottery_code: str = "dlt"


class SimulationTicketDeletePayload(BaseModel):
    ticket_id: int = Field(ge=1)
    lottery_code: str = "dlt"


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
