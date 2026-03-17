import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HomeModelDetailPage } from './HomeModelDetailPage'

vi.mock('./hooks/useHomeData', () => ({
  useHomeData: () => ({
    currentPredictions: {
      data: {
        prediction_date: '2026-03-12',
        target_period: '2026032',
        models: [
          {
            model_id: 'model-a',
            model_name: '模型A',
            model_provider: 'openai_compatible',
            predictions: Array.from({ length: 5 }, (_, index) => ({
              group_id: index + 1,
              strategy: '综合策略',
              description: '基于当前期历史统计生成。',
              red_balls: ['01', '02', '03', '04', '05'],
              blue_balls: ['06', '07'],
            })),
          },
        ],
      },
      isLoading: false,
      error: null,
    },
    lotteryCharts: {
      data: {
        data: [
          {
            period: '2026032',
            date: '2026-03-15',
            red_balls: ['01', '02', '03', '14', '21'],
            blue_balls: ['06', '10'],
          },
        ],
      },
      isLoading: false,
      error: null,
    },
    predictionsHistory: {
      data: {
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
              recent_window: {
                overall_score: 78,
                per_bet_score: 70,
                per_period_score: 74,
                profit_score: 72,
                hit_score: 68,
                stability_score: 66,
                ceiling_score: 81,
                floor_score: 59,
                periods: 8,
                bets: 40,
                hit_rate_by_period: 0.625,
                hit_rate_by_bet: 0.25,
                roi: 0.36,
                avg_period_roi: 0.12,
                best_period: {
                  target_period: '2026030',
                  prediction_date: '2026-03-08',
                  bet_count: 5,
                  winning_bet_count: 2,
                  cost_amount: 10,
                  prize_amount: 30,
                  net_profit: 20,
                  roi: 2,
                  best_hit_count: 5,
                },
                worst_period: {
                  target_period: '2026028',
                  prediction_date: '2026-03-04',
                  bet_count: 5,
                  winning_bet_count: 0,
                  cost_amount: 10,
                  prize_amount: 0,
                  net_profit: -10,
                  roi: -1,
                  best_hit_count: 1,
                },
              },
              long_term_window: {
                overall_score: 70,
                per_bet_score: 66,
                per_period_score: 72,
                profit_score: 70,
                hit_score: 66,
                stability_score: 68,
                ceiling_score: 78,
                floor_score: 57,
                periods: 12,
                bets: 60,
                hit_rate_by_period: 0.58,
                hit_rate_by_bet: 0.22,
                roi: 0.3,
                avg_period_roi: 0.11,
                best_period: {
                  target_period: '2026030',
                  prediction_date: '2026-03-08',
                  bet_count: 5,
                  winning_bet_count: 2,
                  cost_amount: 10,
                  prize_amount: 30,
                  net_profit: 20,
                  roi: 2,
                  best_hit_count: 5,
                },
                worst_period: {
                  target_period: '2026028',
                  prediction_date: '2026-03-04',
                  bet_count: 5,
                  winning_bet_count: 0,
                  cost_amount: 10,
                  prize_amount: 0,
                  net_profit: -10,
                  roi: -1,
                  best_hit_count: 1,
                },
              },
              best_period_snapshot: {
                target_period: '2026030',
                prediction_date: '2026-03-08',
                bet_count: 5,
                winning_bet_count: 2,
                cost_amount: 10,
                prize_amount: 30,
                net_profit: 20,
                roi: 2,
                best_hit_count: 5,
              },
              worst_period_snapshot: {
                target_period: '2026028',
                prediction_date: '2026-03-04',
                bet_count: 5,
                winning_bet_count: 0,
                cost_amount: 10,
                prize_amount: 0,
                net_profit: -10,
                roi: -1,
                best_hit_count: 1,
              },
              sample_size_periods: 12,
              sample_size_bets: 60,
            },
          },
        ],
        predictions_history: [],
        total_count: 0,
      },
      isLoading: false,
      error: null,
    },
    pagedLotteryHistory: {
      data: { data: [], total_count: 0 },
      isLoading: false,
      error: null,
    },
  }),
}))

function renderPage(initialPath = '/dashboard/models/model-a') {
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
      <MemoryRouter initialEntries={[{ pathname: initialPath, state: { dashboardState: { activeTab: 'prediction', activeSection: 'models' } } }]}>
        <Routes>
          <Route
            path="/dashboard/models/:modelId"
            element={
              <>
                <HomeModelDetailPage />
                <LocationDisplay />
              </>
            }
          />
          <Route path="/dashboard" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HomeModelDetailPage', () => {
  it('renders the standalone model detail page', async () => {
    renderPage()

    expect(screen.getByRole('heading', { name: '模型A' })).toBeInTheDocument()
    expect(screen.getByText('能力画像')).toBeInTheDocument()
    expect(screen.getByText('综合分')).toBeInTheDocument()
    expect(screen.getByText('能力上限')).toBeInTheDocument()
    expect(screen.getByText('能力下限')).toBeInTheDocument()
    expect(screen.getByText('本期预测组')).toBeInTheDocument()
    expect(screen.getAllByText('综合策略').length).toBeGreaterThan(0)
  })

  it('returns to dashboard from the detail page', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '返回总览' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard')
  })

  it('shows empty state for unknown models', () => {
    renderPage('/dashboard/models/missing-model')

    const page = screen.getByText('模型详情不存在').closest('section')
    expect(page).not.toBeNull()
    expect(within(page as HTMLElement).getByText('未找到对应模型：`missing-model`')).toBeInTheDocument()
  })
})
