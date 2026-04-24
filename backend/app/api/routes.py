from __future__ import annotations

from datetime import datetime, time, timedelta
from pathlib import Path
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import RedirectResponse

from backend.app.auth import (
    AuthService,
    clear_session_cookie,
    get_auth_service,
    require_basic_profile_permission,
    require_current_user,
    require_expert_management_permission,
    require_model_management_permission,
    require_role_management_permission,
    require_schedule_management_permission,
    require_super_admin,
    require_user_management_permission,
    set_session_cookie,
)
from backend.app.schemas.auth import (
    CurrentUserResponse,
    ForgotPasswordResetPayload,
    ForgotPasswordSendCodePayload,
    LoginPayload,
    OAuthStartResponse,
    PermissionListResponse,
    RoleListResponse,
    RegisterPayload,
    RegisterSendCodePayload,
    ResetPasswordPayload,
    RoleResponse,
    UserCreatePayload,
    UserListResponse,
    UserUpdatePayload,
)
from backend.app.schemas.history import PredictionsHistoryListResponse
from backend.app.schemas.model_settings import (
    ModelConnectivityTestResponse,
    ModelListResponse,
    ModelResponse,
    ModelSettingsPayload,
    ProviderModelDiscoveryResponse,
    ProviderListResponse,
)
from backend.app.schemas.requests import (
    BulkGenerateModelPredictionsPayload,
    BulkModelActionPayload,
    GenerateModelPredictionsPayload,
    MessageDeletePayload,
    MessageListPayload,
    MessageReadAllPayload,
    MessageReadPayload,
    ModelCodePayload,
    ModelConnectivityTestPayload,
    MyBetRecordDeletePayload,
    MyBetRecordListPayload,
    MyBetRecordPayload,
    MyBetRecordUpdatePayload,
    ModelListPayload,
    ModelStatusUpdatePayload,
    ExpertCodePayload,
    ExpertCurrentDetailPayload,
    ExpertListPayload,
    ExpertPredictionRunStartPayload,
    ExpertPredictionTaskPayload,
    ExpertSettingsPayload,
    ExpertStatusUpdatePayload,
    ExpertUpdatePayload,
    ModelUpdatePayload,
    ProviderCodePayload,
    ProviderCreatePayload,
    ProviderModelDiscoveryPayload,
    ProviderUpdatePayload,
    LotteryFetchTaskPayload,
    MaintenanceRunLogListPayload,
    PasswordChangePayload,
    PaginationPayload,
    PermissionUpdatePayload,
    PredictionGenerationTaskPayload,
    PredictionsHistoryListPayload,
    ProfileUpdatePayload,
    PredictionHistoryDetailPayload,
    SmartPredictionRunIdPayload,
    SmartPredictionRunListPayload,
    SmartPredictionRunStartPayload,
    SmartPredictionStage2StartPayload,
    ScheduleTaskCodePayload,
    ScheduleRunLogListPayload,
    ScheduleTaskPayload,
    ScheduleTaskStatusPayload,
    ScheduleTaskUpdatePayload,
    SettingsPredictionRecordDetailPayload,
    SimulationTicketDeletePayload,
    SimulationTicketQuotePayload,
    SimulationTicketListPayload,
    SimulationTicketPayload,
    RoleCodePayload,
    RolePayload,
)
from backend.app.schemas.responses import (
    BulkModelActionResponse,
    CurrentPredictionsResponse,
    MaintenanceRunLogListResponse,
    LotteryFetchTaskResponse,
    LotteryHistoryResponse,
    MyBetRecordCreateResponse,
    MyBetRecordListResponse,
    MyBetOCRDraftResponse,
    MyBetOCRImageUploadResponse,
    MyBetRecordUpdateResponse,
    PredictionGenerationTaskResponse,
    ExpertCurrentDetailResponse,
    ExpertListResponse,
    ExpertResponse,
    ExpertPredictionTaskResponse,
    ExpertPublicListResponse,
    PredictionsHistoryResponse,
    ScheduleTaskListResponse,
    ScheduleTaskResponse,
    SiteMessageListResponse,
    SiteMessageUnreadCountResponse,
    SettingsPredictionRecordDetailResponse,
    SettingsPredictionRecordListResponse,
    SmartPredictionRunListResponse,
    SmartPredictionRunResponse,
    SimulationTicketCreateResponse,
    SimulationTicketQuoteResponse,
    SimulationTicketListResponse,
    SuccessResponse,
)
from backend.app.lotteries import normalize_lottery_code
from backend.app.rbac import MODEL_MANAGEMENT_PERMISSION, SCHEDULE_MANAGEMENT_PERMISSION
from backend.app.services.lottery_service import LotteryService
from backend.app.services.lottery_fetch_task_service import lottery_fetch_task_service
from backend.app.services.model_service import ModelService
from backend.app.services.expert_service import ExpertService
from backend.app.services.expert_prediction_service import expert_prediction_service
from backend.app.services.expert_prediction_task_service import expert_prediction_task_service
from backend.app.services.prediction_generation_service import PredictionGenerationService
from backend.app.services.prediction_generation_task_service import prediction_generation_task_service
from backend.app.services.prediction_service import PredictionService
from backend.app.services.schedule_service import schedule_service
from backend.app.services.message_service import MessageService
from backend.app.services.my_bet_service import MyBetService
from backend.app.services.simulation_ticket_service import SimulationTicketService
from backend.app.services.smart_prediction_service import smart_prediction_service
from backend.app.services.ticket_ocr_service import TicketOCRService


