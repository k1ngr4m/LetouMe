import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeBacktestPage } from './HomeBacktestPage'
import { apiClient } from '../../shared/api/client'
import type { BacktestSummaryResponse } from '../../shared/types/api'

vi.mock('../../shared/lib/storage', () => ({
  loadSelectedLottery: () => 'dlt',
  saveSelectedLottery: () => undefined,
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getPredictionBacktestSummary: vi.fn(),
  },
}))

function buildBacktestResponse(overrides: Partial<BacktestSummaryResponse> = {}): BacktestSummaryResponse {
  return {
    lottery_code: 'dlt',
    recent_period_count: 20,
    overview: {
      period_count: 2,
      model_count: 1,
      total_bet_count: 4,
      winning_bet_count: 1,
      total_cost_amount: 8,
      total_prize_amount: 10000,
      net_profit: 9992,
      roi: 1249,
      winning_period_count: 1,
      win_rate_by_period: 0.5,
      overall_score: 82,
      top_model: null,
    },
    model_rankings: [
      {
        model_id: 'model-a',
        prediction_play_mode: 'direct',
        model_name: '模型A',
        periods: 2,
        winning_periods: 1,
        bet_count: 4,
        winning_bet_count: 1,
        cost_amount: 8,
        prize_amount: 10000,
        win_rate_by_period: 0.5,
        win_rate_by_bet: 0.25,
        overall_score: 82,
        net_profit: 9992,
        roi: 1249,
        best_period: {
          target_period: '26001',
          prediction_date: '2026-02-28',
          bet_count: 2,
          winning_bet_count: 1,
          cost_amount: 4,
          prize_amount: 10000,
          net_profit: 9996,
          roi: 2499,
          best_hit_count: 5,
        },
        worst_period: {
          target_period: '26002',
          prediction_date: '2026-03-01',
          bet_count: 2,
          winning_bet_count: 0,
          cost_amount: 4,
          prize_amount: 0,
          net_profit: -4,
          roi: -1,
          best_hit_count: 0,
        },
        sample_size_periods: 2,
        sample_size_bets: 4,
      },
    ],
    periods: [
      {
        lottery_code: 'dlt',
        target_period: '26002',
        prediction_date: '2026-03-01',
        actual_result: {
          lottery_code: 'dlt',
          period: '26002',
          date: '2026-03-01',
          red_balls: ['01', '02', '03', '04', '05'],
          blue_balls: ['06', '07'],
        },
        summary: {
          total_bet_count: 2,
          total_cost_amount: 4,
          total_prize_amount: 0,
        },
        models: [
          {
            model_id: 'model-a',
            prediction_play_mode: 'direct',
            model_name: '模型A',
            model_provider: 'openai',
            best_group: 1,
            best_hit_count: 0,
            bet_count: 2,
            winning_bet_count: 0,
            cost_amount: 4,
            prize_amount: 0,
            net_profit: -4,
            hit_period_win: false,
          },
        ],
      },
    ],
    strategy_breakdown: [
      {
        strategy: '热号',
        period_count: 2,
        model_count: 1,
        total_bet_count: 4,
        winning_bet_count: 1,
        total_cost_amount: 8,
        total_prize_amount: 10000,
        net_profit: 9992,
        roi: 1249,
        win_rate_by_period: 0.5,
        overall_score: 82,
      },
    ],
    strategy_options: ['热号'],
    ...overrides,
  }
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomeBacktestPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HomeBacktestPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getPredictionBacktestSummary).mockReset()
    vi.mocked(apiClient.getPredictionBacktestSummary).mockResolvedValue(buildBacktestResponse())
  })

  it('renders overview, rankings, trend, and period details', async () => {
    renderPage()

    expect(await screen.findByText('模型排行榜')).toBeInTheDocument()
    expect(screen.getByText('AI 预测回测')).toBeInTheDocument()
    expect(screen.getByText('82.0')).toBeInTheDocument()
    expect(screen.getByText('期号趋势')).toBeInTheDocument()
    expect(screen.getByText('方案表现')).toBeInTheDocument()
    expect(screen.getAllByText('第 26002 期').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: /第 26002 期/ }))
    expect(screen.getByText('直选/普通 · 最佳 0')).toBeInTheDocument()
  })

  it('refreshes query when recent period changes', async () => {
    renderPage()
    await screen.findByText('模型排行榜')

    await userEvent.click(screen.getByRole('button', { name: '近 10 期' }))

    expect(apiClient.getPredictionBacktestSummary).toHaveBeenLastCalledWith(
      expect.objectContaining({ lottery_code: 'dlt', recent_period_count: 10 }),
    )
  })

  it('shows empty state when no periods match filters', async () => {
    vi.mocked(apiClient.getPredictionBacktestSummary).mockResolvedValue(
      buildBacktestResponse({
        overview: {
          period_count: 0,
          model_count: 0,
          total_bet_count: 0,
          winning_bet_count: 0,
          total_cost_amount: 0,
          total_prize_amount: 0,
          net_profit: 0,
          roi: 0,
          winning_period_count: 0,
          win_rate_by_period: 0,
          overall_score: 0,
          top_model: null,
        },
        model_rankings: [],
        periods: [],
        strategy_breakdown: [],
        strategy_options: [],
      }),
    )

    renderPage()

    expect(await screen.findByText('当前筛选条件下暂无可回测的历史报告。')).toBeInTheDocument()
    expect(within(screen.getByLabelText('主导航')).getByRole('button', { name: '回测' })).toHaveClass('is-active')
  })
})
