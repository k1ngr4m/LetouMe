import type { LotteryCode } from '../types/api'

const PINNED_MODELS_KEY_PREFIX = 'letoumePinnedModelIds'
const SELECTED_LOTTERY_KEY = 'letoumeSelectedLottery'
const THEME_PREFERENCE_KEY = 'letoumeThemePreference'
const MOTION_PREFERENCE_KEY = 'letoumeMotionPreference'
const SETTINGS_TABLE_WIDTHS_KEY_PREFIX = 'letoumeSettingsTableWidths'
const SIDEBAR_COLLAPSE_PREFERENCE_KEY = 'letoumeSidebarCollapsed'
const SETTINGS_LOTTERY_FETCH_LIMITS_KEY = 'letoumeSettingsLotteryFetchLimits'

export function loadPinnedModels(lotteryCode: LotteryCode = 'dlt') {
  try {
    const raw = window.localStorage.getItem(`${PINNED_MODELS_KEY_PREFIX}:${lotteryCode}`)
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

export function savePinnedModels(modelIds: string[], lotteryCode: LotteryCode = 'dlt') {
  try {
    window.localStorage.setItem(`${PINNED_MODELS_KEY_PREFIX}:${lotteryCode}`, JSON.stringify(modelIds))
  } catch {
    // Ignore persistence failures in unsupported environments.
  }
}

export function loadSelectedLottery(): LotteryCode {
  try {
    const raw = window.localStorage.getItem(SELECTED_LOTTERY_KEY)
    return raw === 'pl3' || raw === 'pl5' || raw === 'qxc' ? raw : 'dlt'
  } catch {
    return 'dlt'
  }
}

export function saveSelectedLottery(lotteryCode: LotteryCode) {
  try {
    window.localStorage.setItem(SELECTED_LOTTERY_KEY, lotteryCode)
  } catch {
    // Ignore persistence failures in unsupported environments.
  }
}

export function loadThemePreference() {
  try {
    const raw = window.localStorage.getItem(THEME_PREFERENCE_KEY)
    return raw === 'dark' || raw === 'light' ? raw : null
  } catch {
    return null
  }
}

export function saveThemePreference(theme: 'dark' | 'light') {
  try {
    window.localStorage.setItem(THEME_PREFERENCE_KEY, theme)
  } catch {
    // Ignore persistence failures in unsupported environments.
  }
}

export type MotionPreference = 'system' | 'minimal' | 'normal' | 'enhanced'

export function loadMotionPreference(): MotionPreference {
  try {
    const raw = window.localStorage.getItem(MOTION_PREFERENCE_KEY)
    return raw === 'minimal' || raw === 'normal' || raw === 'enhanced' || raw === 'system' ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function saveMotionPreference(preference: MotionPreference) {
  try {
    window.localStorage.setItem(MOTION_PREFERENCE_KEY, preference)
  } catch {
    // Ignore persistence failures in unsupported environments.
  }
}

export function loadSettingsTableColumnWidths(tableKey: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(`${SETTINGS_TABLE_WIDTHS_KEY_PREFIX}:${tableKey}`)
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      result[key] = Math.max(80, Math.round(value))
    }
    return result
  } catch {
    return {}
  }
}

export function saveSettingsTableColumnWidths(tableKey: string, widths: Record<string, number>) {
  try {
    window.localStorage.setItem(`${SETTINGS_TABLE_WIDTHS_KEY_PREFIX}:${tableKey}`, JSON.stringify(widths))
  } catch {
    // Ignore persistence failures in unsupported environments.
  }
}

export function loadSidebarCollapsePreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_PREFERENCE_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSidebarCollapsePreference(isCollapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_PREFERENCE_KEY, isCollapsed ? '1' : '0')
  } catch {
    // Ignore persistence failures in unsupported environments.
  }
}

export function loadSettingsLotteryFetchLimits(): Partial<Record<LotteryCode, number>> {
  try {
    const raw = window.localStorage.getItem(SETTINGS_LOTTERY_FETCH_LIMITS_KEY)
    const parsed = JSON.parse(raw || '{}')
    if (!parsed || typeof parsed !== 'object') return {}
    const result: Partial<Record<LotteryCode, number>> = {}
    for (const lotteryCode of ['dlt', 'pl3', 'pl5', 'qxc'] as LotteryCode[]) {
      const value = Number((parsed as Record<string, unknown>)[lotteryCode])
      if (!Number.isFinite(value)) continue
      result[lotteryCode] = Math.max(1, Math.min(500, Math.round(value)))
    }
    return result
  } catch {
    return {}
  }
}

export function saveSettingsLotteryFetchLimits(limits: Partial<Record<LotteryCode, number>>) {
  try {
    window.localStorage.setItem(SETTINGS_LOTTERY_FETCH_LIMITS_KEY, JSON.stringify(limits))
  } catch {
    // Ignore persistence failures in unsupported environments.
  }
}
