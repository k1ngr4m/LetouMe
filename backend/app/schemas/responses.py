from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class LotteryHistoryResponse(BaseModel):
    lottery_code: str = "dlt"
    last_updated: int
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


class PredictionBacktestSummaryResponse(BaseModel):
    lottery_code: str = "dlt"
    recent_period_count: int | None = None
    overview: dict[str, Any] = Field(default_factory=dict)
    model_rankings: list[dict[str, Any]] = Field(default_factory=list)
    periods: list[dict[str, Any]] = Field(default_factory=list)
    strategy_breakdown: list[dict[str, Any]] = Field(default_factory=list)
    strategy_options: list[str] = Field(default_factory=list)


class PredictionGenerationTaskResponse(BaseModel):
    lottery_code: str = "dlt"
    task_id: str
    status: str
    mode: str
    model_code: str
    created_at: int
    started_at: int | None = None
    finished_at: int | None = None
    progress_summary: dict[str, Any]
    error_message: str | None = None


class LotteryFetchTaskResponse(BaseModel):
    lottery_code: str = "dlt"
    task_id: str
    status: str
    created_at: int
    started_at: int | None = None
    finished_at: int | None = None
    progress_summary: dict[str, Any]
    error_message: str | None = None


class MaintenanceRunLogItemResponse(BaseModel):
    id: int
    task_id: str
    schedule_task_code: str | None = None
    lottery_code: str = "dlt"
    trigger_type: str = "manual"
    task_type: str = "lottery_fetch"
    mode: str | None = None
    model_code: str | None = None
    status: str
    started_at: int | None = None
    finished_at: int | None = None
    fetched_count: int = 0
    saved_count: int = 0
    processed_count: int = 0
    skipped_count: int = 0
    failed_count: int = 0
    latest_period: str | None = None
    duration_ms: float = 0
    error_message: str | None = None
    created_at: int | None = None
    updated_at: int | None = None


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
    direct_hundreds_dan: list[str] = Field(default_factory=list)
    direct_hundreds_tuo: list[str] = Field(default_factory=list)
    direct_tens_dan: list[str] = Field(default_factory=list)
    direct_tens_tuo: list[str] = Field(default_factory=list)
    direct_units_dan: list[str] = Field(default_factory=list)
    direct_units_tuo: list[str] = Field(default_factory=list)
    group_numbers: list[str] = Field(default_factory=list)
    sum_values: list[str] = Field(default_factory=list)
    position_selections: list[list[str]] = Field(default_factory=list)
    bet_count: int = 0
    amount: int = 0
    created_at: int


class SimulationTicketListResponse(BaseModel):
    tickets: list[SimulationTicketRecordResponse] = Field(default_factory=list)


class SimulationTicketCreateResponse(BaseModel):
    ticket: SimulationTicketRecordResponse


class SimulationTicketQuoteResponse(BaseModel):
    lottery_code: str = "dlt"
    play_type: str = "dlt"
    bet_count: int = 0
    amount: int = 0


class WorldCupOddsSnapshotResponse(BaseModel):
    play_type: str
    play_label: str
    odds: dict[str, str] = Field(default_factory=dict)
    goal_line: str | None = None
    single_status: str | None = None
    sell_status: str | None = None
    source: str | None = None
    source_updated_at: int | None = None
    fetched_at: int | None = None


class WorldCupMatchResponse(BaseModel):
    match_id: str
    sporttery_match_id: str | None = None
    match_num_str: str | None = None
    home_team: str
    away_team: str
    kickoff_at: int
    stage: str
    status: str = "scheduled"
    score: str | None = None
    sell_status: str | None = None
    latest_odds: dict[str, str] = Field(default_factory=dict)
    odds_snapshots: list[WorldCupOddsSnapshotResponse] = Field(default_factory=list)
    odds_fetched_at: int | None = None
    recommendation_count: int = 0


class WorldCupRecommendationResponse(BaseModel):
    recommendation_id: str
    match: WorldCupMatchResponse
    play_type: str
    selection: str
    model_code: str | None = None
    model_name: str | None = None
    odds_value: str | None = None
    implied_probability: float | None = None
    confidence_score: float | None = None
    confidence_level: str = "medium"
    risk_level: str = "medium"
    budget_min: int = 0
    budget_max: int = 0
    reason: str
    latest_odds: dict[str, str] = Field(default_factory=dict)
    odds_fetched_at: int | None = None
    model_sources: list[str] = Field(default_factory=list)
    risk_tags: list[str] = Field(default_factory=list)
    is_favorite: bool = False
    compliance_notice: str
    updated_at: int
    created_at: int


class WorldCupMatchListResponse(BaseModel):
    matches: list[WorldCupMatchResponse] = Field(default_factory=list)
    total_count: int = 0


class WorldCupRecommendationListResponse(BaseModel):
    recommendations: list[WorldCupRecommendationResponse] = Field(default_factory=list)
    total_count: int = 0
    compliance_notice: str


class WorldCupRecommendationDetailResponse(BaseModel):
    recommendation: WorldCupRecommendationResponse


class WorldCupBaiduAnalysisResponse(BaseModel):
    match_id: str
    match: WorldCupMatchResponse
    analysis: dict[str, Any] = Field(default_factory=dict)


class WorldCupFavoriteResponse(BaseModel):
    recommendation_id: str
    is_favorite: bool


