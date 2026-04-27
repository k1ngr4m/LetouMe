import { describe, expect, it } from 'vitest'
import { formatDateTimeBeijing } from './format'

describe('formatDateTimeBeijing', () => {
  it('formats compact database datetime values as wall-clock dates', () => {
    expect(formatDateTimeBeijing('20260427002500')).toBe('2026-04-27 00:25')
  })

  it('still supports epoch milliseconds', () => {
    expect(formatDateTimeBeijing(1770000000000)).toBe('2026-02-02 10:40')
  })
})
