import type {
  CurrentPredictionsResponse,
  LotteryHistoryResponse,
  PredictionsHistoryResponse,
  SettingsModel,
  SettingsModelListResponse,
  SettingsModelPayload,
  SettingsProviderListResponse,
} from '../types/api'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined | null>) {
  const url = new URL(path, `${API_BASE_URL}/`)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

async function requestJson<T>(path: string, init?: RequestInit, query?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? data.detail : '请求失败'
    throw new Error(typeof detail === 'string' ? detail : '请求失败')
  }
  return data as T
}

export const apiClient = {
  getLotteryHistory(query?: { limit?: number; offset?: number }) {
    return requestJson<LotteryHistoryResponse>('/api/lottery/history', undefined, query)
  },
  getCurrentPredictions() {
    return requestJson<CurrentPredictionsResponse>('/api/predictions/current')
  },
  getPredictionsHistory(query?: { limit?: number; offset?: number }) {
    return requestJson<PredictionsHistoryResponse>('/api/predictions/history', undefined, query)
  },
  getSettingsModels(includeDeleted = false) {
    return requestJson<SettingsModelListResponse>('/api/settings/models', undefined, { include_deleted: includeDeleted })
  },
  getSettingsModel(modelCode: string) {
    return requestJson<SettingsModel>(`/api/settings/models/${encodeURIComponent(modelCode)}`)
  },
  getSettingsProviders() {
    return requestJson<SettingsProviderListResponse>('/api/settings/providers')
  },
  createSettingsModel(payload: SettingsModelPayload) {
    return requestJson<SettingsModel>('/api/settings/models', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },
  updateSettingsModel(modelCode: string, payload: SettingsModelPayload) {
    return requestJson<SettingsModel>(`/api/settings/models/${encodeURIComponent(modelCode)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },
  toggleSettingsModel(modelCode: string, isActive: boolean) {
    return requestJson<SettingsModel>(`/api/settings/models/${encodeURIComponent(modelCode)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    })
  },
  deleteSettingsModel(modelCode: string) {
    return requestJson<SettingsModel>(`/api/settings/models/${encodeURIComponent(modelCode)}`, {
      method: 'DELETE',
    })
  },
  restoreSettingsModel(modelCode: string) {
    return requestJson<SettingsModel>(`/api/settings/models/${encodeURIComponent(modelCode)}/restore`, {
      method: 'POST',
    })
  },
}