class WorldCupSimulationDraftResponse(BaseModel):
    recommendation_id: str
    match_id: str
    title: str
    checklist: str
    amount: int
    ticket_id: int | None = None
    compliance_notice: str


class WorldCupSimulationTicketItemResponse(BaseModel):
    id: int
    match: WorldCupMatchResponse
    recommendation_id: str | None = None
    play_type: str
    selection: str
    odds_value: str | None = None
    odds_snapshot: dict[str, str] = Field(default_factory=dict)
    confidence_level: str | None = None
    amount: int = 0


class WorldCupSimulationTicketResponse(BaseModel):
    id: int
    title: str
    status: str
    total_amount: int = 0
    multiplier: int = 1
    note: str | None = None
    source_recommendation_id: str | None = None
    items: list[WorldCupSimulationTicketItemResponse] = Field(default_factory=list)
    created_at: int
    updated_at: int
    compliance_notice: str


class WorldCupSimulationTicketListResponse(BaseModel):
    tickets: list[WorldCupSimulationTicketResponse] = Field(default_factory=list)
    total_count: int = 0
    compliance_notice: str


class WorldCupSimulationTicketCreateResponse(BaseModel):
    ticket: WorldCupSimulationTicketResponse


class WorldCupHistoryRecommendationResponse(BaseModel):
    recommendation: WorldCupRecommendationResponse
    result_status: str
    hit: bool | None = None
    actual_result: str | None = None
    settlement_note: str


class WorldCupHistoryMatchResponse(BaseModel):
    match: WorldCupMatchResponse
    recommendations: list[WorldCupHistoryRecommendationResponse] = Field(default_factory=list)


class WorldCupHistoryResponse(BaseModel):
    records: list[WorldCupHistoryMatchResponse] = Field(default_factory=list)
    total_count: int = 0
    compliance_notice: str


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
    direct_hundreds_dan: list[str] = Field(default_factory=list)
    direct_hundreds_tuo: list[str] = Field(default_factory=list)
    direct_tens_dan: list[str] = Field(default_factory=list)
    direct_tens_tuo: list[str] = Field(default_factory=list)
    direct_units_dan: list[str] = Field(default_factory=list)
    direct_units_tuo: list[str] = Field(default_factory=list)
    group_numbers: list[str] = Field(default_factory=list)
    sum_values: list[str] = Field(default_factory=list)
    position_selections: list[list[str]] = Field(default_factory=list)
    multiplier: int = 1
    is_append: bool = False
    bet_count: int = 0
    amount: int = 0
    discount_amount: int = 0
    net_amount: int = 0
    settlement_status: str = "pending"
    winning_bet_count: int = 0
    prize_level: str | None = None
    prize_amount: int | float = 0
    net_profit: int | float = 0
    settled_at: int | None = None
    source_type: str = "manual"
    ticket_image_url: str = ""
    ocr_text: str = ""
    ocr_provider: str | None = None
    ocr_recognized_at: int | None = None
    ticket_purchased_at: int | None = None
    actual_result: dict[str, Any] | None = None
    lines: list[dict[str, Any]] = Field(default_factory=list)
    created_at: int
    updated_at: int


class MyBetSummaryResponse(BaseModel):
    total_count: int = 0
    total_amount: int = 0
    total_discount_amount: int = 0
    total_net_amount: int = 0
    total_prize_amount: int | float = 0
    total_net_profit: int | float = 0
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
    ocr_recognized_at: int | None = None
    ticket_purchased_at: int | None = None
    lines: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SiteMessageResponse(BaseModel):
    id: int
    lottery_code: str = "dlt"
    target_period: str
    my_bet_record_id: int
    message_type: str = "bet_settlement"
    title: str
    content: str
    snapshot: dict[str, Any] | None = None
    is_read: bool = False
    read_at: int | None = None
    created_at: int


class SiteMessageListResponse(BaseModel):
    messages: list[SiteMessageResponse] = Field(default_factory=list)
    total_count: int = 0


class SiteMessageUnreadCountResponse(BaseModel):
    unread_count: int = 0


class AssistantChatResponse(BaseModel):
    conversation_id: str
    answer: str
    context_summary: str = ""
    model_code: str = ""
    messages: list[dict[str, Any]] = Field(default_factory=list)


class AssistantModelListResponse(BaseModel):
    models: list[dict[str, Any]] = Field(default_factory=list)


class AssistantConversationListResponse(BaseModel):
    conversations: list[dict[str, Any]] = Field(default_factory=list)
    total_count: int = 0


class AssistantConversationDetailResponse(BaseModel):
    conversation: dict[str, Any]
    messages: list[dict[str, Any]] = Field(default_factory=list)


class SuccessResponse(BaseModel):
    success: bool = True


class ScheduleTaskResponse(BaseModel):
    task_code: str
    task_name: str
    task_type: str
    lottery_code: str = "dlt"
    fetch_limit: int = 30
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
    next_run_at: int | None = None
    last_run_at: int | None = None
    last_run_status: str | None = None
    last_error_message: str | None = None
    last_task_id: str | None = None
    rule_summary: str | None = None
    created_at: int | None = None
    updated_at: int | None = None


class ScheduleTaskListResponse(BaseModel):
    tasks: list[ScheduleTaskResponse] = Field(default_factory=list)
