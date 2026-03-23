import type { LotteryCode } from '../types/api'

const PINNED_MODELS_KEY_PREFIX = 'letoumePinnedModelIds'
const SELECTED_LOTTERY_KEY = 'letoumeSelectedLottery'
const THEME_PREFERENCE_KEY = 'letoumeThemePreference'

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
    return raw === 'pl3' || raw === 'pl5' ? raw : 'dlt'
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
