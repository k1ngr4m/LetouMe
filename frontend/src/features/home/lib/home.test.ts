import { describe, expect, it } from 'vitest'
import { buildHistoryHitTrend, buildSummary, filterModels } from './home'

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
