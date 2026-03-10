from __future__ import annotations

from fastapi import APIRouter

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
def get_lottery_history() -> dict:
    return lottery_service.get_history_payload()


@router.get("/predictions/current", response_model=CurrentPredictionsResponse)
def get_current_predictions() -> dict:
    return prediction_service.get_current_payload()


@router.get("/predictions/history", response_model=PredictionsHistoryResponse)
def get_predictions_history() -> dict:
    return prediction_service.get_history_payload()
