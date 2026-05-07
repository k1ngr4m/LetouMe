import { describe, expect, it } from 'vitest'
import {
  buildModuloTrendChart,
  buildOddEvenChart,
  buildOddEvenDistributionChart,
  buildZoneShareDistributionChart,
  buildHistoryCumulativeProfitTrend,
  buildHistoryCumulativeRoiTrend,
  buildHistoryDrawdownTrend,
  buildHistoryHitTrend,
  buildHistoryHitHeatmap,
  buildHistoryProfitDistribution,
  buildHistoryProfitTrend,
  buildHistoryRankTrend,
  buildHistoryRollingHitRateTrend,
  buildModelScores,
  buildPl3OddEvenStructureChart,
  buildPl3PositionHotChart,
  buildPl3SumTrendChart,
  buildPl5OddEvenStructureChart,
  buildPl5PositionHotChart,
  buildPl5SumTrendChart,
  buildQxcOddEvenStructureChart,
  buildQxcPositionHotChart,
  buildQxcSumTrendChart,
  buildSpanTrendChart,
  buildSumTrendChart,
  buildSumDistributionChart,
  buildSummary,
  compareNumbers,
  filterModels,
  getPredictionPlayTypeLabel,
  normalizePredictionModelPlayMode,
  resolveHistoryFallbackState,
  resolveModelScore,
  buildZoneDistributionChart,
} from './home'
import type { PredictionModel } from '../../../shared/types/api'

describe('buildHistoryHitTrend', () => {
  it('builds best-hit trend points for selected models', () => {
    const result = buildHistoryHitTrend(
      [
        {
          prediction_date: '2026-03-01',
          target_period: '26021',
          actual_result: null,
          models: [
            {
              model_id: 'm1',
              model_name: 'Model 1',
              model_provider: 'openai',
              best_hit_count: 4,
            },
            {
              model_id: 'm2',
              model_name: 'Model 2',
              model_provider: 'gemini',
              best_hit_count: 2,
            },
          ],
        },
        {
          prediction_date: '2026-03-02',
          target_period: '26022',
          actual_result: null,
          models: [
            {
              model_id: 'm1',
              model_name: 'Model 1',
              model_provider: 'openai',
              best_hit_count: 3,
            },
          ],
        },
      ],
      ['m1', 'm2'],
    )

    expect(result).toEqual([
      { period: '26021', m1: 4, m2: 2 },
      { period: '26022', m1: 3, m2: 0 },
    ])
  })
})

describe('buildHistoryProfitTrend', () => {
  it('builds period profit points for selected models', () => {
    const result = buildHistoryProfitTrend(
      [
        {
          prediction_date: '2026-03-01',
          target_period: '26021',
          actual_result: null,
          models: [
            {
              model_id: 'm1',
              model_name: 'Model 1',
              model_provider: 'openai',
              cost_amount: 80,
              prize_amount: 305,
            },
            {
              model_id: 'm2',
              model_name: 'Model 2',
              model_provider: 'gemini',
              cost_amount: 20,
              prize_amount: 15,
            },
          ],
        },
        {
          prediction_date: '2026-03-02',
          target_period: '26022',
          actual_result: null,
          models: [
            {
              model_id: 'm1',
              model_name: 'Model 1',
              model_provider: 'openai',
              cost_amount: 130,
              prize_amount: 120,
            },
          ],
        },
      ],
      ['m1', 'm2'],
    )

    expect(result).toEqual([
      { period: '26021', m1: 225, m2: -5 },
      { period: '26022', m1: -10, m2: 0 },
    ])
  })
})

describe('advanced history trend builders', () => {
  const records = [
    {
      prediction_date: '2026-03-01',
      target_period: '26021',
      actual_result: null,
      models: [
        { model_id: 'm1', model_name: 'Model 1', model_provider: 'openai', best_hit_count: 4, cost_amount: 80, prize_amount: 305, hit_period_win: true },
        { model_id: 'm2', model_name: 'Model 2', model_provider: 'gemini', best_hit_count: 1, cost_amount: 20, prize_amount: 15, hit_period_win: false },
      ],
    },
    {
      prediction_date: '2026-03-02',
      target_period: '26022',
      actual_result: null,
      models: [
        { model_id: 'm1', model_name: 'Model 1', model_provider: 'openai', best_hit_count: 2, cost_amount: 130, prize_amount: 120, hit_period_win: false },
        { model_id: 'm2', model_name: 'Model 2', model_provider: 'gemini', best_hit_count: 3, cost_amount: 0, prize_amount: 0, hit_period_win: true },
      ],
    },
  ]

  it('builds cumulative profit trend', () => {
    expect(buildHistoryCumulativeProfitTrend(records, ['m1', 'm2'])).toEqual([
      { period: '26021', m1: 225, m2: -5 },
      { period: '26022', m1: 215, m2: -5 },
    ])
  })

  it('builds cumulative roi trend and guards zero cost', () => {
    expect(buildHistoryCumulativeRoiTrend(records, ['m1', 'm2'])).toEqual([
      { period: '26021', m1: 2.8125, m2: -0.25 },
      { period: '26022', m1: 215 / 210, m2: -0.25 },
    ])
  })

  it('builds rolling hit-rate trend', () => {
    expect(buildHistoryRollingHitRateTrend(records, ['m1', 'm2'], 2)).toEqual([
      { period: '26021', m1: 1, m2: 0 },
      { period: '26022', m1: 0.5, m2: 0.5 },
    ])
  })

  it('builds drawdown trend from cumulative profits', () => {
    expect(buildHistoryDrawdownTrend(records, ['m1', 'm2'])).toEqual([
      { period: '26021', m1: 0, m2: -5 },
      { period: '26022', m1: -10, m2: -5 },
    ])
  })

  it('builds ranking trend with stable ordering', () => {
    expect(buildHistoryRankTrend(records, ['m1', 'm2'])).toEqual([
      { period: '26021', m1: 1, m2: 2 },
      { period: '26022', m1: 1, m2: 2 },
    ])
  })

  it('builds heatmap cells and profit distribution', () => {
    expect(buildHistoryHitHeatmap(records, ['m1', 'm2'])).toEqual([
      { period: '26021', model_id: 'm1', model_name: 'Model 1', hit_count: 4, is_winning_period: true },
      { period: '26021', model_id: 'm2', model_name: 'Model 2', hit_count: 1, is_winning_period: false },
      { period: '26022', model_id: 'm1', model_name: 'Model 1', hit_count: 2, is_winning_period: false },
      { period: '26022', model_id: 'm2', model_name: 'Model 2', hit_count: 3, is_winning_period: true },
    ])

    expect(buildHistoryProfitDistribution(records, ['m1', 'm2'])).toEqual([
      { model_id: 'm1', model_name: 'Model 1', profitPeriods: 1, lossPeriods: 1, flatPeriods: 0 },
      { model_id: 'm2', model_name: 'Model 2', profitPeriods: 0, lossPeriods: 1, flatPeriods: 1 },
    ])
  })
})

