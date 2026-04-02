import { useEffect, useMemo, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'
import { ToastProvider } from '../../shared/feedback/ToastProvider'

const {
  createMyBet,
  createSimulationTicket,
  deleteMyBet,
  deleteSimulationTicket,
  getMyBets,
  getPredictionsHistoryDetail,
  getSimulationTickets,
  quoteSimulationTicket,
  simulateDltModeCoexistCurrentPredictions,
  simulateDltCompoundCurrentPredictions,
  simulateDltDantuoCurrentPredictions,
  simulatePl3SumCurrentPredictions,
  simulatePl3SumHistoryMislabel,
  updateMyBet,
  simulateHistoryFilterLoading,
  toPng,
  setMotionPreference,
} = vi.hoisted(() => ({
  createMyBet: vi.fn(),
  createSimulationTicket: vi.fn(),
  deleteMyBet: vi.fn(),
  deleteSimulationTicket: vi.fn(),
  getMyBets: vi.fn(),
  getPredictionsHistoryDetail: vi.fn(),
  getSimulationTickets: vi.fn(),
  quoteSimulationTicket: vi.fn(),
  simulateDltModeCoexistCurrentPredictions: { current: false },
  simulateDltCompoundCurrentPredictions: { current: false },
  simulateDltDantuoCurrentPredictions: { current: false },
  simulatePl3SumCurrentPredictions: { current: false },
  simulatePl3SumHistoryMislabel: { current: false },
  updateMyBet: vi.fn(),
  simulateHistoryFilterLoading: { current: false },
  toPng: vi.fn(),
  setMotionPreference: vi.fn(),
}))

function buildHistoryRecord(period: string, date: string, primaryModelId: 'model-a' | 'model-b' = 'model-b') {
  const primaryModelName = primaryModelId === 'model-a' ? '模型A' : '模型B'
  const secondaryModelId = primaryModelId === 'model-a' ? 'model-b' : 'model-a'
  const secondaryModelName = secondaryModelId === 'model-a' ? '模型A' : '模型B'
  return {
    prediction_date: date,
    target_period: period,
    actual_result: {
      period,
      date,
      red_balls: ['01', '08', '12', '19', '25'],
      blue_balls: ['06', '11'],
    },
    period_summary: {
      total_bet_count: 10,
      total_cost_amount: 20,
      total_prize_amount: primaryModelId === 'model-a' ? 305 : 25,
    },
    models: [
      {
        model_id: primaryModelId,
        model_name: primaryModelName,
        model_provider: primaryModelId === 'model-a' ? 'openai_compatible' : 'deepseek',
        prediction_play_mode: 'direct',
        best_hit_count: primaryModelId === 'model-a' ? 3 : 2,
        bet_count: 5,
        cost_amount: 10,
        winning_bet_count: 1,
        prize_amount: primaryModelId === 'model-a' ? 300 : 15,
        hit_period_win: true,
      },
      {
        model_id: secondaryModelId,
        model_name: secondaryModelName,
        model_provider: secondaryModelId === 'model-a' ? 'openai_compatible' : 'deepseek',
        prediction_play_mode: 'direct',
        best_hit_count: 1,
        bet_count: 5,
        cost_amount: 10,
        winning_bet_count: 1,
        prize_amount: secondaryModelId === 'model-a' ? 10 : 5,
        hit_period_win: true,
      },
    ],
  }
}

const SECOND_HISTORY_RECORD = {
  prediction_date: '2026-03-11',
  target_period: '2026030',
  actual_result: {
    period: '2026030',
    date: '2026-03-08',
    red_balls: ['03', '04', '05', '06', '07'],
    blue_balls: ['08', '09'],
  },
  period_summary: {
    total_bet_count: 5,
    total_cost_amount: 10,
    total_prize_amount: 15,
  },
  models: [
    {
      model_id: 'model-b',
      model_name: '模型B',
      model_provider: 'deepseek',
      best_hit_count: 2,
      bet_count: 5,
      cost_amount: 10,
      winning_bet_count: 1,
      prize_amount: 15,
      hit_period_win: true,
    },
  ],
}

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    createMyBet,
    createSimulationTicket,
    deleteMyBet,
    deleteSimulationTicket,
    getMyBets,
    getPredictionsHistoryDetail,
    getSimulationTickets,
    quoteSimulationTicket,
    updateMyBet,
  },
}))

