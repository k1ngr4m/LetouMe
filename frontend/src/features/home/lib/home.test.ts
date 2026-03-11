import { describe, expect, it } from 'vitest'
import { buildHistoryHitTrend } from './home'

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
              predictions: [],
              best_hit_count: 4,
            },
            {
              model_id: 'm2',
              model_name: 'Model 2',
              model_provider: 'gemini',
              predictions: [],
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
              predictions: [],
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
