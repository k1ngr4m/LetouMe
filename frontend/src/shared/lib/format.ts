export function padBall(value: string | number) {
  return String(value).padStart(2, '0')
}

export function formatDateLabel(value?: string | null) {
  if (!value) return '-'
  return value
}

export function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function byFrequencyDescending<T extends { count: number; ball: string }>(items: T[]) {
  return [...items].sort((left, right) => right.count - left.count || left.ball.localeCompare(right.ball))
}
