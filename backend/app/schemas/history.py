from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ScoreSnapshot(BaseModel):
    target_period: str = ""
    prediction_date: str = ""
    bet_count: int = 0
    winning_bet_count: int = 0
    cost_amount: int = 0
    prize_amount: int = 0
    net_profit: int = 0
    roi: float = 0
    best_hit_count: int = 0


class ScoreWindowProfile(BaseModel):
    overall_score: int = 0
    per_bet_score: int = 0
    per_period_score: int = 0
    profit_score: int = 0
    hit_score: int = 0
    stability_score: int = 0
    ceiling_score: int = 0
    floor_score: int = 0
    periods: int = 0
    bets: int = 0
    hit_rate_by_period: float = 0
    hit_rate_by_bet: float = 0
    roi: float = 0
    avg_period_roi: float = 0
    best_period: ScoreSnapshot = Field(default_factory=ScoreSnapshot)
    worst_period: ScoreSnapshot = Field(default_factory=ScoreSnapshot)


class ScoreProfile(BaseModel):
    overall_score: int = 0
    per_bet_score: int = 0
    per_period_score: int = 0
    recent_score: int = 0
    long_term_score: int = 0
    component_scores: dict[str, int] = Field(default_factory=dict)
    recent_window: ScoreWindowProfile = Field(default_factory=ScoreWindowProfile)
    long_term_window: ScoreWindowProfile = Field(default_factory=ScoreWindowProfile)
    best_period_snapshot: ScoreSnapshot = Field(default_factory=ScoreSnapshot)
    worst_period_snapshot: ScoreSnapshot = Field(default_factory=ScoreSnapshot)
    sample_size_periods: int = 0
    sample_size_bets: int = 0


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
    score_profile: ScoreProfile = Field(default_factory=ScoreProfile)


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
    score_profile: ScoreProfile = Field(default_factory=ScoreProfile)


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
