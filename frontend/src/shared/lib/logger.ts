const SENSITIVE_KEYS = ['api_key', 'authorization', 'cookie', 'password', 'secret', 'token']

function maskValue(value: unknown) {
  const text = String(value ?? '')
  if (text.length <= 4) return '***'
  return `${text.slice(0, 2)}***${text.slice(-2)}`
}

export function sanitizeForLog(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      SENSITIVE_KEYS.includes(key.toLowerCase()) ? maskValue(value) : value,
    ]),
  )
}

function shouldLogInfo() {
  return !import.meta.env.PROD
}

export const appLogger = {
  debug(message: string, context?: unknown) {
    if (!shouldLogInfo()) return
    console.debug(message, context ? sanitizeForLog(context) : '')
  },
  info(message: string, context?: unknown) {
    if (!shouldLogInfo()) return
    console.info(message, context ? sanitizeForLog(context) : '')
  },
  warn(message: string, context?: unknown) {
    console.warn(message, context ? sanitizeForLog(context) : '')
  },
  error(message: string, context?: unknown) {
    console.error(message, context ? sanitizeForLog(context) : '')
  },
}
