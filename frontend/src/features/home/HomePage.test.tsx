import { useEffect, useMemo, useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

const {
  createMyBet,
  createSimulationTicket,
  deleteMyBet,
  deleteSimulationTicket,
  getMyBets,
  getPredictionsHistoryDetail,
  getSimulationTickets,
  quoteSimulationTicket,
  updateMyBet,
  simulateHistoryFilterLoading,
} = vi.hoisted(() => ({
  createMyBet: vi.fn(),
  createSimulationTicket: vi.fn(),
  deleteMyBet: vi.fn(),
  deleteSimulationTicket: vi.fn(),
  getMyBets: vi.fn(),
  getPredictionsHistoryDetail: vi.fn(),
  getSimulationTickets: vi.fn(),
  quoteSimulationTicket: vi.fn(),
  updateMyBet: vi.fn(),
  simulateHistoryFilterLoading: { current: false },
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
    _historyPlayTypeFilters: Array<'direct' | 'group3' | 'group6'> = [],
    lotteryPage = 1,
    lotteryPageSize = 10,
  ) => {
    const isPl3 = _lotteryCode === 'pl3'
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
    ]
    const filteredHistoryRecords = historyRecords
      .map((record) => {
        const models = (record.models || []).filter((model) => matchesHistoryStrategies(model.model_id))
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
        model_stats: [
          {
            model_id: 'model-a',
            model_name: '模型A',
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
      [filteredHistoryRecords.length, pagedHistoryRecords],
    )
    const currentModels = isPl3
      ? [
          {
            model_id: 'model-a',
            model_name: '模型A',
            model_provider: 'openai_compatible',
            model_tags: ['reasoning'],
            model_api_model: 'model-a-api',
            predictions: [
              { group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '02', '03'] },
              { group_id: 2, play_type: 'group3', red_balls: [], blue_balls: [], digits: ['01', '01', '03'] },
              { group_id: 3, play_type: 'group6', red_balls: [], blue_balls: [], digits: ['01', '02', '03'] },
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
              { group_id: 2, play_type: 'group6', red_balls: [], blue_balls: [], digits: ['04', '05', '06'] },
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
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  simulateHistoryFilterLoading.current = false
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
      if (playType === 'direct') {
        const hundreds = Array.isArray(payload.direct_hundreds) ? payload.direct_hundreds.length : 0
        const tens = Array.isArray(payload.direct_tens) ? payload.direct_tens.length : 0
        const units = Array.isArray(payload.direct_units) ? payload.direct_units.length : 0
        const betCount = hundreds && tens && units ? hundreds * tens * units : 0
        return { lottery_code: 'pl3', play_type: playType, bet_count: betCount, amount: betCount * 2 }
      }
      const groupCount = Array.isArray(payload.group_numbers) ? payload.group_numbers.length : 0
      const betCount = playType === 'group3'
        ? (groupCount >= 2 ? groupCount * (groupCount - 1) : 0)
        : (groupCount >= 3 ? (groupCount * (groupCount - 1) * (groupCount - 2)) / 6 : 0)
      return { lottery_code: 'pl3', play_type: playType, bet_count: betCount, amount: betCount * 2 }
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
  it('shows local sidebar navigation on prediction tab', () => {
    renderPage()

    expect(screen.getByRole('button', { name: '模型列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '预测统计' })).toBeInTheDocument()
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

  it('switches model overview across list, card and score views', async () => {
    renderPage()

    expect(screen.getByRole('button', { name: '列表视图' })).toHaveClass('is-active')
    expect(screen.getByRole('columnheader', { name: '模型' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '预测号码' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '评分摘要' })).toBeInTheDocument()
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

  it('navigates to model detail page when opening model detail', async () => {
    renderPage()

    await userEvent.click(screen.getAllByRole('button', { name: /查看详情：/ })[0])

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/models/model-a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('updates url when switching dashboard tabs', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/history')
  })

  it('navigates to rules page from tab strip', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '规则与奖金' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/rules')
  })

  it('shows strategy filters for dlt views', async () => {
    renderPage()

    expect(screen.getByText('方案筛选')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))

    expect(screen.getByText('开奖方案筛选')).toBeInTheDocument()
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
  })

  it('shows matched and unmatched models in summary tooltip', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()

    const badge = within(summarySection as HTMLElement).getAllByRole('button', { name: '命中 1 个模型' })[0]
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

    expect(within(historySection as HTMLElement).getAllByText('按期中奖率 100%').length).toBeGreaterThan(0)
    expect(within(historySection as HTMLElement).getAllByText('按注中奖率 20%').length).toBeGreaterThan(0)
    expect(within(historySection as HTMLElement).getAllByText('成本 20 元').length).toBeGreaterThan(0)
    expect(within(historySection as HTMLElement).getAllByText('奖金 305 元').length).toBeGreaterThan(0)

    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    expect(firstHistoryCard?.parentElement).toHaveClass('history-card-list__records')
    expect(within(firstHistoryCard as HTMLElement).getAllByText('注数').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('成本').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('奖金').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('10 元').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getByText('300 元')).toBeInTheDocument()
  })

  it('paginates history records and supports page size changes', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()

    expect(within(historySection as HTMLElement).getByText('第 1 / 2 页')).toBeInTheDocument()
    expect(within(historySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    expect(screen.getByText('第 2026031 期')).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: '保存方案' }))

    await waitFor(() => {
      expect(createSimulationTicket).toHaveBeenCalledWith({
        lottery_code: 'dlt',
        play_type: 'dlt',
        front_numbers: ['01', '02', '03', '04', '05'],
        back_numbers: ['06', '07'],
        direct_hundreds: [],
        direct_tens: [],
        direct_units: [],
        group_numbers: [],
      })
    })

    expect(await screen.findByText('方案 #11')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(deleteSimulationTicket).toHaveBeenCalledWith(11, 'dlt'))
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

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型B' }))
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型B' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('deepseek')).toBeInTheDocument()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' }))
    expect(within(firstHistoryCard as HTMLElement).queryByText('openai_compatible')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('deepseek')).toBeInTheDocument()
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

    expect(screen.getByText('已显示 1 / 2 个模型')).toBeInTheDocument()
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(screen.queryByText('模型B')).not.toBeInTheDocument()
    expect(screen.queryByText('第 2026030 期')).not.toBeInTheDocument()

    const firstHistoryCard = within(historySection as HTMLElement).getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))
    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))

    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' })).toBeInTheDocument()
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(screen.queryByText('模型B')).not.toBeInTheDocument()
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

  it('highlights group3 hits without position and deduplicates repeated numbers', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '01', '08'],
            blue_balls: [],
            digits: ['01', '01', '08'],
            lottery_code: 'pl3',
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
                  play_type: 'group3',
                  red_balls: [],
                  blue_balls: [],
                  digits: ['01', '08', '08'],
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
    expect(await within(firstHistoryCard as HTMLElement).findByText('组选3')).toBeInTheDocument()

    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    const cardScope = within(groupCard as HTMLElement)
    expect(cardScope.getByText('2 中')).toBeInTheDocument()
    const eightDigits = cardScope.getAllByText('08')
    expect(eightDigits[0]).toHaveClass('is-hit')
    expect(eightDigits[1]).not.toHaveClass('is-hit')
    expect(eightDigits[1]).toHaveClass('number-ball--muted')
  })

  it('filters pl3 prediction groups by play type in overview views', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    expect(screen.getAllByText('玩法筛选').length).toBeGreaterThan(0)
    expect(screen.getAllByText('直选').length).toBeGreaterThan(0)
    expect(screen.getAllByText('组选3').length).toBeGreaterThan(0)
    expect(screen.getAllByText('组选6').length).toBeGreaterThan(0)

    await userEvent.click(screen.getAllByRole('button', { name: '组选3' })[0])

    const modelSection = screen.getByRole('heading', { name: '模型列表' }).closest('section')
    expect(modelSection).not.toBeNull()
    expect(within(modelSection as HTMLElement).getByText('G-2')).toBeInTheDocument()
    expect(within(modelSection as HTMLElement).queryByText('G-3')).not.toBeInTheDocument()
    expect(within(modelSection as HTMLElement).queryByText('G-1')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))
    expect(screen.getByRole('button', { name: '评分视图' })).toHaveClass('is-active')
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('模型B').length).toBeGreaterThan(0)
  })

  it('filters pl3 history detail groups by play type', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '01', '02'],
            blue_balls: [],
            digits: ['01', '01', '02'],
            lottery_code: 'pl3',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 2,
              predictions: [
                { group_id: 1, play_type: 'direct', red_balls: [], blue_balls: [], digits: ['01', '01', '02'] },
                { group_id: 2, play_type: 'group3', red_balls: [], blue_balls: [], digits: ['01', '01', '03'] },
                { group_id: 3, play_type: 'group6', red_balls: [], blue_balls: [], digits: ['01', '02', '03'] },
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
    await userEvent.click(screen.getByRole('button', { name: '组选6' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    expect(await within(firstHistoryCard as HTMLElement).findByText('组选6')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('组选3')).not.toBeInTheDocument()
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
    const dialog = await screen.findByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText('前区号码（逗号分隔）'))
    await userEvent.type(within(dialog).getByLabelText('前区号码（逗号分隔）', { exact: true }), '01,02,03,04,05')
    await userEvent.clear(within(dialog).getByLabelText('后区号码（逗号分隔）'))
    await userEvent.type(within(dialog).getByLabelText('后区号码（逗号分隔）', { exact: true }), '06,07')
    await userEvent.click(within(dialog).getByRole('button', { name: '添加投注' }))

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
})
