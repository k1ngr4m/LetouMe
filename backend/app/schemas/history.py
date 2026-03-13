from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PredictionHistorySummaryModel(BaseModel):
    model_id: str
    model_name: str
    model_provider: str
    model_version: str | None = None
    model_api_model: str | None = None
    best_group: int | None = None
    best_hit_count: int | None = None


class PredictionHistorySummaryRecord(BaseModel):
    prediction_date: str
    target_period: str
    actual_result: dict[str, Any] | None = None
    models: list[PredictionHistorySummaryModel] = Field(default_factory=list)


class PredictionsHistoryListResponse(BaseModel):
    predictions_history: list[PredictionHistorySummaryRecord] = Field(default_factory=list)
    total_count: int = 0
