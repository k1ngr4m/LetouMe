from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field

from backend.app.schemas.model_settings import ModelSettingsPayload, ProviderSettingsPayload


class PaginationPayload(BaseModel):
    lottery_code: str = "dlt"
    limit: int | None = Field(default=None, ge=1, le=500)
    offset: int = Field(default=0, ge=0)


class PredictionsHistoryListPayload(BaseModel):
    lottery_code: str = "dlt"
    limit: int | None = Field(default=None, ge=1, le=500)
    offset: int = Field(default=0, ge=0)
    strategy_filters: list[str] = Field(default_factory=list)
    play_type_filters: list[Literal["direct", "direct_sum", "group3", "group6", "pl3_dantuo", "dlt_dantuo", "dlt_compound"]] = Field(default_factory=list)
    strategy_match_mode: Literal["all"] = "all"


class ModelListPayload(BaseModel):
    include_deleted: bool = False
    lottery_code: str | None = None


class ModelCodePayload(BaseModel):
    model_code: str


class ProviderCodePayload(BaseModel):
    provider_code: str


class ProviderModelDiscoveryPayload(BaseModel):
    provider: str
    base_url: str | None = ""
    api_key: str | None = ""


class ModelUpdatePayload(ModelSettingsPayload):
    original_model_code: str
    model_code: str


class ModelConnectivityTestPayload(BaseModel):
    provider: str
    api_format: str | None = None
    api_model_name: str
    base_url: str | None = ""
    api_key: str | None = ""
    app_code: str | None = ""
    temperature: float = 0.3


class ProviderCreatePayload(ProviderSettingsPayload):
    code: str


class ProviderUpdatePayload(ProviderSettingsPayload):
    provider_code: str


class ModelStatusUpdatePayload(BaseModel):
    model_code: str
    is_active: bool


class ExpertListPayload(BaseModel):
    include_deleted: bool = False
    lottery_code: str | None = None


class ExpertCodePayload(BaseModel):
    expert_code: str


class ExpertSettingsPayload(BaseModel):
    display_name: str
    bio: str | None = ""
    model_code: str
    lottery_code: str = "dlt"
    is_active: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class ExpertUpdatePayload(ExpertSettingsPayload):
    original_expert_code: str


class ExpertStatusUpdatePayload(BaseModel):
    expert_code: str
    is_active: bool


class ExpertCurrentDetailPayload(BaseModel):
    lottery_code: str = "dlt"
    expert_code: str


class ExpertHistoryListPayload(BaseModel):
    lottery_code: str = "dlt"
    expert_code: str | None = None
    period_query: str | None = None
    limit: int | None = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class ExpertHistoryDetailPayload(BaseModel):
    lottery_code: str = "dlt"
    target_period: str
    expert_code: str


class ExpertPredictionRunStartPayload(BaseModel):
    lottery_code: str = "dlt"
    expert_code: str | None = None
    mode: str = "current"
    overwrite: bool = False
    parallelism: int | None = Field(default=None, ge=1, le=8)
    start_period: str | None = None
    end_period: str | None = None
    recent_period_count: Literal[1, 5, 10, 20] | None = None
    prompt_history_period_count: Literal[30, 50, 100] | None = None


class ExpertPredictionTaskPayload(BaseModel):
    task_id: str


class GenerateModelPredictionsPayload(BaseModel):
    lottery_code: str = "dlt"
    model_code: str
    mode: str
    prediction_play_mode: Literal["direct", "direct_sum", "compound", "dantuo"] = "direct"
    overwrite: bool = False
    parallelism: int | None = Field(default=None, ge=1, le=8)
    start_period: str | None = None
    end_period: str | None = None
    recent_period_count: Literal[1, 5, 10, 20] | None = None
    prompt_history_period_count: Literal[30, 50, 100] | None = None


class BulkModelActionPayload(BaseModel):
    model_codes: list[str] = Field(default_factory=list)
    action: str
    updates: dict[str, object] | None = None


class BulkGenerateModelPredictionsPayload(BaseModel):
    lottery_code: str = "dlt"
    model_codes: list[str] = Field(default_factory=list)
    mode: str
    prediction_play_mode: Literal["direct", "direct_sum", "compound", "dantuo"] = "direct"
    overwrite: bool = False
    parallelism: int | None = Field(default=None, ge=1, le=8)
    start_period: str | None = None
    end_period: str | None = None
    recent_period_count: Literal[1, 5, 10, 20] | None = None
    prompt_history_period_count: Literal[30, 50, 100] | None = None


