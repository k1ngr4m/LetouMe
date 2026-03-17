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
    bet_count: int = 0
    cost_amount: int = 0
    winning_bet_count: int = 0
    prize_amount: int = 0
    hit_period_win: bool = False
    win_rate_by_period: float | None = None
    win_rate_by_bet: float | None = None


class PredictionHistoryPeriodSummary(BaseModel):
    total_bet_count: int = 0
    total_cost_amount: int = 0
    total_prize_amount: int = 0


class PredictionHistoryModelStat(BaseModel):
    model_id: str
    model_name: str
    periods: int = 0
    winning_periods: int = 0
    bet_count: int = 0
    winning_bet_count: int = 0
    cost_amount: int = 0
    prize_amount: int = 0
    win_rate_by_period: float = 0
    win_rate_by_bet: float = 0


class PredictionHistorySummaryRecord(BaseModel):
    prediction_date: str
    target_period: str
    actual_result: dict[str, Any] | None = None
    models: list[PredictionHistorySummaryModel] = Field(default_factory=list)
    period_summary: PredictionHistoryPeriodSummary = Field(default_factory=PredictionHistoryPeriodSummary)


class PredictionsHistoryListResponse(BaseModel):
    predictions_history: list[PredictionHistorySummaryRecord] = Field(default_factory=list)
    total_count: int = 0
    model_stats: list[PredictionHistoryModelStat] = Field(default_factory=list)
