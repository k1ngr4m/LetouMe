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
  const timestampMs = typeof value === 'number' ? value * 1000 : Number(value)
  const date = Number.isFinite(timestampMs) ? new Date(timestampMs) : new Date(value)
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
