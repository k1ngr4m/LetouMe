import { describe, expect, it } from 'vitest'
import { buildScheduleCalendarMonth } from './scheduleCalendar'
import type { ScheduleTask } from '../../../shared/types/api'

function createTask(task: Partial<ScheduleTask>): ScheduleTask {
  return {
    task_code: 'task',
    task_name: '测试任务',
    task_type: 'lottery_fetch',
    lottery_code: 'dlt',
    fetch_limit: 30,
    model_codes: [],
    generation_mode: 'current',
    prediction_play_mode: 'direct',
    overwrite_existing: false,
    schedule_mode: 'preset',
    preset_type: 'daily',
    time_of_day: '09:00',
    weekdays: [],
    cron_expression: null,
    is_active: true,
    ...task,
  }
}

describe('schedule calendar helpers', () => {
  it('expands preset weekly schedule for matched weekday only', () => {
    const month = buildScheduleCalendarMonth(
      [
        createTask({
          task_code: 'weekly-task',
          task_name: '每周任务',
          schedule_mode: 'preset',
          preset_type: 'weekly',
          time_of_day: '10:30',
          weekdays: [1, 4],
        }),
      ],
      2026,
      3,
    )

    expect((month.dayEntries['2026-03-03'] || [])[0]?.triggerTimes).toEqual(['10:30'])
    expect((month.dayEntries['2026-03-06'] || [])[0]?.triggerTimes).toEqual(['10:30'])
    expect(month.dayEntries['2026-03-04'] || []).toEqual([])
  })

  it('expands cron schedule in current month with AND day-weekday semantics', () => {
    const month = buildScheduleCalendarMonth(
      [
        createTask({
          task_code: 'cron-task',
          task_name: 'Cron任务',
          schedule_mode: 'cron',
          cron_expression: '0 9 * 3 4',
        }),
      ],
      2026,
      3,
    )

    expect((month.dayEntries['2026-03-06'] || [])[0]?.triggerTimes).toEqual(['09:00'])
    expect(month.dayEntries['2026-03-13'] || []).toHaveLength(1)
    expect(month.dayEntries['2026-03-04'] || []).toEqual([])
  })
})

