const PINNED_MODELS_KEY = 'dltPinnedModelIds'

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
