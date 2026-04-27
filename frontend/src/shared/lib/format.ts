export function padBall(value: string | number) {
  return String(value).padStart(2, '0')
}

export function formatDateLabel(value?: string | null) {
  if (!value) return '-'
  return value
}

export function formatDateTimeLocal(value?: string | number | null) {
  return formatDateTimeInTimeZone(value, 'Asia/Shanghai')
}

export function formatDateTimeInTimeZone(value: string | number | null | undefined, timeZone: string) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number' && value <= 0) return '-'
  if (typeof value === 'string' && String(value).trim() && Number.isFinite(Number(value)) && Number(value) <= 0) return '-'
  const date = parseDateTimeValue(value, timeZone)
  if (Number.isNaN(date.getTime())) return String(value)

  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '--'
  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  const hour = pick('hour')
  const minute = pick('minute')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function parseDateTimeValue(value: string | number, timeZone: string) {
  const compactDate = parseCompactDateTime(value, timeZone)
  if (compactDate) return compactDate

  const numericValue = typeof value === 'number' ? value : Number(value)
  const timestampMs = Number.isFinite(numericValue) ? (numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue) : NaN
  return Number.isFinite(timestampMs) ? new Date(timestampMs) : new Date(value)
}

function parseCompactDateTime(value: string | number, timeZone: string) {
  const text = String(value).trim()
  if (!/^\d{8}(\d{4})?(\d{2})?$/.test(text)) return null
  const year = Number(text.slice(0, 4))
  const month = Number(text.slice(4, 6))
  const day = Number(text.slice(6, 8))
  const hour = text.length >= 12 ? Number(text.slice(8, 10)) : 0
  const minute = text.length >= 12 ? Number(text.slice(10, 12)) : 0
  const second = text.length === 14 ? Number(text.slice(12, 14)) : 0
  const validationDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day ||
    validationDate.getUTCHours() !== hour ||
    validationDate.getUTCMinutes() !== minute ||
    validationDate.getUTCSeconds() !== second
  ) {
    return null
  }
  const utcHour = timeZone === 'Asia/Shanghai' ? hour - 8 : hour
  return new Date(Date.UTC(year, month - 1, day, utcHour, minute, second))
}

export function formatDateTimeBeijing(value?: string | number | null) {
  return formatDateTimeInTimeZone(value, 'Asia/Shanghai')
}

export function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function byFrequencyDescending<T extends { count: number; ball: string }>(items: T[]) {
  return [...items].sort((left, right) => right.count - left.count || left.ball.localeCompare(right.ball))
}
