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
            model_tags: ['reasoning'],
            model_api_model: 'model-a-api',
            predictions: Array.from({ length: 5 }, (_, index) => ({
              group_id: index + 1,
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
              red_balls: ['08', '09', '10', '11', '12'],
              blue_balls: ['01', '02'],
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
            period_summary: {
              total_bet_count: 10,
              total_cost_amount: 20,
              total_prize_amount: 305,
            },
            models: [
              {
                model_id: 'model-a',
                model_name: '模型A',
                model_provider: 'openai_compatible',
                best_hit_count: 3,
                bet_count: 5,
                cost_amount: 10,
                winning_bet_count: 1,
                prize_amount: 300,
                hit_period_win: true,
              },
              {
                model_id: 'model-b',
                model_name: '模型B',
                model_provider: 'deepseek',
                best_hit_count: 1,
                bet_count: 5,
                cost_amount: 10,
                winning_bet_count: 1,
                prize_amount: 5,
                hit_period_win: true,
              },
            ],
          },
          {
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
          },
        ],
        total_count: 2,
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

  it('switches model overview between card and list views', async () => {
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
  })

  it('keeps full ability portrait in model detail dialog', async () => {
    renderPage()

    await userEvent.click(screen.getAllByRole('button', { name: /查看详情：/ })[0])

    const dialog = await screen.findByRole('dialog')
    const dialogScope = within(dialog)
    expect(dialog).toBeInTheDocument()
    expect(dialogScope.getByText('能力画像')).toBeInTheDocument()
    expect(dialogScope.getByText('综合分')).toBeInTheDocument()
    expect(dialogScope.getByText('能力上限')).toBeInTheDocument()
    expect(dialogScope.getByText('能力下限')).toBeInTheDocument()
    expect(dialogScope.getByText('近期 20 期')).toBeInTheDocument()
  })

  it('applies model list filters to number summary candidates', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '展开筛选' }))
    await userEvent.click(screen.getByRole('button', { name: 'openai_compatible' }))

    const summarySection = screen.getByRole('heading', { name: '号码预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()

    expect(within(summarySection as HTMLElement).getByRole('button', { name: '模型A' })).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).queryByRole('button', { name: '模型B' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '81-100 分' }))
    expect(within(summarySection as HTMLElement).getByText('当前筛选条件下没有可统计的模型。')).toBeInTheDocument()
  })

  it('shows matched and unmatched models in summary tooltip', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '号码预测统计' }).closest('section')
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

    expect(screen.getAllByText('按期中奖率 100%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('按注中奖率 20%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('成本 10 元').length).toBeGreaterThan(0)
    expect(screen.getByText('5 注 / 10 元 / 300 元')).toBeInTheDocument()
    expect(screen.getAllByText('成本 20 元').length).toBeGreaterThan(0)
    expect(screen.getByText('奖金 305 元')).toBeInTheDocument()
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
    await userEvent.click(screen.getAllByRole('button', { name: '展开详情' })[0])

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031'))
    expect(await screen.findByText('收起详情')).toBeInTheDocument()

    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    const detailSection = within(firstHistoryCard as HTMLElement).getAllByText('模型A')[1].closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
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

    await userEvent.click(screen.getByRole('button', { name: '展开筛选' }))
    await userEvent.click(screen.getByRole('button', { name: 'openai_compatible' }))
    await userEvent.click(screen.getByRole('button', { name: '历史回溯' }))

    expect(screen.getByText('已显示 1 / 2 个模型')).toBeInTheDocument()
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(screen.queryByText('模型B')).not.toBeInTheDocument()
    expect(screen.queryByText('第 2026030 期')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '展开详情' }))
    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031'))

    expect(await screen.findByText('收起详情')).toBeInTheDocument()
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(screen.queryByText('模型B')).not.toBeInTheDocument()
  })
})
