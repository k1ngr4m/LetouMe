from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app.schemas.history import PredictionsHistoryListResponse
from backend.app.schemas.requests import (
    ModelCodePayload,
    ModelListPayload,
    ModelStatusUpdatePayload,
    ModelUpdatePayload,
    PaginationPayload,
    PredictionHistoryDetailPayload,
)
from backend.app.schemas.responses import (
    CurrentPredictionsResponse,
    LotteryHistoryResponse,
    PredictionsHistoryResponse,
)
from backend.app.schemas.model_settings import (
    ModelListResponse,
    ModelResponse,
    ModelSettingsPayload,
    ProviderListResponse,
)
from backend.app.services.lottery_service import LotteryService
from backend.app.services.model_service import ModelService
from backend.app.services.prediction_service import PredictionService


router = APIRouter(prefix="/api")
lottery_service = LotteryService()
prediction_service = PredictionService()
model_service = ModelService()


@router.post("/lottery/history", response_model=LotteryHistoryResponse)
def get_lottery_history(payload: PaginationPayload) -> dict:
    return lottery_service.get_history_payload(limit=payload.limit, offset=payload.offset)


@router.post("/predictions/current", response_model=CurrentPredictionsResponse)
def get_current_predictions() -> dict:
    return prediction_service.get_current_payload()


@router.post("/predictions/history/list", response_model=PredictionsHistoryListResponse)
def get_predictions_history_list(payload: PaginationPayload) -> dict:
    return prediction_service.get_history_list_payload(limit=payload.limit, offset=payload.offset)


@router.post("/predictions/history/detail", response_model=PredictionsHistoryResponse)
def get_predictions_history_detail(payload: PredictionHistoryDetailPayload) -> dict:
    record = prediction_service.get_history_detail_payload(payload.target_period)
    if not record:
        raise HTTPException(status_code=404, detail="历史记录不存在")
    return record


@router.post("/settings/models/list", response_model=ModelListResponse)
def get_settings_models(payload: ModelListPayload) -> dict:
    return {"models": model_service.list_models(include_deleted=payload.include_deleted)}


@router.post("/settings/model/detail", response_model=ModelResponse)
def get_settings_model(payload: ModelCodePayload) -> dict:
    model = model_service.get_model(payload.model_code)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    return model


@router.post("/settings/models/create", response_model=ModelResponse)
def create_settings_model(payload: ModelSettingsPayload) -> dict:
    try:
        return model_service.create_model(payload.dict())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/update", response_model=ModelResponse)
def update_settings_model(payload: ModelUpdatePayload) -> dict:
    try:
        return model_service.update_model(payload.model_code, payload.dict())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/status", response_model=ModelResponse)
def update_settings_model_status(payload: ModelStatusUpdatePayload) -> dict:
    try:
        return model_service.set_model_active(payload.model_code, payload.is_active)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/models/delete", response_model=ModelResponse)
def delete_settings_model(payload: ModelCodePayload) -> dict:
    try:
        return model_service.delete_model(payload.model_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/models/restore", response_model=ModelResponse)
def restore_settings_model(payload: ModelCodePayload) -> dict:
    try:
        return model_service.restore_model(payload.model_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/providers/list", response_model=ProviderListResponse)
def get_settings_providers() -> dict:
    return {"providers": model_service.list_providers()}