describe('pl3 analysis chart builders', () => {
  it('builds top10 hot numbers by position from recent draws', () => {
    const chart = buildPl3PositionHotChart(
      [
        {
          period: '2026033',
          date: '2026-03-12',
          lottery_code: 'pl3',
          red_balls: ['01', '02', '03'],
          blue_balls: [],
          digits: ['01', '02', '03'],
        },
        {
          period: '2026032',
          date: '2026-03-11',
          lottery_code: 'pl3',
          red_balls: ['01', '04', '05'],
          blue_balls: [],
          digits: ['01', '04', '05'],
        },
        {
          period: '2026031',
          date: '2026-03-10',
          lottery_code: 'pl3',
          red_balls: ['01', '06', '07'],
          blue_balls: [],
        },
      ],
      0,
    )

    expect(chart).toHaveLength(10)
    expect(chart[0]).toMatchObject({ ball: '01', count: 3 })
    expect(chart.find((item) => item.ball === '00')).toMatchObject({ count: 0 })
  })

  it('builds sum trend from provided draws in ascending period order', () => {
    const chart = buildPl3SumTrendChart(
      [
        {
          period: '2026032',
          date: '2026-03-11',
          lottery_code: 'pl3',
          red_balls: ['01', '02', '03'],
          blue_balls: [],
          digits: ['01', '02', '03'],
        },
        {
          period: '2026031',
          date: '2026-03-10',
          lottery_code: 'pl3',
          red_balls: ['04', '05', '06'],
          blue_balls: [],
          digits: ['04', '05', '06'],
        },
      ],
    )

    expect(chart).toEqual([
      { period: '2026031', sum: 15 },
      { period: '2026032', sum: 6 },
    ])
  })

  it('builds odd-even structure trend by 3-digit structure', () => {
    const chart = buildPl3OddEvenStructureChart(
      [
        {
          period: '2026032',
          date: '2026-03-11',
          lottery_code: 'pl3',
          red_balls: ['01', '03', '05'],
          blue_balls: [],
          digits: ['01', '03', '05'],
        },
        {
          period: '2026031',
          date: '2026-03-10',
          lottery_code: 'pl3',
          red_balls: ['02', '04', '05'],
          blue_balls: [],
          digits: ['02', '04', '05'],
        },
      ],
    )

    expect(chart).toEqual([
      { period: '2026031', oddCount: 1, structure: '1:2' },
      { period: '2026032', oddCount: 3, structure: '3:0' },
    ])
  })
})

describe('number distribution builders', () => {
  it('builds dlt zone share distribution with stable ratios', () => {
    const result = buildZoneShareDistributionChart(
      [
        {
          period: '2026032',
          date: '2026-03-11',
          lottery_code: 'dlt',
          red_balls: ['01', '13', '25', '12', '24'],
          blue_balls: ['01', '02'],
        },
        {
          period: '2026031',
          date: '2026-03-10',
          lottery_code: 'dlt',
          red_balls: ['02', '14', '26', '11', '35'],
          blue_balls: ['03', '04'],
        },
      ],
      'dlt',
    )

    expect(result).toEqual([
      { label: '一区（01-12）', count: 4, ratio: 0.4 },
      { label: '二区（13-24）', count: 3, ratio: 0.3 },
      { label: '三区（25-35）', count: 3, ratio: 0.3 },
    ])
  })

  it('builds pl3 zone share distribution from digits', () => {
    const result = buildZoneShareDistributionChart(
      [
        {
          period: '2026032',
          date: '2026-03-11',
          lottery_code: 'pl3',
          red_balls: ['01', '04', '07'],
          blue_balls: [],
          digits: ['01', '04', '07'],
        },
        {
          period: '2026031',
          date: '2026-03-10',
          lottery_code: 'pl3',
          red_balls: ['03', '06', '09'],
          blue_balls: [],
          digits: ['03', '06', '09'],
        },
      ],
      'pl3',
    )

    expect(result).toEqual([
      { label: '低位区（0-3）', count: 2, ratio: 2 / 6 },
      { label: '中位区（4-6）', count: 2, ratio: 2 / 6 },
      { label: '高位区（7-9）', count: 2, ratio: 2 / 6 },
    ])
  })
})

