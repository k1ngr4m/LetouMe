import { describe, expect, it } from 'vitest'
import { buildSimulationMatches, calculateAmount, calculateBetCount, type SimulationSelection } from './simulation'

function makeDltSelection(frontNumbers: string[], backNumbers: string[]): SimulationSelection {
  return {
    lotteryCode: 'dlt',
    playType: 'dlt',
    frontNumbers,
    backNumbers,
    directTenThousands: [],
    directThousands: [],
    directHundreds: [],
    directTens: [],
    directUnits: [],
    groupNumbers: [],
  }
}

describe('simulation helpers', () => {
  it('calculates dlt bet count and amount for multiple ticket', () => {
    expect(calculateBetCount(makeDltSelection(['01', '02', '03', '04', '05'], ['01', '02']))).toBe(1)
    expect(calculateBetCount(makeDltSelection(['01', '02', '03', '04', '05', '06'], ['01', '02', '03']))).toBe(18)
    expect(calculateAmount(makeDltSelection(['01', '02', '03', '04', '05', '06'], ['01', '02', '03']))).toBe(36)
  })

  it('matches dlt historical draws and exposes top prize', () => {
    const matches = buildSimulationMatches(
      makeDltSelection(['01', '02', '03', '04', '05'], ['01', '02']),
      [{ period: '2026001', date: '2026-01-01', red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['01', '02'] }],
      30,
    )

    expect(matches[0].topPrizeLevel).toBe('一等奖')
    expect(matches[0].redHits).toEqual(['01', '02', '03', '04', '05'])
    expect(matches[0].blueHits).toEqual(['01', '02'])
  })

  it('calculates pl3 direct and group bet count', () => {
    expect(
      calculateBetCount({
        lotteryCode: 'pl3',
        playType: 'direct',
        frontNumbers: [],
        backNumbers: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: ['00', '01'],
        directTens: ['02'],
        directUnits: ['03', '04'],
        groupNumbers: [],
      }),
    ).toBe(4)

    expect(
      calculateBetCount({
        lotteryCode: 'pl3',
        playType: 'group3',
        frontNumbers: [],
        backNumbers: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: [],
        directTens: [],
        directUnits: [],
        groupNumbers: ['01', '02', '03'],
      }),
    ).toBe(6)

    expect(
      calculateBetCount({
        lotteryCode: 'pl3',
        playType: 'group6',
        frontNumbers: [],
        backNumbers: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: [],
        directTens: [],
        directUnits: [],
        groupNumbers: ['01', '02', '03', '04'],
      }),
    ).toBe(4)
  })

  it('matches pl3 direct and group prizes', () => {
    const directMatches = buildSimulationMatches(
      {
        lotteryCode: 'pl3',
        playType: 'direct',
        frontNumbers: [],
        backNumbers: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: ['04'],
        directTens: ['05'],
        directUnits: ['06'],
        groupNumbers: [],
      },
      [{ period: '26001', date: '2026-01-01', red_balls: ['04', '05', '06'], blue_balls: [] }],
      30,
    )
    expect(directMatches[0].topPrizeLevel).toBe('直选')
    expect(directMatches[0].digitHits).toEqual(['04', '05', '06'])

    const groupMatches = buildSimulationMatches(
      {
        lotteryCode: 'pl3',
        playType: 'group6',
        frontNumbers: [],
        backNumbers: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: [],
        directTens: [],
        directUnits: [],
        groupNumbers: ['01', '02', '03', '04'],
      },
      [{ period: '26002', date: '2026-01-02', red_balls: ['03', '01', '04'], blue_balls: [] }],
      30,
    )
    expect(groupMatches[0].topPrizeLevel).toBe('组选6')
  })

  it('matches pl5 direct prize', () => {
    const matches = buildSimulationMatches(
      {
        lotteryCode: 'pl5',
        playType: 'direct',
        frontNumbers: [],
        backNumbers: [],
        directTenThousands: ['01'],
        directThousands: ['02'],
        directHundreds: ['03'],
        directTens: ['04'],
        directUnits: ['05'],
        groupNumbers: [],
      },
      [{ period: '26003', date: '2026-01-03', red_balls: ['01', '02', '03', '04', '05'], blue_balls: [] }],
      30,
    )
    expect(matches[0].topPrizeLevel).toBe('直选')
    expect(matches[0].digitHits).toEqual(['01', '02', '03', '04', '05'])
  })
})