vi.mock('./hooks/useHomeData', () => ({
  useHomeData: (
    _lotteryCode: string,
    historyPage = 1,
    historyPageSize = 10,
    historyStrategyFilters: string[] = [],
    historyPlayTypeFilters: Array<'direct' | 'direct_sum' | 'group3' | 'group6' | 'dlt_dantuo' | 'dlt_compound'> = [],
    lotteryPage = 1,
    lotteryPageSize = 10,
  ) => {
    const isPl3 = _lotteryCode === 'pl3'
    const isPl5 = _lotteryCode === 'pl5'
    const [effectiveHistoryStrategyFilters, setEffectiveHistoryStrategyFilters] = useState(historyStrategyFilters)
    const [isHistoryFetching, setIsHistoryFetching] = useState(false)

    const modelStrategiesById: Record<string, string[]> = {
      'model-a': ['增强型热号追随者', 'AI 组合策略'],
      'model-b': ['冷号补位'],
    }
    const normalizedHistoryStrategyFilters = [...new Set(effectiveHistoryStrategyFilters)]
    const matchesHistoryStrategies = (modelId: string) =>
      !normalizedHistoryStrategyFilters.length ||
      normalizedHistoryStrategyFilters.every((strategy) => (modelStrategiesById[modelId] || []).includes(strategy))
    const compoundPredictions = [
      {
        group_id: 1,
        play_type: 'dlt_compound',
        strategy: '增强型综合决策者',
        red_balls: ['01', '02', '03', '04', '05', '06'],
        blue_balls: ['06', '07'],
      },
      {
        group_id: 2,
        play_type: 'dlt_compound',
        strategy: '增强型综合决策者',
        red_balls: ['08', '09', '10', '11', '12', '13', '14'],
        blue_balls: ['01', '02'],
      },
      {
        group_id: 3,
        play_type: 'dlt_compound',
        strategy: '增强型综合决策者',
        red_balls: ['15', '16', '17', '18', '19', '20'],
        blue_balls: ['03', '04', '05'],
      },
      {
        group_id: 4,
        play_type: 'dlt_compound',
        strategy: '增强型综合决策者',
        red_balls: ['21', '22', '23', '24', '25', '26', '27'],
        blue_balls: ['08', '09', '10'],
      },
    ]

    const historyRecords = [
      buildHistoryRecord('2026031', '2026-03-10', 'model-a'),
      SECOND_HISTORY_RECORD,
      buildHistoryRecord('2026029', '2026-03-06', 'model-a'),
      buildHistoryRecord('2026028', '2026-03-04', 'model-b'),
      buildHistoryRecord('2026027', '2026-03-02', 'model-a'),
      buildHistoryRecord('2026026', '2026-02-28', 'model-b'),
      buildHistoryRecord('2026025', '2026-02-26', 'model-a'),
      buildHistoryRecord('2026024', '2026-02-24', 'model-b'),
      buildHistoryRecord('2026023', '2026-02-22', 'model-a'),
      buildHistoryRecord('2026022', '2026-02-20', 'model-b'),
      buildHistoryRecord('2026021', '2026-02-18', 'model-a'),
      buildHistoryRecord('2026020', '2026-02-16', 'model-b'),
    ].map((record) => {
      if (!isPl3 && simulateDltDantuoCurrentPredictions.current) {
        return {
          ...record,
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'dantuo',
              best_hit_count: 3,
              bet_count: 5,
              cost_amount: 10,
              winning_bet_count: 1,
              prize_amount: 300,
              hit_period_win: true,
            },
          ],
        }
      }
      if (!isPl3 && simulateDltCompoundCurrentPredictions.current) {
        return {
          ...record,
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'compound',
              best_hit_count: 3,
              bet_count: 51,
              cost_amount: 102,
              winning_bet_count: 2,
              prize_amount: 300,
              hit_period_win: true,
            },
          ],
        }
      }
      if (!isPl3 || !simulatePl3SumHistoryMislabel.current) return record
      return {
        ...record,
        models: (record.models || []).map((model, index) =>
          index === 0
            ? {
                ...model,
                prediction_play_mode: 'direct',
                play_type: 'direct_sum',
              }
            : model,
        ),
      }
    })
    const filteredHistoryRecords = historyRecords
      .map((record) => {
        const models = (record.models || []).filter((model) => {
          if (!matchesHistoryStrategies(model.model_id)) return false
          if (!historyPlayTypeFilters.length) return true
          if (!isPl3) {
            const modelPlayMode = String((model as { prediction_play_mode?: string }).prediction_play_mode || 'direct').trim().toLowerCase()
            if (historyPlayTypeFilters.includes('dlt_dantuo')) return modelPlayMode === 'dantuo'
            if (historyPlayTypeFilters.includes('dlt_compound')) return modelPlayMode === 'compound'
            return modelPlayMode === 'direct'
          }
          const modelPlayType = String((model as { play_type?: string }).play_type || 'direct').trim().toLowerCase()
          return historyPlayTypeFilters.includes(modelPlayType as 'direct' | 'direct_sum' | 'group3' | 'group6')
        })
        const periodSummary = models.reduce(
          (accumulator, model) => ({
            total_bet_count: accumulator.total_bet_count + Number(model.bet_count || 0),
            total_cost_amount: accumulator.total_cost_amount + Number(model.cost_amount || 0),
            total_prize_amount: accumulator.total_prize_amount + Number(model.prize_amount || 0),
          }),
          {
            total_bet_count: 0,
            total_cost_amount: 0,
            total_prize_amount: 0,
          },
        )
        return {
          ...record,
          models,
          period_summary: periodSummary,
        }
      })
      .filter((record) => record.models.length > 0)
    const offset = (historyPage - 1) * historyPageSize
    const pagedHistoryRecords = filteredHistoryRecords.slice(offset, offset + historyPageSize)
    const lotteryRecords = Array.from({ length: 12 }, (_, index) => ({
      period: `${2026031 - index}`,
      date: `2026-03-${String(10 - index).padStart(2, '0')}`,
      red_balls: ['01', '02', '03', '04', '05'],
      blue_balls: ['06', '07'],
    }))
    const lotteryOffset = (lotteryPage - 1) * lotteryPageSize
    const pagedLotteryRecords = lotteryRecords.slice(lotteryOffset, lotteryOffset + lotteryPageSize)
    const currentHistoryPayload = useMemo(
      () => ({
        model_stats: !isPl3 && simulateDltModeCoexistCurrentPredictions.current
          ? [
              {
                model_id: 'model-a',
                model_name: '模型A',
                prediction_play_mode: 'direct',
                periods: 8,
                winning_periods: 5,
                bet_count: 40,
                winning_bet_count: 10,
                cost_amount: 80,
                prize_amount: 160,
                win_rate_by_period: 0.625,
                win_rate_by_bet: 0.25,
                score_profile: {
                  overall_score: 72,
                  per_bet_score: 68,
                  per_period_score: 75,
                  recent_score: 78,
                  long_term_score: 70,
                  component_scores: {
                    profit: 74,
                    hit_rate: 71,
                    stability: 69,
                    ceiling: 80,
                    floor: 58,
                  },
                },
              },
              {
                model_id: 'model-a',
                model_name: '模型A',
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
                  component_scores: {
                    profit: 48,
                    hit_rate: 53,
                    stability: 57,
                    ceiling: 61,
                    floor: 45,
                  },
                },
              },
              {
                model_id: 'model-a',
                model_name: '模型A',
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
                  component_scores: {
                    profit: 89,
                    hit_rate: 86,
                    stability: 84,
                    ceiling: 92,
                    floor: 79,
                  },
                },
              },
            ]
          : [
              {
                model_id: 'model-a',
                model_name: '模型A',
                prediction_play_mode:
                  !isPl3 && simulateDltDantuoCurrentPredictions.current
                    ? 'dantuo'
                    : !isPl3 && simulateDltCompoundCurrentPredictions.current
                      ? 'compound'
                      : 'direct',
                periods: 8,
                winning_periods: 5,
                bet_count: 40,
                winning_bet_count: 10,
                cost_amount: 80,
                prize_amount: 160,
                win_rate_by_period: 0.625,
                win_rate_by_bet: 0.25,
                score_profile: {
                  overall_score: 72,
                  per_bet_score: 68,
                  per_period_score: 75,
                  recent_score: 78,
                  long_term_score: 70,
                  component_scores: {
                    profit: 74,
                    hit_rate: 71,
                    stability: 69,
                    ceiling: 80,
                    floor: 58,
                  },
                },
              },
              {
                model_id: 'model-b',
                model_name: '模型B',
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
                  overall_score: 61,
                  per_bet_score: 57,
                  per_period_score: 64,
                  recent_score: 59,
                  long_term_score: 63,
                  component_scores: {
                    profit: 60,
                    hit_rate: 62,
                    stability: 58,
                    ceiling: 67,
                    floor: 52,
                  },
                },
              },
            ],
        predictions_history: pagedHistoryRecords,
        total_count: filteredHistoryRecords.length,
        strategy_options: ['AI 组合策略', '冷号补位', '增强型热号追随者'],
      }),
      [filteredHistoryRecords.length, isPl3, pagedHistoryRecords],
    )
    const currentModels = isPl3
      ? [
          ...(simulatePl3SumCurrentPredictions.current
            ? [
                {
                  model_id: 'model-a',
                  model_name: '模型A',
                  model_provider: 'openai_compatible',
                  model_tags: ['reasoning'],
                  model_api_model: 'model-a-api',
                  prediction_play_mode: 'direct_sum',
                  predictions: [
                    { group_id: 1, play_type: 'direct_sum', sum_value: '10', red_balls: [], blue_balls: [], digits: [] },
                    { group_id: 2, play_type: 'direct_sum', sum_value: '11', red_balls: [], blue_balls: [], digits: [] },
                  ],
                },
                {
                  model_id: 'model-b',
                  model_name: '模型B',
                  model_provider: 'deepseek',
                  model_tags: ['fast'],
                  model_api_model: 'model-b-api',
                  prediction_play_mode: 'direct_sum',
                  predictions: [
                    { group_id: 1, play_type: 'direct_sum', sum_value: '10', red_balls: [], blue_balls: [], digits: [] },
                  ],
                },
              ]
            : [
                {
                  model_id: 'model-a',
                  model_name: '模型A',
                  model_provider: 'openai_compatible',
                  model_tags: ['reasoning'],
                  model_api_model: 'model-a-api',
                  predictions: [
                    { group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '02', '03'] },
                    { group_id: 2, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '01', '03'] },
                    { group_id: 3, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '02', '04'] },
                  ],
                },
                {
                  model_id: 'model-b',
                  model_name: '模型B',
                  model_provider: 'deepseek',
                  model_tags: ['fast'],
                  model_api_model: 'model-b-api',
                  predictions: [
                    { group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['04', '05', '06'] },
                    { group_id: 2, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['04', '06', '07'] },
                  ],
                },
              ]),
        ]
      : isPl5
        ? [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              model_tags: ['reasoning'],
              model_api_model: 'model-a-api',
              predictions: Array.from({ length: 5 }, (_, index) => ({
                group_id: index + 1,
                play_type: 'direct',
                strategy: index < 3 ? '增强型热号追随者' : 'AI 组合策略',
                red_balls: [],
                blue_balls: [],
                digits: ['01', '02', '03', '04', '05'],
              })),
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              model_tags: ['fast'],
              model_api_model: 'model-b-api',
              predictions: Array.from({ length: 5 }, (_, index) => ({
                group_id: index + 1,
                play_type: 'direct',
                strategy: '冷号补位',
                red_balls: [],
                blue_balls: [],
                digits: ['06', '07', '08', '09', '00'],
              })),
            },
          ]
      : simulateDltModeCoexistCurrentPredictions.current
        ? [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              model_tags: ['reasoning'],
              model_api_model: 'model-a-api',
              prediction_play_mode: 'direct',
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct',
                  strategy: '增强型热号追随者',
                  red_balls: ['01', '02', '03', '04', '05'],
                  blue_balls: ['06', '07'],
                },
              ],
            },
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              model_tags: ['reasoning'],
              model_api_model: 'model-a-api',
              prediction_play_mode: 'compound',
              predictions: compoundPredictions,
            },
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              model_tags: ['reasoning'],
              model_api_model: 'model-a-api',
              prediction_play_mode: 'dantuo',
              predictions: [
                {
                  group_id: 1,
                  play_type: 'dlt_dantuo',
                  strategy: '增强型热号追随者',
                  front_dan: ['01', '08'],
                  front_tuo: ['12', '19', '25', '31'],
                  back_dan: ['06'],
                  back_tuo: ['11'],
                  red_balls: ['01', '08', '12', '19', '25', '31'],
                  blue_balls: ['06', '11'],
                },
              ],
            },
          ]
        : simulateDltCompoundCurrentPredictions.current
        ? [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              model_tags: ['reasoning'],
              model_api_model: 'model-a-api',
              prediction_play_mode: 'compound',
              predictions: compoundPredictions,
            },
          ]
        : simulateDltDantuoCurrentPredictions.current
        ? [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              model_tags: ['reasoning'],
              model_api_model: 'model-a-api',
              prediction_play_mode: 'dantuo',
              predictions: [
                {
                  group_id: 1,
                  play_type: 'dlt_dantuo',
                  strategy: '增强型热号追随者',
                  front_dan: ['01', '08'],
                  front_tuo: ['12', '19', '25', '31'],
                  back_dan: ['06'],
                  back_tuo: ['11'],
                  red_balls: ['01', '08', '12', '19', '25', '31'],
                  blue_balls: ['06', '11'],
                },
              ],
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              model_tags: ['fast'],
              model_api_model: 'model-b-api',
              prediction_play_mode: 'dantuo',
              predictions: [
                {
                  group_id: 1,
                  play_type: 'dlt_dantuo',
                  strategy: '冷号补位',
                  front_dan: ['01', '09'],
                  front_tuo: ['12', '22', '25', '32'],
                  back_dan: ['06'],
                  back_tuo: ['12'],
                  red_balls: ['01', '09', '12', '22', '25', '32'],
                  blue_balls: ['06', '12'],
                },
              ],
            },
          ]
        : [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              model_tags: ['reasoning'],
              model_api_model: 'model-a-api',
              predictions: Array.from({ length: 5 }, (_, index) => ({
                group_id: index + 1,
                strategy: index < 3 ? '增强型热号追随者' : 'AI 组合策略',
                red_balls: ['01', '02', '03', '04', '05'],
                blue_balls: ['06', '07'],
              })),
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              model_tags: ['fast'],
              model_api_model: 'model-b-api',
              predictions: Array.from({ length: 5 }, (_, index) => ({
                group_id: index + 1,
                strategy: '冷号补位',
                red_balls: ['08', '09', '10', '11', '12'],
                blue_balls: ['01', '02'],
              })),
            },
          ]
    const lotteryHistoryData = isPl3
      ? [
          {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '01', '02'],
            blue_balls: [],
            digits: ['01', '01', '02'],
            lottery_code: 'pl3',
          },
          {
            period: '2026030',
            date: '2026-03-08',
            red_balls: ['03', '04', '05'],
            blue_balls: [],
            digits: ['03', '04', '05'],
            lottery_code: 'pl3',
          },
        ]
      : isPl5
        ? [
            {
              period: '2026031',
              date: '2026-03-10',
              red_balls: [],
              blue_balls: [],
              digits: ['01', '02', '03', '04', '05'],
              lottery_code: 'pl5',
            },
            {
              period: '2026030',
              date: '2026-03-08',
              red_balls: [],
              blue_balls: [],
              digits: ['06', '07', '08', '09', '00'],
              lottery_code: 'pl5',
            },
          ]
        : [
          {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '02', '03', '04', '05'],
            blue_balls: ['06', '07'],
          },
          {
            period: '2026030',
            date: '2026-03-08',
            red_balls: ['08', '09', '10', '11', '12'],
            blue_balls: ['01', '02'],
          },
        ]
    useEffect(() => {
      if (!simulateHistoryFilterLoading.current) {
        setEffectiveHistoryStrategyFilters(historyStrategyFilters)
        setIsHistoryFetching(false)
        return
      }

      setIsHistoryFetching(true)
      const timer = window.setTimeout(() => {
        setEffectiveHistoryStrategyFilters(historyStrategyFilters)
        setIsHistoryFetching(false)
      }, 150)

      return () => window.clearTimeout(timer)
    }, [historyStrategyFilters])

    return {
      currentPredictions: {
        data: {
          prediction_date: '2026-03-12',
          target_period: '2026032',
          models: currentModels,
        },
        isLoading: false,
        error: null,
      },
      lotteryCharts: {
        data: {
          data: lotteryHistoryData,
          next_draw: {
            next_date_display: '2026-03-15',
          },
        },
        isLoading: false,
        error: null,
      },
      predictionsHistory: {
        data: currentHistoryPayload,
        isFetching: isHistoryFetching,
        isLoading: isHistoryFetching,
        error: null,
      },
      pagedLotteryHistory: {
        data: {
          data: pagedLotteryRecords,
          total_count: lotteryRecords.length,
        },
        isLoading: false,
        error: null,
      },
    }
  },
}))