describe('pl5 analysis chart builders', () => {
  it('builds top10 hot numbers for five positions', () => {
    const tenThousands = buildPl5PositionHotChart(
      [
        {
          period: '2026033',
          date: '2026-03-12',
          lottery_code: 'pl5',
          red_balls: [],
          blue_balls: [],
          digits: ['01', '02', '03', '04', '05'],
        },
        {
          period: '2026032',
          date: '2026-03-11',
          lottery_code: 'pl5',
          red_balls: [],
          blue_balls: [],
          digits: ['01', '06', '07', '08', '09'],
        },
      ],
      0,
    )

    expect(tenThousands).toHaveLength(10)
    expect(tenThousands[0]).toMatchObject({ ball: '01', count: 2 })
    expect(tenThousands.find((item) => item.ball === '00')).toMatchObject({ count: 0 })
  })

  it('builds sum trend from five digits in ascending period order', () => {
    const chart = buildPl5SumTrendChart(
      [
        {
          period: '2026032',
          date: '2026-03-11',
          lottery_code: 'pl5',
          red_balls: [],
          blue_balls: [],
          digits: ['01', '02', '03', '04', '05'],
        },
        {
          period: '2026031',
          date: '2026-03-10',
          lottery_code: 'pl5',
          red_balls: [],
          blue_balls: [],
          digits: ['05', '06', '07', '08', '09'],
        },
      ],
    )

    expect(chart).toEqual([
      { period: '2026031', sum: 35 },
      { period: '2026032', sum: 15 },
    ])
  })

  it('builds odd-even structure trend with 5-digit structure mapping', () => {
    const chart = buildPl5OddEvenStructureChart(
      [
        {
          period: '2026032',
          date: '2026-03-11',
          lottery_code: 'pl5',
          red_balls: [],
          blue_balls: [],
          digits: ['01', '03', '05', '07', '09'],
        },
        {
          period: '2026031',
          date: '2026-03-10',
          lottery_code: 'pl5',
          red_balls: [],
          blue_balls: [],
          digits: ['02', '04', '06', '08', '09'],
        },
      ],
    )

    expect(chart).toEqual([
      { period: '2026031', oddCount: 1, structure: '1:4' },
      { period: '2026032', oddCount: 5, structure: '5:0' },
    ])
  })
})

describe('qxc analysis chart builders', () => {
  const draws = [
    {
      period: '2026033',
      date: '2026-03-12',
      lottery_code: 'qxc' as const,
      red_balls: [],
      blue_balls: [],
      digits: ['01', '02', '03', '04', '05', '06', '14'],
    },
    {
      period: '2026032',
      date: '2026-03-11',
      lottery_code: 'qxc' as const,
      red_balls: [],
      blue_balls: [],
      digits: ['01', '04', '05', '06', '07', '08', '10'],
    },
    {
      period: '2026031',
      date: '2026-03-10',
      lottery_code: 'qxc' as const,
      red_balls: [],
      blue_balls: [],
      digits: ['09', '02', '03', '00', '05', '06', '14'],
    },
  ]

  it('builds hot numbers by qxc position and supports 00-14 on last position', () => {
    const firstChart = buildQxcPositionHotChart(draws, 0)
    const lastChart = buildQxcPositionHotChart(draws, 6)

    expect(firstChart).toHaveLength(10)
    expect(firstChart[0]).toMatchObject({ ball: '01', count: 2 })
    expect(lastChart).toHaveLength(15)
    expect(lastChart[0]).toMatchObject({ ball: '14', count: 2 })
    expect(lastChart.find((item) => item.ball === '00')).toMatchObject({ count: 0 })
  })

  it('builds qxc sum and odd-even trends', () => {
    expect(buildQxcSumTrendChart(draws)).toEqual([
      { period: '2026031', sum: 39 },
      { period: '2026032', sum: 41 },
      { period: '2026033', sum: 35 },
    ])

    expect(buildQxcOddEvenStructureChart(draws)).toEqual([
      { period: '2026031', oddCount: 3, structure: '3:4' },
      { period: '2026032', oddCount: 3, structure: '3:4' },
      { period: '2026033', oddCount: 3, structure: '3:4' },
    ])
  })

  it('builds qxc distribution and pattern charts with dedicated last-position buckets', () => {
    expect(buildZoneShareDistributionChart(draws, 'qxc')).toEqual([
      { label: '低位区（0-3）', count: 7, ratio: 7 / 21 },
      { label: '中位区（4-6）', count: 8, ratio: 8 / 21 },
      { label: '高位区（7-9）', count: 3, ratio: 3 / 21 },
      { label: '第七位低位区（00-04）', count: 0, ratio: 0 },
      { label: '第七位中位区（05-09）', count: 0, ratio: 0 },
      { label: '第七位高位区（10-14）', count: 3, ratio: 3 / 21 },
    ])
    expect(buildSumDistributionChart(draws, 'qxc')).toEqual([
      { label: '35', count: 1 },
      { label: '39', count: 1 },
      { label: '41', count: 1 },
    ])
    expect(buildOddEvenDistributionChart(draws, 'qxc')).toEqual([
      { label: '3:4', count: 3 },
    ])
    expect(buildSpanTrendChart(draws, 'qxc')).toEqual([
      { period: '2026031', value: 14 },
      { period: '2026032', value: 9 },
      { period: '2026033', value: 13 },
    ])
    expect(buildZoneDistributionChart(draws, 'qxc')).toEqual([
      { label: '1-3-2 / 第七位高', count: 1 },
      { label: '3-2-1 / 第七位高', count: 1 },
      { label: '3-3-0 / 第七位高', count: 1 },
    ])
    expect(buildModuloTrendChart(draws, 'qxc')).toEqual([
      { period: '2026031', value: 403, pattern: '4-0-3' },
      { period: '2026032', value: 142, pattern: '1-4-2' },
      { period: '2026033', value: 223, pattern: '2-2-3' },
    ])
  })
})

