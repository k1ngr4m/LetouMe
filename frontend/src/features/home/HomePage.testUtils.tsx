import { useEffect, useMemo, useState } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { ToastProvider } from '../../shared/feedback/ToastProvider'

const hoistedMocks = vi.hoisted(() => ({
  createMyBet: vi.fn(),
  createSimulationTicket: vi.fn(),
  deleteMyBet: vi.fn(),
  deleteSimulationTicket: vi.fn(),
  getMyBets: vi.fn(),
  getPredictionsHistoryDetail: vi.fn(),
  getSimulationTickets: vi.fn(),
  quoteSimulationTicket: vi.fn(),
  recognizeMyBetByImage: vi.fn(),
  simulateDltModeCoexistCurrentPredictions: { current: false },
  simulateDltCompoundCurrentPredictions: { current: false },
  simulateDltDantuoCurrentPredictions: { current: false },
  simulateDltInactiveHistoryModel: { current: false },
  simulatePl3SumCurrentPredictions: { current: false },
  simulatePl3SumHistoryMislabel: { current: false },
  simulateJackpotPoolData: { current: false },
  updateMyBet: vi.fn(),
  uploadMyBetOCRImage: vi.fn(),
  simulateHistoryFilterLoading: { current: false },
  homeDataArgsCapture: {
    current: null as null | {
      lotteryCode: string
      historyPage: number
      historyPageSize: number
      lotteryPage: number
      lotteryPageSize: number
    },
  },
  toPng: vi.fn(),
  setMotionPreference: vi.fn(),
}))

