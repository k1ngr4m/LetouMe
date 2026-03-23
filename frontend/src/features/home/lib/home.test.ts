import { describe, expect, it } from 'vitest'
import { buildHistoryHitTrend, buildSummary, compareNumbers, filterModels, getPredictionPlayTypeLabel, resolveHistoryFallbackState } from './home'

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

  it('prompts before fallback when manual filter is active and no intersection', () => {
    const result = resolveHistoryFallbackState({
      hasHistoryRecords: true,
      hasManualModelFilter: true,
      hasCurrentModels: true,
      filteredModelIds: ['current-a'],
      historyModelIds: ['history-only'],
      historyFallbackEnabled: false,
    })

    expect(result.useHistoryFallbackModels).toBe(false)
    expect(result.needsHistoryFallbackPrompt).toBe(true)
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
})

describe('getPredictionPlayTypeLabel', () => {
  it('returns direct/group labels for pl3 groups and keeps dlt as 复式', () => {
    expect(getPredictionPlayTypeLabel({ group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '02', '03'] })).toBe('直选')
    expect(getPredictionPlayTypeLabel({ group_id: 1, play_type: 'group3', red_balls: [], blue_balls: [], digits: ['01', '01', '03'] })).toBe('组选3')
    expect(getPredictionPlayTypeLabel({ group_id: 1, red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['06', '07'] })).toBe('复式')
  })
})
