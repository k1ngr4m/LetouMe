from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.app.auth import (
    AuthService,
    clear_session_cookie,
    get_auth_service,
    require_basic_profile_permission,
    require_current_user,
    require_model_management_permission,
    require_role_management_permission,
    require_user_management_permission,
    set_session_cookie,
)
from backend.app.schemas.auth import (
    CurrentUserResponse,
    LoginPayload,
    PermissionListResponse,
    RoleListResponse,
    RegisterPayload,
    ResetPasswordPayload,
    RoleResponse,
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
    GenerateModelPredictionsPayload,
    ModelCodePayload,
    ModelListPayload,
    ModelStatusUpdatePayload,
    ModelUpdatePayload,
    PasswordChangePayload,
    PaginationPayload,
    PermissionUpdatePayload,
    PredictionGenerationTaskPayload,
    ProfileUpdatePayload,
    PredictionHistoryDetailPayload,
    SettingsPredictionRecordDetailPayload,
    RoleCodePayload,
    RolePayload,
)
from backend.app.schemas.responses import (
    CurrentPredictionsResponse,
    LotteryHistoryResponse,
    PredictionGenerationTaskResponse,
    PredictionsHistoryResponse,
    SettingsPredictionRecordDetailResponse,
    SettingsPredictionRecordListResponse,
)
from backend.app.services.lottery_service import LotteryService
from backend.app.services.model_service import ModelService
from backend.app.services.prediction_generation_service import PredictionGenerationService
from backend.app.services.prediction_generation_task_service import prediction_generation_task_service
from backend.app.services.prediction_service import PredictionService


router = APIRouter(prefix="/api")
lottery_service = LotteryService()
prediction_service = PredictionService()
model_service = ModelService()
prediction_generation_service = PredictionGenerationService()


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
    return {"predictions_history": [record], "total_count": 1}


