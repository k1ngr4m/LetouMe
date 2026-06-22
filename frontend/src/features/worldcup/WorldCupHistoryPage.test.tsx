import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '../../shared/api/client'
import type { WorldCupHistoryResponse } from '../../shared/types/api'
import { WorldCupHistoryPage } from './WorldCupHistoryPage'

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    getWorldCupHistory: vi.fn(),
  },
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: apiClientMock,
}))

const match = {
  match_id: 'worldcup-match-1',
  sporttery_match_id: '2040174',
  match_num_str: '周一013',
  home_team: '瑞士',
  away_team: '波黑',
  kickoff_at: 1781809200,
  stage: '世界杯',
  status: 'finished' as const,
  score: '4:1',
  sell_status: 'Selling',
  latest_odds: {},
  odds_snapshots: [],
  recommendation_count: 3,
}

const baseRecommendation = {
  recommendation_id: 'worldcup-rec-1',
  match,
  play_type: 'win_draw_win' as const,
  selection: '胜',
  model_code: 'worldcup-model-a',
  model_name: '瑞士模型',
  confidence_level: 'medium' as const,
  risk_level: 'low' as const,
  budget_min: 10,
  budget_max: 20,
  reason: '测试推荐。',
  latest_odds: {},
  model_sources: [],
  risk_tags: [],
  is_favorite: false,
  compliance_notice: '预测仅供参考研究，不保证命中。',
  updated_at: 1781809200,
  created_at: 1781809200,
}

