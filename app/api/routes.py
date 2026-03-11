from __future__ import annotations

from fastapi import APIRouter, Query

from app.schemas.responses import (
    CurrentPredictionsResponse,
    LotteryHistoryResponse,
    PredictionsHistoryResponse,
)
from app.services.lottery_service import LotteryService
from app.services.prediction_service import PredictionService


router = APIRouter(prefix="/api")
lottery_service = LotteryService()
prediction_service = PredictionService()


@router.get("/lottery/history", response_model=LotteryHistoryResponse)
def get_lottery_history(
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return lottery_service.get_history_payload(limit=limit, offset=offset)


@router.get("/predictions/current", response_model=CurrentPredictionsResponse)
def get_current_predictions() -> dict:
    return prediction_service.get_current_payload()


@router.get("/predictions/history", response_model=PredictionsHistoryResponse)
def get_predictions_history(
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict:
    return prediction_service.get_history_payload(limit=limit, offset=offset)