@router.post("/settings/profile/update", response_model=CurrentUserResponse)
def update_profile(
    payload: ProfileUpdatePayload,
    current_user: dict = Depends(require_basic_profile_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        return {"user": auth_service.update_profile(int(current_user["id"]), payload.nickname)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/profile/password", response_model=CurrentUserResponse)
def change_profile_password(
    payload: PasswordChangePayload,
    current_user: dict = Depends(require_basic_profile_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        auth_service.change_password(int(current_user["id"]), payload.current_password, payload.new_password)
        return {"user": None}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="用户不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/list", response_model=ModelListResponse)
def get_settings_models(payload: ModelListPayload, _: dict = Depends(require_model_management_permission)) -> dict:
    return {"models": model_service.list_models(include_deleted=payload.include_deleted)}


@router.post("/settings/model/detail", response_model=ModelResponse)
def get_settings_model(payload: ModelCodePayload, _: dict = Depends(require_model_management_permission)) -> dict:
    model = model_service.get_model(payload.model_code)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    return model


@router.post("/settings/models/create", response_model=ModelResponse)
def create_settings_model(payload: ModelSettingsPayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        return model_service.create_model(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/update", response_model=ModelResponse)
def update_settings_model(payload: ModelUpdatePayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        return model_service.update_model(payload.model_code, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/status", response_model=ModelResponse)
def update_settings_model_status(payload: ModelStatusUpdatePayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        return model_service.set_model_active(payload.model_code, payload.is_active)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/models/delete", response_model=ModelResponse)
def delete_settings_model(payload: ModelCodePayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        return model_service.delete_model(payload.model_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/models/restore", response_model=ModelResponse)
def restore_settings_model(payload: ModelCodePayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        return model_service.restore_model(payload.model_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc


@router.post("/settings/providers/list", response_model=ProviderListResponse)
def get_settings_providers(_: dict = Depends(require_model_management_permission)) -> dict:
    return {"providers": model_service.list_providers()}


@router.post("/settings/models/predictions/generate", response_model=PredictionGenerationTaskResponse)
def generate_model_predictions(
    payload: GenerateModelPredictionsPayload,
    _: dict = Depends(require_model_management_permission),
) -> dict:
    mode = payload.mode.strip().lower()
    if mode not in {"current", "history"}:
        raise HTTPException(status_code=400, detail="不支持的生成模式")
    if mode == "history" and (not payload.start_period or not payload.end_period):
        raise HTTPException(status_code=400, detail="历史重算必须提供开始期号和结束期号")

    try:
        prediction_generation_service.validate_model(payload.model_code)
        task = prediction_generation_task_service.create_task(
            mode=mode,
            model_code=payload.model_code,
            worker=lambda progress_callback: prediction_generation_service.generate_current_for_model(
                model_code=payload.model_code,
                overwrite=payload.overwrite,
                progress_callback=progress_callback,
            )
            if mode == "current"
            else prediction_generation_service.recalculate_history_for_model(
                model_code=payload.model_code,
                start_period=str(payload.start_period or ""),
                end_period=str(payload.end_period or ""),
                overwrite=payload.overwrite,
                progress_callback=progress_callback,
            ),
        )
        return task
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/predictions/task-detail", response_model=PredictionGenerationTaskResponse)
def get_model_prediction_generation_task(
    payload: PredictionGenerationTaskPayload,
    _: dict = Depends(require_model_management_permission),
) -> dict:
    task = prediction_generation_task_service.get_task(payload.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.post("/settings/predictions/records/list", response_model=SettingsPredictionRecordListResponse)
def get_settings_prediction_records(_: dict = Depends(require_model_management_permission)) -> dict:
    return prediction_service.get_settings_record_list_payload()


@router.post("/settings/predictions/records/detail", response_model=SettingsPredictionRecordDetailResponse)
def get_settings_prediction_record_detail(
    payload: SettingsPredictionRecordDetailPayload,
    _: dict = Depends(require_model_management_permission),
) -> dict:
    try:
        record = prediction_service.get_settings_record_detail_payload(payload.record_type, payload.target_period)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not record:
        raise HTTPException(status_code=404, detail="预测记录不存在")
    return record


@router.post("/admin/users/list", response_model=UserListResponse)
def list_users(_: dict = Depends(require_user_management_permission), auth_service: AuthService = Depends(get_auth_service)) -> dict:
    return {"users": auth_service.list_users()}


@router.post("/admin/users/create", response_model=CurrentUserResponse)
def create_user(
    payload: UserCreatePayload,
    _: dict = Depends(require_user_management_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        return {"user": auth_service.create_user(payload.model_dump())}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/users/update", response_model=CurrentUserResponse)
def update_user(
    payload: UserUpdatePayload,
    _: dict = Depends(require_user_management_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        return {"user": auth_service.update_user(payload.user_id, payload.model_dump())}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="用户不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/users/reset-password", response_model=CurrentUserResponse)
def reset_user_password(
    payload: ResetPasswordPayload,
    _: dict = Depends(require_user_management_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        return {"user": auth_service.reset_password(payload.user_id, payload.password)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="用户不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/roles/list", response_model=RoleListResponse)
def list_roles(_: dict = Depends(require_role_management_permission), auth_service: AuthService = Depends(get_auth_service)) -> dict:
    return {"roles": auth_service.list_roles()}


@router.post("/admin/roles/permissions", response_model=PermissionListResponse)
def list_permissions(
    _: dict = Depends(require_role_management_permission),
    auth_service: AuthService = Depends(get_auth_service),
    ) -> dict:
    return {"permissions": auth_service.list_permissions()}


@router.post("/admin/roles/permissions/update", response_model=PermissionListResponse)
def update_permission(
    payload: PermissionUpdatePayload,
    _: dict = Depends(require_role_management_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        auth_service.update_permission(payload.permission_code, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="权限不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"permissions": auth_service.list_permissions()}


@router.post("/admin/roles/create", response_model=RoleResponse)
def create_role(
    payload: RolePayload,
    _: dict = Depends(require_role_management_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        return auth_service.create_role(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/roles/update", response_model=RoleResponse)
def update_role(
    payload: RolePayload,
    _: dict = Depends(require_role_management_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        return auth_service.update_role(payload.role_code, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="角色不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/admin/roles/delete", response_model=RoleResponse)
def delete_role(
    payload: RoleCodePayload,
    _: dict = Depends(require_role_management_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    role = next((item for item in auth_service.list_roles() if item["role_code"] == payload.role_code), None)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    try:
        auth_service.delete_role(payload.role_code)
        return role
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
