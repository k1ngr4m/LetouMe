import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomeExpertPredictionPage } from './HomeExpertPredictionPage'
import { LotterySelectionProvider } from '../../shared/lottery/LotterySelectionProvider'

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    getExpertsList: vi.fn(),
    getExpertCurrentDetail: vi.fn(),
    getExpertHistoryList: vi.fn(),
    getExpertHistoryDetail: vi.fn(),
  },
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: apiClientMock,
}))

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  window.localStorage.setItem('letou:selected-lottery', 'dlt')
  render(
    <QueryClientProvider client={client}>
      <LotterySelectionProvider>
        <MemoryRouter>
          <HomeExpertPredictionPage />
        </MemoryRouter>
      </LotterySelectionProvider>
    </QueryClientProvider>,
  )
}

describe('HomeExpertPredictionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    apiClientMock.getExpertsList.mockResolvedValue({
      lottery_code: 'dlt',
      target_period: '26034',
      experts: [
        {
          expert_code: 'wei-rong-jie',
          display_name: '魏荣杰',
          bio: '稳健专家',
          lottery_code: 'dlt',
          target_period: '26034',
          model_code: 'deepseek-v3.2',
          dlt_front_weights: {},
          dlt_back_weights: {},
          strategy_preferences: {},
        },
      ],
    })
    apiClientMock.getExpertCurrentDetail.mockResolvedValue({
      expert_code: 'wei-rong-jie',
      display_name: '魏荣杰',
      bio: '稳健专家',
      model_code: 'deepseek-v3.2',
      lottery_code: 'dlt',
      target_period: '26034',
      config: {
        dlt_front_weights: {},
        dlt_back_weights: {},
        strategy_preferences: {},
        pl3_reserved_weights: {},
      },
      tiers: {
        tier1: { front: ['01', '02'], back: ['01'] },
      },
      analysis: {},
      process: {},
    })
    apiClientMock.getExpertHistoryList.mockResolvedValue({
      lottery_code: 'dlt',
      total_count: 1,
      limit: 10,
      offset: 0,
      experts: [{ expert_code: 'wei-rong-jie', display_name: '魏荣杰' }],
      records: [
        {
          target_period: '26033',
          actual_result: {
            period: '26033',
            date: '2026-03-15',
            red_balls: ['01', '02', '03', '04', '05'],
            blue_balls: ['01', '02'],
          },
          experts: [
            {
              expert_code: 'wei-rong-jie',
              display_name: '魏荣杰',
              bio: '稳健专家',
              model_code: 'deepseek-v3.2',
              generated_at: 1770000000,
              best_total_hit_count: 5,
              tier_hits: {
                tier1: {
                  front_hit_count: 2,
                  front_hits: ['01', '02'],
                  back_hit_count: 1,
                  back_hits: ['01'],
                  total_hit_count: 3,
                },
                tier5: {
                  front_hit_count: 3,
                  front_hits: ['01', '02', '03'],
                  back_hit_count: 2,
                  back_hits: ['01', '02'],
                  total_hit_count: 5,
                },
              },
            },
          ],
        },
      ],
    })
    apiClientMock.getExpertHistoryDetail.mockResolvedValue({
      expert_code: 'wei-rong-jie',
      display_name: '魏荣杰',
      bio: '稳健专家',
      model_code: 'deepseek-v3.2',
      lottery_code: 'dlt',
      target_period: '26033',
      actual_result: {
        period: '26033',
        date: '2026-03-15',
        red_balls: ['01', '02', '03', '04', '05'],
        blue_balls: ['01', '02'],
      },
      tiers: {
        tier1: { front: ['01', '04', '09'], back: ['01', '08'] },
        tier2: { front: ['01', '02'], back: ['01'] },
        tier3: { front: ['01', '02'], back: ['01'] },
        tier4: { front: ['01', '02'], back: ['01'] },
        tier5: { front: ['01', '02', '03', '09', '10'], back: ['01', '02'] },
      },
      tier_hits: {
        tier1: {
          front_hit_count: 2,
          front_hits: ['01', '04'],
          back_hit_count: 1,
          back_hits: ['01'],
          total_hit_count: 3,
        },
        tier5: {
          front_hit_count: 3,
          front_hits: ['01', '02', '03'],
          back_hit_count: 2,
          back_hits: ['01', '02'],
          total_hit_count: 5,
        },
      },
      analysis: {
        strategy_summary: '稳健筛选',
        technical_style: '冷热均衡',
      },
      process: {
        tier_trace: {
          tier1: {
            front: { count: 3, kept_from_previous: [], removed_from_previous: [] },
            back: { count: 2, kept_from_previous: [], removed_from_previous: [] },
          },
        },
        strategy_weights: {
          miss_rebound: 40,
          hot_cold_pattern: 20,
          trend_deviation: 20,
          stability: 20,
        },
      },
      generated_at: 1770000000,
    })
  })

  it('shows overview and switches to expert history with tier hit summaries', async () => {
    const user = userEvent.setup()
    renderPage()

    const expertTabs = await screen.findByLabelText('专家预测二级导航')
    expect(within(expertTabs).getByRole('button', { name: '预测总览' })).toBeInTheDocument()
    expect(within(expertTabs).getByRole('button', { name: '预测回溯' })).toBeInTheDocument()
    expect(await screen.findByText('稳健专家')).toBeInTheDocument()

    await user.click(within(expertTabs).getByRole('button', { name: '预测回溯' }))

    await waitFor(() => expect(apiClientMock.getExpertHistoryList).toHaveBeenCalled())
    expect(apiClientMock.getExpertHistoryList).toHaveBeenCalledWith({
      lottery_code: 'dlt',
      expert_code: undefined,
      period_query: undefined,
      limit: 10,
      offset: 0,
    })
    expect(await screen.findByText('第 26033 期')).toBeInTheDocument()
    const record = screen.getByText('专家历史命中').closest('article')
    expect(record).not.toBeNull()
    expect(within(record as HTMLElement).getByText('最高命中 5')).toBeInTheDocument()
    expect(within(record as HTMLElement).getByText('第一档')).toBeInTheDocument()
    expect(within(record as HTMLElement).getByText('第五档')).toBeInTheDocument()

    await user.click(within(record as HTMLElement).getByRole('button', { name: /魏荣杰/ }))

    await waitFor(() => expect(apiClientMock.getExpertHistoryDetail).toHaveBeenCalledWith('26033', 'wei-rong-jie', 'dlt'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('魏荣杰 · 第 26033 期')).toBeInTheDocument()
    expect(screen.getByText('稳健筛选')).toBeInTheDocument()
    const tier1Front = screen.getByTestId('tier1-front-numbers')
    expect(within(tier1Front).getByText('01')).toHaveClass('number-ball--dlt-front')
    expect(within(tier1Front).getByText('09')).toHaveClass('number-ball--muted')

    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
