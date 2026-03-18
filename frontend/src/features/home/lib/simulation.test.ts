import { describe, expect, it } from 'vitest'
import { buildSimulationMatches, calculateAmount, calculateBetCount, calculatePrizeBreakdown } from './simulation'

describe('simulation helpers', () => {
  it('calculates bet count and amount for multiple ticket', () => {
    expect(calculateBetCount(5, 2)).toBe(1)
    expect(calculateBetCount(6, 3)).toBe(18)
    expect(calculateAmount(6, 3)).toBe(36)
  })

  it('builds prize breakdown for multi-hit selections', () => {
    expect(calculatePrizeBreakdown(5, 2, 5, 2)).toEqual([{ level: '一等奖', count: 1 }])
    expect(calculatePrizeBreakdown(6, 3, 5, 2)).toEqual(
      expect.arrayContaining([
        { level: '一等奖', count: 1 },
        { level: '二等奖', count: 2 },
        { level: '四等奖', count: 5 },
        { level: '五等奖', count: 10 },
      ]),
    )
  })

  it('matches historical draws and exposes top prize', () => {
    const matches = buildSimulationMatches(['01', '02', '03', '04', '05'], ['01', '02'], [
      { period: '2026001', date: '2026-01-01', red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['01', '02'] },
    ], 30)

    expect(matches[0].topPrizeLevel).toBe('一等奖')
    expect(matches[0].redHits).toEqual(['01', '02', '03', '04', '05'])
    expect(matches[0].blueHits).toEqual(['01', '02'])
  })
})