vi.mock('html-to-image', () => ({
  toPng,
}))

vi.mock('../../shared/theme/MotionProvider', () => ({
  useMotion: () => ({
    motionLevel: 'normal',
    motionPreference: 'system',
    setMotionPreference,
  }),
}))

function renderPage(initialEntry = '/dashboard/prediction') {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  function LocationDisplay() {
    const location = useLocation()
    return <div data-testid="location-display">{location.pathname}</div>
  }

  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              path="/dashboard/:tab"
              element={
                <>
                  <HomePage />
                  <LocationDisplay />
                </>
              }
            />
            <Route path="/dashboard/models/:modelId" element={<LocationDisplay />} />
            <Route path="/dashboard/rules" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  simulateHistoryFilterLoading.current = false
  simulateDltModeCoexistCurrentPredictions.current = false
  simulateDltCompoundCurrentPredictions.current = false
  simulateDltDantuoCurrentPredictions.current = false
  simulatePl3SumCurrentPredictions.current = false
  simulatePl3SumHistoryMislabel.current = false
  toPng.mockReset()
  toPng.mockResolvedValue('data:image/png;base64,mock-image')
  setMotionPreference.mockReset()
  getMyBets.mockReset()
  getMyBets.mockResolvedValue({
    records: [
      {
        id: 1,
        lottery_code: 'dlt',
        target_period: '2026032',
        play_type: 'dlt',
        front_numbers: ['01', '02', '03', '04', '05'],
        back_numbers: ['06', '07'],
        direct_hundreds: [],
        direct_tens: [],
        direct_units: [],
        group_numbers: [],
        multiplier: 1,
        is_append: false,
        bet_count: 1,
        amount: 2,
        settlement_status: 'pending',
        winning_bet_count: 0,
        prize_level: null,
        prize_amount: 0,
        net_profit: -2,
        settled_at: null,
        created_at: '2026-03-18T00:00:00Z',
        updated_at: '2026-03-18T00:00:00Z',
      },
    ],
    summary: {
      total_count: 1,
      total_amount: 2,
      total_prize_amount: 0,
      total_net_profit: -2,
      settled_count: 0,
      pending_count: 1,
    },
  })
  createMyBet.mockReset()
  createMyBet.mockResolvedValue({
    record: {
      id: 2,
      lottery_code: 'dlt',
      target_period: '2026033',
      play_type: 'dlt',
      front_numbers: ['01', '02', '03', '04', '05'],
      back_numbers: ['06', '07'],
      direct_hundreds: [],
      direct_tens: [],
      direct_units: [],
      group_numbers: [],
      multiplier: 1,
      is_append: false,
      bet_count: 1,
      amount: 2,
      settlement_status: 'pending',
      winning_bet_count: 0,
      prize_level: null,
      prize_amount: 0,
      net_profit: -2,
      settled_at: null,
      created_at: '2026-03-18T00:00:00Z',
      updated_at: '2026-03-18T00:00:00Z',
    },
  })
  updateMyBet.mockReset()
  updateMyBet.mockResolvedValue({
    record: {
      id: 1,
      lottery_code: 'dlt',
      target_period: '2026032',
      play_type: 'dlt',
      front_numbers: ['01', '02', '03', '04', '05'],
      back_numbers: ['06', '07'],
      direct_hundreds: [],
      direct_tens: [],
      direct_units: [],
      group_numbers: [],
      multiplier: 2,
      is_append: false,
      bet_count: 1,
      amount: 4,
      settlement_status: 'pending',
      winning_bet_count: 0,
      prize_level: null,
      prize_amount: 0,
      net_profit: -4,
      settled_at: null,
      created_at: '2026-03-18T00:00:00Z',
      updated_at: '2026-03-18T00:00:00Z',
    },
  })
  deleteMyBet.mockReset()
  deleteMyBet.mockResolvedValue({ success: true })
  createSimulationTicket.mockReset()
  createSimulationTicket.mockResolvedValue({
    ticket: {
      id: 1,
      front_numbers: ['01', '02', '03', '04', '05'],
      back_numbers: ['06', '07'],
      bet_count: 1,
      amount: 2,
      created_at: '2026-03-18T00:00:00Z',
    },
  })
  deleteSimulationTicket.mockReset()
  deleteSimulationTicket.mockResolvedValue({ success: true })
  getPredictionsHistoryDetail.mockReset()
  getSimulationTickets.mockReset()
  getSimulationTickets.mockResolvedValue({ tickets: [] })
  quoteSimulationTicket.mockReset()
  quoteSimulationTicket.mockImplementation(async (payload: Record<string, unknown>) => {
    const lotteryCode = payload.lottery_code === 'pl3' ? 'pl3' : 'dlt'
    if (lotteryCode === 'pl3') {
      const playType = String(payload.play_type || 'direct')
      const pl3DirectSumBetCounts: Record<string, number> = {
        '00': 1, '01': 3, '02': 6, '03': 10, '04': 15, '05': 21, '06': 28, '07': 36, '08': 45, '09': 55,
        '10': 63, '11': 69, '12': 73, '13': 75, '14': 75, '15': 73, '16': 69, '17': 63, '18': 55, '19': 45,
        '20': 36, '21': 28, '22': 21, '23': 15, '24': 10, '25': 6, '26': 3, '27': 1,
      }
      if (playType === 'direct') {
        const hundreds = Array.isArray(payload.direct_hundreds) ? payload.direct_hundreds.length : 0
        const tens = Array.isArray(payload.direct_tens) ? payload.direct_tens.length : 0
        const units = Array.isArray(payload.direct_units) ? payload.direct_units.length : 0
        const betCount = hundreds && tens && units ? hundreds * tens * units : 0
        return { lottery_code: 'pl3', play_type: playType, bet_count: betCount, amount: betCount * 2 }
      }
      if (playType === 'direct_sum') {
        const sumValues = Array.isArray(payload.sum_values) ? payload.sum_values.map((item) => String(item).padStart(2, '0')) : []
        const betCount = sumValues.reduce((sum, value) => sum + Number(pl3DirectSumBetCounts[value] || 0), 0)
        return { lottery_code: 'pl3', play_type: playType, bet_count: betCount, amount: betCount * 2 }
      }
      const groupCount = Array.isArray(payload.group_numbers) ? payload.group_numbers.length : 0
      const betCount = playType === 'group3'
        ? (groupCount >= 2 ? groupCount * (groupCount - 1) : 0)
        : (groupCount >= 3 ? (groupCount * (groupCount - 1) * (groupCount - 2)) / 6 : 0)
      return { lottery_code: 'pl3', play_type: playType, bet_count: betCount, amount: betCount * 2 }
    }
    if (String(payload.play_type || 'dlt') === 'dlt_dantuo') {
      const frontDanValues = Array.isArray(payload.front_dan) ? payload.front_dan.map(String) : []
      const frontTuoValues = Array.isArray(payload.front_tuo) ? payload.front_tuo.map(String) : []
      const backDanValues = Array.isArray(payload.back_dan) ? payload.back_dan.map(String) : []
      const backTuoValues = Array.isArray(payload.back_tuo) ? payload.back_tuo.map(String) : []
      const frontDan = frontDanValues.length
      const frontTuo = frontTuoValues.length
      const backDan = backDanValues.length
      const backTuo = backTuoValues.length
      const hasOverlap = (left: string[], right: string[]) => right.some((item) => left.includes(item))
      const combination = (total: number, choose: number) => {
        if (choose < 0 || choose > total) return 0
        if (choose === 0 || choose === total) return 1
        const actualChoose = Math.min(choose, total - choose)
        let result = 1
        for (let index = 1; index <= actualChoose; index += 1) {
          result = (result * (total - actualChoose + index)) / index
        }
        return Math.round(result)
      }
      const frontPickCount = 5 - frontDan
      const backPickCount = 2 - backDan
      const betCount = frontDan >= 1 &&
        frontDan <= 4 &&
        frontTuo >= 2 &&
        !hasOverlap(frontDanValues, frontTuoValues) &&
        new Set([...frontDanValues, ...frontTuoValues]).size >= 6 &&
        backDan <= 1 &&
        backTuo >= 2 &&
        !hasOverlap(backDanValues, backTuoValues) &&
        new Set([...backDanValues, ...backTuoValues]).size >= 3 &&
        frontTuo >= frontPickCount &&
        backTuo >= backPickCount
        ? combination(frontTuo, frontPickCount) * combination(backTuo, backPickCount)
        : 0
      return { lottery_code: 'dlt', play_type: 'dlt_dantuo', bet_count: betCount, amount: betCount * 2 }
    }
    const frontCount = Array.isArray(payload.front_numbers) ? payload.front_numbers.length : 0
    const backCount = Array.isArray(payload.back_numbers) ? payload.back_numbers.length : 0
    const combination = (total: number, choose: number) => {
      if (choose < 0 || choose > total) return 0
      if (choose === 0 || choose === total) return 1
      const actualChoose = Math.min(choose, total - choose)
      let result = 1
      for (let index = 1; index <= actualChoose; index += 1) {
        result = (result * (total - actualChoose + index)) / index
      }
      return Math.round(result)
    }
    const betCount = frontCount >= 5 && backCount >= 2 ? combination(frontCount, 5) * combination(backCount, 2) : 0
    return { lottery_code: 'dlt', play_type: 'dlt', bet_count: betCount, amount: betCount * 2 }
  })
})