describe('trend builders honor provided draw window', () => {
  function pad(value: number) {
    return String(value).padStart(2, '0')
  }

  function makePeriods(count: number) {
    return Array.from({ length: count }, (_, index) => `26${String(count - index).padStart(4, '0')}`)
  }

  const periods = makePeriods(25)
  const earliestPeriod = periods[periods.length - 1]
  const latestPeriod = periods[0]

  const dltDraws = periods.map((period, index) => ({
    period,
    date: `2026-03-${pad((index % 28) + 1)}`,
    lottery_code: 'dlt' as const,
    red_balls: [1, 2, 3, 4, 5].map((seed) => pad((index + seed) % 35 || 35)),
    blue_balls: [1, 2].map((seed) => pad((index + seed) % 12 || 12)),
  }))

  const pl3Draws = periods.map((period, index) => ({
    period,
    date: `2026-03-${pad((index % 28) + 1)}`,
    lottery_code: 'pl3' as const,
    red_balls: [0, 1, 2].map((seed) => pad((index + seed) % 10)),
    blue_balls: [],
    digits: [0, 1, 2].map((seed) => pad((index + seed) % 10)),
  }))

  const pl5Draws = periods.map((period, index) => ({
    period,
    date: `2026-03-${pad((index % 28) + 1)}`,
    lottery_code: 'pl5' as const,
    red_balls: [],
    blue_balls: [],
    digits: [0, 1, 2, 3, 4].map((seed) => pad((index + seed) % 10)),
  }))

  const qxcDraws = periods.map((period, index) => ({
    period,
    date: `2026-03-${pad((index % 28) + 1)}`,
    lottery_code: 'qxc' as const,
    red_balls: [],
    blue_balls: [],
    digits: [0, 1, 2, 3, 4, 5, 6].map((seed) => pad((index + seed) % 10)),
  }))

  it('does not truncate trend series to 20 points', () => {
    const charts = [
      buildPl3SumTrendChart(pl3Draws),
      buildPl3OddEvenStructureChart(pl3Draws),
      buildPl5SumTrendChart(pl5Draws),
      buildPl5OddEvenStructureChart(pl5Draws),
      buildQxcSumTrendChart(qxcDraws),
      buildQxcOddEvenStructureChart(qxcDraws),
      buildSumTrendChart(dltDraws),
      buildOddEvenChart(dltDraws),
      buildSpanTrendChart(dltDraws, 'dlt'),
      buildModuloTrendChart(dltDraws, 'dlt'),
    ]

    for (const chart of charts) {
      expect(chart).toHaveLength(periods.length)
      expect(chart[0]?.period).toBe(earliestPeriod)
      expect(chart[chart.length - 1]?.period).toBe(latestPeriod)
    }
  })
})