class PredictionGenerationTaskPayload(BaseModel):
    task_id: str


class LotteryFetchTaskPayload(BaseModel):
    task_id: str
    lottery_code: str = "dlt"


class MaintenanceRunLogListPayload(BaseModel):
    lottery_code: str | None = None
    limit: int = Field(default=20, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class SettingsPredictionRecordDetailPayload(BaseModel):
    lottery_code: str = "dlt"
    record_type: str
    target_period: str


class PredictionHistoryDetailPayload(BaseModel):
    lottery_code: str = "dlt"
    target_period: str


class SmartPredictionRunStartPayload(BaseModel):
    lottery_code: str = "dlt"
    data_model_codes: list[str] = Field(default_factory=list)
    stage1_model_code: str
    stage2_model_code: str
    history_period_count: Literal[30, 50, 100] = 50
    strategy_codes: list[Literal["hot", "cold", "balanced", "cycle", "composite"]] = Field(default_factory=list)
    include_trend: bool = True
    include_scores: bool = True
    auto_stage2: bool = True
    retry_once: bool = True
    strict_validation: bool = True


class SmartPredictionRunIdPayload(BaseModel):
    run_id: str


class SmartPredictionRunListPayload(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class SmartPredictionStage2StartPayload(BaseModel):
    run_id: str
    stage2_model_code: str | None = None
    force_rerun: bool = True


class SimulationTicketPayload(BaseModel):
    lottery_code: str = "dlt"
    play_type: str | None = None
    front_numbers: list[str] = Field(default_factory=list)
    back_numbers: list[str] = Field(default_factory=list)
    front_dan: list[str] = Field(default_factory=list)
    front_tuo: list[str] = Field(default_factory=list)
    back_dan: list[str] = Field(default_factory=list)
    back_tuo: list[str] = Field(default_factory=list)
    direct_ten_thousands: list[str] = Field(default_factory=list)
    direct_thousands: list[str] = Field(default_factory=list)
    direct_hundreds: list[str] = Field(default_factory=list)
    direct_tens: list[str] = Field(default_factory=list)
    direct_units: list[str] = Field(default_factory=list)
    direct_hundreds_dan: list[str] = Field(default_factory=list)
    direct_hundreds_tuo: list[str] = Field(default_factory=list)
    direct_tens_dan: list[str] = Field(default_factory=list)
    direct_tens_tuo: list[str] = Field(default_factory=list)
    direct_units_dan: list[str] = Field(default_factory=list)
    direct_units_tuo: list[str] = Field(default_factory=list)
    group_numbers: list[str] = Field(default_factory=list)
    sum_values: list[str] = Field(default_factory=list)
    position_selections: list[list[str]] = Field(default_factory=list)


class SimulationTicketQuotePayload(SimulationTicketPayload):
    pass


class SimulationTicketListPayload(BaseModel):
    lottery_code: str = "dlt"


class SimulationTicketDeletePayload(BaseModel):
    ticket_id: int = Field(ge=1)
    lottery_code: str = "dlt"


class MyBetRecordListPayload(BaseModel):
    lottery_code: str = "dlt"


class MyBetLinePayload(BaseModel):
    play_type: str | None = None
    front_numbers: list[str] = Field(default_factory=list)
    back_numbers: list[str] = Field(default_factory=list)
    front_dan: list[str] = Field(default_factory=list)
    front_tuo: list[str] = Field(default_factory=list)
    back_dan: list[str] = Field(default_factory=list)
    back_tuo: list[str] = Field(default_factory=list)
    direct_ten_thousands: list[str] = Field(default_factory=list)
    direct_thousands: list[str] = Field(default_factory=list)
    direct_hundreds: list[str] = Field(default_factory=list)
    direct_tens: list[str] = Field(default_factory=list)
    direct_units: list[str] = Field(default_factory=list)
    direct_hundreds_dan: list[str] = Field(default_factory=list)
    direct_hundreds_tuo: list[str] = Field(default_factory=list)
    direct_tens_dan: list[str] = Field(default_factory=list)
    direct_tens_tuo: list[str] = Field(default_factory=list)
    direct_units_dan: list[str] = Field(default_factory=list)
    direct_units_tuo: list[str] = Field(default_factory=list)
    group_numbers: list[str] = Field(default_factory=list)
    sum_values: list[str] = Field(default_factory=list)
    position_selections: list[list[str]] = Field(default_factory=list)
    multiplier: int = Field(default=1, ge=1, le=99)
    is_append: bool = False


class MyBetRecordPayload(BaseModel):
    lottery_code: str = "dlt"
    target_period: str
    play_type: str | None = None
    front_numbers: list[str] = Field(default_factory=list)
    back_numbers: list[str] = Field(default_factory=list)
    front_dan: list[str] = Field(default_factory=list)
    front_tuo: list[str] = Field(default_factory=list)
    back_dan: list[str] = Field(default_factory=list)
    back_tuo: list[str] = Field(default_factory=list)
    direct_ten_thousands: list[str] = Field(default_factory=list)
    direct_thousands: list[str] = Field(default_factory=list)
    direct_hundreds: list[str] = Field(default_factory=list)
    direct_tens: list[str] = Field(default_factory=list)
    direct_units: list[str] = Field(default_factory=list)
    direct_hundreds_dan: list[str] = Field(default_factory=list)
    direct_hundreds_tuo: list[str] = Field(default_factory=list)
    direct_tens_dan: list[str] = Field(default_factory=list)
    direct_tens_tuo: list[str] = Field(default_factory=list)
    direct_units_dan: list[str] = Field(default_factory=list)
    direct_units_tuo: list[str] = Field(default_factory=list)
    group_numbers: list[str] = Field(default_factory=list)
    sum_values: list[str] = Field(default_factory=list)
    position_selections: list[list[str]] = Field(default_factory=list)
    multiplier: int = Field(default=1, ge=1, le=99)
    is_append: bool = False
    source_type: str = "manual"
    ticket_image_url: str = ""
    ocr_text: str = ""
    ocr_provider: str | None = None
    ocr_recognized_at: int | None = None
    ticket_purchased_at: int | None = None
    discount_amount: int = Field(default=0, ge=0)
    lines: list[MyBetLinePayload] = Field(default_factory=list)


class MyBetRecordUpdatePayload(MyBetRecordPayload):
    record_id: int = Field(ge=1)


class MyBetRecordDeletePayload(BaseModel):
    lottery_code: str = "dlt"
    record_id: int = Field(ge=1)


class MessageListPayload(BaseModel):
    lottery_code: str | None = None
    status_filter: Literal["all", "unread", "read"] = "all"
    result_filter: Literal["all", "won", "lost"] = "all"
    keyword: str | None = None
    date_start: str | None = None
    date_end: str | None = None
    limit: int = Field(default=20, ge=1, le=200)
    offset: int = Field(default=0, ge=0)


class MessageReadPayload(BaseModel):
    message_id: int = Field(ge=1)


class MessageReadAllPayload(BaseModel):
    lottery_code: str | None = None


class MessageDeletePayload(BaseModel):
    message_id: int = Field(ge=1)


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


class ScheduleTaskPayload(BaseModel):
    task_name: str
    task_type: str
    lottery_code: str = "dlt"
    fetch_limit: int = Field(default=30, ge=1, le=500)
    model_codes: list[str] = Field(default_factory=list)
    generation_mode: str = "current"
    prediction_play_mode: Literal["direct", "direct_sum", "compound", "dantuo"] = "direct"
    overwrite_existing: bool = False
    schedule_mode: str
    preset_type: str | None = None
    time_of_day: str | None = None
    weekdays: list[int] = Field(default_factory=list)
    cron_expression: str | None = None
    is_active: bool = True


class ScheduleTaskUpdatePayload(ScheduleTaskPayload):
    task_code: str


class ScheduleTaskCodePayload(BaseModel):
    task_code: str


class ScheduleTaskStatusPayload(BaseModel):
    task_code: str
    is_active: bool


class ScheduleRunLogListPayload(BaseModel):
    start_date: date
    end_date: date
    task_codes: list[str] = Field(default_factory=list)
    limit: int = Field(default=2000, ge=1, le=5000)