router = APIRouter(prefix="/api")
lottery_service = LotteryService()
prediction_service = PredictionService()
model_service = ModelService()
expert_service = ExpertService()
prediction_generation_service = PredictionGenerationService()
simulation_ticket_service = SimulationTicketService()
my_bet_service = MyBetService()
message_service = MessageService()
profile_avatar_service = TicketOCRService()

PROFILE_AVATAR_MAX_SIZE_BYTES = 4 * 1024 * 1024 + 512 * 1024
PROFILE_AVATAR_ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}
PROFILE_AVATAR_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
BEIJING_TZ = ZoneInfo("Asia/Shanghai")


def _validate_profile_avatar_upload(*, image: UploadFile, image_bytes: bytes) -> str:
    if not image_bytes:
        raise ValueError("图片不能为空")
    if len(image_bytes) > PROFILE_AVATAR_MAX_SIZE_BYTES:
        raise ValueError("头像图片大小不能超过 4.5MB")
    filename = str(image.filename or "avatar.jpg")
    extension = Path(filename).suffix.lower()
    if extension not in PROFILE_AVATAR_ALLOWED_EXTENSIONS:
        raise ValueError("头像仅支持 JPG、PNG 格式")
    content_type = (image.content_type or "").split(";", 1)[0].strip().lower()
    if content_type and content_type not in PROFILE_AVATAR_ALLOWED_CONTENT_TYPES:
        raise ValueError("头像仅支持 JPG、PNG 格式")
    return filename


def _build_oauth_callback_frontend_url(
    *,
    frontend_origin: str,
    provider: str,
    status: str,
    message: str | None = None,
) -> str:
    normalized_origin = frontend_origin.rstrip("/")
    params: dict[str, str] = {"status": status}
    if message:
        params["message"] = message
    return f"{normalized_origin}/auth/callback/{provider}?{urlencode(params)}"


