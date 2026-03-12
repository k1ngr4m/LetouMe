from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.app.schemas.responses import (
    CurrentPredictionsResponse,
    LotteryHistoryResponse,
    PredictionsHistoryResponse,
)
from backend.app.schemas.model_settings import (
    ModelListResponse,
    ModelResponse,
    ModelSettingsPayload,
    ModelStatusPayload,
    ProviderListResponse,
)
from backend.app.services.lottery_service import LotteryService
from backend.app.services.model_service import ModelService
from backend.app.services.prediction_service import PredictionService


router = APIRouter(prefix="/api")
lottery_service = LotteryService()
prediction_service = PredictionService()
model_service = ModelService()


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


@router.get("/settings/models", response_model=ModelListResponse)
def get_settings_models(include_deleted: bool = Query(default=False)) -> dict:
    return {"models": model_service.list_models(include_deleted=include_deleted)}


@router.get("/settings/models/{model_code}", response_model=ModelResponse)
def get_settings_model(model_code: str) -> dict:
    model = model_service.get_model(model_code)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    return model


@router.post("/settings/models", response_model=ModelResponse)
def create_settings_model(payload: ModelSettingsPayload) -> dict:
    try:
        return model_service.create_model(payload.dict())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/settings/models/{model_code}", response_model=ModelResponse)
def update_settings_model(model_code: str, payload: ModelSettingsPayload) -> dict:
    try:
        return model_service.update_model(model_code, payload.dict())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/settings/models/{model_code}/status", response_model=ModelResponse)
def update_settings_model_status(model_code: str, payload: ModelStatusPayload) -> dict:
    try:
        return model_service.set_model_active(model_code, payload.is_active)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.delete("/settings/models/{model_code}", response_model=ModelResponse)
def delete_settings_model(model_code: str) -> dict:
    try:
        return model_service.delete_model(model_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/models/{model_code}/restore", response_model=ModelResponse)
def restore_settings_model(model_code: str) -> dict:
    try:
        return model_service.restore_model(model_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.get("/settings/providers", response_model=ProviderListResponse)
def get_settings_providers() -> dict:
    return {"providers": model_service.list_providers()}
