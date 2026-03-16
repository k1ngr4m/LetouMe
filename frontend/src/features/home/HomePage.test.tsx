import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

const { getPredictionsHistoryDetail } = vi.hoisted(() => ({
  getPredictionsHistoryDetail: vi.fn(),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getPredictionsHistoryDetail,
  },
}))

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
            model_api_model: 'model-a-api',
            predictions: Array.from({ length: 5 }, (_, index) => ({
              group_id: index + 1,
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
        data: [],
        next_draw: {
          next_date_display: '2026-03-15',
        },
      },
      isLoading: false,
      error: null,
    },
    predictionsHistory: {
      data: {
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
              },
            ],
          },
        ],
        total_count: 1,
      },
      isLoading: false,
      error: null,
    },
    pagedLotteryHistory: {
      data: {
        data: [],
        total_count: 0,
      },
      isLoading: false,
      error: null,
    },
  }),
}))

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  render(
    <QueryClientProvider client={client}>
      <HomePage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getPredictionsHistoryDetail.mockReset()
})

describe('HomePage dashboard sidebar', () => {
  it('shows local sidebar navigation on prediction tab', () => {
    renderPage()

    expect(screen.getByRole('button', { name: '模型列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '号码预测统计' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '号码预测统计' })).toBeInTheDocument()
    expect(screen.queryByText('评分加权')).not.toBeInTheDocument()
  })

  it('filters model list with model provider, tag and score range', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '展开筛选' }))
    await userEvent.click(screen.getByRole('button', { name: 'openai_compatible' }))
    await userEvent.click(screen.getByRole('button', { name: '81-100 分' }))

    expect(screen.getByText('已显示 0 / 1 个模型')).toBeInTheDocument()
    expect(screen.getByText('没有符合当前筛选条件的模型。')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '清空筛选' }))

    await waitFor(() => {
      expect(screen.getByText('已显示 1 / 1 个模型')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: '模型A' })).toBeInTheDocument()
  })

  it('hides local sidebar navigation outside prediction tab', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '图表分析' }))

    expect(screen.queryByRole('button', { name: '模型列表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '号码预测统计' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '号码预测统计' })).not.toBeInTheDocument()
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
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))
    await userEvent.click(screen.getByRole('button', { name: '展开详情' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031'))
    expect(await screen.findByText('收起详情')).toBeInTheDocument()

    const groupCard = screen.getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    const cardScope = within(groupCard as HTMLElement)
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
    expect(groupCard).not.toHaveClass('is-hit-tier-4')
    expect(groupCard).not.toHaveClass('is-hit-tier-5')
    expect(groupCard).not.toHaveClass('is-hit-tier-6')
    expect(hit4Card).toHaveClass('is-hit-tier-4')
    expect(hit5Card).toHaveClass('is-hit-tier-5')
    expect(hit6Card).toHaveClass('is-hit-tier-6')
  })
})
