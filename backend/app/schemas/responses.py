from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class LotteryHistoryResponse(BaseModel):
    lottery_code: str = "dlt"
    last_updated: str
    data: list[dict[str, Any]]
    next_draw: dict[str, Any] | None = None
    total_count: int = 0


class CurrentPredictionsResponse(BaseModel):
    lottery_code: str = "dlt"
    prediction_date: str
    target_period: str
    models: list[dict[str, Any]]


class PredictionsHistoryResponse(BaseModel):
    predictions_history: list[dict[str, Any]]
    total_count: int = 0
    model_stats: list[dict[str, Any]] = Field(default_factory=list)


class PredictionGenerationTaskResponse(BaseModel):
    lottery_code: str = "dlt"
    task_id: str
    status: str
    mode: str
    model_code: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    progress_summary: dict[str, Any]
    error_message: str | None = None


class LotteryFetchTaskResponse(BaseModel):
    lottery_code: str = "dlt"
    task_id: str
    status: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    progress_summary: dict[str, Any]
    error_message: str | None = None


class MaintenanceRunLogItemResponse(BaseModel):
    id: int
    task_id: str
    lottery_code: str = "dlt"
    trigger_type: str = "manual"
    task_type: str = "lottery_fetch"
    mode: str | None = None
    model_code: str | None = None
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    fetched_count: int = 0
    saved_count: int = 0
    processed_count: int = 0
    skipped_count: int = 0
    failed_count: int = 0
    latest_period: str | None = None
    duration_ms: float = 0
    error_message: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class MaintenanceRunLogListResponse(BaseModel):
    logs: list[MaintenanceRunLogItemResponse] = Field(default_factory=list)
    total_count: int = 0


class BulkModelActionResponse(BaseModel):
    selected_count: int = 0
    processed_count: int = 0
    skipped_count: int = 0
    failed_count: int = 0
    processed_models: list[str] = Field(default_factory=list)
    skipped_models: list[str] = Field(default_factory=list)
    failed_models: list[str] = Field(default_factory=list)


class SettingsPredictionRecordSummaryResponse(BaseModel):
    lottery_code: str = "dlt"
    record_type: str
    target_period: str
    prediction_date: str
    actual_result: dict[str, Any] | None = None
    model_count: int = 0
    status_label: str


class SettingsPredictionRecordListResponse(BaseModel):
    records: list[SettingsPredictionRecordSummaryResponse]


class SettingsPredictionRecordDetailResponse(BaseModel):
    lottery_code: str = "dlt"
    record_type: str
    prediction_date: str
    target_period: str
    actual_result: dict[str, Any] | None = None
    models: list[dict[str, Any]]
    model_stats: list[dict[str, Any]] = Field(default_factory=list)


class SimulationTicketRecordResponse(BaseModel):
    id: int
    lottery_code: str = "dlt"
    play_type: str = "dlt"
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
    group_numbers: list[str] = Field(default_factory=list)
    bet_count: int = 0
    amount: int = 0
    created_at: str


class SimulationTicketListResponse(BaseModel):
    tickets: list[SimulationTicketRecordResponse] = Field(default_factory=list)


class SimulationTicketCreateResponse(BaseModel):
    ticket: SimulationTicketRecordResponse


class SimulationTicketQuoteResponse(BaseModel):
    lottery_code: str = "dlt"
    play_type: str = "dlt"
    bet_count: int = 0
    amount: int = 0


class MyBetRecordResponse(BaseModel):
    id: int
    lottery_code: str = "dlt"
    target_period: str
    play_type: str = "dlt"
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
    group_numbers: list[str] = Field(default_factory=list)
    sum_values: list[str] = Field(default_factory=list)
    multiplier: int = 1
    is_append: bool = False
    bet_count: int = 0
    amount: int = 0
    settlement_status: str = "pending"
    winning_bet_count: int = 0
    prize_level: str | None = None
    prize_amount: int = 0
    net_profit: int = 0
    settled_at: str | None = None
    source_type: str = "manual"
    ticket_image_url: str = ""
    ocr_text: str = ""
    ocr_provider: str | None = None
    ocr_recognized_at: str | None = None
    ticket_purchased_at: str | None = None
    actual_result: dict[str, Any] | None = None
    lines: list[dict[str, Any]] = Field(default_factory=list)
    created_at: str
    updated_at: str


class MyBetSummaryResponse(BaseModel):
    total_count: int = 0
    total_amount: int = 0
    total_prize_amount: int = 0
    total_net_profit: int = 0
    settled_count: int = 0
    pending_count: int = 0


class MyBetRecordListResponse(BaseModel):
    records: list[MyBetRecordResponse] = Field(default_factory=list)
    summary: MyBetSummaryResponse = Field(default_factory=MyBetSummaryResponse)


class MyBetRecordCreateResponse(BaseModel):
    record: MyBetRecordResponse


class MyBetRecordUpdateResponse(BaseModel):
    record: MyBetRecordResponse


class MyBetOCRDraftResponse(BaseModel):
    lottery_code: str = "dlt"
    target_period: str = ""
    source_type: str = "ocr"
    ticket_image_url: str = ""
    ocr_text: str = ""
    ocr_provider: str | None = None
    ocr_recognized_at: str | None = None
    ticket_purchased_at: str | None = None
    lines: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class MyBetOCRImageUploadResponse(BaseModel):
    lottery_code: str = "dlt"
    ticket_image_url: str


class SuccessResponse(BaseModel):
    success: bool = True


class ScheduleTaskResponse(BaseModel):
    task_code: str
    task_name: str
    task_type: str
    lottery_code: str = "dlt"
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
    next_run_at: str | None = None
    last_run_at: str | None = None
    last_run_status: str | None = None
    last_error_message: str | None = None
    last_task_id: str | None = None
    rule_summary: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


class ScheduleTaskListResponse(BaseModel):
    tasks: list[ScheduleTaskResponse] = Field(default_factory=list)
