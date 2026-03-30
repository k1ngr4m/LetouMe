import { describe, expect, it } from 'vitest'
import { buildSimulationMatches, calculateAmount, calculateBetCount, type SimulationSelection } from './simulation'

function makeDltSelection(frontNumbers: string[], backNumbers: string[]): SimulationSelection {
  return {
    lotteryCode: 'dlt',
    playType: 'dlt',
    frontNumbers,
    backNumbers,
    frontDan: [],
    frontTuo: [],
    backDan: [],
    backTuo: [],
    directTenThousands: [],
    directThousands: [],
    directHundreds: [],
    directTens: [],
    directUnits: [],
    groupNumbers: [],
    sumValues: [],
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

  it('calculates dlt dantuo bet count and match prize', () => {
    const selection: SimulationSelection = {
      lotteryCode: 'dlt',
      playType: 'dlt_dantuo',
      frontNumbers: [],
      backNumbers: [],
      frontDan: ['01'],
      frontTuo: ['02', '03', '04', '05', '06'],
      backDan: ['01'],
      backTuo: ['07', '08'],
      directTenThousands: [],
      directThousands: [],
      directHundreds: [],
      directTens: [],
      directUnits: [],
      groupNumbers: [],
      sumValues: [],
    }
    expect(calculateBetCount(selection)).toBe(10)
    expect(calculateAmount(selection)).toBe(20)

    const matches = buildSimulationMatches(
      selection,
      [{ period: '26014', date: '2026-01-02', red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['01', '07'] }],
      30,
    )
    expect(matches[0].topPrizeLevel).toBe('一等奖')
    expect(matches[0].totalWinningBets).toBe(10)
  })

  it('uses old/new dlt prize mapping by period boundary', () => {
    const oldRule = buildSimulationMatches(
      makeDltSelection(['01', '02', '31', '32', '33'], ['01', '02']),
      [{ period: '26013', date: '2026-01-01', red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['01', '02'] }],
      30,
    )
    const newRule = buildSimulationMatches(
      makeDltSelection(['01', '02', '31', '32', '33'], ['01', '02']),
      [{ period: '26014', date: '2026-01-02', red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['01', '02'] }],
      30,
    )

    expect(oldRule[0].topPrizeLevel).toBe('八等奖')
    expect(newRule[0].topPrizeLevel).toBe('六等奖')
  })

  it('calculates pl3 direct and group bet count', () => {
    expect(
      calculateBetCount({
        lotteryCode: 'pl3',
        playType: 'direct',
        frontNumbers: [],
        backNumbers: [],
        frontDan: [],
        frontTuo: [],
        backDan: [],
        backTuo: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: ['00', '01'],
        directTens: ['02'],
        directUnits: ['03', '04'],
        groupNumbers: [],
        sumValues: [],
      }),
    ).toBe(4)

    expect(
      calculateBetCount({
        lotteryCode: 'pl3',
        playType: 'group3',
        frontNumbers: [],
        backNumbers: [],
        frontDan: [],
        frontTuo: [],
        backDan: [],
        backTuo: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: [],
        directTens: [],
        directUnits: [],
        groupNumbers: ['01', '02', '03'],
        sumValues: [],
      }),
    ).toBe(6)

    expect(
      calculateBetCount({
        lotteryCode: 'pl3',
        playType: 'group6',
        frontNumbers: [],
        backNumbers: [],
        frontDan: [],
        frontTuo: [],
        backDan: [],
        backTuo: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: [],
        directTens: [],
        directUnits: [],
        groupNumbers: ['01', '02', '03', '04'],
        sumValues: [],
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
        frontDan: [],
        frontTuo: [],
        backDan: [],
        backTuo: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: ['04'],
        directTens: ['05'],
        directUnits: ['06'],
        groupNumbers: [],
        sumValues: [],
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
        frontDan: [],
        frontTuo: [],
        backDan: [],
        backTuo: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: [],
        directTens: [],
        directUnits: [],
        groupNumbers: ['01', '02', '03', '04'],
        sumValues: [],
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
        frontDan: [],
        frontTuo: [],
        backDan: [],
        backTuo: [],
        directTenThousands: ['01'],
        directThousands: ['02'],
        directHundreds: ['03'],
        directTens: ['04'],
        directUnits: ['05'],
        groupNumbers: [],
        sumValues: [],
      },
      [{ period: '26003', date: '2026-01-03', red_balls: ['01', '02', '03', '04', '05'], blue_balls: [] }],
      30,
    )
    expect(matches[0].topPrizeLevel).toBe('直选')
    expect(matches[0].digitHits).toEqual(['01', '02', '03', '04', '05'])
  })

  it('calculates and matches pl3 direct_sum bets', () => {
    const selection: SimulationSelection = {
      lotteryCode: 'pl3',
      playType: 'direct_sum',
      frontNumbers: [],
      backNumbers: [],
      frontDan: [],
      frontTuo: [],
      backDan: [],
      backTuo: [],
      directTenThousands: [],
      directThousands: [],
      directHundreds: [],
      directTens: [],
      directUnits: [],
      groupNumbers: [],
      sumValues: ['10', '11'],
    }

    expect(calculateBetCount(selection)).toBe(132)
    expect(calculateAmount(selection)).toBe(264)

    const matches = buildSimulationMatches(
      selection,
      [{ period: '26004', date: '2026-01-04', red_balls: ['01', '02', '07'], blue_balls: [] }],
      30,
    )
    expect(matches[0].topPrizeLevel).toBe('直选')
    expect(matches[0].totalWinningBets).toBe(1)
    expect(matches[0].prizes).toEqual([{ level: '直选', count: 1 }])
  })
})
