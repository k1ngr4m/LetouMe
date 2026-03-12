const PINNED_MODELS_KEY = 'dltPinnedModelIds'
const THEME_PREFERENCE_KEY = 'dltThemePreference'

export function loadPinnedModels() {
  try {
    const raw = window.localStorage.getItem(PINNED_MODELS_KEY)
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

export function savePinnedModels(modelIds: string[]) {
  try {
    window.localStorage.setItem(PINNED_MODELS_KEY, JSON.stringify(modelIds))
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
