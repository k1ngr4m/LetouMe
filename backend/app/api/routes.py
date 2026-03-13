from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.app.auth import (
    AuthService,
    clear_session_cookie,
    get_auth_service,
    require_admin_user,
    require_current_user,
    set_session_cookie,
)
from backend.app.schemas.auth import (
    CurrentUserResponse,
    LoginPayload,
    RegisterPayload,
    ResetPasswordPayload,
    UserCreatePayload,
    UserListResponse,
    UserUpdatePayload,
)
from backend.app.schemas.history import PredictionsHistoryListResponse
from backend.app.schemas.model_settings import (
    ModelListResponse,
    ModelResponse,
    ModelSettingsPayload,
    ProviderListResponse,
)
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
from backend.app.services.lottery_service import LotteryService
from backend.app.services.model_service import ModelService
from backend.app.services.prediction_service import PredictionService


router = APIRouter(prefix="/api")
lottery_service = LotteryService()
prediction_service = PredictionService()
model_service = ModelService()


@router.post("/auth/login", response_model=CurrentUserResponse)
def login(
    payload: LoginPayload,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        user, session_token = auth_service.login(
            payload.username,
            payload.password,
            user_agent=request.headers.get("user-agent", ""),
            ip_address=request.client.host if request.client else "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    set_session_cookie(response, session_token, auth_service.settings)
    return {"user": user}


@router.post("/auth/register", response_model=CurrentUserResponse)
def register(
    payload: RegisterPayload,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        user, session_token = auth_service.register(
            payload.username,
            payload.password,
            user_agent=request.headers.get("user-agent", ""),
            ip_address=request.client.host if request.client else "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    set_session_cookie(response, session_token, auth_service.settings)
    return {"user": user}


@router.post("/auth/logout", response_model=CurrentUserResponse)
def logout(
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    auth_service.logout(request.cookies.get(auth_service.settings.auth_session_cookie_name))
    clear_session_cookie(response, auth_service.settings)
    return {"user": None}


@router.post("/auth/me", response_model=CurrentUserResponse)
def get_current_auth_user(current_user: dict = Depends(require_current_user)) -> dict:
    return {"user": current_user}


@router.post("/lottery/history", response_model=LotteryHistoryResponse)
def get_lottery_history(payload: PaginationPayload, _: dict = Depends(require_current_user)) -> dict:
    return lottery_service.get_history_payload(limit=payload.limit, offset=payload.offset)


@router.post("/predictions/current", response_model=CurrentPredictionsResponse)
def get_current_predictions(_: dict = Depends(require_current_user)) -> dict:
    return prediction_service.get_current_payload()


@router.post("/predictions/history/list", response_model=PredictionsHistoryListResponse)
def get_predictions_history_list(payload: PaginationPayload, _: dict = Depends(require_current_user)) -> dict:
    return prediction_service.get_history_list_payload(limit=payload.limit, offset=payload.offset)


@router.post("/predictions/history/detail", response_model=PredictionsHistoryResponse)
def get_predictions_history_detail(payload: PredictionHistoryDetailPayload, _: dict = Depends(require_current_user)) -> dict:
    record = prediction_service.get_history_detail_payload(payload.target_period)
    if not record:
        raise HTTPException(status_code=404, detail="历史记录不存在")
    return record


@router.post("/settings/models/list", response_model=ModelListResponse)
def get_settings_models(payload: ModelListPayload, _: dict = Depends(require_admin_user)) -> dict:
    return {"models": model_service.list_models(include_deleted=payload.include_deleted)}


@router.post("/settings/model/detail", response_model=ModelResponse)
def get_settings_model(payload: ModelCodePayload, _: dict = Depends(require_admin_user)) -> dict:
    model = model_service.get_model(payload.model_code)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    return model


@router.post("/settings/models/create", response_model=ModelResponse)
def create_settings_model(payload: ModelSettingsPayload, _: dict = Depends(require_admin_user)) -> dict:
    try:
        return model_service.create_model(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/update", response_model=ModelResponse)
def update_settings_model(payload: ModelUpdatePayload, _: dict = Depends(require_admin_user)) -> dict:
    try:
        return model_service.update_model(payload.model_code, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/status", response_model=ModelResponse)
def update_settings_model_status(payload: ModelStatusUpdatePayload, _: dict = Depends(require_admin_user)) -> dict:
    try:
        return model_service.set_model_active(payload.model_code, payload.is_active)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/models/delete", response_model=ModelResponse)
def delete_settings_model(payload: ModelCodePayload, _: dict = Depends(require_admin_user)) -> dict:
    try:
        return model_service.delete_model(payload.model_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/models/restore", response_model=ModelResponse)
def restore_settings_model(payload: ModelCodePayload, _: dict = Depends(require_admin_user)) -> dict:
    try:
        return model_service.restore_model(payload.model_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/providers/list", response_model=ProviderListResponse)
def get_settings_providers(_: dict = Depends(require_current_user)) -> dict:
    return {"providers": model_service.list_providers()}


@router.post("/admin/users/list", response_model=UserListResponse)
def list_users(_: dict = Depends(require_admin_user), auth_service: AuthService = Depends(get_auth_service)) -> dict:
    return {"users": auth_service.list_users()}


@router.post("/admin/users/create", response_model=CurrentUserResponse)
def create_user(
    payload: UserCreatePayload,
    _: dict = Depends(require_admin_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        return {"user": auth_service.create_user(payload.model_dump())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/users/update", response_model=CurrentUserResponse)
def update_user(
    payload: UserUpdatePayload,
    _: dict = Depends(require_admin_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        return {"user": auth_service.update_user(payload.user_id, payload.model_dump())}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="用户不存在") from exc


@router.post("/admin/users/reset-password", response_model=CurrentUserResponse)
def reset_user_password(
    payload: ResetPasswordPayload,
    _: dict = Depends(require_admin_user),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        return {"user": auth_service.reset_password(payload.user_id, payload.password)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="用户不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