const historyResponse: WorldCupHistoryResponse = {
  records: [
    {
      match,
      recommendations: [
        {
          result_status: 'settled',
          hit: true,
          actual_result: '胜',
          settlement_note: '命中',
          recommendation: baseRecommendation,
        },
        {
          result_status: 'settled',
          hit: false,
          actual_result: null,
          settlement_note: '实际赛果为 5球',
          recommendation: {
            ...baseRecommendation,
            recommendation_id: 'worldcup-rec-2',
            play_type: 'total_goals',
            selection: '2',
          },
        },
        {
          result_status: 'pending',
          hit: null,
          actual_result: null,
          settlement_note: '等待赛果同步',
          recommendation: {
            ...baseRecommendation,
            recommendation_id: 'worldcup-rec-3',
            play_type: 'correct_score',
            selection: '2:1',
          },
        },
      ],
    },
  ],
  total_count: 1,
  summary: {
    total_count: 3,
    settled_count: 2,
    hit_count: 1,
    miss_count: 1,
    pending_count: 1,
    unknown_count: 0,
    accuracy: 0.5,
  },
  play_type_groups: [
    {
      play_type: 'win_draw_win',
      play_type_label: '胜平负',
      total_count: 1,
      settled_count: 1,
      hit_count: 1,
      miss_count: 0,
      pending_count: 0,
      unknown_count: 0,
      accuracy: 1,
      models: [
        {
          model_code: 'worldcup-model-a',
          model_name: '瑞士模型',
          play_type: 'win_draw_win',
          total_count: 1,
          settled_count: 1,
          hit_count: 1,
          miss_count: 0,
          pending_count: 0,
          unknown_count: 0,
          accuracy: 1,
        },
      ],
    },
    {
      play_type: 'total_goals',
      play_type_label: '总进球数',
      total_count: 1,
      settled_count: 1,
      hit_count: 0,
      miss_count: 1,
      pending_count: 0,
      unknown_count: 0,
      accuracy: 0,
      models: [
        {
          model_code: 'worldcup-model-a',
          model_name: '瑞士模型',
          play_type: 'total_goals',
          total_count: 1,
          settled_count: 1,
          hit_count: 0,
          miss_count: 1,
          pending_count: 0,
          unknown_count: 0,
          accuracy: 0,
        },
      ],
    },
    {
      play_type: 'correct_score',
      play_type_label: '比分',
      total_count: 1,
      settled_count: 0,
      hit_count: 0,
      miss_count: 0,
      pending_count: 1,
      unknown_count: 0,
      accuracy: null,
      models: [
        {
          model_code: 'worldcup-model-a',
          model_name: '瑞士模型',
          play_type: 'correct_score',
          total_count: 1,
          settled_count: 0,
          hit_count: 0,
          miss_count: 0,
          pending_count: 1,
          unknown_count: 0,
          accuracy: null,
        },
      ],
    },
  ],
  compliance_notice: '预测仅供参考研究，不保证命中。',
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorldCupHistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorldCupHistoryPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getWorldCupHistory).mockReset()
    vi.mocked(apiClient.getWorldCupHistory).mockResolvedValue(historyResponse)
  })

  it('renders refined match cards and loads all dates by default', async () => {
    renderPage()

    const title = await screen.findByRole('heading', { name: '瑞士 vs 波黑' })
    const card = title.closest('article')
    expect(card).not.toBeNull()
    const matchCard = card as HTMLElement
    const summary = within(matchCard).getByLabelText('瑞士 vs 波黑 推荐概览')

    expect(within(matchCard).getByText('4:1')).toBeInTheDocument()
    expect(within(matchCard).getByText('完场比分')).toBeInTheDocument()
    expect(within(summary).getByText('3')).toBeInTheDocument()
    expect(within(summary).getByText('推荐')).toBeInTheDocument()
    expect(within(summary).getByText('2')).toBeInTheDocument()
    expect(within(summary).getByText('已判定')).toBeInTheDocument()
    expect(within(matchCard).getAllByText('命中')).toHaveLength(2)
    expect(within(matchCard).getAllByText('未中')).toHaveLength(2)
    expect(within(matchCard).getAllByText('待判定')).toHaveLength(2)
    expect(within(matchCard).getByText('胜平负')).toBeInTheDocument()
    expect(within(matchCard).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      '胜平负 · 1 推荐',
      '总进球数 · 1 推荐',
      '比分 · 1 推荐',
    ])
    expect(within(within(matchCard).getByLabelText('总进球数推荐分组')).getByText('2')).toBeInTheDocument()
    expect(within(matchCard).getByText('实际赛果为 5球')).toBeInTheDocument()
    expect(within(matchCard).getByText('等待赛果同步')).toBeInTheDocument()
    expect(screen.queryByText('世界杯赛果复盘')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('回溯概览')).not.toBeInTheDocument()
    expect(apiClient.getWorldCupHistory).toHaveBeenCalledWith({
      status_filter: 'all',
      play_type_filter: 'all',
    })
  })

  it('renders play-type performance groups with model accuracy', async () => {
    renderPage()

    const performance = await screen.findByLabelText('玩法表现')

    expect(within(performance).getByText('按玩法统计模型正确率')).toBeInTheDocument()
    expect(within(performance).getByText('整体正确率')).toBeInTheDocument()
    expect(within(performance).getByText('50.0%')).toBeInTheDocument()
    expect(within(performance).getAllByText('胜平负').length).toBeGreaterThan(0)
    expect(within(performance).getAllByText('100.0%').length).toBeGreaterThan(0)
    expect(within(performance).getAllByText('0.0%').length).toBeGreaterThan(0)
    expect(within(performance).getAllByText('瑞士模型')).toHaveLength(3)
    expect(within(performance).queryByText('worldcup-model-a')).not.toBeInTheDocument()
    expect(within(performance).getAllByText('暂无已判定')).toHaveLength(2)
    expect(within(performance).getAllByText('1 待开奖').length).toBeGreaterThan(0)
  })

  it('filters history by a selected match date', async () => {
    renderPage()

    await screen.findByText('瑞士 vs 波黑')
    await userEvent.type(screen.getByLabelText('比赛日期'), '2026-06-16')

    await waitFor(() => {
      expect(apiClient.getWorldCupHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          date_start: '2026-06-16 00:00:00',
          date_end: '2026-06-16 23:59:59',
        }),
      )
    })
  })

  it('shows the empty state when no history records are available', async () => {
    vi.mocked(apiClient.getWorldCupHistory).mockResolvedValueOnce({
      records: [],
      total_count: 0,
      summary: {
        total_count: 0,
        settled_count: 0,
        hit_count: 0,
        miss_count: 0,
        pending_count: 0,
        unknown_count: 0,
        accuracy: null,
      },
      play_type_groups: [],
      compliance_notice: '预测仅供参考研究，不保证命中。',
    })

    renderPage()

    expect(await screen.findByText('暂无回溯记录，等待赛程、推荐或赛果同步。')).toBeInTheDocument()
  })

  it('combines date, status, and play type filters', async () => {
    renderPage()

    await screen.findByText('瑞士 vs 波黑')
    await userEvent.type(screen.getByLabelText('比赛日期'), '2026-06-16')
    await userEvent.click(screen.getByRole('button', { name: '已完赛' }))
    await userEvent.click(screen.getByRole('button', { name: '总进球数' }))

    await waitFor(() => {
      expect(apiClient.getWorldCupHistory).toHaveBeenCalledWith({
        status_filter: 'finished',
        play_type_filter: 'total_goals',
        date_start: '2026-06-16 00:00:00',
        date_end: '2026-06-16 23:59:59',
      })
    })
  })

  it('clears the date filter and returns to all dates', async () => {
    renderPage()

    await screen.findByText('瑞士 vs 波黑')
    await userEvent.type(screen.getByLabelText('比赛日期'), '2026-06-16')
    await userEvent.click(screen.getByRole('button', { name: '全部日期' }))

    await waitFor(() => {
      expect(apiClient.getWorldCupHistory).toHaveBeenLastCalledWith({
        status_filter: 'all',
        play_type_filter: 'all',
      })
    })
  })
})
