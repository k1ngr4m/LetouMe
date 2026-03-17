from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LotteryHistoryResponse(BaseModel):
    last_updated: str
    data: list[dict[str, Any]]
    next_draw: dict[str, Any] | None = None
    total_count: int = 0


class CurrentPredictionsResponse(BaseModel):
    prediction_date: str
    target_period: str
    models: list[dict[str, Any]]


class PredictionsHistoryResponse(BaseModel):
    predictions_history: list[dict[str, Any]]
    total_count: int = 0
    model_stats: list[dict[str, Any]] = Field(default_factory=list)


class PredictionGenerationTaskResponse(BaseModel):
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
    task_id: str
    status: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    progress_summary: dict[str, Any]
    error_message: str | None = None


class BulkModelActionResponse(BaseModel):
    selected_count: int = 0
    processed_count: int = 0
    skipped_count: int = 0
    failed_count: int = 0
    processed_models: list[str] = Field(default_factory=list)
    skipped_models: list[str] = Field(default_factory=list)
    failed_models: list[str] = Field(default_factory=list)


class SettingsPredictionRecordSummaryResponse(BaseModel):
    record_type: str
    target_period: str
    prediction_date: str
    actual_result: dict[str, Any] | None = None
    model_count: int = 0
    status_label: str


class SettingsPredictionRecordListResponse(BaseModel):
    records: list[SettingsPredictionRecordSummaryResponse]


class SettingsPredictionRecordDetailResponse(BaseModel):
    record_type: str
    prediction_date: str
    target_period: str
    actual_result: dict[str, Any] | None = None
    models: list[dict[str, Any]]
    model_stats: list[dict[str, Any]] = Field(default_factory=list)
