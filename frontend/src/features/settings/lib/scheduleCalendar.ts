import type { ScheduleTask } from '../../../shared/types/api'

export type ScheduleCalendarCell = {
  dateKey: string
  dayOfMonth: number
  inCurrentMonth: boolean
}

export type ScheduleCalendarDayEntry = {
  task: ScheduleTask
  triggerTimes: string[]
}

export type ScheduleCalendarMonth = {
  year: number
  month: number
  cells: ScheduleCalendarCell[]
  dayEntries: Record<string, ScheduleCalendarDayEntry[]>
}

function formatDateKey(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function parseTimeOfDay(value: string | null | undefined): { hour: number; minute: number } {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim())
  if (!matched) return { hour: 0, minute: 0 }
  return { hour: Number(matched[1]), minute: Number(matched[2]) }
}

function parseCronRange(field: string, minValue: number, maxValue: number): [number, number] {
  if (field === '*') return [minValue, maxValue]
  if (field.includes('-')) {
    const [startRaw, endRaw] = field.split('-', 2)
    const start = Number(startRaw)
    const end = Number(endRaw)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < minValue || end > maxValue || start > end) {
      throw new Error('invalid cron range')
    }
    return [start, end]
  }
  const value = Number(field)
  if (!Number.isInteger(value) || value < minValue || value > maxValue) {
    throw new Error('invalid cron value')
  }
  return [value, value]
}

function parseCronValues(field: string, minValue: number, maxValue: number): number[] {
  const chunkValues = String(field || '').trim()
  if (!chunkValues) return []
  if (chunkValues === '*') {
    return Array.from({ length: maxValue - minValue + 1 }, (_, index) => minValue + index)
  }
  const values = new Set<number>()
  for (const chunkRaw of chunkValues.split(',')) {
    const chunk = chunkRaw.trim()
    if (!chunk) return []
    if (chunk.startsWith('*/')) {
      const step = Number(chunk.slice(2))
      if (!Number.isInteger(step) || step <= 0) return []
      for (let value = minValue; value <= maxValue; value += step) values.add(value)
      continue
    }
    if (chunk.includes('/')) {
      const [rangePart, stepPart] = chunk.split('/', 2)
      const step = Number(stepPart)
      if (!Number.isInteger(step) || step <= 0) return []
      const [start, end] = parseCronRange(rangePart, minValue, maxValue)
      for (let value = start; value <= end; value += step) values.add(value)
      continue
    }
    const [start, end] = parseCronRange(chunk, minValue, maxValue)
    for (let value = start; value <= end; value += 1) values.add(value)
  }
  return [...values].sort((left, right) => left - right)
}

function getWeekdayIndex(year: number, month: number, day: number) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return (weekday + 6) % 7
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function resolvePresetTimes(task: ScheduleTask, year: number, month: number, day: number): string[] {
  const { hour, minute } = parseTimeOfDay(task.time_of_day)
  const hitTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  if (task.preset_type === 'weekly') {
    const weekday = getWeekdayIndex(year, month, day)
    return (task.weekdays || []).includes(weekday) ? [hitTime] : []
  }
  return [hitTime]
}

function resolveCronTimes(task: ScheduleTask, year: number, month: number, day: number): string[] {
  const expression = String(task.cron_expression || '').trim()
  const fields = expression.split(/\s+/)
  if (fields.length !== 5) return []
  const minuteValues = parseCronValues(fields[0], 0, 59)
  const hourValues = parseCronValues(fields[1], 0, 23)
  const dayValues = parseCronValues(fields[2], 1, 31)
  const monthValues = parseCronValues(fields[3], 1, 12)
  const weekdayValues = parseCronValues(fields[4], 0, 6)
  if (!minuteValues.length || !hourValues.length || !dayValues.length || !monthValues.length || !weekdayValues.length) return []
  const weekday = getWeekdayIndex(year, month, day)
  if (!monthValues.includes(month) || !dayValues.includes(day) || !weekdayValues.includes(weekday)) return []
  const result: string[] = []
  for (const hour of hourValues) {
    for (const minute of minuteValues) {
      result.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`)
    }
  }
  return result
}

function resolveTaskTimesForDate(task: ScheduleTask, year: number, month: number, day: number): string[] {
  if (task.schedule_mode === 'cron') return resolveCronTimes(task, year, month, day)
  if (task.schedule_mode === 'preset') return resolvePresetTimes(task, year, month, day)
  return []
}

export function buildScheduleCalendarMonth(tasks: ScheduleTask[], year: number, month: number): ScheduleCalendarMonth {
  const daysInMonth = getDaysInMonth(year, month)
  const firstWeekday = getWeekdayIndex(year, month, 1)
  const cells: ScheduleCalendarCell[] = []
  const dayEntries: Record<string, ScheduleCalendarDayEntry[]> = {}
  const leadingDays = firstWeekday
  const totalCells = 42
  for (let index = 0; index < totalCells; index += 1) {
    const offset = index - leadingDays + 1
    const date = new Date(Date.UTC(year, month - 1, offset))
    const cellYear = date.getUTCFullYear()
    const cellMonth = date.getUTCMonth() + 1
    const cellDay = date.getUTCDate()
    const dateKey = formatDateKey(cellYear, cellMonth, cellDay)
    const inCurrentMonth = offset >= 1 && offset <= daysInMonth
    cells.push({
      dateKey,
      dayOfMonth: cellDay,
      inCurrentMonth,
    })
    if (!inCurrentMonth) continue
    const entries: ScheduleCalendarDayEntry[] = []
    for (const task of tasks) {
      const triggerTimes = resolveTaskTimesForDate(task, year, month, cellDay)
      if (!triggerTimes.length) continue
      entries.push({
        task,
        triggerTimes,
      })
    }
    entries.sort((left, right) => {
      const leftTime = left.triggerTimes[0] || '99:99'
      const rightTime = right.triggerTimes[0] || '99:99'
      if (leftTime !== rightTime) return leftTime.localeCompare(rightTime)
      return left.task.task_name.localeCompare(right.task.task_name)
    })
    dayEntries[dateKey] = entries
  }
  return {
    year,
    month,
    cells,
    dayEntries,
  }
}

export function shiftCalendarMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
}

export function resolveTodayInBeijing(): { year: number; month: number; day: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0)
  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  return { year, month, day, dateKey: formatDateKey(year, month, day) }
}

export function buildMonthLabel(year: number, month: number) {
  return `${year}年${month.toString().padStart(2, '0')}月`
}