describe('HomePage dashboard sidebar', () => {
  it('shows standalone summary cards between disclaimer and model list on prediction tab', () => {
    renderPage()

    expect(screen.queryByText('Prediction Command Center')).not.toBeInTheDocument()

    const summary = screen.getByLabelText('当前预测摘要')
    expect(within(summary).getByText('目标期号')).toBeInTheDocument()
    expect(within(summary).getByText('下期开奖日')).toBeInTheDocument()
    expect(within(summary).getByText('预测日期')).toBeInTheDocument()
    expect(within(summary).getByText('开奖状态')).toBeInTheDocument()

    const modelSectionTitle = screen.getByRole('heading', { name: '模型列表' })
    expect(summary.compareDocumentPosition(modelSectionTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows local sidebar navigation on prediction tab', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: '模型列表' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '预测统计' })).toBeInTheDocument()
    expect(screen.queryByText('评分加权')).not.toBeInTheDocument()
  })

  it('filters model list with model provider, tag and score range', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    await userEvent.click(screen.getByRole('button', { name: 'deepseek' }))
    await userEvent.click(screen.getByRole('button', { name: '81-100 分' }))

    expect(screen.getByText('已显示 0 / 2 个模型')).toBeInTheDocument()
    expect(screen.getByText('没有符合当前筛选条件的模型。')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '清空筛选' }))

    await waitFor(() => {
      expect(screen.getByText('已显示 2 / 2 个模型')).toBeInTheDocument()
    })
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('模型B').length).toBeGreaterThan(0)
  })

  it('supports fuzzy-search selection and selected model chips in filter panel', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    const filterPanel = screen.getByText('名称搜索').closest('.model-filter-panel')
    expect(filterPanel).not.toBeNull()
    await userEvent.click(within(filterPanel as HTMLElement).getByRole('button', { name: '清空筛选' }))
    const modelAButtonsAfterClear = within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型A' })
    expect(modelAButtonsAfterClear.length).toBeGreaterThan(0)
    expect(modelAButtonsAfterClear[0]).toHaveClass('is-active')

    await userEvent.type(within(filterPanel as HTMLElement).getByPlaceholderText('按模型名称或ID筛选'), '型a')
    const matchedModelAButton = within(filterPanel as HTMLElement)
      .getAllByRole('button', { name: '模型A' })
      .find((button) => !button.classList.contains('is-inactive'))
    expect(matchedModelAButton).toBeDefined()
    await userEvent.click(matchedModelAButton as HTMLElement)
    const modelAButtonsAfterSelect = within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型A' })
    expect(modelAButtonsAfterSelect.some((button) => button.classList.contains('is-active'))).toBe(true)

    await userEvent.click(within(filterPanel as HTMLElement).getByRole('button', { name: '清空筛选' }))
    const modelAButtonsAfterSecondClear = within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型A' })
    expect(modelAButtonsAfterSecondClear.some((button) => button.classList.contains('is-active'))).toBe(true)
  })

  it('switches model overview across list, card and score views', async () => {
    renderPage()

    expect(screen.getByRole('button', { name: '列表视图' })).toHaveClass('is-active')
    expect(screen.getByRole('columnheader', { name: '模型' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '预测号码' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '评分摘要' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/综合 \d+ · 按注 \d+/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/按期 \d+ · 近期\/长期 \d+\/\d+/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /查看详情：/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))

    expect(screen.getByRole('button', { name: '卡片视图' })).toHaveClass('is-active')
    expect(screen.getByRole('heading', { name: '模型A' })).toBeInTheDocument()
    expect(screen.getAllByText('本期预测号码').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/综合 \d+/).length).toBeGreaterThan(0)
    expect(screen.queryByText('接口模型')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))

    expect(screen.getByRole('button', { name: '评分视图' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: '收益分排序' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '稳定性排序' })).toBeInTheDocument()
    expect(screen.queryByText('本期预测号码')).not.toBeInTheDocument()
  })

  it('shows per-group cost summary in model list and card views', async () => {
    renderPage()

    expect(screen.getAllByText('成本 1注/2元').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))
    expect(screen.getAllByText('成本 1注/2元').length).toBeGreaterThan(0)
  })

  it('removes standalone overall score and api model columns from list view', () => {
    renderPage()

    expect(screen.queryByRole('columnheader', { name: '综合分' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '接口模型' })).not.toBeInTheDocument()
  })

  it('sorts score view by selected score dimension', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))

    const rowsBefore = screen.getAllByRole('row').slice(1)
    expect(within(rowsBefore[0]).getByText('模型A')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '下限分排序' }))

    const rowsAfterFirstSort = screen.getAllByRole('row').slice(1)
    expect(within(rowsAfterFirstSort[0]).getByText('模型A')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '下限分排序' }))

    const rowsAfterSecondSort = screen.getAllByRole('row').slice(1)
    expect(within(rowsAfterSecondSort[0]).getByText('模型B')).toBeInTheDocument()
  })

  it('shows score definition tooltip in score view without affecting sorting', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))

    const profitInfoButton = screen.getByRole('button', { name: '收益分定义' })
    await userEvent.hover(profitInfoButton)

    const tooltip = await screen.findByRole('tooltip')
    expect(within(tooltip).getByText('收益分')).toBeInTheDocument()
    expect(within(tooltip).getByText('反映模型历史奖金回报和盈利能力的评分。')).toBeInTheDocument()

    const rowsAfterHover = screen.getAllByRole('row').slice(1)
    expect(within(rowsAfterHover[0]).getByText('模型A')).toBeInTheDocument()
  })

  it('navigates to model detail page when clicking list row data', async () => {
    renderPage()

    const modelARow = screen.getByRole('button', { name: '查看详情：模型A' }).closest('tr')
    expect(modelARow).not.toBeNull()
    await userEvent.click(within(modelARow as HTMLElement).getByText('openai_compatible'))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/models/model-a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates to model detail page when clicking card data', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))
    await userEvent.click(screen.getByRole('heading', { name: '模型A' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/models/model-a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates to model detail page when clicking score row data', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))
    const modelARow = screen.getByText('openai_compatible').closest('tr')
    expect(modelARow).not.toBeNull()
    await userEvent.click(within(modelARow as HTMLElement).getByText('openai_compatible'))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/models/model-a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exports model detail png from list and card views', async () => {
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '更多操作：模型A' }))
    await userEvent.click(screen.getByRole('button', { name: '导出详情' }))
    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1))
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('导出成功，已开始下载。')
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/prediction')

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))
    await userEvent.click(screen.getByRole('button', { name: '导出详情：模型A' }))
    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toHaveTextContent('导出成功，已开始下载。')

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 2500 })

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))
    expect(screen.queryByRole('button', { name: /导出详情：/ })).not.toBeInTheDocument()

    anchorClickSpy.mockRestore()
  })

  it('updates url when switching dashboard tabs', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/history')
  })

  it('navigates to rules page from tab strip', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '规则' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/rules')
  })

  it('shows strategy filters for dlt views', async () => {
    renderPage()

    expect(screen.getByText('方案筛选')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))

    expect(screen.getByText('开奖方案筛选')).toBeInTheDocument()
  })

  it('hides strategy filters in dlt dantuo mode', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))
    expect(screen.queryByText('方案筛选')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    expect(screen.queryByText('开奖方案筛选')).not.toBeInTheDocument()
    expect(screen.queryByText('正在更新开奖方案筛选结果...')).not.toBeInTheDocument()
  })

  it('shows four dlt dantuo summary sections in prediction overview', async () => {
    simulateDltDantuoCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))

    expect(screen.getByText('前区胆统计')).toBeInTheDocument()
    expect(screen.getByText('前区拖统计')).toBeInTheDocument()
    expect(screen.getByText('后区胆统计')).toBeInTheDocument()
    expect(screen.getByText('后区拖统计')).toBeInTheDocument()
    expect(screen.queryByText('前区统计')).not.toBeInTheDocument()
    expect(screen.queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('keeps dlt direct and dantuo current predictions separate by mode switch', async () => {
    simulateDltModeCoexistCurrentPredictions.current = true
    renderPage()

    expect(screen.queryByText('前胆')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))

    expect(screen.getByText('前胆')).toBeInTheDocument()
    expect(screen.getByText('前拖')).toBeInTheDocument()
  })

  it('uses separate dlt scores for direct compound and dantuo modes', async () => {
    simulateDltModeCoexistCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))
    expect(screen.getByRole('cell', { name: '综合分 72分' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '复式' }))
    expect(screen.getByRole('cell', { name: '综合分 54分' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))
    expect(screen.getByRole('cell', { name: '综合分 88分' })).toBeInTheDocument()
  })

  it('shows four fixed compound groups in dlt prediction overview', async () => {
    simulateDltCompoundCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '复式' }))

    expect(screen.getAllByText('复式').length).toBeGreaterThan(0)
    expect(screen.getByText('成本 6注/12元')).toBeInTheDocument()
    expect(screen.getByText('成本 63注/126元')).toBeInTheDocument()
    expect(screen.getAllByText('01').length).toBeGreaterThan(0)
    expect(screen.getAllByText('27').length).toBeGreaterThan(0)
  })

  it('filters dlt history records by compound mode', async () => {
    simulateDltCompoundCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '复式' })[0])

    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()
    const historyRecords = (historySection as HTMLElement).querySelector('.history-card-list__records')
    expect(historyRecords).not.toBeNull()
    expect(within(historyRecords as HTMLElement).getAllByText('模型A').length).toBeGreaterThan(0)
    expect(within(historyRecords as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
  })

  it('applies model list filters to number summary candidates', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    await userEvent.click(screen.getByRole('button', { name: 'openai_compatible' }))

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()

    expect(within(summarySection as HTMLElement).getByRole('button', { name: '模型A' })).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).queryByRole('button', { name: '模型B' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '81-100 分' }))
    expect(within(summarySection as HTMLElement).getByText('当前筛选条件下没有可统计的模型。')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByRole('button', { name: '导出统计' })).toBeDisabled()
  })

  it('exports prediction summary png from summary card', async () => {
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '导出统计' }))
    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1))
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('导出成功，已开始下载。')
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/prediction')

    anchorClickSpy.mockRestore()
  })

  it('keeps summary model chips visible and marks deselected chips inactive', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()

    const summaryScope = within(summarySection as HTMLElement)
    const modelBChip = summaryScope.getByRole('button', { name: '模型B' })
    expect(modelBChip).toHaveClass('is-active')

    await userEvent.click(modelBChip)
    const modelBInactiveChip = summaryScope.getByRole('button', { name: '模型B' })
    expect(modelBInactiveChip).toHaveClass('is-inactive')
    expect(modelBInactiveChip).not.toHaveClass('is-active')

    await userEvent.click(modelBInactiveChip)
    expect(summaryScope.getByRole('button', { name: '模型B' })).toHaveClass('is-active')
  })

  it('applies selected models consistently to model list, summary and history', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()
    const summaryScope = within(summarySection as HTMLElement)

    await userEvent.click(summaryScope.getByRole('button', { name: '模型B' }))

    const modelTable = document.querySelector('.home-model-list-table tbody')
    expect(modelTable).not.toBeNull()
    expect(within(modelTable as HTMLElement).getByText('模型A')).toBeInTheDocument()
    expect(within(modelTable as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
    expect(summaryScope.getByRole('button', { name: '模型B' })).toHaveClass('is-inactive')

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()
    const historyRecords = (historySection as HTMLElement).querySelector('.history-card-list__records')
    expect(historyRecords).not.toBeNull()
    expect(within(historyRecords as HTMLElement).getAllByText('模型A').length).toBeGreaterThan(0)
    expect(within(historyRecords as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
  })

  it('falls back to all models when the last selected model is cleared', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()
    const summaryScope = within(summarySection as HTMLElement)

    await userEvent.click(summaryScope.getByRole('button', { name: '模型B' }))
    await userEvent.click(summaryScope.getByRole('button', { name: '模型A' }))

    expect(summaryScope.getByRole('button', { name: '模型A' })).toHaveClass('is-active')
    expect(summaryScope.getByRole('button', { name: '模型B' })).toHaveClass('is-active')

    const modelTable = document.querySelector('.home-model-list-table tbody')
    expect(modelTable).not.toBeNull()
    expect(within(modelTable as HTMLElement).getByText('模型A')).toBeInTheDocument()
    expect(within(modelTable as HTMLElement).getByText('模型B')).toBeInTheDocument()
  })

  it('resets selected models to all when clearing filters', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    const filterPanel = screen.getByText('名称搜索').closest('.model-filter-panel')
    expect(filterPanel).not.toBeNull()

    await userEvent.click(within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型B' })[0])
    expect(within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型B' })[0]).toHaveClass('is-inactive')

    await userEvent.click(within(filterPanel as HTMLElement).getByRole('button', { name: '清空筛选' }))

    expect(within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型A' })[0]).toHaveClass('is-active')
    expect(within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型B' })[0]).toHaveClass('is-active')
  })

  it('shows five position summary columns for pl5', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列5' }))

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()
    expect(within(summarySection as HTMLElement).getByText('第一位（万位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第二位（千位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第三位（百位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第四位（十位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第五位（个位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(summarySection as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('shows matched and unmatched models in summary tooltip', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()

    const badge = within(summarySection as HTMLElement).getAllByRole('button', { name: '命中 1/2' })[0]
    await userEvent.hover(badge)

    const tooltip = await screen.findByRole('tooltip')
    const modelA = within(tooltip).getByText('模型A')
    const modelB = within(tooltip).getByText('模型B')

    expect(modelA).toHaveClass('is-hit')
    expect(modelB).not.toHaveClass('is-hit')
  })

  it('shows history win rates and period cost summary', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()
    expect(await screen.findByText('命中趋势折线')).toBeInTheDocument()
    expect(await screen.findByText('命中堆叠柱形统计')).toBeInTheDocument()
    expect(await screen.findByText('奖金趋势折线')).toBeInTheDocument()

    expect(within(historySection as HTMLElement).getAllByText('按期中奖率 100%').length).toBeGreaterThan(0)
    expect(within(historySection as HTMLElement).getAllByText('按注中奖率 20%').length).toBeGreaterThan(0)
    expect(within(historySection as HTMLElement).getAllByText('成本 20 元').length).toBeGreaterThan(0)
    expect(within(historySection as HTMLElement).getAllByText('奖金 305 元').length).toBeGreaterThan(0)

    const firstHistoryCard = (await screen.findByText('第 2026031 期')).closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    expect(firstHistoryCard?.parentElement).toHaveClass('history-card-list__records')
    expect(within(firstHistoryCard as HTMLElement).getAllByText('注数').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('成本').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('奖金').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('10 元').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getByText('300 元')).toBeInTheDocument()
  }, 10000)

  it('exports a single history record card png', async () => {
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    await userEvent.click(screen.getByRole('button', { name: '导出开奖回溯：第 2026031 期' }))

    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1))
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('导出成功，已开始下载。')
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/history')

    anchorClickSpy.mockRestore()
  })

  it('shows error toast when export summary fails and auto dismisses it', async () => {
    toPng.mockRejectedValueOnce(new Error('boom'))
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '导出统计' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('统计导出失败，请稍后重试。'))
    expect(screen.getByRole('status')).toHaveClass('is-error')

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 2500 })
  })

  it('paginates history records and supports page size changes', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()

    expect(within(historySection as HTMLElement).getByText('第 1 / 1 页')).toBeInTheDocument()
    expect(within(historySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    expect(screen.getByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.getByText('第 2026021 期')).toBeInTheDocument()

    await userEvent.selectOptions(within(historySection as HTMLElement).getByRole('combobox'), '10')

    expect(within(historySection as HTMLElement).getByText('第 1 / 2 页')).toBeInTheDocument()
    expect(screen.queryByText('第 2026021 期')).not.toBeInTheDocument()

    await userEvent.click(within(historySection as HTMLElement).getByRole('button', { name: '下一页' }))

    expect(within(historySection as HTMLElement).getByText('第 2 / 2 页')).toBeInTheDocument()
    expect(screen.getByText('第 2026021 期')).toBeInTheDocument()
    expect(screen.queryByText('第 2026031 期')).not.toBeInTheDocument()

    await userEvent.selectOptions(within(historySection as HTMLElement).getByRole('combobox'), '20')

    expect(within(historySection as HTMLElement).getByText('第 1 / 1 页')).toBeInTheDocument()
    expect(screen.getByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.getByText('第 2026021 期')).toBeInTheDocument()
  })

  it('filters history records by selected strategy', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()
    expect(within(historySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    expect(within(historySection as HTMLElement).getByText('第 2026030 期')).toBeInTheDocument()

    await userEvent.click(within(historySection as HTMLElement).getByRole('button', { name: '增强型热号追随者' }))

    await waitFor(() => {
      expect(within(historySection as HTMLElement).getByText('共 11 条记录')).toBeInTheDocument()
    })
    expect(within(historySection as HTMLElement).queryByText('第 2026030 期')).not.toBeInTheDocument()
    expect(within(historySection as HTMLElement).getByText('第 2026031 期')).toBeInTheDocument()

    await userEvent.click(within(historySection as HTMLElement).getByRole('button', { name: '清空方案' }))

    await waitFor(() => {
      expect(within(historySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    })
    expect(within(historySection as HTMLElement).getByText('第 2026030 期')).toBeInTheDocument()
  })

  it('applies history strategy from page 2 with one click', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()

    await userEvent.selectOptions(within(historySection as HTMLElement).getByRole('combobox'), '10')
    await userEvent.click(within(historySection as HTMLElement).getByRole('button', { name: '下一页' }))
    expect(within(historySection as HTMLElement).getByText('第 2 / 2 页')).toBeInTheDocument()
    expect(within(historySection as HTMLElement).getByText('第 2026021 期')).toBeInTheDocument()

    const strategyButton = within(historySection as HTMLElement).getByRole('button', { name: '增强型热号追随者' })
    await userEvent.click(strategyButton)

    await waitFor(() => {
      expect(within(historySection as HTMLElement).getByText('第 1 / 2 页')).toBeInTheDocument()
    })
    expect(strategyButton).toHaveClass('is-active')
    expect(within(historySection as HTMLElement).getByText('第 2026031 期')).toBeInTheDocument()
    expect(within(historySection as HTMLElement).queryByText('第 2026030 期')).not.toBeInTheDocument()
  })

  it('keeps selected history strategy during refetch gap', async () => {
    simulateHistoryFilterLoading.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()

    const strategyButton = within(historySection as HTMLElement).getByRole('button', { name: '增强型热号追随者' })
    await userEvent.click(strategyButton)

    expect(strategyButton).toHaveClass('is-active')
    await waitFor(() => {
      expect(screen.queryByText('正在加载大乐透预测控制台...')).not.toBeInTheDocument()
      expect(within(historySection as HTMLElement).getByText('正在更新开奖方案筛选结果...')).toBeInTheDocument()
      expect(within(historySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(within(historySection as HTMLElement).getByText('共 11 条记录')).toBeInTheDocument()
    })
    expect(strategyButton).toHaveClass('is-active')
    expect(within(historySection as HTMLElement).queryByText('第 2026030 期')).not.toBeInTheDocument()
  })

  it('reuses pager selector in lottery history', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const lotterySection = screen.getByRole('heading', { name: '开奖历史' }).closest('section')
    expect(lotterySection).not.toBeNull()

    expect(within(lotterySection as HTMLElement).getByText('第 1 / 2 页')).toBeInTheDocument()
    expect(within(lotterySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    expect(within(lotterySection as HTMLElement).getByText('2026031')).toBeInTheDocument()
    expect(within(lotterySection as HTMLElement).queryByText('2026021')).not.toBeInTheDocument()

    await userEvent.click(within(lotterySection as HTMLElement).getByRole('button', { name: '下一页' }))

    expect(within(lotterySection as HTMLElement).getByText('第 2 / 2 页')).toBeInTheDocument()
    expect(within(lotterySection as HTMLElement).getByText('2026021')).toBeInTheDocument()

    await userEvent.selectOptions(within(lotterySection as HTMLElement).getByRole('combobox'), '20')

    expect(within(lotterySection as HTMLElement).getByText('第 1 / 1 页')).toBeInTheDocument()
    expect(within(lotterySection as HTMLElement).getByText('2026031')).toBeInTheDocument()
    expect(within(lotterySection as HTMLElement).getByText('2026021')).toBeInTheDocument()
  })

  it('hides local sidebar navigation outside prediction tab', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '图表分析' }))

    expect(screen.queryByRole('button', { name: '模型列表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预测统计' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '预测统计' })).not.toBeInTheDocument()
  })

  it('supports simulation pick, matching, save and delete flows', async () => {
    getSimulationTickets
      .mockResolvedValueOnce({ tickets: [] })
      .mockResolvedValueOnce({
        tickets: [
          {
            id: 11,
            front_numbers: ['01', '02', '03', '04', '05'],
            back_numbers: ['06', '07'],
            bet_count: 1,
            amount: 2,
            created_at: '2026-03-18T00:00:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({ tickets: [] })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 01' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 02' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 03' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 04' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 05' }))
    await userEvent.click(screen.getByRole('button', { name: '后区 06' }))
    await userEvent.click(screen.getByRole('button', { name: '后区 07' }))

    expect(screen.getByText('已选 1 注，共 2 元')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '历史中奖匹配' }))
    expect(await screen.findByText('一等奖')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '仅展示中奖期数' })).not.toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: '保存方案' }))

    await waitFor(() => {
      expect(createSimulationTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'dlt',
          play_type: 'dlt',
          front_numbers: ['01', '02', '03', '04', '05'],
          back_numbers: ['06', '07'],
          direct_hundreds: [],
          direct_tens: [],
          direct_units: [],
          group_numbers: [],
        }),
      )
    })

    expect(await screen.findByText('方案 #11')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(deleteSimulationTicket).toHaveBeenCalledWith(11, 'dlt'))
  })

  it('filters simulation matches to winning periods only', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 01' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 02' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 03' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 04' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 05' }))
    await userEvent.click(screen.getByRole('button', { name: '后区 06' }))
    await userEvent.click(screen.getByRole('button', { name: '后区 07' }))
    await userEvent.click(screen.getByRole('button', { name: '历史中奖匹配' }))

    expect(await screen.findByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.getByText('第 2026030 期')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: '仅展示中奖期数' }))

    expect(screen.getByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.queryByText('第 2026030 期')).not.toBeInTheDocument()
  })

  it('shows empty state when winning-only filter hides all simulation matches and resets on reselection', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    await userEvent.click(screen.getByRole('button', { name: '百位 00' }))
    await userEvent.click(screen.getByRole('button', { name: '十位 00' }))
    await userEvent.click(screen.getByRole('button', { name: '个位 00' }))
    await userEvent.click(screen.getByRole('button', { name: '历史中奖匹配' }))

    expect(await screen.findByText('第 2026031 期')).toBeInTheDocument()

    const winningOnlyToggle = screen.getByRole('checkbox', { name: '仅展示中奖期数' })
    await userEvent.click(winningOnlyToggle)
    expect(screen.getByText('当前筛选条件下没有中奖期数。')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '个位 00' }))
    await userEvent.click(screen.getByRole('button', { name: '个位 01' }))
    await userEvent.click(screen.getByRole('button', { name: '历史中奖匹配' }))

    expect(screen.getByRole('checkbox', { name: '仅展示中奖期数' })).not.toBeChecked()
  })

  it('calculates multiple bet count in simulation tab', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    for (const ball of ['01', '02', '03', '04', '05', '06']) {
      await userEvent.click(screen.getByRole('button', { name: `前区 ${ball}` }))
    }
    for (const ball of ['07', '08', '09']) {
      await userEvent.click(screen.getByRole('button', { name: `后区 ${ball}` }))
    }

    expect(screen.getByText('已选 18 注，共 36 元')).toBeInTheDocument()
  })

  it('supports dlt dantuo mode in simulation tab', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    const dltModeSwitch = screen.getByRole('tablist', { name: '大乐透玩法切换' })
    await userEvent.click(within(dltModeSwitch).getByRole('button', { name: '胆拖' }))

    await userEvent.click(screen.getByRole('button', { name: '前胆 01' }))
    for (const ball of ['02', '03', '04', '05', '06']) {
      await userEvent.click(screen.getByRole('button', { name: `前拖 ${ball}` }))
    }
    await userEvent.click(screen.getByRole('button', { name: '后胆 01' }))
    await userEvent.click(screen.getByRole('button', { name: '后拖 07' }))
    await userEvent.click(screen.getByRole('button', { name: '后拖 08' }))

    expect(screen.getByText('已选 10 注，共 20 元')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '保存方案' }))
    await waitFor(() => {
      expect(createSimulationTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'dlt',
          play_type: 'dlt_dantuo',
          front_dan: ['01'],
          front_tuo: ['02', '03', '04', '05', '06'],
          back_dan: ['01'],
          back_tuo: ['07', '08'],
        }),
      )
    })
  })

  it('supports pl3 direct_sum mode in simulation tab', async () => {
    getSimulationTickets
      .mockResolvedValueOnce({ tickets: [] })
      .mockResolvedValueOnce({
        tickets: [
          {
            id: 21,
            lottery_code: 'pl3',
            play_type: 'direct_sum',
            sum_values: ['10', '11'],
            bet_count: 132,
            amount: 264,
            created_at: '2026-03-18T00:00:00Z',
          },
        ],
      })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    const pl3ModeSwitch = screen.getByRole('tablist', { name: '排列3玩法切换' })
    await userEvent.click(within(pl3ModeSwitch).getByRole('button', { name: '和值' }))

    expect(screen.getByRole('button', { name: '和值 10' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '百位 00' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '和值 10' }))
    await userEvent.click(screen.getByRole('button', { name: '和值 11' }))

    expect(screen.getByText('已选 132 注，共 264 元')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '保存方案' }))

    await waitFor(() => {
      expect(createSimulationTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'pl3',
          play_type: 'direct_sum',
          sum_values: ['10', '11'],
        }),
      )
    })

    expect(await screen.findByText('方案 #21')).toBeInTheDocument()
    expect(screen.getByText('和值 · 132 注')).toBeInTheDocument()
  })

  it('loads history detail on expand and highlights hit numbers', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['01', '02', '03', '12', '15'],
                  blue_balls: ['06', '10'],
                  description: '模型A第1组：覆盖胆码与后区防守组合，优先控制回撤并兼顾上限。',
                  hit_result: {
                    red_hits: ['01', '12'],
                    red_hit_count: 2,
                    blue_hits: ['06'],
                    blue_hit_count: 1,
                    total_hits: 3,
                  },
                },
                {
                  group_id: 2,
                  red_balls: ['01', '08', '12', '19', '30'],
                  blue_balls: ['09', '10'],
                  hit_result: {
                    red_hits: ['01', '08', '12', '19'],
                    red_hit_count: 4,
                    blue_hits: [],
                    blue_hit_count: 0,
                    total_hits: 4,
                  },
                },
                {
                  group_id: 3,
                  red_balls: ['01', '08', '12', '19', '30'],
                  blue_balls: ['06', '10'],
                  hit_result: {
                    red_hits: ['01', '08', '12', '19'],
                    red_hit_count: 4,
                    blue_hits: ['06'],
                    blue_hit_count: 1,
                    total_hits: 5,
                  },
                },
                {
                  group_id: 4,
                  red_balls: ['01', '08', '12', '19', '25'],
                  blue_balls: ['06', '11'],
                  hit_result: {
                    red_hits: ['01', '08', '12', '19', '25'],
                    red_hit_count: 5,
                    blue_hits: ['06'],
                    blue_hit_count: 1,
                    total_hits: 6,
                  },
                },
              ],
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['08', '09', '10', '11', '12'],
                  blue_balls: ['01', '02'],
                  description: '模型B第1组：偏进攻型号码分布。',
                  hit_result: {
                    red_hits: ['08', '12'],
                    red_hit_count: 2,
                    blue_hits: [],
                    blue_hit_count: 0,
                    total_hits: 2,
                  },
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' })).toBeInTheDocument()

    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    expect(groupCard).toHaveClass('is-compact')
    const cardScope = within(groupCard as HTMLElement)
    const descNode = cardScope.getByText('模型A第1组：覆盖胆码与后区防守组合，优先控制回撤并兼顾上限。')
    expect(descNode).toHaveAttribute('title', '模型A第1组：覆盖胆码与后区防守组合，优先控制回撤并兼顾上限。')
    expect(descNode).toHaveClass('prediction-group-card__desc--compact')
    expect(cardScope.getByText('01')).toHaveClass('is-hit')
    expect(cardScope.getByText('12')).toHaveClass('is-hit')
    expect(cardScope.getByText('06')).toHaveClass('is-hit')
    expect(cardScope.getByText('02')).not.toHaveClass('is-hit')
    expect(cardScope.getByText('02')).toHaveClass('number-ball--muted')
    expect(cardScope.getByText('10')).toHaveClass('number-ball--muted')
    expect(cardScope.getByText('01')).not.toHaveClass('number-ball--muted')

    const hit4Card = screen.getByText('G-2').closest('.prediction-group-card')
    const hit5Card = screen.getByText('G-3').closest('.prediction-group-card')
    const hit6Card = screen.getByText('G-4').closest('.prediction-group-card')
    expect(within(firstHistoryCard as HTMLElement).getAllByText('注数').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('成本').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('奖金').length).toBeGreaterThan(0)
    expect(within(detailSection as HTMLElement).getByText('按期中奖率')).toBeInTheDocument()
    expect(within(detailSection as HTMLElement).getByText('按注中奖率')).toBeInTheDocument()
    expect(groupCard).not.toHaveClass('is-hit-tier-4')
    expect(groupCard).not.toHaveClass('is-hit-tier-5')
    expect(groupCard).not.toHaveClass('is-hit-tier-6')
    expect(hit4Card).toHaveClass('is-hit-tier-4')
    expect(hit5Card).toHaveClass('is-hit-tier-5')
    expect(hit6Card).toHaveClass('is-hit-tier-6')
    expect(within(detailSection as HTMLElement).getAllByText('成本 2 元')).toHaveLength(4)

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型B' }))
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型B' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('deepseek')).toBeInTheDocument()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' }))
    expect(within(firstHistoryCard as HTMLElement).queryByText('openai_compatible')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('deepseek')).toBeInTheDocument()
  })

  it('shows dlt dantuo sections with dan/tuo labels', async () => {
    simulateDltDantuoCurrentPredictions.current = true
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'dlt_dantuo',
                  front_dan: ['01', '08'],
                  front_tuo: ['12', '19', '25', '31'],
                  back_dan: [],
                  back_tuo: ['06', '11'],
                  red_balls: ['01', '08', '12', '19', '25', '31'],
                  blue_balls: ['06', '11'],
                  hit_result: {
                    red_hits: ['01', '08', '12', '19', '25'],
                    red_hit_count: 5,
                    blue_hits: ['06', '11'],
                    blue_hit_count: 2,
                    total_hits: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))
    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    const cardScope = within(groupCard as HTMLElement)
    expect(cardScope.getByText('前胆')).toBeInTheDocument()
    expect(cardScope.getByText('前拖')).toBeInTheDocument()
    expect(cardScope.queryByText('后胆')).not.toBeInTheDocument()
    expect(cardScope.getByText('后拖')).toBeInTheDocument()
    const numberLines = (groupCard as HTMLElement).querySelectorAll('.number-row__line')
    expect(numberLines).toHaveLength(2)
    expect(within(numberLines[0] as HTMLElement).getByText('前胆')).toBeInTheDocument()
    expect(within(numberLines[0] as HTMLElement).getByText('前拖')).toBeInTheDocument()
    expect(within(numberLines[1] as HTMLElement).getByText('后拖')).toBeInTheDocument()
    expect(cardScope.getByText('01')).toHaveClass('is-hit')
    expect(cardScope.getByText('31')).toHaveClass('number-ball--muted')

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '显示该期预测统计：第 2026031 期' }))
    expect(within(firstHistoryCard as HTMLElement).getByText('前区胆统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('前区拖统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('后区胆统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('后区拖统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('supports one-click expand and collapse for all models in a record', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['01', '02', '03', '12', '15'],
                  blue_balls: ['06', '10'],
                },
              ],
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['08', '09', '10', '11', '12'],
                  blue_balls: ['01', '02'],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开该期全部模型详情：第 2026031 期' }))
    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型B' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起该期全部模型详情：第 2026031 期' })).toBeInTheDocument()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起该期全部模型详情：第 2026031 期' }))
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型B' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('openai_compatible')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('deepseek')).not.toBeInTheDocument()
  })

  it('shows period prediction summary only after clicking summary toggle', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                { group_id: 1, red_balls: ['01', '02', '03', '12', '15'], blue_balls: ['06', '10'] },
                { group_id: 2, red_balls: ['01', '08', '18', '28', '33'], blue_balls: ['02', '06'] },
              ],
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              best_hit_count: 1,
              predictions: [
                { group_id: 1, red_balls: ['08', '09', '10', '11', '12'], blue_balls: ['01', '02'] },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    expect(within(firstHistoryCard as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '显示该期预测统计：第 2026031 期' }))
    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))
    expect(within(firstHistoryCard as HTMLElement).getByText('前区统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('后区统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '隐藏该期预测统计：第 2026031 期' })).toBeInTheDocument()
    const periodSummary = (firstHistoryCard as HTMLElement).querySelector('.history-record-card__period-summary')
    const modelsSection = (firstHistoryCard as HTMLElement).querySelector('.history-record-card__models')
    expect(periodSummary).not.toBeNull()
    expect(modelsSection).not.toBeNull()
    expect(periodSummary?.compareDocumentPosition(modelsSection as Node)).toBe(Node.DOCUMENT_POSITION_PRECEDING)
    expect(within(periodSummary as HTMLElement).getByText('06')).not.toHaveClass('number-ball--muted')
    const tenBalls = within(periodSummary as HTMLElement).getAllByText('10')
    expect(tenBalls.length).toBeGreaterThan(0)
    expect(tenBalls.every((node) => node.classList.contains('number-ball--muted'))).toBe(true)

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '隐藏该期预测统计：第 2026031 期' }))
    expect(within(firstHistoryCard as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('reuses shared model filters in history and trims record details', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['01', '02', '03', '12', '15'],
                  blue_balls: ['06', '10'],
                },
              ],
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['08', '09', '10', '11', '12'],
                  blue_balls: ['01', '02'],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    await userEvent.click(screen.getByRole('button', { name: 'openai_compatible' }))
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()
    const historyRecords = (historySection as HTMLElement).querySelector('.history-card-list__records')
    expect(historyRecords).not.toBeNull()

    expect(screen.getByText('已显示 1 / 2 个模型')).toBeInTheDocument()
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(within(historyRecords as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
    expect(screen.queryByText('第 2026030 期')).not.toBeInTheDocument()

    const firstHistoryCard = within(historySection as HTMLElement).getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))
    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))

    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' })).toBeInTheDocument()
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(within(historyRecords as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
    expect(screen.getByText('G-1').closest('.prediction-group-card')).toHaveClass('is-compact')
    const descFallback = within(firstHistoryCard as HTMLElement).getByText('暂无说明')
    expect(descFallback).toHaveClass('prediction-group-card__desc--compact')
    expect(descFallback).toHaveAttribute('title', '暂无说明')
    expect(screen.getAllByText('注数').length).toBeGreaterThan(0)
  })

  it('requests pl3 history detail and highlights direct hits by position', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 2,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct',
                  red_balls: [],
                  blue_balls: [],
                  digits: ['01', '01', '12'],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    expect(screen.queryByText('方案筛选')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    expect(screen.queryByText('开奖方案筛选')).not.toBeInTheDocument()
    expect(screen.queryByText('正在更新开奖方案筛选结果...')).not.toBeInTheDocument()
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    expect(await within(firstHistoryCard as HTMLElement).findByText('直选')).toBeInTheDocument()

    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    expect(groupCard).toHaveClass('is-compact')
    expect(within(detailSection as HTMLElement).getByText('按期中奖率')).toBeInTheDocument()

    const cardScope = within(groupCard as HTMLElement)
    const oneDigits = cardScope.getAllByText('01')
    expect(oneDigits[0]).toHaveClass('is-hit')
    expect(oneDigits[1]).not.toHaveClass('is-hit')
    expect(oneDigits[1]).toHaveClass('number-ball--muted')
    expect(cardScope.getByText('12')).toHaveClass('is-hit')
  })

  it('matches pl3 history detail by play mode when model id repeats', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '01', '12'],
            lottery_code: 'pl3',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'direct',
              best_hit_count: 2,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct',
                  red_balls: [],
                  blue_balls: [],
                  digits: ['01', '01', '12'],
                },
              ],
            },
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'direct_sum',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct_sum',
                  sum_value: '14',
                  red_balls: [],
                  blue_balls: [],
                  digits: [],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    expect(within(firstHistoryCard as HTMLElement).queryByText('该模型不满足所选玩法。')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('G-1')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('直选')).toBeInTheDocument()
  })

  it('shows pl3 direct_sum detail when history list mode is mislabeled', async () => {
    simulatePl3SumHistoryMislabel.current = true
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '02', '07'],
            lottery_code: 'pl3',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'direct',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct',
                  red_balls: [],
                  blue_balls: [],
                  digits: ['01', '02', '07'],
                  description: '直选分支',
                },
              ],
            },
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'direct_sum',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct_sum',
                  sum_value: '10',
                  red_balls: [],
                  blue_balls: [],
                  digits: [],
                  description: '和值分支',
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    expect(within(firstHistoryCard as HTMLElement).queryByText('该模型不满足所选玩法。')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('和值')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('和值分支')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('直选分支')).not.toBeInTheDocument()
  })

  it('uses group-level cost for pl3 direct_sum detail summary', async () => {
    simulatePl3SumHistoryMislabel.current = true
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '02', '07'],
            lottery_code: 'pl3',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct_sum',
                  sum_value: '10',
                  red_balls: [],
                  blue_balls: [],
                  digits: [],
                  cost_amount: 126,
                  prize_level: '和值',
                  prize_amount: 1040,
                  prize_source: 'fallback',
                },
                {
                  group_id: 2,
                  play_type: 'direct_sum',
                  sum_value: '11',
                  red_balls: [],
                  blue_balls: [],
                  digits: [],
                  cost_amount: 138,
                  prize_amount: 0,
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    expect(within(detailSection as HTMLElement).getByText('成本 264 元')).toBeInTheDocument()
    expect(within(detailSection as HTMLElement).getByText('成本 126 元')).toBeInTheDocument()
    expect(within(detailSection as HTMLElement).getByText('成本 138 元')).toBeInTheDocument()
    expect(within(detailSection as HTMLElement).getByText('奖金 1,040 元')).toBeInTheDocument()
  })

  it('shows pl3 sum history records even when model mode is mislabeled', async () => {
    simulatePl3SumHistoryMislabel.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])

    expect(await screen.findByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.queryByText('当前筛选条件下没有历史回溯记录。')).not.toBeInTheDocument()
  })

  it('renders five digits for pl5 prediction groups', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '02', '03', '04', '05'],
            lottery_code: 'pl5',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 5,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct',
                  red_balls: [],
                  blue_balls: [],
                  digits: ['01', '02', '03', '04', '05'],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列5' }))
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl5'))

    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    expect(groupCard?.querySelectorAll('.number-ball').length).toBe(5)
    expect(within(groupCard as HTMLElement).getByText('04')).toBeInTheDocument()
    expect(within(groupCard as HTMLElement).getByText('05')).toBeInTheDocument()
  })

  it('uses direct-only display and three-position summary for pl3', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    expect(screen.queryByText('玩法筛选')).not.toBeInTheDocument()
    expect(screen.queryByText('预测玩法筛选')).not.toBeInTheDocument()
    expect(screen.getByText('第一位（百位）统计')).toBeInTheDocument()
    expect(screen.getByText('第二位（十位）统计')).toBeInTheDocument()
    expect(screen.getByText('第三位（个位）统计')).toBeInTheDocument()
    expect(screen.queryByText('前区统计')).not.toBeInTheDocument()
    expect(screen.queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('shows sum-only statistics for pl3 direct_sum in prediction overview', async () => {
    simulatePl3SumCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])

    expect(screen.getByText('和值统计')).toBeInTheDocument()
    expect(screen.queryByText('第一位（百位）统计')).not.toBeInTheDocument()
    expect(screen.queryByText('第二位（十位）统计')).not.toBeInTheDocument()
    expect(screen.queryByText('第三位（个位）统计')).not.toBeInTheDocument()
  })

  it('shows sum-only statistics in pl3 history period summary', async () => {
    simulatePl3SumHistoryMislabel.current = true
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '02', '07'],
            lottery_code: 'pl3',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 1,
              predictions: [
                { group_id: 1, play_type: 'direct_sum', sum_value: '10', red_balls: [], blue_balls: [], digits: [] },
                { group_id: 2, play_type: 'direct_sum', sum_value: '11', red_balls: [], blue_balls: [], digits: [] },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])

    const firstHistoryCard = await screen.findByText('第 2026031 期')
    const card = firstHistoryCard.closest('.history-record-card')
    expect(card).not.toBeNull()
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: '显示该期预测统计：第 2026031 期' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    expect(within(card as HTMLElement).getByText('和值统计')).toBeInTheDocument()
    expect(within(card as HTMLElement).queryByText('第一位（百位）统计')).not.toBeInTheDocument()
    expect(within(card as HTMLElement).queryByText('第二位（十位）统计')).not.toBeInTheDocument()
    expect(within(card as HTMLElement).queryByText('第三位（个位）统计')).not.toBeInTheDocument()
  })

  it('navigates to my-bets tab from dashboard strip', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '我的投注' }))
    expect(await screen.findByText('我的投注')).toBeInTheDocument()
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/my-bets')
  })

  it('supports create and delete on my-bets tab', async () => {
    renderPage('/dashboard/my-bets')
    await screen.findByText('我的投注')
    expect(await screen.findByText('第 2026032 期')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(deleteMyBet).toHaveBeenCalledWith(1, 'dlt'))

    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.clear(within(formView).getByLabelText('前区号码（逗号分隔）'))
    await userEvent.type(within(formView).getByLabelText('前区号码（逗号分隔）', { exact: true }), '01,02,03,04,05')
    await userEvent.clear(within(formView).getByLabelText('后区号码（逗号分隔）'))
    await userEvent.type(within(formView).getByLabelText('后区号码（逗号分隔）', { exact: true }), '06,07')
    await userEvent.click(within(formView).getByRole('button', { name: '添加投注' }))

    await waitFor(() =>
      expect(createMyBet).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'dlt',
          target_period: '2026032',
          lines: [
            expect.objectContaining({
              play_type: 'dlt',
              front_numbers: ['01', '02', '03', '04', '05'],
              back_numbers: ['06', '07'],
            }),
          ],
        }),
      ),
    )
  })

  it('keeps my-bets details collapsed by default and supports expand controls', async () => {
    getMyBets.mockResolvedValueOnce({
      records: [
        {
          id: 1,
          lottery_code: 'dlt',
          target_period: '2026032',
          play_type: 'dlt',
          front_numbers: ['01', '02', '03', '04', '05'],
          back_numbers: ['06', '07'],
          lines: [
            {
              line_no: 1,
              play_type: 'dlt',
              front_numbers: ['01', '02', '03', '04', '05'],
              back_numbers: ['06', '07'],
              multiplier: 1,
              is_append: false,
              bet_count: 1,
              amount: 2,
            },
          ],
          amount: 2,
          prize_amount: 0,
          net_profit: -2,
          winning_bet_count: 0,
          settlement_status: 'pending',
          created_at: '2026-03-18T00:00:00Z',
          updated_at: '2026-03-18T00:00:00Z',
        },
        {
          id: 2,
          lottery_code: 'dlt',
          target_period: '2026031',
          play_type: 'dlt',
          front_numbers: ['08', '09', '10', '11', '12'],
          back_numbers: ['01', '02'],
          lines: [
            {
              line_no: 1,
              play_type: 'dlt',
              front_numbers: ['08', '09', '10', '11', '12'],
              back_numbers: ['01', '02'],
              multiplier: 1,
              is_append: false,
              bet_count: 1,
              amount: 2,
            },
          ],
          amount: 2,
          prize_amount: 0,
          net_profit: -2,
          winning_bet_count: 0,
          settlement_status: 'pending',
          created_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:00Z',
        },
      ],
      summary: {
        total_count: 2,
        total_amount: 4,
        total_prize_amount: 0,
        total_net_profit: -4,
        settled_count: 0,
        pending_count: 2,
      },
    })

    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })
    await screen.findByText('第 2026032 期')

    expect(screen.queryByText('开奖号码：')).not.toBeInTheDocument()
    expect(screen.queryByText('子注单 #1 · 大乐透')).not.toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: '展开详情' })[0])
    expect(await screen.findByText('开奖号码：')).toBeInTheDocument()
    expect(await screen.findByText('子注单 #1 · 大乐透')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '全部展开' }))
    expect(screen.getAllByRole('button', { name: '收起详情' })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: '全部收起' }))
    expect(screen.getAllByRole('button', { name: '展开详情' })).toHaveLength(2)
  })

  it('supports dlt dantuo create on my-bets tab', async () => {
    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })

    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.selectOptions(within(formView).getByLabelText('玩法'), 'dlt_dantuo')
    await userEvent.type(within(formView).getByLabelText('前区胆码（逗号分隔）'), '01')
    await userEvent.type(within(formView).getByLabelText('前区拖码（逗号分隔）'), '02,03,04,05,06')
    await userEvent.type(within(formView).getByLabelText('后区胆码（逗号分隔）'), '01')
    await userEvent.type(within(formView).getByLabelText('后区拖码（逗号分隔）'), '07,08')
    await userEvent.click(within(formView).getByRole('button', { name: '添加投注' }))

    await waitFor(() =>
      expect(createMyBet).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'dlt',
          lines: [
            expect.objectContaining({
              play_type: 'dlt_dantuo',
              front_dan: ['01'],
              front_tuo: ['02', '03', '04', '05', '06'],
              back_dan: ['01'],
              back_tuo: ['07', '08'],
            }),
          ],
        }),
      ),
    )
  })

  it('shows explicit dlt dantuo validation reason when back dan exceeds limit', async () => {
    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })

    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.selectOptions(within(formView).getByLabelText('玩法'), 'dlt_dantuo')
    await userEvent.type(within(formView).getByLabelText('前区胆码（逗号分隔）'), '01')
    await userEvent.type(within(formView).getByLabelText('前区拖码（逗号分隔）'), '02,03,04,05,06')
    await userEvent.type(within(formView).getByLabelText('后区胆码（逗号分隔）'), '01,02')
    await userEvent.type(within(formView).getByLabelText('后区拖码（逗号分隔）'), '07,08')

    expect(within(formView).getByText('子注单 #1：后区胆码最多 1 个。')).toBeInTheDocument()
    const submitButton = within(formView).getByRole('button', { name: '添加投注' })
    expect(submitButton).toBeDisabled()
    expect(createMyBet).not.toHaveBeenCalled()

    await userEvent.clear(within(formView).getByLabelText('后区胆码（逗号分隔）'))
    await userEvent.type(within(formView).getByLabelText('后区胆码（逗号分隔）'), '01')

    await waitFor(() => expect(within(formView).getByText('可提交保存。')).toBeInTheDocument())
    expect(submitButton).toBeEnabled()
  })

  it('confirms before returning to list when my-bets form has unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })

    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.type(within(formView).getByLabelText('前区号码（逗号分隔）'), '01,02,03,04,05')

    await userEvent.click(within(formView).getByRole('button', { name: '返回列表' }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByTestId('my-bets-form-view')).toBeInTheDocument()

    await userEvent.click(within(formView).getByRole('button', { name: '返回列表' }))
    await waitFor(() => expect(screen.queryByTestId('my-bets-form-view')).not.toBeInTheDocument())

    confirmSpy.mockRestore()
  })

  it('prompts before switching tab when my-bets form has unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })
    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.type(within(formView).getByLabelText('前区号码（逗号分隔）'), '01,02,03,04,05')

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/my-bets')

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    await waitFor(() => expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/history'))

    confirmSpy.mockRestore()
  })
})
