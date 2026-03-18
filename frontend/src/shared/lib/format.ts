export function padBall(value: string | number) {
  return String(value).padStart(2, '0')
}

export function formatDateLabel(value?: string | null) {
  if (!value) return '-'
  return value
}

export function formatDateTimeLocal(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function formatDateTimeInTimeZone(value: string | null | undefined, timeZone: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

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

export function formatDateTimeBeijing(value?: string | null) {
  return formatDateTimeInTimeZone(value, 'Asia/Shanghai')
}

export function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function byFrequencyDescending<T extends { count: number; ball: string }>(items: T[]) {
  return [...items].sort((left, right) => right.count - left.count || left.ball.localeCompare(right.ball))
}