describe('buildSummary', () => {
  it('builds number stats with raw counts and model matches', () => {
    const result = buildSummary(
      [
        {
          model_id: 'm1',
          model_name: 'Model 1',
          model_provider: 'openai',
          predictions: [
            { group_id: 1, red_balls: ['01', '02'], blue_balls: ['09'] },
            { group_id: 2, red_balls: ['01', '03'], blue_balls: ['10'] },
          ],
        },
        {
          model_id: 'm2',
          model_name: 'Model 2',
          model_provider: 'gemini',
          predictions: [
            { group_id: 1, red_balls: ['01', '04'], blue_balls: ['09'] },
            { group_id: 2, red_balls: ['05', '06'], blue_balls: ['11'] },
          ],
        },
      ],
      {
        m1: { overallScore: 80, perBetScore: 0, perPeriodScore: 0, recentScore: 0, longTermScore: 0, componentScores: {}, recentWindow: {} as never, longTermWindow: {} as never, bestPeriod: {} as never, worstPeriod: {} as never, sampleSize: 1, betSampleSize: 1 },
        m2: { overallScore: 20, perBetScore: 0, perPeriodScore: 0, recentScore: 0, longTermScore: 0, componentScores: {}, recentWindow: {} as never, longTermWindow: {} as never, bestPeriod: {} as never, worstPeriod: {} as never, sampleSize: 1, betSampleSize: 1 },
      },
      ['m1', 'm2'],
      true,
      false,
    )

    expect(result.red[0]).toMatchObject({
      ball: '01',
      appearanceCount: 3,
      totalGroupCount: 4,
      matchedModelCount: 2,
      selectedModelCount: 2,
      appearanceRatio: 0.75,
    })

    const commonOnly = buildSummary(
      [
        {
          model_id: 'm1',
          model_name: 'Model 1',
          model_provider: 'openai',
          predictions: [{ group_id: 1, red_balls: ['01'], blue_balls: ['09'] }],
        },
        {
          model_id: 'm2',
          model_name: 'Model 2',
          model_provider: 'gemini',
          predictions: [{ group_id: 1, red_balls: ['01', '02'], blue_balls: ['10'] }],
        },
      ],
      {},
      ['m1', 'm2'],
      false,
      true,
    )

    expect(commonOnly.red.map((item) => item.ball)).toEqual(['01'])
  })

  it('filters summary with strategy all-match semantics', () => {
    const result = buildSummary(
      [
        {
          model_id: 'm1',
          model_name: 'Model 1',
          model_provider: 'openai',
          predictions: [
            { group_id: 1, strategy: '增强型热号追随者', red_balls: ['01'], blue_balls: ['09'] },
            { group_id: 2, strategy: 'AI 组合策略', red_balls: ['02'], blue_balls: ['10'] },
          ],
        },
        {
          model_id: 'm2',
          model_name: 'Model 2',
          model_provider: 'gemini',
          predictions: [{ group_id: 1, strategy: '增强型热号追随者', red_balls: ['03'], blue_balls: ['11'] }],
        },
      ],
      {},
      ['m1', 'm2'],
      false,
      false,
      ['增强型热号追随者', 'AI 组合策略'],
    )

    expect(result.red.map((item) => item.ball)).toEqual(['01', '02'])
    expect(result.red[0].selectedModelCount).toBe(1)
    expect(result.red[0].totalGroupCount).toBe(2)
  })

  it('builds pl5 summary by five positions', () => {
    const result = buildSummary(
      [
        {
          model_id: 'm1',
          model_name: 'Model 1',
          model_provider: 'openai',
          predictions: [
            { group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '02', '03', '04', '05'] },
            { group_id: 2, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '06', '03', '07', '08'] },
          ],
        },
        {
          model_id: 'm2',
          model_name: 'Model 2',
          model_provider: 'gemini',
          predictions: [
            { group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['09', '02', '03', '00', '05'] },
          ],
        },
      ],
      {},
      ['m1', 'm2'],
      false,
      false,
    )

    expect(result.positions).toHaveLength(5)
    expect(result.positions[0][0]).toMatchObject({
      ball: '01',
      appearanceCount: 2,
      totalGroupCount: 3,
      matchedModelCount: 1,
    })
    expect(result.positions[1][0]).toMatchObject({
      ball: '02',
      appearanceCount: 2,
      totalGroupCount: 3,
      matchedModelCount: 2,
    })
    expect(result.positions[4].map((item) => item.ball)).toContain('05')
    expect(result.red).toEqual([])
    expect(result.blue).toEqual([])
  })

  it('builds pl3 summary by three positions', () => {
    const result = buildSummary(
      [
        {
          model_id: 'm1',
          model_name: 'Model 1',
          model_provider: 'openai',
          predictions: [
            { group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '02', '03'] },
            { group_id: 2, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '04', '05'] },
          ],
        },
        {
          model_id: 'm2',
          model_name: 'Model 2',
          model_provider: 'gemini',
          predictions: [
            { group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['06', '02', '03'] },
          ],
        },
      ],
      {},
      ['m1', 'm2'],
      false,
      false,
    )

    expect(result.positions[0][0]).toMatchObject({
      ball: '01',
      appearanceCount: 2,
      totalGroupCount: 3,
    })
    expect(result.positions[1][0]).toMatchObject({
      ball: '02',
      appearanceCount: 2,
      matchedModelCount: 2,
    })
    expect(result.positions[2].map((item) => item.ball)).toContain('03')
    expect(result.red).toEqual([])
    expect(result.blue).toEqual([])
  })

  it('builds pl3 direct_sum summary by sum values', () => {
    const result = buildSummary(
      [
        {
          model_id: 'm1',
          model_name: 'Model 1',
          model_provider: 'openai',
          predictions: [
            { group_id: 1, play_type: 'direct_sum', sum_value: '10', red_balls: [], blue_balls: [], digits: [] },
            { group_id: 2, play_type: 'direct_sum', sum_value: '11', red_balls: [], blue_balls: [], digits: [] },
          ],
        },
        {
          model_id: 'm2',
          model_name: 'Model 2',
          model_provider: 'gemini',
          predictions: [
            { group_id: 1, play_type: 'direct_sum', sum_value: '10', red_balls: [], blue_balls: [], digits: [] },
            { group_id: 2, play_type: 'direct_sum', sum_value: 'invalid', red_balls: [], blue_balls: [], digits: [] },
          ],
        },
      ],
      {},
      ['m1', 'm2'],
      false,
      false,
      [],
      ['direct_sum'],
    )

    const sum10 = result.sums.find((item) => item.ball === '10')
    const sum11 = result.sums.find((item) => item.ball === '11')
    expect(sum10).toMatchObject({
      appearanceCount: 2,
      totalGroupCount: 4,
      matchedModelCount: 2,
    })
    expect(sum11).toMatchObject({
      appearanceCount: 1,
      totalGroupCount: 4,
      matchedModelCount: 1,
    })
    expect(result.positions.every((items) => items.length === 0)).toBe(true)
  })
})