export const {
  createMyBet,
  createSimulationTicket,
  deleteMyBet,
  deleteSimulationTicket,
  getMyBets,
  getPredictionsHistoryDetail,
  getSimulationTickets,
  quoteSimulationTicket,
  recognizeMyBetByImage,
  simulateDltModeCoexistCurrentPredictions,
  simulateDltCompoundCurrentPredictions,
  simulateDltDantuoCurrentPredictions,
  simulateDltInactiveHistoryModel,
  simulatePl3SumCurrentPredictions,
  simulatePl3SumHistoryMislabel,
  simulateJackpotPoolData,
  updateMyBet,
  uploadMyBetOCRImage,
  simulateHistoryFilterLoading,
  homeDataArgsCapture,
  toPng,
  setMotionPreference,
} = hoistedMocks

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
    recognizeMyBetByImage,
    updateMyBet,
    uploadMyBetOCRImage,
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
    homeDataArgsCapture.current = {
      lotteryCode: _lotteryCode,
      historyPage,
      historyPageSize,
      lotteryPage,
      lotteryPageSize,
    }
    const isPl3 = _lotteryCode === 'pl3'
    const isPl5 = _lotteryCode === 'pl5'
    const isQxc = _lotteryCode === 'qxc'
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

    const historyRecords = useMemo(
      () =>
        [
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
          const recordWithInactiveHistoryModel = !isPl3 && simulateDltInactiveHistoryModel.current
            ? {
                ...record,
                models: [
                  ...(record.models || []),
                  {
                    model_id: 'model-disabled',
                    model_name: '停用模型',
                    model_provider: 'deepseek',
                    prediction_play_mode: 'direct',
                    best_hit_count: 4,
                    bet_count: 5,
                    cost_amount: 10,
                    winning_bet_count: 2,
                    prize_amount: 50,
                    hit_period_win: true,
                  },
                ],
              }
            : record
          if (!isPl3 && simulateDltDantuoCurrentPredictions.current) {
            return {
              ...recordWithInactiveHistoryModel,
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
              ...recordWithInactiveHistoryModel,
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
          if (!isPl3 || !simulatePl3SumHistoryMislabel.current) return recordWithInactiveHistoryModel
          return {
            ...recordWithInactiveHistoryModel,
            models: (recordWithInactiveHistoryModel.models || []).map((model, index) =>
              index === 0
                ? {
                    ...model,
                    prediction_play_mode: 'direct',
                    play_type: 'direct_sum',
                  }
                : model,
            ),
          }
        }),
      [isPl3],
    )
    const filteredHistoryRecords = useMemo(
      () =>
        historyRecords
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
          .filter((record) => record.models.length > 0),
      [historyPlayTypeFilters, historyRecords, isPl3, normalizedHistoryStrategyFilters.join('|')],
    )
    const pagedHistoryRecords = useMemo(() => {
      const offset = (historyPage - 1) * historyPageSize
      return filteredHistoryRecords.slice(offset, offset + historyPageSize)
    }, [filteredHistoryRecords, historyPage, historyPageSize])
    const lotteryRecords = useMemo(
      () =>
        Array.from({ length: 12 }, (_, index) => ({
          period: `${2026031 - index}`,
          date: `2026-03-${String(10 - index).padStart(2, '0')}`,
          red_balls: ['01', '02', '03', '04', '05'],
          blue_balls: ['06', '07'],
        })),
      [],
    )
    const pagedLotteryRecords = useMemo(() => {
      const lotteryOffset = (lotteryPage - 1) * lotteryPageSize
      return lotteryRecords.slice(lotteryOffset, lotteryOffset + lotteryPageSize)
    }, [lotteryPage, lotteryPageSize, lotteryRecords])
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
              ...(simulateDltInactiveHistoryModel.current
                ? [
                    {
                      model_id: 'model-disabled',
                      model_name: '停用模型',
                      prediction_play_mode: 'direct',
                      periods: 8,
                      winning_periods: 7,
                      bet_count: 40,
                      winning_bet_count: 16,
                      cost_amount: 80,
                      prize_amount: 320,
                      win_rate_by_period: 0.875,
                      win_rate_by_bet: 0.4,
                      score_profile: {
                        overall_score: 99,
                        per_bet_score: 98,
                        per_period_score: 97,
                        recent_score: 96,
                        long_term_score: 95,
                        component_scores: {
                          profit: 99,
                          hit_rate: 98,
                          stability: 97,
                          ceiling: 96,
                          floor: 95,
                        },
                      },
                    },
                  ]
                : []),
            ],
        predictions_history: pagedHistoryRecords,
        total_count: filteredHistoryRecords.length,
        strategy_options: ['AI 组合策略', '冷号补位', '增强型热号追随者'],
      }),
      [filteredHistoryRecords.length, isPl3, pagedHistoryRecords],
    )
    const currentModels = useMemo(() => (isPl3
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
          ]), [isPl3, isPl5, isQxc])
    const lotteryHistoryData = useMemo(() => (isPl3
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
        : isQxc
          ? [
              {
                period: '26037',
                date: '2026-04-05',
                red_balls: [],
                blue_balls: [],
                digits: ['09', '09', '06', '09', '04', '00', '01'],
                lottery_code: 'qxc',
              },
              {
                period: '26036',
                date: '2026-04-03',
                red_balls: [],
                blue_balls: [],
                digits: ['01', '02', '03', '04', '05', '06', '07'],
                lottery_code: 'qxc',
              },
            ]
          : [
          {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '02', '03', '04', '05'],
            blue_balls: ['06', '07'],
            jackpot_pool_balance: simulateJackpotPoolData.current ? 123456789 : undefined,
          },
          {
            period: '2026030',
            date: '2026-03-08',
            red_balls: ['08', '09', '10', '11', '12'],
            blue_balls: ['01', '02'],
          },
        ]), [isPl3, isPl5, isQxc])
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

    return useMemo(
      () => ({
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
      }),
      [currentHistoryPayload, currentModels, isHistoryFetching, lotteryHistoryData, lotteryRecords.length, pagedLotteryRecords],
    )
  },
}))

vi.mock('html-to-image', () => ({
  toPng,
}))

vi.mock('recharts', async () => {
  const React = await import('react')

  function makeWrapper(tag: string) {
    return ({ children }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(tag, null, children)
  }

  return {
    ResponsiveContainer: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    AreaChart: makeWrapper('div'),
    BarChart: makeWrapper('div'),
    LineChart: makeWrapper('div'),
    CartesianGrid: makeWrapper('div'),
    Legend: makeWrapper('div'),
    Line: makeWrapper('div'),
    ReferenceLine: makeWrapper('div'),
    Tooltip: makeWrapper('div'),
    XAxis: makeWrapper('div'),
    YAxis: makeWrapper('div'),
    Area: makeWrapper('div'),
    Bar: makeWrapper('div'),
  }
})

vi.mock('framer-motion', async () => {
  const React = await import('react')
  const MotionDiv = ({ children }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('div', null, children)

  return {
    AnimatePresence: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    motion: new Proxy(
      {},
      {
        get: () => MotionDiv,
      },
    ),
  }
})

vi.mock('../../shared/theme/MotionProvider', () => ({
  useMotion: () => ({
    motionLevel: 'normal',
    motionPreference: 'system',
    setMotionPreference,
  }),
}))

const { HomePage } = await import('./HomePage')

export function renderPage(initialEntry = '/dashboard/prediction') {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: Number.POSITIVE_INFINITY,
        retry: false,
      },
    },
  })
  activeQueryClients.push(client)

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

