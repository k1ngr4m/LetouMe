import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/feedback/ToastProvider'
import type { WorldCupMatch, WorldCupRecommendation } from '../../shared/types/api'
import { apiClient } from '../../shared/api/client'
import { WorldCupPage } from './WorldCupPage'

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    getWorldCupMatches: vi.fn(),
    getWorldCupRecommendations: vi.fn(),
  },
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: apiClientMock,
}))

const match: WorldCupMatch = {
  match_id: 'worldcup-match-1',
  sporttery_match_id: '2040174',
  match_num_str: '周一013',
  home_team: '西班牙',
  away_team: '佛得角',
  kickoff_at: 1781539200,
  stage: '世界杯',
  status: 'scheduled',
  score: null,
  sell_status: 'Selling',
  latest_odds: { 胜: '1.80', 平: '3.20', 负: '4.60' },
  odds_fetched_at: 1781492400,
  recommendation_count: 1,
  odds_snapshots: [
    {
      play_type: 'win_draw_win',
      play_label: '胜平负',
      odds: { 胜: '1.80', 平: '3.20', 负: '4.60' },
      fetched_at: 1781492400,
    },
    {
      play_type: 'handicap_win_draw_win',
      play_label: '让球胜平负',
      odds: { 胜: '1.54', 平: '4.55', 负: '3.85' },
      goal_line: '-2.00',
      sell_status: 'Selling',
      fetched_at: 1781492400,
    },
    {
      play_type: 'correct_score',
      play_label: '比分',
      odds: { '1:0': '9.70', '2:0': '6.70', '2:1': '13.50', '0:1': '80.00', 胜其它: '5.75', 平其它: '700.0', 负其它: '800.0' },
      single_status: '1',
      sell_status: 'Selling',
      fetched_at: 1781492400,
    },
    {
      play_type: 'total_goals',
      play_label: '总进球数',
      odds: { '0': '34.00', '1': '8.90', '2': '5.10', '3': '4.10', '4': '4.30', '5': '5.50', '6': '7.75', '7+': '7.75' },
      single_status: '1',
      sell_status: 'Selling',
      fetched_at: 1781492400,
    },
    {
      play_type: 'half_full_time',
      play_label: '半全场胜平负',
      odds: { 胜胜: '1.20', 胜平: '40.00', 胜负: '100.0', 平胜: '4.20', 平平: '17.50', 平负: '75.00', 负胜: '28.00', 负平: '40.00', 负负: '60.00' },
      single_status: '1',
      sell_status: 'Selling',
      fetched_at: 1781492400,
    },
  ],
}

const recommendation: WorldCupRecommendation = {
  recommendation_id: 'worldcup-rec-1',
  match,
  play_type: 'win_draw_win',
  selection: '胜',
  odds_value: '1.80',
  implied_probability: 0.556,
  confidence_level: 'medium',
  risk_level: 'low',
  budget_min: 10,
  budget_max: 30,
  reason: '测试推荐理由。',
  latest_odds: { 胜: '1.80', 平: '3.20', 负: '4.60' },
  odds_fetched_at: 1781492400,
  model_sources: ['fixture'],
  risk_tags: ['fixture'],
  is_favorite: false,
  compliance_notice: '预测仅供参考研究，不保证命中；请以线下实体店和官方公告为准，理性参与。',
  updated_at: 1781492400,
  created_at: 1781492400,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <WorldCupPage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WorldCupPage odds display', () => {
  beforeEach(() => {
    localStorage.setItem('worldcup-age-confirmed', '1')
    vi.mocked(apiClient.getWorldCupMatches).mockResolvedValue({ matches: [match], total_count: 1 })
    vi.mocked(apiClient.getWorldCupRecommendations).mockResolvedValue({
      recommendations: [recommendation],
      total_count: 1,
      compliance_notice: recommendation.compliance_notice,
    })
  })

  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('opens a full odds modal from compact match cards', async () => {
    renderPage()

    expect(await screen.findByText('西班牙 vs 佛得角')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '赔率已同步' })).toBeInTheDocument()
    expect(screen.queryByText('负其它')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '赔率已同步' }))

    const dialog = screen.getByRole('dialog', { name: '世界杯赔率' })
    expect(within(dialog).getByText('周一 013 世界杯 06-16 00:00')).toBeInTheDocument()
    expect(within(dialog).getByText('[主]')).toBeInTheDocument()
    expect(within(dialog).getByText('-2')).toBeInTheDocument()
    expect(within(dialog).getAllByText('主胜').length).toBeGreaterThan(0)
    expect(within(dialog).getByText('比分')).toBeInTheDocument()
    expect(within(dialog).getByText('负其它')).toBeInTheDocument()
    expect(within(dialog).getByText('总进球数')).toBeInTheDocument()
    expect(within(dialog).getByText('7+')).toBeInTheDocument()
    expect(within(dialog).getByText('半全场胜平负')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog', { name: '世界杯赔率' })).not.toBeInTheDocument()
  })

  it('keeps match odds visible while play type filters recommendations', async () => {
    renderPage()
    expect(await screen.findByText('西班牙 vs 佛得角')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '总进球数' }))

    await waitFor(() => {
      expect(apiClient.getWorldCupRecommendations).toHaveBeenLastCalledWith(
        expect.objectContaining({ play_type_filter: 'total_goals' }),
      )
    })
    expect(screen.getByRole('button', { name: '赔率已同步' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '赔率已同步' }))
    const dialog = screen.getByRole('dialog', { name: '世界杯赔率' })
    expect(within(dialog).getByText('胜平负')).toBeInTheDocument()
    expect(within(dialog).getByText('总进球数')).toBeInTheDocument()
  })
})