describe('filterModels', () => {
  const models = [
    {
      model_id: 'deepseek-chat',
      model_name: 'DeepSeek-V3.2',
      model_provider: 'deepseek',
      model_tags: ['reasoning', 'fast'],
      predictions: [],
    },
    {
      model_id: 'gemini-pro',
      model_name: 'Gemini-3.1',
      model_provider: 'gemini',
      model_tags: ['reasoning'],
      predictions: [],
    },
    {
      model_id: 'gpt-4o',
      model_name: 'GPT-4o',
      model_provider: 'openai',
      model_tags: ['fast'],
      predictions: [],
    },
  ]

  const scores = {
    'deepseek-chat': { overallScore: 85, perBetScore: 0, perPeriodScore: 0, recentScore: 0, longTermScore: 0, componentScores: {}, recentWindow: {} as never, longTermWindow: {} as never, bestPeriod: {} as never, worstPeriod: {} as never, sampleSize: 1, betSampleSize: 1 },
    'gemini-pro': { overallScore: 58, perBetScore: 0, perPeriodScore: 0, recentScore: 0, longTermScore: 0, componentScores: {}, recentWindow: {} as never, longTermWindow: {} as never, bestPeriod: {} as never, worstPeriod: {} as never, sampleSize: 1, betSampleSize: 1 },
    'gpt-4o': { overallScore: 28, perBetScore: 0, perPeriodScore: 0, recentScore: 0, longTermScore: 0, componentScores: {}, recentWindow: {} as never, longTermWindow: {} as never, bestPeriod: {} as never, worstPeriod: {} as never, sampleSize: 1, betSampleSize: 1 },
  }

  it('applies all filter conditions together', () => {
    const result = filterModels(models, scores, {
      nameQuery: 'deepseek',
      selectedProviders: ['deepseek'],
      selectedTags: ['reasoning', 'fast'],
      scoreRange: '81-100',
    })

    expect(result.map((item) => item.model_id)).toEqual(['deepseek-chat'])
  })

  it('requires all selected tags to be present', () => {
    const result = filterModels(models, scores, {
      nameQuery: '',
      selectedProviders: [],
      selectedTags: ['reasoning', 'fast'],
      scoreRange: 'all',
    })

    expect(result.map((item) => item.model_id)).toEqual(['deepseek-chat'])
  })

  it('filters by score range', () => {
    const result = filterModels(models, scores, {
      nameQuery: '',
      selectedProviders: [],
      selectedTags: [],
      scoreRange: '31-60',
    })

    expect(result.map((item) => item.model_id)).toEqual(['gemini-pro'])
  })
})

describe('resolveHistoryFallbackState', () => {
  it('auto-falls back to history models when no manual filter and no intersection', () => {
    const result = resolveHistoryFallbackState({
      hasHistoryRecords: true,
      hasManualModelFilter: false,
      hasCurrentModels: true,
      filteredModelIds: ['current-a'],
      historyModelIds: ['history-only'],
      historyFallbackEnabled: false,
    })

    expect(result.useHistoryFallbackModels).toBe(true)
    expect(result.needsHistoryFallbackPrompt).toBe(false)
  })

  it('auto-falls back when manual filter is active and no intersection', () => {
    const result = resolveHistoryFallbackState({
      hasHistoryRecords: true,
      hasManualModelFilter: true,
      hasCurrentModels: true,
      filteredModelIds: ['current-a'],
      historyModelIds: ['history-only'],
      historyFallbackEnabled: false,
    })

    expect(result.useHistoryFallbackModels).toBe(true)
    expect(result.needsHistoryFallbackPrompt).toBe(false)
  })

  it('enables manual fallback after user confirms', () => {
    const result = resolveHistoryFallbackState({
      hasHistoryRecords: true,
      hasManualModelFilter: true,
      hasCurrentModels: true,
      filteredModelIds: ['current-a'],
      historyModelIds: ['history-only'],
      historyFallbackEnabled: true,
    })

    expect(result.useHistoryFallbackModels).toBe(true)
    expect(result.needsHistoryFallbackPrompt).toBe(false)
  })
})

describe('compareNumbers for pl3', () => {
  it('highlights only matched positions for direct play', () => {
    const hit = compareNumbers(
      {
        group_id: 1,
        play_type: 'direct',
        red_balls: [],
        blue_balls: [],
        digits: ['01', '01', '02'],
      },
      {
        lottery_code: 'pl3',
        period: '26067',
        date: '2026-03-18',
        red_balls: [],
        blue_balls: [],
        digits: ['01', '03', '02'],
      },
    )

    expect(hit?.digitHitIndexes).toEqual([0, 2])
    expect(hit?.digitHitCount).toBe(2)
    expect(hit?.totalHits).toBe(2)
  })

  it('counts group3 hits by unique numbers and group6 hits by numbers', () => {
    const group3Hit = compareNumbers(
      {
        group_id: 1,
        play_type: 'group3',
        red_balls: [],
        blue_balls: [],
        digits: ['01', '08', '08'],
      },
      {
        lottery_code: 'pl3',
        period: '26067',
        date: '2026-03-18',
        red_balls: [],
        blue_balls: [],
        digits: ['01', '01', '08'],
      },
    )
    const group6Hit = compareNumbers(
      {
        group_id: 2,
        play_type: 'group6',
        red_balls: [],
        blue_balls: [],
        digits: ['01', '03', '08'],
      },
      {
        lottery_code: 'pl3',
        period: '26067',
        date: '2026-03-18',
        red_balls: [],
        blue_balls: [],
        digits: ['08', '03', '01'],
      },
    )

    expect(group3Hit?.digitHitIndexes).toEqual([0, 1])
    expect(group3Hit?.digitHitCount).toBe(2)
    expect(group3Hit?.totalHits).toBe(2)
    expect(group6Hit?.digitHitIndexes).toEqual([0, 1, 2])
    expect(group6Hit?.digitHitCount).toBe(3)
  })

  it('counts direct_sum hit by sum equality', () => {
    const hit = compareNumbers(
      {
        group_id: 3,
        play_type: 'direct_sum',
        sum_value: '10',
        red_balls: [],
        blue_balls: [],
        digits: [],
      },
      {
        lottery_code: 'pl3',
        period: '26067',
        date: '2026-03-18',
        red_balls: [],
        blue_balls: [],
        digits: ['01', '02', '07'],
      },
    )

    expect(hit?.digitHitCount).toBe(1)
    expect(hit?.totalHits).toBe(1)
  })
})

