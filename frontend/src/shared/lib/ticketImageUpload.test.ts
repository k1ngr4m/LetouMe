import { describe, expect, it } from 'vitest'

import {
  buildOptimizedTicketImageName,
  resolveScaledDimensions,
  shouldKeepOriginalFile,
} from './ticketImageUpload'

describe('resolveScaledDimensions', () => {
  it('keeps original dimensions under max edge', () => {
    expect(resolveScaledDimensions(1200, 800, 1600)).toEqual({ width: 1200, height: 800 })
  })

  it('scales landscape image by max edge', () => {
    expect(resolveScaledDimensions(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 })
  })

  it('scales portrait image by max edge', () => {
    expect(resolveScaledDimensions(1800, 3000, 1600)).toEqual({ width: 960, height: 1600 })
  })
})

describe('shouldKeepOriginalFile', () => {
  it('keeps original when savings are below threshold', () => {
    expect(shouldKeepOriginalFile(1_000_000, 960_000, 0.05)).toBe(true)
  })

  it('uses optimized file when savings meet threshold', () => {
    expect(shouldKeepOriginalFile(1_000_000, 900_000, 0.05)).toBe(false)
  })
})

describe('buildOptimizedTicketImageName', () => {
  it('replaces file extension with jpg', () => {
    expect(buildOptimizedTicketImageName('Snipaste_2026-04-15_14-11-14.png')).toBe('Snipaste_2026-04-15_14-11-14.jpg')
  })

  it('uses fallback name when filename missing', () => {
    expect(buildOptimizedTicketImageName('')).toBe('ticket.jpg')
  })
})
