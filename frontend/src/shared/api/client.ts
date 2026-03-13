import type {
  AdminUserCreatePayload,
  AdminUserResetPasswordPayload,
  AdminUserUpdatePayload,
  CurrentUserResponse,
  CurrentPredictionsResponse,
  LoginPayload,
  LotteryHistoryResponse,
  PredictionsHistoryListResponse,
  PredictionsHistoryResponse,
  SettingsModel,
  SettingsModelListResponse,
  SettingsModelPayload,
  SettingsProviderListResponse,
  UserListResponse,
  RegisterPayload,
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
  getLotteryHistory(payload?: { limit?: number; offset?: number }) {
    return requestJson<LotteryHistoryResponse>('/api/lottery/history', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    })
  },
  getCurrentPredictions() {
    return requestJson<CurrentPredictionsResponse>('/api/predictions/current', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  },
  getPredictionsHistoryList(payload?: { limit?: number; offset?: number }) {
    return requestJson<PredictionsHistoryListResponse>('/api/predictions/history/list', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    })
  },
  getPredictionsHistoryDetail(targetPeriod: string) {
    return requestJson<PredictionsHistoryResponse>('/api/predictions/history/detail', {
      method: 'POST',
      body: JSON.stringify({ target_period: targetPeriod }),
    })
  },
  getSettingsModels(includeDeleted = false) {
    return requestJson<SettingsModelListResponse>('/api/settings/models/list', {
      method: 'POST',
      body: JSON.stringify({ include_deleted: includeDeleted }),
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
  createSettingsModel(payload: SettingsModelPayload) {
    return requestJson<SettingsModel>('/api/settings/models/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateSettingsModel(modelCode: string, payload: SettingsModelPayload) {
    return requestJson<SettingsModel>('/api/settings/models/update', {
      method: 'POST',
      body: JSON.stringify({ ...payload, model_code: modelCode }),
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
}