@router.post("/auth/login", response_model=CurrentUserResponse)
def login(
    payload: LoginPayload,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        user, session_token = auth_service.login(
            payload.identifier,
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
            payload.email,
            payload.password,
            payload.code,
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


@router.post("/auth/register/send-code", response_model=SuccessResponse)
def send_register_code(
    payload: RegisterSendCodePayload,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        auth_service.send_registration_code(payload.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"success": True}


@router.post("/auth/forgot-password/send-code", response_model=SuccessResponse)
def send_forgot_password_code(
    payload: ForgotPasswordSendCodePayload,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        auth_service.send_password_reset_code(payload.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"success": True}


@router.post("/auth/forgot-password/reset", response_model=SuccessResponse)
def reset_password_by_email_code(
    payload: ForgotPasswordResetPayload,
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        auth_service.reset_password_by_email_code(payload.email, payload.code, payload.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True}


@router.get("/auth/oauth/{provider}/start", response_model=OAuthStartResponse)
def oauth_provider_start(provider: str, auth_service: AuthService = Depends(get_auth_service)) -> dict:
    try:
        return auth_service.get_oauth_provider_start(provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/auth/oauth/{provider}/callback")
def oauth_provider_callback(
    provider: str,
    request: Request,
    auth_service: AuthService = Depends(get_auth_service),
    code: str | None = None,
    state: str | None = None,
):
    normalized_provider = provider.strip().lower()
    if normalized_provider not in {"google", "github"}:
        raise HTTPException(status_code=400, detail="不支持的 OAuth Provider")

    if not code or not state:
        return RedirectResponse(
            _build_oauth_callback_frontend_url(
                frontend_origin=auth_service.settings.frontend_origin,
                provider=normalized_provider,
                status="error",
                message="缺少 OAuth 参数",
            ),
            status_code=302,
        )

    try:
        _, session_token = auth_service.complete_oauth_login(
            normalized_provider,
            code=code,
            state=state,
            user_agent=request.headers.get("user-agent", ""),
            ip_address=request.client.host if request.client else "",
        )
    except (ValueError, RuntimeError) as exc:
        return RedirectResponse(
            _build_oauth_callback_frontend_url(
                frontend_origin=auth_service.settings.frontend_origin,
                provider=normalized_provider,
                status="error",
                message=str(exc),
            ),
            status_code=302,
        )

    redirect = RedirectResponse(
        _build_oauth_callback_frontend_url(
            frontend_origin=auth_service.settings.frontend_origin,
            provider=normalized_provider,
            status="success",
            message="登录成功",
        ),
        status_code=302,
    )
    set_session_cookie(redirect, session_token, auth_service.settings)
    return redirect


@router.post("/lottery/history", response_model=LotteryHistoryResponse)
def get_lottery_history(payload: PaginationPayload, _: dict = Depends(require_current_user)) -> dict:
    return lottery_service.get_history_payload(limit=payload.limit, offset=payload.offset, lottery_code=payload.lottery_code)


@router.post("/predictions/current", response_model=CurrentPredictionsResponse)
def get_current_predictions(payload: PaginationPayload, _: dict = Depends(require_current_user)) -> dict:
    return prediction_service.get_current_payload(lottery_code=payload.lottery_code, include_inactive_models=False)


@router.post("/predictions/history/list", response_model=PredictionsHistoryListResponse)
def get_predictions_history_list(payload: PredictionsHistoryListPayload, _: dict = Depends(require_current_user)) -> dict:
    return prediction_service.get_history_list_payload(
        limit=payload.limit,
        offset=payload.offset,
        lottery_code=payload.lottery_code,
        strategy_filters=payload.strategy_filters,
        play_type_filters=payload.play_type_filters,
        strategy_match_mode=payload.strategy_match_mode,
        include_inactive_models=False,
    )


@router.post("/predictions/history/detail", response_model=PredictionsHistoryResponse)
def get_predictions_history_detail(payload: PredictionHistoryDetailPayload, _: dict = Depends(require_current_user)) -> dict:
    record = prediction_service.get_history_detail_payload(
        payload.target_period,
        lottery_code=payload.lottery_code,
        include_inactive_models=False,
    )
    if not record:
        raise HTTPException(status_code=404, detail="历史记录不存在")
    score_profiles = prediction_service._build_score_profiles([record])
    return {"predictions_history": [record], "total_count": 1, "model_stats": prediction_service._build_model_stats([record], score_profiles)}


@router.post("/experts/list", response_model=ExpertPublicListResponse)
def list_public_experts(payload: PaginationPayload, _: dict = Depends(require_current_user)) -> dict:
    return expert_prediction_service.list_current_experts(lottery_code=payload.lottery_code)


@router.post("/experts/current/detail", response_model=ExpertCurrentDetailResponse)
def get_public_expert_current_detail(payload: ExpertCurrentDetailPayload, _: dict = Depends(require_current_user)) -> dict:
    detail = expert_prediction_service.get_current_expert_detail(
        lottery_code=payload.lottery_code,
        expert_code=payload.expert_code,
    )
    if not detail:
        raise HTTPException(status_code=404, detail="专家当期方案不存在")
    return detail


@router.post("/predictions/smart/run/start", response_model=SmartPredictionRunResponse)
def start_smart_prediction_run(payload: SmartPredictionRunStartPayload, current_user: dict = Depends(require_super_admin)) -> dict:
    try:
        return smart_prediction_service.start_run(int(current_user["id"]), payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/predictions/smart/run/detail", response_model=SmartPredictionRunResponse)
def get_smart_prediction_run_detail(payload: SmartPredictionRunIdPayload, _: dict = Depends(require_super_admin)) -> dict:
    run = smart_prediction_service.get_run(payload.run_id)
    if not run:
        raise HTTPException(status_code=404, detail="智能预测运行记录不存在")
    return run


@router.post("/predictions/smart/run/cancel", response_model=SmartPredictionRunResponse)
def cancel_smart_prediction_run(payload: SmartPredictionRunIdPayload, _: dict = Depends(require_super_admin)) -> dict:
    try:
        return smart_prediction_service.cancel_run(payload.run_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="智能预测运行记录不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/predictions/smart/run/stage2/start", response_model=SmartPredictionRunResponse)
def start_smart_prediction_stage2(payload: SmartPredictionStage2StartPayload, _: dict = Depends(require_super_admin)) -> dict:
    try:
        return smart_prediction_service.start_stage2(
            payload.run_id,
            stage2_model_code=payload.stage2_model_code,
            force_rerun=payload.force_rerun,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="智能预测运行记录不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/predictions/smart/history/list", response_model=SmartPredictionRunListResponse)
def list_smart_prediction_runs(payload: SmartPredictionRunListPayload, _: dict = Depends(require_super_admin)) -> dict:
    return smart_prediction_service.list_runs(limit=payload.limit, offset=payload.offset)


@router.post("/predictions/smart/history/detail", response_model=SmartPredictionRunResponse)
def get_smart_prediction_history_detail(payload: SmartPredictionRunIdPayload, _: dict = Depends(require_super_admin)) -> dict:
    run = smart_prediction_service.get_run(payload.run_id)
    if not run:
        raise HTTPException(status_code=404, detail="智能预测运行记录不存在")
    return run


@router.post("/simulation/tickets/list", response_model=SimulationTicketListResponse)
def get_simulation_tickets(payload: SimulationTicketListPayload, current_user: dict = Depends(require_current_user)) -> dict:
    return {"tickets": simulation_ticket_service.list_tickets(int(current_user["id"]), lottery_code=payload.lottery_code)}


@router.post("/simulation/tickets/create", response_model=SimulationTicketCreateResponse)
def create_simulation_ticket(payload: SimulationTicketPayload, current_user: dict = Depends(require_current_user)) -> dict:
    try:
        ticket = simulation_ticket_service.create_ticket(int(current_user["id"]), payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ticket": ticket}


@router.post("/simulation/tickets/quote", response_model=SimulationTicketQuoteResponse)
def quote_simulation_ticket(payload: SimulationTicketQuotePayload, _: dict = Depends(require_current_user)) -> dict:
    return simulation_ticket_service.quote_ticket(payload.model_dump())


@router.post("/simulation/tickets/delete", response_model=SuccessResponse)
def delete_simulation_ticket(payload: SimulationTicketDeletePayload, current_user: dict = Depends(require_current_user)) -> dict:
    try:
        simulation_ticket_service.delete_ticket(int(current_user["id"]), payload.ticket_id, lottery_code=payload.lottery_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="方案不存在") from exc
    return {"success": True}


@router.post("/my-bets/list", response_model=MyBetRecordListResponse)
def list_my_bets(payload: MyBetRecordListPayload, current_user: dict = Depends(require_current_user)) -> dict:
    return my_bet_service.list_records(int(current_user["id"]), lottery_code=payload.lottery_code)


@router.post("/my-bets/create", response_model=MyBetRecordCreateResponse)
def create_my_bet(payload: MyBetRecordPayload, current_user: dict = Depends(require_current_user)) -> dict:
    try:
        record = my_bet_service.create_record(int(current_user["id"]), payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"record": record}


@router.post("/my-bets/ocr/recognize", response_model=MyBetOCRDraftResponse)
async def recognize_my_bet_ocr(
    lottery_code: str = Form(default="dlt"),
    image: UploadFile = File(...),
    _: dict = Depends(require_current_user),
) -> dict:
    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise ValueError("图片不能为空")
        if len(image_bytes) > 8 * 1024 * 1024:
            raise ValueError("图片大小不能超过 8MB")
        filename = str(image.filename or "ticket.jpg")
        return my_bet_service.recognize_ticket_image(
            lottery_code=lottery_code,
            image_bytes=image_bytes,
            filename=filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/my-bets/ocr/upload-image", response_model=MyBetOCRImageUploadResponse)
async def upload_my_bet_ocr_image(
    lottery_code: str = Form(default="dlt"),
    image: UploadFile = File(...),
    _: dict = Depends(require_current_user),
) -> dict:
    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise ValueError("图片不能为空")
        if len(image_bytes) > 8 * 1024 * 1024:
            raise ValueError("图片大小不能超过 8MB")
        filename = str(image.filename or "ticket.jpg")
        return my_bet_service.upload_ticket_image(
            lottery_code=lottery_code,
            image_bytes=image_bytes,
            filename=filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/my-bets/update", response_model=MyBetRecordUpdateResponse)
def update_my_bet(payload: MyBetRecordUpdatePayload, current_user: dict = Depends(require_current_user)) -> dict:
    try:
        record = my_bet_service.update_record(int(current_user["id"]), payload.record_id, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="投注记录不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"record": record}


@router.post("/my-bets/delete", response_model=SuccessResponse)
def delete_my_bet(payload: MyBetRecordDeletePayload, current_user: dict = Depends(require_current_user)) -> dict:
    try:
        my_bet_service.delete_record(int(current_user["id"]), payload.record_id, lottery_code=payload.lottery_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="投注记录不存在") from exc
    return {"success": True}


@router.post("/messages/list", response_model=SiteMessageListResponse)
def list_messages(payload: MessageListPayload, current_user: dict = Depends(require_current_user)) -> dict:
    return message_service.list_messages(
        user_id=int(current_user["id"]),
        lottery_code=payload.lottery_code,
        status_filter=payload.status_filter,
        result_filter=payload.result_filter,
        keyword=payload.keyword,
        date_start=payload.date_start,
        date_end=payload.date_end,
        limit=payload.limit,
        offset=payload.offset,
    )


@router.post("/messages/unread-count", response_model=SiteMessageUnreadCountResponse)
def get_message_unread_count(payload: MessageReadAllPayload, current_user: dict = Depends(require_current_user)) -> dict:
    return message_service.get_unread_count(user_id=int(current_user["id"]), lottery_code=payload.lottery_code)


@router.post("/messages/read", response_model=SuccessResponse)
def mark_message_read(payload: MessageReadPayload, current_user: dict = Depends(require_current_user)) -> dict:
    try:
        message_service.mark_read(user_id=int(current_user["id"]), message_id=payload.message_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="消息不存在") from exc
    return {"success": True}


@router.post("/messages/read-all", response_model=SuccessResponse)
def mark_all_messages_read(payload: MessageReadAllPayload, current_user: dict = Depends(require_current_user)) -> dict:
    message_service.mark_all_read(user_id=int(current_user["id"]), lottery_code=payload.lottery_code)
    return {"success": True}


@router.post("/messages/delete", response_model=SuccessResponse)
def delete_message(payload: MessageDeletePayload, current_user: dict = Depends(require_current_user)) -> dict:
    try:
        message_service.delete_message(user_id=int(current_user["id"]), message_id=payload.message_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="消息不存在") from exc
    return {"success": True}


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


@router.post("/settings/profile/avatar/upload", response_model=CurrentUserResponse)
async def upload_profile_avatar(
    image: UploadFile = File(...),
    current_user: dict = Depends(require_basic_profile_permission),
    auth_service: AuthService = Depends(get_auth_service),
) -> dict:
    try:
        image_bytes = await image.read()
        filename = _validate_profile_avatar_upload(image=image, image_bytes=image_bytes)
        avatar_url = profile_avatar_service.upload_profile_avatar(image_bytes=image_bytes, filename=filename)
        return {"user": auth_service.update_profile_avatar(int(current_user["id"]), avatar_url)}
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
def get_settings_models(payload: ModelListPayload, current_user: dict = Depends(require_current_user)) -> dict:
    permissions = set(current_user.get("permissions") or [])
    if MODEL_MANAGEMENT_PERMISSION not in permissions and SCHEDULE_MANAGEMENT_PERMISSION not in permissions:
        raise HTTPException(status_code=403, detail="没有权限")
    models = model_service.list_models(include_deleted=payload.include_deleted)
    return {"models": models}


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
        return model_service.update_model(payload.original_model_code, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/connectivity-test", response_model=ModelConnectivityTestResponse)
def test_settings_model_connectivity(payload: ModelConnectivityTestPayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        return model_service.test_model_connectivity(payload.model_dump())
    except Exception as exc:
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


@router.post("/settings/experts/list", response_model=ExpertListResponse)
def list_settings_experts(payload: ExpertListPayload, _: dict = Depends(require_expert_management_permission)) -> dict:
    return {
        "experts": expert_service.list_experts(
            include_deleted=payload.include_deleted,
            lottery_code=payload.lottery_code,
        )
    }


@router.post("/settings/experts/detail", response_model=ExpertResponse)
def get_settings_expert(payload: ExpertCodePayload, _: dict = Depends(require_expert_management_permission)) -> dict:
    expert = expert_service.get_expert(payload.expert_code)
    if not expert:
        raise HTTPException(status_code=404, detail="专家不存在")
    return expert


@router.post("/settings/experts/create", response_model=ExpertResponse)
def create_settings_expert(payload: ExpertSettingsPayload, _: dict = Depends(require_expert_management_permission)) -> dict:
    try:
        return expert_service.create_expert(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/experts/update", response_model=ExpertResponse)
def update_settings_expert(payload: ExpertUpdatePayload, _: dict = Depends(require_expert_management_permission)) -> dict:
    try:
        return expert_service.update_expert(payload.original_expert_code, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="专家不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/experts/status", response_model=ExpertResponse)
def update_settings_expert_status(payload: ExpertStatusUpdatePayload, _: dict = Depends(require_expert_management_permission)) -> dict:
    try:
        return expert_service.set_expert_active(payload.expert_code, payload.is_active)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="专家不存在") from exc


@router.post("/settings/experts/delete", response_model=ExpertResponse)
def delete_settings_expert(payload: ExpertCodePayload, _: dict = Depends(require_expert_management_permission)) -> dict:
    try:
        return expert_service.delete_expert(payload.expert_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="专家不存在") from exc


@router.post("/settings/experts/restore", response_model=ExpertResponse)
def restore_settings_expert(payload: ExpertCodePayload, _: dict = Depends(require_expert_management_permission)) -> dict:
    try:
        return expert_service.restore_expert(payload.expert_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="专家不存在") from exc


@router.post("/settings/experts/predictions/run/start", response_model=ExpertPredictionTaskResponse)
def start_settings_expert_prediction_run(
    payload: ExpertPredictionRunStartPayload,
    _: dict = Depends(require_expert_management_permission),
) -> dict:
    try:
        lottery_code = normalize_lottery_code(payload.lottery_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return expert_prediction_task_service.create_task(
        lottery_code=lottery_code,
        worker=lambda progress_callback: expert_prediction_service.generate_current_for_all(
            lottery_code=lottery_code,
            progress_callback=progress_callback,
        ),
    )


@router.post("/settings/experts/predictions/task-detail", response_model=ExpertPredictionTaskResponse)
def get_settings_expert_prediction_task(
    payload: ExpertPredictionTaskPayload,
    _: dict = Depends(require_expert_management_permission),
) -> dict:
    task = expert_prediction_task_service.get_task(payload.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.post("/settings/providers/list", response_model=ProviderListResponse)
def get_settings_providers(_: dict = Depends(require_model_management_permission)) -> dict:
    return {"providers": model_service.list_providers()}


@router.post("/settings/providers/detail")
def get_settings_provider(payload: ProviderCodePayload, _: dict = Depends(require_model_management_permission)) -> dict:
    provider = model_service.get_provider(payload.provider_code)
    if not provider:
        raise HTTPException(status_code=404, detail="供应商不存在")
    return provider


@router.post("/settings/providers/models/discover", response_model=ProviderModelDiscoveryResponse)
def discover_settings_provider_models(payload: ProviderModelDiscoveryPayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        return model_service.discover_provider_models(payload.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/providers/create")
def create_settings_provider(payload: ProviderCreatePayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        return model_service.create_provider(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/providers/update")
def update_settings_provider(payload: ProviderUpdatePayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        return model_service.update_provider(payload.provider_code, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="供应商不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/providers/delete", response_model=SuccessResponse)
def delete_settings_provider(payload: ProviderCodePayload, _: dict = Depends(require_model_management_permission)) -> dict:
    try:
        model_service.delete_provider(payload.provider_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="供应商不存在") from exc
    return {"success": True}


@router.post("/settings/lottery/fetch", response_model=LotteryFetchTaskResponse)
def fetch_settings_lottery_history(payload: PaginationPayload, _: dict = Depends(require_super_admin)) -> dict:
    return lottery_fetch_task_service.create_task(payload.lottery_code, limit=payload.limit or 30)


@router.post("/settings/lottery/fetch/task-detail", response_model=LotteryFetchTaskResponse)
def get_settings_lottery_fetch_task(
    payload: LotteryFetchTaskPayload,
    _: dict = Depends(require_super_admin),
) -> dict:
    task = lottery_fetch_task_service.get_task(payload.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.post("/settings/lottery/fetch/logs", response_model=MaintenanceRunLogListResponse)
def list_settings_lottery_fetch_logs(
    payload: MaintenanceRunLogListPayload,
    _: dict = Depends(require_super_admin),
) -> dict:
    normalized_code = normalize_lottery_code(payload.lottery_code) if payload.lottery_code else None
    return lottery_fetch_task_service.list_logs(
        lottery_code=normalized_code,
        limit=payload.limit,
        offset=payload.offset,
    )


@router.post("/settings/schedules/list", response_model=ScheduleTaskListResponse)
def list_schedule_tasks(_: dict = Depends(require_schedule_management_permission)) -> dict:
    return {"tasks": schedule_service.list_tasks()}


@router.post("/settings/schedules/logs", response_model=MaintenanceRunLogListResponse)
def list_schedule_run_logs(
    payload: ScheduleRunLogListPayload,
    _: dict = Depends(require_schedule_management_permission),
) -> dict:
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=400, detail="结束日期不能早于开始日期")
    start_at = datetime.combine(payload.start_date, time.min, tzinfo=BEIJING_TZ)
    end_at = datetime.combine(payload.end_date + timedelta(days=1), time.min, tzinfo=BEIJING_TZ)
    return schedule_service.list_run_logs(
        schedule_task_codes=payload.task_codes,
        created_at_from=int(start_at.timestamp()),
        created_at_to=int(end_at.timestamp()),
        limit=payload.limit,
    )


@router.post("/settings/schedules/create", response_model=ScheduleTaskResponse)
def create_schedule_task(payload: ScheduleTaskPayload, _: dict = Depends(require_schedule_management_permission)) -> dict:
    try:
        return schedule_service.create_task(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/schedules/update", response_model=ScheduleTaskResponse)
def update_schedule_task(payload: ScheduleTaskUpdatePayload, _: dict = Depends(require_schedule_management_permission)) -> dict:
    try:
        return schedule_service.update_task(payload.task_code, payload.model_dump())
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="定时任务不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/schedules/status", response_model=ScheduleTaskResponse)
def update_schedule_task_status(payload: ScheduleTaskStatusPayload, _: dict = Depends(require_schedule_management_permission)) -> dict:
    try:
        return schedule_service.set_task_active(payload.task_code, payload.is_active)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="定时任务不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/schedules/delete", response_model=SuccessResponse)
def delete_schedule_task(payload: ScheduleTaskCodePayload, _: dict = Depends(require_schedule_management_permission)) -> dict:
    try:
        schedule_service.delete_task(payload.task_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="定时任务不存在") from exc
    return {"success": True}


@router.post("/settings/schedules/run-now", response_model=ScheduleTaskResponse)
def run_schedule_task_now(payload: ScheduleTaskCodePayload, _: dict = Depends(require_schedule_management_permission)) -> dict:
    try:
        return schedule_service.run_task_now(payload.task_code)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="定时任务不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/predictions/generate", response_model=PredictionGenerationTaskResponse)
def generate_model_predictions(
    payload: GenerateModelPredictionsPayload,
    _: dict = Depends(require_model_management_permission),
) -> dict:
    try:
        lottery_code = normalize_lottery_code(payload.lottery_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    mode = payload.mode.strip().lower()
    prediction_play_mode = payload.prediction_play_mode.strip().lower()
    if mode not in {"current", "history"}:
        raise HTTPException(status_code=400, detail="不支持的生成模式")
    if mode == "history" and not payload.recent_period_count and (not payload.start_period or not payload.end_period):
        raise HTTPException(status_code=400, detail="历史重算必须提供开始期号和结束期号，或选择最近期数")

    try:
        prediction_generation_service.validate_model(payload.model_code, lottery_code=lottery_code)
        task = prediction_generation_task_service.create_task(
            lottery_code=lottery_code,
            mode=mode,
            model_code=payload.model_code,
            worker=lambda progress_callback: prediction_generation_service.generate_current_for_model(
                lottery_code=lottery_code,
                model_code=payload.model_code,
                prediction_play_mode=prediction_play_mode,
                prompt_history_period_count=payload.prompt_history_period_count,
                overwrite=payload.overwrite,
                progress_callback=progress_callback,
            )
            if mode == "current"
            else prediction_generation_service.recalculate_history_for_model(
                lottery_code=lottery_code,
                model_code=payload.model_code,
                prediction_play_mode=prediction_play_mode,
                prompt_history_period_count=payload.prompt_history_period_count,
                start_period=str(payload.start_period or ""),
                end_period=str(payload.end_period or ""),
                recent_period_count=payload.recent_period_count,
                overwrite=payload.overwrite,
                parallelism=payload.parallelism,
                progress_callback=progress_callback,
            ),
        )
        return task
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="模型不存在") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/bulk-action", response_model=BulkModelActionResponse)
def bulk_action_settings_models(
    payload: BulkModelActionPayload,
    _: dict = Depends(require_model_management_permission),
) -> dict:
    try:
        return model_service.bulk_action(payload.model_codes, payload.action.strip().lower(), payload.updates or {})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/models/predictions/bulk-generate", response_model=PredictionGenerationTaskResponse)
def bulk_generate_model_predictions(
    payload: BulkGenerateModelPredictionsPayload,
    _: dict = Depends(require_model_management_permission),
) -> dict:
    try:
        lottery_code = normalize_lottery_code(payload.lottery_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    mode = payload.mode.strip().lower()
    prediction_play_mode = payload.prediction_play_mode.strip().lower()
    if mode not in {"current", "history"}:
        raise HTTPException(status_code=400, detail="不支持的生成模式")
    if mode == "history" and not payload.recent_period_count and (not payload.start_period or not payload.end_period):
        raise HTTPException(status_code=400, detail="历史重算必须提供开始期号和结束期号，或选择最近期数")

    try:
        return prediction_generation_task_service.create_task(
            lottery_code=lottery_code,
            mode=mode,
            model_code="__bulk__",
            worker=lambda progress_callback: prediction_generation_service.generate_for_models(
                lottery_code=lottery_code,
                model_codes=payload.model_codes,
                mode=mode,
                prediction_play_mode=prediction_play_mode,
                prompt_history_period_count=payload.prompt_history_period_count,
                overwrite=payload.overwrite,
                parallelism=payload.parallelism,
                start_period=payload.start_period,
                end_period=payload.end_period,
                recent_period_count=payload.recent_period_count,
                progress_callback=progress_callback,
            ),
        )
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
def get_settings_prediction_records(payload: PaginationPayload, _: dict = Depends(require_model_management_permission)) -> dict:
    return prediction_service.get_settings_record_list_payload(lottery_code=payload.lottery_code)


@router.post("/settings/predictions/records/detail", response_model=SettingsPredictionRecordDetailResponse)
def get_settings_prediction_record_detail(
    payload: SettingsPredictionRecordDetailPayload,
    _: dict = Depends(require_model_management_permission),
) -> dict:
    try:
        record = prediction_service.get_settings_record_detail_payload(payload.record_type, payload.target_period, lottery_code=payload.lottery_code)
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
