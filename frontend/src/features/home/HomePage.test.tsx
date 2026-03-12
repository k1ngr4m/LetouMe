import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { HomePage } from './HomePage'

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
        predictions_history: [],
        total_count: 0,
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

describe('HomePage dashboard sidebar', () => {
  it('shows local sidebar navigation on prediction tab', () => {
    renderPage()

    expect(screen.getByRole('button', { name: '模型列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '号码预测统计' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '号码预测统计' })).toBeInTheDocument()
    expect(screen.queryByText('评分加权')).not.toBeInTheDocument()
  })

  it('hides local sidebar navigation outside prediction tab', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '图表分析' }))

    expect(screen.queryByRole('button', { name: '模型列表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '号码预测统计' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '号码预测统计' })).not.toBeInTheDocument()
  })
})