describe('qxc treats last digit as blue zone', () => {
  it('counts last digit hit into blueHits for qxc direct', () => {
    const hit = compareNumbers(
      {
        group_id: 1,
        play_type: 'direct',
        red_balls: [],
        blue_balls: [],
        digits: ['01', '02', '03', '04', '05', '06', '14'],
      },
      {
        lottery_code: 'qxc',
        period: '26037',
        date: '2026-04-05',
        red_balls: [],
        blue_balls: [],
        digits: ['01', '02', '03', '04', '05', '06', '14'],
      },
    )

    expect(hit?.redHitCount).toBe(6)
    expect(hit?.blueHitCount).toBe(1)
    expect(hit?.blueHits).toEqual(['14'])
    expect(hit?.digitHitIndexes).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('places qxc last position numbers into summary blue bucket', () => {
    const summary = buildSummary(
      [
        {
          model_id: 'model-qxc',
          model_name: 'QXC Model',
          model_provider: 'openai_compatible',
          predictions: [
            {
              group_id: 1,
              play_type: 'direct',
              red_balls: [],
              blue_balls: [],
              digits: ['01', '02', '03', '04', '05', '06', '14'],
            },
          ],
        },
      ] as unknown as PredictionModel[],
      {},
      ['model-qxc'],
      false,
      false,
    )

    expect(summary.red.map((item) => item.ball)).toContain('01')
    expect(summary.red.map((item) => item.ball)).toContain('06')
    expect(summary.blue.map((item) => item.ball)).toEqual(['14'])
  })
})

describe('getPredictionPlayTypeLabel', () => {
  it('returns labels for pl3 and dlt play types', () => {
    expect(getPredictionPlayTypeLabel({ group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '02', '03'] })).toBe('直选')
    expect(getPredictionPlayTypeLabel({ group_id: 1, play_type: 'direct_sum', sum_value: '10', red_balls: [], blue_balls: [], digits: [] })).toBe('和值')
    expect(getPredictionPlayTypeLabel({ group_id: 1, play_type: 'pl3_dantuo', red_balls: [], blue_balls: [], digits: [] })).toBe('直选胆拖')
    expect(getPredictionPlayTypeLabel({ group_id: 1, play_type: 'group3', red_balls: [], blue_balls: [], digits: ['01', '01', '03'] })).toBe('组选3')
    expect(getPredictionPlayTypeLabel({ group_id: 1, red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['06', '07'] })).toBe('普通')
    expect(
      getPredictionPlayTypeLabel({
        group_id: 2,
        play_type: 'dlt_dantuo',
        red_balls: ['01', '02', '03', '04', '05', '06'],
        blue_balls: ['01', '02', '03'],
        front_dan: ['01', '02'],
        front_tuo: ['03', '04', '05', '06'],
        back_dan: ['01'],
        back_tuo: ['02', '03'],
      }),
    ).toBe('胆拖')
    expect(
      getPredictionPlayTypeLabel({
        group_id: 3,
        play_type: 'dlt_compound',
        red_balls: ['01', '02', '03', '04', '05', '06'],
        blue_balls: ['01', '02', '03'],
      }),
    ).toBe('复式')
  })
})

describe('normalizePredictionModelPlayMode', () => {
  it('prefers explicit prediction_play_mode when available', () => {
    expect(
      normalizePredictionModelPlayMode({
        model_id: 'm1',
        prediction_play_mode: 'direct_sum',
        model_name: 'Model 1',
        model_provider: 'openai',
        predictions: [],
      }),
    ).toBe('direct_sum')
  })

  it('infers direct_sum from prediction groups when mode missing', () => {
    expect(
      normalizePredictionModelPlayMode({
        model_id: 'm2',
        model_name: 'Model 2',
        model_provider: 'openai',
        predictions: [{ group_id: 1, play_type: 'direct_sum', sum_value: '12', red_balls: [], blue_balls: [], digits: [] }],
      }),
    ).toBe('direct_sum')
  })

  it('infers compound from explicit mode or group play type', () => {
    expect(
      normalizePredictionModelPlayMode({
        model_id: 'm3',
        prediction_play_mode: 'compound',
        model_name: 'Model 3',
        model_provider: 'openai',
        predictions: [],
      }),
    ).toBe('compound')

    expect(
      normalizePredictionModelPlayMode({
        model_id: 'm4',
        model_name: 'Model 4',
        model_provider: 'openai',
        predictions: [{ group_id: 1, play_type: 'dlt_compound', red_balls: ['01', '02', '03', '04', '05', '06'], blue_balls: ['01', '02'] }],
      }),
    ).toBe('compound')
  })

  it('infers dantuo from pl3 dantuo groups when mode missing', () => {
    expect(
      normalizePredictionModelPlayMode({
        model_id: 'm5',
        model_name: 'Model 5',
        model_provider: 'openai',
        predictions: [{ group_id: 1, play_type: 'pl3_dantuo', red_balls: [], blue_balls: [] }],
      }),
    ).toBe('dantuo')
  })
})

describe('buildModelScores', () => {
  it('prefers the current model score profile over paginated history stats', () => {
    const modelScores = buildModelScores(
      {
        model_stats: [
          {
            model_id: 'm1',
            model_name: 'Model 1',
            prediction_play_mode: 'direct',
            periods: 20,
            winning_periods: 4,
            bet_count: 100,
            winning_bet_count: 8,
            cost_amount: 200,
            prize_amount: 60,
            win_rate_by_period: 0.2,
            win_rate_by_bet: 0.08,
            score_profile: {
              overall_score: 34,
              per_bet_score: 22,
              per_period_score: 36,
              recent_score: 34,
              long_term_score: 34,
              component_scores: { profit: 28, hit_rate: 31, stability: 44, ceiling: 39, floor: 29 },
            } as never,
          },
        ],
        predictions_history: [],
        total_count: 0,
        strategy_options: [],
      },
      [
        {
          model_id: 'm1',
          model_name: 'Model 1',
          model_provider: 'openai',
          prediction_play_mode: 'direct',
          predictions: [],
          score_profile: {
            overall_score: 34,
            per_bet_score: 22,
            per_period_score: 36,
            recent_score: 34,
            long_term_score: 33,
            component_scores: { profit: 27, hit_rate: 30, stability: 44, ceiling: 39, floor: 29 },
          } as never,
        },
      ],
    )

    const score = resolveModelScore(modelScores, { model_id: 'm1', prediction_play_mode: 'direct', predictions: [] })
    expect(score?.recentScore).toBe(34)
    expect(score?.longTermScore).toBe(33)
  })

  it('falls back to history stats when the current model has no score profile', () => {
    const modelScores = buildModelScores(
      {
        model_stats: [
          {
            model_id: 'm1',
            model_name: 'Model 1',
            prediction_play_mode: 'direct',
            periods: 20,
            winning_periods: 4,
            bet_count: 100,
            winning_bet_count: 8,
            cost_amount: 200,
            prize_amount: 60,
            win_rate_by_period: 0.2,
            win_rate_by_bet: 0.08,
            score_profile: {
              overall_score: 34,
              per_bet_score: 22,
              per_period_score: 36,
              recent_score: 34,
              long_term_score: 34,
              component_scores: { profit: 28, hit_rate: 31, stability: 44, ceiling: 39, floor: 29 },
            } as never,
          },
        ],
        predictions_history: [],
        total_count: 0,
        strategy_options: [],
      },
      [{ model_id: 'm1', model_name: 'Model 1', model_provider: 'openai', prediction_play_mode: 'direct', predictions: [] }],
    )

    const score = resolveModelScore(modelScores, { model_id: 'm1', prediction_play_mode: 'direct', predictions: [] })
    expect(score?.recentScore).toBe(34)
    expect(score?.longTermScore).toBe(34)
  })

  it('keeps score profiles separated by prediction play mode for the same model id', () => {
    const modelScores = buildModelScores(
      {
        model_stats: [
          {
            model_id: 'm1',
            model_name: 'Model 1',
            prediction_play_mode: 'direct',
            periods: 8,
            winning_periods: 4,
            bet_count: 40,
            winning_bet_count: 8,
            cost_amount: 80,
            prize_amount: 110,
            win_rate_by_period: 0.5,
            win_rate_by_bet: 0.2,
            score_profile: {
              overall_score: 72,
              per_bet_score: 68,
              per_period_score: 75,
              recent_score: 78,
              long_term_score: 70,
              component_scores: { profit: 74, hit_rate: 71, stability: 69, ceiling: 80, floor: 58 },
            } as never,
          },
          {
            model_id: 'm1',
            model_name: 'Model 1',
            prediction_play_mode: 'compound',
            periods: 8,
            winning_periods: 3,
            bet_count: 160,
            winning_bet_count: 6,
            cost_amount: 320,
            prize_amount: 90,
            win_rate_by_period: 0.375,
            win_rate_by_bet: 0.0375,
            score_profile: {
              overall_score: 54,
              per_bet_score: 49,
              per_period_score: 58,
              recent_score: 56,
              long_term_score: 52,
              component_scores: { profit: 48, hit_rate: 53, stability: 57, ceiling: 61, floor: 45 },
            } as never,
          },
          {
            model_id: 'm1',
            model_name: 'Model 1',
            prediction_play_mode: 'dantuo',
            periods: 8,
            winning_periods: 6,
            bet_count: 52,
            winning_bet_count: 12,
            cost_amount: 104,
            prize_amount: 260,
            win_rate_by_period: 0.75,
            win_rate_by_bet: 0.2308,
            score_profile: {
              overall_score: 88,
              per_bet_score: 84,
              per_period_score: 90,
              recent_score: 91,
              long_term_score: 85,
              component_scores: { profit: 89, hit_rate: 86, stability: 84, ceiling: 92, floor: 79 },
            } as never,
          },
        ],
        predictions_history: [],
        total_count: 0,
        strategy_options: [],
      },
      [
        { model_id: 'm1', model_name: 'Model 1', model_provider: 'openai', prediction_play_mode: 'direct', predictions: [] },
        { model_id: 'm1', model_name: 'Model 1', model_provider: 'openai', prediction_play_mode: 'compound', predictions: [] },
        { model_id: 'm1', model_name: 'Model 1', model_provider: 'openai', prediction_play_mode: 'dantuo', predictions: [] },
      ],
    )

    expect(resolveModelScore(modelScores, { model_id: 'm1', prediction_play_mode: 'direct', predictions: [] })?.overallScore).toBe(72)
    expect(resolveModelScore(modelScores, { model_id: 'm1', prediction_play_mode: 'compound', predictions: [] })?.overallScore).toBe(54)
    expect(resolveModelScore(modelScores, { model_id: 'm1', prediction_play_mode: 'dantuo', predictions: [] })?.overallScore).toBe(88)
  })
})
