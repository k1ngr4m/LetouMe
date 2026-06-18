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
    getWorldCupBaiduAnalysis: vi.fn(),
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
  confidence_score: 64,
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

const matchWithoutWinDrawWinOdds: WorldCupMatch = {
  ...match,
  latest_odds: {},
  odds_snapshots: match.odds_snapshots?.map((snapshot) => (
    snapshot.play_type === 'win_draw_win'
      ? { ...snapshot, odds: {}, sell_status: 'Closed' }
      : snapshot
  )),
}

const yesterdayMatch: WorldCupMatch = {
  ...match,
  match_id: 'worldcup-match-yesterday',
  match_num_str: '周日012',
  home_team: '昨天队',
  away_team: '旧数据队',
  kickoff_at: 1781452800,
}

const tomorrowMatch: WorldCupMatch = {
  ...match,
  match_id: 'worldcup-match-tomorrow',
  match_num_str: '周二014',
  home_team: '法国',
  away_team: '塞内加尔',
  kickoff_at: 1781625600,
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
    vi.mocked(apiClient.getWorldCupBaiduAnalysis).mockResolvedValue({
      match_id: match.match_id,
      match,
      analysis: {
        status: 'available',
        provider: 'baidu_tiyu',
        recent_records: [
          {
            scope: 'all',
            team_name: '西班牙',
            title: '西班牙近期战绩',
            result: '5胜1平0负',
            probability: ['胜率 83%', '赢盘率 50%', '大球率 100%'],
            matches: [
              {
                date: '2026-06-09',
                match: '国际友谊',
                score: '西班牙 3 - 1 北爱尔兰',
                handicap: { value: '2.0', desc: '走盘' },
                total_goals: { value: '3.25', desc: '大球' },
              },
            ],
          },
        ],
        pre_match_prediction: {
          sample_count: '71955',
          percentage: { victory: '68%', draw: '20%', lost: '12%' },
        },
        positive_intelligence: [
          { team_name: '西班牙', items: ['西班牙6场比赛5胜1平，状态出色。'] },
          { team_name: '佛得角', items: ['佛得角近10场正赛主场7胜3平0负，表现出色。'] },
        ],
        negative_intelligence: [],
        squad_status: {
          status: '阵容名单已获取，首发待确认',
          court: '波士顿体育场',
          referee: '皮埃尔·吉斯兰·阿乔',
        },
      },
    })
  })

  afterEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('opens a full odds modal from compact match cards', async () => {
    renderPage()

    const oddsButton = await screen.findByRole('button', { name: '西班牙 vs 佛得角 查看全部赔率' })
    expect(await screen.findByText('置信值')).toBeInTheDocument()
    expect(await screen.findByText('64%')).toBeInTheDocument()
    expect(within(oddsButton).getAllByText('主胜').length).toBeGreaterThan(0)
    expect(within(oddsButton).getByText('1.80')).toBeInTheDocument()
    expect(within(oddsButton).getByText('3.20')).toBeInTheDocument()
    expect(within(oddsButton).getByText('4.60')).toBeInTheDocument()
    expect(within(oddsButton).getByText('-2')).toBeInTheDocument()
    expect(within(oddsButton).getByText('全部玩法')).toBeInTheDocument()
    expect(screen.queryByText('负其它')).not.toBeInTheDocument()

    await userEvent.click(oddsButton)

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

  it('shows baidu pre-match analysis for the selected match', async () => {
    renderPage()

    const recommendationHeading = await screen.findByRole('heading', { name: '推荐方案' })
    const analysisHeading = await screen.findByRole('heading', { name: '赛前分析' })
    expect(recommendationHeading.compareDocumentPosition(analysisHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Baidu 体育')).toBeInTheDocument()
    expect(await screen.findByText('68%')).toBeInTheDocument()
    expect(screen.getByText('71955 样本')).toBeInTheDocument()
    expect(screen.getByText('西班牙近期战绩')).toBeInTheDocument()
    expect(screen.getByText('胜率 83%')).toBeInTheDocument()
    expect(screen.getByText('西班牙6场比赛5胜1平，状态出色。')).toBeInTheDocument()
    expect(screen.getByText('阵容名单已获取，首发待确认')).toBeInTheDocument()
  })

  it('shows a closed win-draw-win row when that play has no odds', async () => {
    vi.mocked(apiClient.getWorldCupMatches).mockResolvedValue({ matches: [matchWithoutWinDrawWinOdds], total_count: 1 })
    vi.mocked(apiClient.getWorldCupRecommendations).mockResolvedValueOnce({
      recommendations: [],
      total_count: 0,
      compliance_notice: recommendation.compliance_notice,
    })
    renderPage()

    const oddsButton = await screen.findByRole('button', { name: '西班牙 vs 佛得角 查看全部赔率' })
    expect(within(oddsButton).getByText('胜平负游戏未开售')).toBeInTheDocument()
    expect(within(oddsButton).getByText('-2')).toBeInTheDocument()
    expect(within(oddsButton).getByText('1.54')).toBeInTheDocument()
    expect(within(oddsButton).queryByText('1.80')).not.toBeInTheDocument()

    await userEvent.click(oddsButton)

    const dialog = screen.getByRole('dialog', { name: '世界杯赔率' })
    expect(within(dialog).queryByText('胜平负游戏未开售')).not.toBeInTheDocument()
    expect(within(dialog).getByText('让球胜平负')).toBeInTheDocument()
    expect(within(dialog).getByText('主胜')).toBeInTheDocument()
  })

  it('keeps match odds visible while play type filters recommendations', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: '西班牙 vs 佛得角 查看全部赔率' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '全部风险' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '低风险' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '总进球数' }))

    await waitFor(() => {
      expect(apiClient.getWorldCupRecommendations).toHaveBeenLastCalledWith(
        expect.not.objectContaining({ risk_level_filter: expect.anything() }),
      )
      expect(apiClient.getWorldCupRecommendations).toHaveBeenLastCalledWith(
        expect.objectContaining({ play_type_filter: 'total_goals' }),
      )
    })
    const oddsButton = screen.getByRole('button', { name: '西班牙 vs 佛得角 查看全部赔率' })
    expect(within(oddsButton).getByText('1.80')).toBeInTheDocument()
    expect(within(oddsButton).getByText('-2')).toBeInTheDocument()

    await userEvent.click(oddsButton)
    const dialog = screen.getByRole('dialog', { name: '世界杯赔率' })
    expect(within(dialog).getByText('胜平负')).toBeInTheDocument()
    expect(within(dialog).getByText('总进球数')).toBeInTheDocument()
  })

  it('shows the latest odds update time when odds are newer than recommendations', async () => {
    const newerOddsMatch: WorldCupMatch = {
      ...match,
      odds_fetched_at: 1781578800,
      odds_snapshots: match.odds_snapshots?.map((snapshot) => ({
        ...snapshot,
        fetched_at: 1781578800,
      })),
    }
    vi.mocked(apiClient.getWorldCupMatches).mockResolvedValue({ matches: [newerOddsMatch], total_count: 1 })
    vi.mocked(apiClient.getWorldCupRecommendations).mockResolvedValueOnce({
      recommendations: [{ ...recommendation, match: newerOddsMatch, updated_at: 1781492400 }],
      total_count: 1,
      compliance_notice: recommendation.compliance_notice,
    })

    renderPage()

    expect(await screen.findByText('2026-06-16 11:00')).toBeInTheDocument()
  })

  it('defaults the schedule odds view to tomorrow instead of today', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-06-16T12:00:00+08:00'))
    vi.mocked(apiClient.getWorldCupMatches).mockImplementation((payload) => {
      if (payload?.date_start) {
        return Promise.resolve({ matches: [tomorrowMatch], total_count: 1 })
      }
      return Promise.resolve({ matches: [yesterdayMatch, match, tomorrowMatch], total_count: 3 })
    })

    renderPage()

    expect(await screen.findByText('赛程赔率')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '法国 vs 塞内加尔 查看全部赔率' })).toBeInTheDocument()
    expect(screen.getByText(/2026-06-17\s+·\s+1\s+场/)).toBeInTheDocument()
    expect(screen.queryByText('昨天队 vs 旧数据队')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '西班牙 vs 佛得角 查看全部赔率' })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(apiClient.getWorldCupMatches).toHaveBeenCalledWith(
        expect.objectContaining({
          date_start: '2026-06-17 00:00:00',
          date_end: '2026-06-17 23:59:59',
        }),
      )
    })
  })
})
