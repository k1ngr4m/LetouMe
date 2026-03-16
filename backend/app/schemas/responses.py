from __future__ import annotations

from typing import Any

from pydantic import BaseModel


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
