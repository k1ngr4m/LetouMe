import type {
  AdminUserCreatePayload,
  AdminUserResetPasswordPayload,
  AdminUserUpdatePayload,
  BulkGenerateSettingsModelPredictionsPayload,
  BulkModelActionResult,
  BulkSettingsModelActionPayload,
  CurrentUserResponse,
  CurrentPredictionsResponse,
  GenerateSettingsModelPredictionsPayload,
  LoginPayload,
  MyBetRecordCreateResponse,
  MyBetOCRDraftResponse,
  MyBetOCRImageUploadResponse,
  MyBetRecordListResponse,
  MyBetRecordPayload,
  MyBetRecordUpdatePayload,
  MyBetRecordUpdateResponse,
  LotteryHistoryResponse,
  LotteryFetchTask,
  MaintenanceRunLogListResponse,
  PasswordChangePayload,
  PermissionListResponse,
  PermissionUpdatePayload,
  PredictionsHistoryListResponse,
  PredictionsHistoryResponse,
  ProfileUpdatePayload,
  RoleItem,
  RoleListResponse,
  RolePayload,
  ScheduleTask,
  ScheduleTaskListResponse,
  ScheduleTaskPayload,
  PredictionGenerationTask,
  SettingsPredictionRecordDetail,
  SettingsPredictionRecordListResponse,
  SettingsModel,
  SettingsModelConnectivityTestPayload,
  SettingsModelConnectivityTestResponse,
  SettingsModelListResponse,
  SettingsModelPayload,
  SettingsProvider,
  SettingsProviderListResponse,
  SettingsProviderPayload,
  SimulationTicketCreateResponse,
  SimulationTicketQuoteResponse,
  SimulationTicketListResponse,
  SimulationTicketPayload,
  SuccessResponse,
  UserListResponse,
  RegisterPayload,
  LotteryCode,
} from '../types/api'
import { appLogger, sanitizeForLog } from '../lib/logger'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function buildUrl(path: string) {
  const base = /^https?:\/\//.test(API_BASE_URL) ? `${API_BASE_URL}/` : window.location.origin
  return /^https?:\/\//.test(API_BASE_URL)
    ? new URL(path, base)
    : new URL(`${API_BASE_URL}${path}`, base)
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const startedAt = performance.now()
  const headers = new Headers(init?.headers || {})
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const method = init?.method || 'GET'
  let requestPayload: unknown = undefined
  if (typeof init?.body === 'string') {
    try {
      requestPayload = JSON.parse(init.body)
    } catch {
      requestPayload = init.body
    }
  }
  appLogger.debug('API request started', { method, path, payload: sanitizeForLog(requestPayload) })

  const response = await fetch(buildUrl(path).toString(), {
    credentials: 'include',
    headers,
    ...init,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : '请求失败'
    appLogger.error('API request failed', {
      method,
      path,
      status: response.status,
      duration_ms: Number((performance.now() - startedAt).toFixed(2)),
      detail,
    })
    throw new Error(typeof detail === 'string' ? detail : '请求失败')
  }
  appLogger.info('API request completed', {
    method,
    path,
    status: response.status,
    duration_ms: Number((performance.now() - startedAt).toFixed(2)),
  })
  return data as T
}

async function requestFormData<T>(path: string, formData: FormData): Promise<T> {
  const startedAt = performance.now()
  appLogger.debug('API request started', { method: 'POST', path, payload: '[form-data]' })
  const response = await fetch(buildUrl(path).toString(), {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : '请求失败'
    appLogger.error('API request failed', {
      method: 'POST',
      path,
      status: response.status,
      duration_ms: Number((performance.now() - startedAt).toFixed(2)),
      detail,
    })
    throw new Error(typeof detail === 'string' ? detail : '请求失败')
  }
  appLogger.info('API request completed', {
    method: 'POST',
    path,
    status: response.status,
    duration_ms: Number((performance.now() - startedAt).toFixed(2)),
  })
  return data as T
}

export const apiClient = {
  login(payload: LoginPayload) {
    return requestJson<CurrentUserResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  register(payload: RegisterPayload) {
    return requestJson<CurrentUserResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  logout() {
    return requestJson<CurrentUserResponse>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  getCurrentUser() {
    return requestJson<CurrentUserResponse>('/api/auth/me', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  updateProfile(payload: ProfileUpdatePayload) {
    return requestJson<CurrentUserResponse>('/api/settings/profile/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  changePassword(payload: PasswordChangePayload) {
    return requestJson<CurrentUserResponse>('/api/settings/profile/password', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  getLotteryHistory(payload?: { lottery_code?: LotteryCode; limit?: number; offset?: number }) {
    return requestJson<LotteryHistoryResponse>('/api/lottery/history', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    })
  },
  getCurrentPredictions(lotteryCode: LotteryCode = 'dlt') {
    return requestJson<CurrentPredictionsResponse>('/api/predictions/current', {
      method: 'POST',
      body: JSON.stringify({ lottery_code: lotteryCode }),
    })
  },
  getPredictionsHistoryList(payload?: {
    lottery_code?: LotteryCode
    limit?: number
    offset?: number
    strategy_filters?: string[]
    play_type_filters?: Array<'direct' | 'direct_sum' | 'group3' | 'group6'>
    strategy_match_mode?: 'all'
  }) {
    return requestJson<PredictionsHistoryListResponse>('/api/predictions/history/list', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    })
  },
  getPredictionsHistoryDetail(targetPeriod: string, lotteryCode: LotteryCode = 'dlt') {
    return requestJson<PredictionsHistoryResponse>('/api/predictions/history/detail', {
      method: 'POST',
      body: JSON.stringify({ lottery_code: lotteryCode, target_period: targetPeriod }),
    })
  },
  getSimulationTickets(lotteryCode: LotteryCode = 'dlt') {
    return requestJson<SimulationTicketListResponse>('/api/simulation/tickets/list', {
      method: 'POST',
      body: JSON.stringify({ lottery_code: lotteryCode }),
    })
  },
  getMyBets(lotteryCode: LotteryCode = 'dlt') {
    return requestJson<MyBetRecordListResponse>('/api/my-bets/list', {
      method: 'POST',
      body: JSON.stringify({ lottery_code: lotteryCode }),
    })
  },
  createMyBet(payload: MyBetRecordPayload) {
    return requestJson<MyBetRecordCreateResponse>('/api/my-bets/create', {
      method: 'POST',
      body: JSON.stringify({
        lottery_code: payload.lottery_code || 'dlt',
        ...payload,
      }),
    })
  },
  updateMyBet(payload: MyBetRecordUpdatePayload) {
    return requestJson<MyBetRecordUpdateResponse>('/api/my-bets/update', {
      method: 'POST',
      body: JSON.stringify({
        lottery_code: payload.lottery_code || 'dlt',
        ...payload,
      }),
    })
  },
  deleteMyBet(recordId: number, lotteryCode: LotteryCode = 'dlt') {
    return requestJson<SuccessResponse>('/api/my-bets/delete', {
      method: 'POST',
      body: JSON.stringify({ record_id: recordId, lottery_code: lotteryCode }),
    })
  },
  recognizeMyBetByImage(lotteryCode: LotteryCode, image: File) {
    const formData = new FormData()
    formData.set('lottery_code', lotteryCode)
    formData.set('image', image)
    return requestFormData<MyBetOCRDraftResponse>('/api/my-bets/ocr/recognize', formData)
  },
  uploadMyBetOCRImage(lotteryCode: LotteryCode, image: File) {
    const formData = new FormData()
    formData.set('lottery_code', lotteryCode)
    formData.set('image', image)
    return requestFormData<MyBetOCRImageUploadResponse>('/api/my-bets/ocr/upload-image', formData)
  },
  createSimulationTicket(payload: SimulationTicketPayload) {
    return requestJson<SimulationTicketCreateResponse>('/api/simulation/tickets/create', {
      method: 'POST',
      body: JSON.stringify({ lottery_code: payload.lottery_code || 'dlt', ...payload }),
    })
  },
  quoteSimulationTicket(payload: SimulationTicketPayload) {
    return requestJson<SimulationTicketQuoteResponse>('/api/simulation/tickets/quote', {
      method: 'POST',
      body: JSON.stringify({ lottery_code: payload.lottery_code || 'dlt', ...payload }),
    })
  },
  deleteSimulationTicket(ticketId: number, lotteryCode: LotteryCode = 'dlt') {
    return requestJson<SuccessResponse>('/api/simulation/tickets/delete', {
      method: 'POST',
      body: JSON.stringify({ ticket_id: ticketId, lottery_code: lotteryCode }),
    })
  },
  getSettingsModels(includeDeleted = false, lotteryCode?: LotteryCode) {
    return requestJson<SettingsModelListResponse>('/api/settings/models/list', {
      method: 'POST',
      body: JSON.stringify({ include_deleted: includeDeleted, lottery_code: lotteryCode }),
    })
  },
  getSettingsModel(modelCode: string) {
    return requestJson<SettingsModel>('/api/settings/model/detail', {
      method: 'POST',
      body: JSON.stringify({ model_code: modelCode }),
    })
  },
  getSettingsProviders() {
    return requestJson<SettingsProviderListResponse>('/api/settings/providers/list', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  getSettingsProvider(providerCode: string) {
    return requestJson<SettingsProvider>('/api/settings/providers/detail', {
      method: 'POST',
      body: JSON.stringify({ provider_code: providerCode }),
    })
  },
  createSettingsProvider(payload: SettingsProviderPayload) {
    return requestJson<SettingsProvider>('/api/settings/providers/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateSettingsProvider(providerCode: string, payload: SettingsProviderPayload) {
    return requestJson<SettingsProvider>('/api/settings/providers/update', {
      method: 'POST',
      body: JSON.stringify({ ...payload, provider_code: providerCode }),
    })
  },
  deleteSettingsProvider(providerCode: string) {
    return requestJson<SuccessResponse>('/api/settings/providers/delete', {
      method: 'POST',
      body: JSON.stringify({ provider_code: providerCode }),
    })
  },
  fetchSettingsLotteryHistory(lotteryCode: LotteryCode = 'dlt') {
    return requestJson<LotteryFetchTask>('/api/settings/lottery/fetch', {
      method: 'POST',
      body: JSON.stringify({ lottery_code: lotteryCode }),
    })
  },
  getLotteryFetchTaskDetail(taskId: string) {
    return requestJson<LotteryFetchTask>('/api/settings/lottery/fetch/task-detail', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId }),
    })
  },
  listMaintenanceRunLogs(payload?: { lottery_code?: LotteryCode; limit?: number; offset?: number }) {
    return requestJson<MaintenanceRunLogListResponse>('/api/settings/lottery/fetch/logs', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    })
  },
  createSettingsModel(payload: SettingsModelPayload) {
    return requestJson<SettingsModel>('/api/settings/models/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateSettingsModel(modelCode: string, payload: SettingsModelPayload) {
    return requestJson<SettingsModel>('/api/settings/models/update', {
      method: 'POST',
      body: JSON.stringify({ ...payload, original_model_code: modelCode }),
    })
  },
  testSettingsModelConnectivity(payload: SettingsModelConnectivityTestPayload) {
    return requestJson<SettingsModelConnectivityTestResponse>('/api/settings/models/connectivity-test', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  toggleSettingsModel(modelCode: string, isActive: boolean) {
    return requestJson<SettingsModel>('/api/settings/models/status', {
      method: 'POST',
      body: JSON.stringify({ model_code: modelCode, is_active: isActive }),
    })
  },
  deleteSettingsModel(modelCode: string) {
    return requestJson<SettingsModel>('/api/settings/models/delete', {
      method: 'POST',
      body: JSON.stringify({ model_code: modelCode }),
    })
  },
  restoreSettingsModel(modelCode: string) {
    return requestJson<SettingsModel>('/api/settings/models/restore', {
      method: 'POST',
      body: JSON.stringify({ model_code: modelCode }),
    })
  },
  bulkUpdateSettingsModels(payload: BulkSettingsModelActionPayload) {
    return requestJson<BulkModelActionResult>('/api/settings/models/bulk-action', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  generateSettingsModelPredictions(payload: GenerateSettingsModelPredictionsPayload) {
    return requestJson<PredictionGenerationTask>('/api/settings/models/predictions/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  bulkGenerateSettingsModelPredictions(payload: BulkGenerateSettingsModelPredictionsPayload) {
    return requestJson<PredictionGenerationTask>('/api/settings/models/predictions/bulk-generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  getPredictionGenerationTaskDetail(taskId: string) {
    return requestJson<PredictionGenerationTask>('/api/settings/models/predictions/task-detail', {
      method: 'POST',
      body: JSON.stringify({ task_id: taskId }),
    })
  },
  getSettingsPredictionRecords(lotteryCode: LotteryCode = 'dlt') {
    return requestJson<SettingsPredictionRecordListResponse>('/api/settings/predictions/records/list', {
      method: 'POST',
      body: JSON.stringify({ lottery_code: lotteryCode }),
    })
  },
  getSettingsPredictionRecordDetail(recordType: 'current' | 'history', targetPeriod: string, lotteryCode: LotteryCode = 'dlt') {
    return requestJson<SettingsPredictionRecordDetail>('/api/settings/predictions/records/detail', {
      method: 'POST',
      body: JSON.stringify({ lottery_code: lotteryCode, record_type: recordType, target_period: targetPeriod }),
    })
  },
  listUsers() {
    return requestJson<UserListResponse>('/api/admin/users/list', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  createUser(payload: AdminUserCreatePayload) {
    return requestJson<CurrentUserResponse>('/api/admin/users/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateUser(payload: AdminUserUpdatePayload) {
    return requestJson<CurrentUserResponse>('/api/admin/users/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  resetUserPassword(payload: AdminUserResetPasswordPayload) {
    return requestJson<CurrentUserResponse>('/api/admin/users/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  listRoles() {
    return requestJson<RoleListResponse>('/api/admin/roles/list', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  listPermissions() {
    return requestJson<PermissionListResponse>('/api/admin/roles/permissions', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  updatePermission(payload: PermissionUpdatePayload) {
    return requestJson<PermissionListResponse>('/api/admin/roles/permissions/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  createRole(payload: RolePayload) {
    return requestJson<RoleItem>('/api/admin/roles/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateRole(payload: RolePayload) {
    return requestJson<RoleItem>('/api/admin/roles/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  deleteRole(roleCode: string) {
    return requestJson<RoleItem>('/api/admin/roles/delete', {
      method: 'POST',
      body: JSON.stringify({ role_code: roleCode }),
    })
  },
  listScheduleTasks() {
    return requestJson<ScheduleTaskListResponse>('/api/settings/schedules/list', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  createScheduleTask(payload: ScheduleTaskPayload) {
    return requestJson<ScheduleTask>('/api/settings/schedules/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateScheduleTask(taskCode: string, payload: ScheduleTaskPayload) {
    return requestJson<ScheduleTask>('/api/settings/schedules/update', {
      method: 'POST',
      body: JSON.stringify({ ...payload, task_code: taskCode }),
    })
  },
  toggleScheduleTask(taskCode: string, isActive: boolean) {
    return requestJson<ScheduleTask>('/api/settings/schedules/status', {
      method: 'POST',
      body: JSON.stringify({ task_code: taskCode, is_active: isActive }),
    })
  },
  deleteScheduleTask(taskCode: string) {
    return requestJson<SuccessResponse>('/api/settings/schedules/delete', {
      method: 'POST',
      body: JSON.stringify({ task_code: taskCode }),
    })
  },
  runScheduleTaskNow(taskCode: string) {
    return requestJson<ScheduleTask>('/api/settings/schedules/run-now', {
      method: 'POST',
      body: JSON.stringify({ task_code: taskCode }),
    })
  },
}