const activeQueryClients: QueryClient[] = []

afterEach(() => {
  while (activeQueryClients.length > 0) {
    const client = activeQueryClients.pop()
    client?.unmount()
    client?.clear()
  }
})

beforeEach(() => {
  window.localStorage.clear()
  simulateHistoryFilterLoading.current = false
  simulateDltModeCoexistCurrentPredictions.current = false
  simulateDltCompoundCurrentPredictions.current = false
  simulateDltDantuoCurrentPredictions.current = false
  simulatePl3SumCurrentPredictions.current = false
  simulatePl3SumHistoryMislabel.current = false
  simulateJackpotPoolData.current = false
  homeDataArgsCapture.current = null
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
  recognizeMyBetByImage.mockReset()
  recognizeMyBetByImage.mockResolvedValue({
    lottery_code: 'dlt',
    target_period: '2026033',
    source_type: 'ocr',
    ticket_image_url: '',
    ocr_text: 'mock ocr text',
    ocr_provider: 'baidu',
    ocr_recognized_at: 1773801600,
    lines: [
      {
        line_no: 1,
        play_type: 'dlt',
        front_numbers: ['01', '02', '03', '04', '05'],
        back_numbers: ['06', '07'],
        direct_ten_thousands: [],
        direct_thousands: [],
        direct_hundreds: [],
        direct_tens: [],
        direct_units: [],
        direct_hundreds_dan: [],
        direct_hundreds_tuo: [],
        direct_tens_dan: [],
        direct_tens_tuo: [],
        direct_units_dan: [],
        direct_units_tuo: [],
        group_numbers: [],
        multiplier: 1,
        is_append: false,
        bet_count: 1,
        amount: 2,
      },
    ],
    warnings: [],
  })
  uploadMyBetOCRImage.mockReset()
  uploadMyBetOCRImage.mockResolvedValue({ lottery_code: 'dlt', ticket_image_url: 'https://img.test/ticket.jpg' })
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
    const lotteryCode = payload.lottery_code === 'pl3' ? 'pl3' : payload.lottery_code === 'qxc' ? 'qxc' : 'dlt'
    if (lotteryCode === 'pl3') {
      const playType = String(payload.play_type || 'direct')
      const pl3DirectSumBetCounts: Record<string, number> = {
        '00': 1, '01': 3, '02': 6, '03': 10, '04': 15, '05': 21, '06': 28, '07': 36, '08': 45, '09': 55,
        '10': 63, '11': 69, '12': 73, '13': 75, '14': 75, '15': 73, '16': 69, '17': 63, '18': 55, '19': 45,
        '20': 36, '21': 28, '22': 21, '23': 15, '24': 10, '25': 6, '26': 3, '27': 1,
      }
      const pl3GroupSumBetCounts: Record<string, number> = {
        '00': 0, '01': 1, '02': 2, '03': 2, '04': 4, '05': 5, '06': 6, '07': 8, '08': 10, '09': 11,
        '10': 13, '11': 14, '12': 14, '13': 15, '14': 15, '15': 14, '16': 14, '17': 13, '18': 11, '19': 10,
        '20': 8, '21': 6, '22': 5, '23': 4, '24': 2, '25': 2, '26': 1, '27': 0,
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
      if (playType === 'group_sum') {
        const sumValues = Array.isArray(payload.sum_values) ? payload.sum_values.map((item) => String(item).padStart(2, '0')) : []
        const betCount = sumValues.reduce((sum, value) => sum + Number(pl3GroupSumBetCounts[value] || 0), 0)
        return { lottery_code: 'pl3', play_type: playType, bet_count: betCount, amount: betCount * 2 }
      }
      const groupCount = Array.isArray(payload.group_numbers) ? payload.group_numbers.length : 0
      const betCount = playType === 'group3'
        ? (groupCount >= 2 ? groupCount * (groupCount - 1) : 0)
        : (groupCount >= 3 ? (groupCount * (groupCount - 1) * (groupCount - 2)) / 6 : 0)
      return { lottery_code: 'pl3', play_type: playType, bet_count: betCount, amount: betCount * 2 }
    }
    if (lotteryCode === 'qxc') {
      const positions = Array.isArray(payload.position_selections) ? payload.position_selections : []
      const betCount = positions.length === 7
        ? positions.reduce((product, values) => {
            const count = Array.isArray(values) ? values.length : 0
            return count > 0 ? product * count : 0
          }, 1)
        : 0
      return { lottery_code: 'qxc', play_type: 'qxc_compound', bet_count: betCount, amount: betCount * 2 }
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

