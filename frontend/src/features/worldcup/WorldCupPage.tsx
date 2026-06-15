import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, ChevronDown, CircleHelp, Copy, Heart, ShieldAlert, Shuffle } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'
import { formatDateTimeLocal } from '../../shared/lib/format'
import { useToast } from '../../shared/feedback/ToastProvider'
import type { WorldCupConfidenceLevel, WorldCupMatch, WorldCupOddsSnapshot, WorldCupPlayType, WorldCupRecommendation, WorldCupRiskLevel } from '../../shared/types/api'
import { WorldCupTabStrip } from './WorldCupTabStrip'

const PLAY_TYPE_OPTIONS: Array<{ value: 'all' | WorldCupPlayType; label: string }> = [
  { value: 'all', label: '全部玩法' },
  { value: 'win_draw_win', label: '胜平负' },
  { value: 'handicap_win_draw_win', label: '让球胜平负' },
  { value: 'total_goals', label: '总进球数' },
  { value: 'correct_score', label: '比分' },
  { value: 'half_full_time', label: '半全场' },
]

const RISK_OPTIONS: Array<{ value: 'all' | WorldCupRiskLevel; label: string }> = [
  { value: 'all', label: '全部风险' },
  { value: 'low', label: '低风险' },
  { value: 'medium', label: '中风险' },
  { value: 'high', label: '高风险' },
]

const STATUS_OPTIONS: Array<{ value: 'all' | 'scheduled' | 'live' | 'finished'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'scheduled', label: '未开赛' },
  { value: 'live', label: '进行中' },
  { value: 'finished', label: '已结束' },
]

const PLAY_TYPE_ORDER = PLAY_TYPE_OPTIONS.filter((option): option is { value: WorldCupPlayType; label: string } => option.value !== 'all')
const WIN_DRAW_WIN_ORDER = ['胜', '平', '负']
const TOTAL_GOALS_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+']
const HALF_FULL_TIME_ORDER = ['胜胜', '胜平', '胜负', '平胜', '平平', '平负', '负胜', '负平', '负负']
const CORRECT_SCORE_OTHER_ORDER: Record<string, number> = {
  胜其它: 0,
  平其它: 1,
  负其它: 2,
}

function formatPlayType(playType: WorldCupPlayType) {
  if (playType === 'win_draw_win') return '胜平负'
  if (playType === 'handicap_win_draw_win') return '让球胜平负'
  if (playType === 'total_goals') return '总进球数'
  if (playType === 'correct_score') return '比分'
  return '半全场'
}

function confidenceLabel(level: WorldCupConfidenceLevel) {
  if (level === 'high') return '高信心'
  if (level === 'low') return '低信心'
  return '中信心'
}

function riskLabel(level: WorldCupRiskLevel) {
  if (level === 'low') return '低风险'
  if (level === 'high') return '高风险'
  return '中风险'
}

function getOddsEntries(snapshot: Pick<WorldCupOddsSnapshot, 'odds'>) {
  return Object.entries(snapshot.odds || {})
    .map(([label, value]) => [normalizeOddsLabel(String(label)), String(value || '').trim()] as const)
    .filter(([, value]) => isDisplayableOdd(value))
}

function sortOddsSnapshots(snapshots: WorldCupOddsSnapshot[], activePlayType: 'all' | WorldCupPlayType) {
  return [...snapshots].sort((a, b) => {
    if (activePlayType !== 'all') {
      if (a.play_type === activePlayType && b.play_type !== activePlayType) return -1
      if (b.play_type === activePlayType && a.play_type !== activePlayType) return 1
    }
    const aIndex = PLAY_TYPE_ORDER.findIndex((option) => option.value === a.play_type)
    const bIndex = PLAY_TYPE_ORDER.findIndex((option) => option.value === b.play_type)
    return (aIndex < 0 ? PLAY_TYPE_ORDER.length : aIndex) - (bIndex < 0 ? PLAY_TYPE_ORDER.length : bIndex)
  })
}

function normalizeOddsLabel(label: string) {
  if (label === '胜其他') return '胜其它'
  if (label === '平其他') return '平其它'
  if (label === '负其他') return '负其它'
  if (label === '7') return '7+'
  return label
}

function isDisplayableOdd(value: string) {
  if (!value) return false
  const numeric = Number(value)
  return !Number.isFinite(numeric) || numeric > 0
}

function hasAnyOdds(match: WorldCupMatch) {
  return (match.odds_snapshots || []).some((snapshot) => getOddsEntries(snapshot).length > 0)
}

function formatMatchNum(value?: string | null) {
  const text = String(value || '').trim()
  const match = text.match(/^(周.)\s*(\d+)$/)
  return match ? `${match[1]} ${match[2]}` : text
}

function formatCompactKickoff(value: string | number | null | undefined) {
  const formatted = formatDateTimeLocal(value)
  const match = formatted.match(/^\d{4}-(\d{2}-\d{2}\s+\d{2}:\d{2})$/)
  return match ? match[1] : formatted
}

function formatOddsModalTitle(match: WorldCupMatch) {
  return [formatMatchNum(match.match_num_str), match.stage, formatCompactKickoff(match.kickoff_at)].filter(Boolean).join(' ')
}

function formatGoalLine(value?: string | null) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value || ''
  const formatted = Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(2)))
  return numeric > 0 ? `+${formatted}` : formatted
}

function getModalEntryLabel(playType: WorldCupPlayType, label: string) {
  if (playType === 'win_draw_win' || playType === 'handicap_win_draw_win') {
    if (label === '胜') return '主胜'
    if (label === '负') return '主负'
  }
  return label
}

function getCorrectScoreSortValue(label: string) {
  const scoreMatch = label.match(/^(\d+):(\d+)$/)
  if (!scoreMatch) {
    const otherIndex = CORRECT_SCORE_OTHER_ORDER[label]
    return otherIndex === undefined ? [9, 99, 99] : [otherIndex, 99, 99]
  }
  const home = Number(scoreMatch[1])
  const away = Number(scoreMatch[2])
  if (home > away) return [0, home, away]
  if (home === away) return [1, home, away]
  return [2, away, home]
}

function compareNumericTuple(left: number[], right: number[]) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function getOrderedOddsEntries(snapshot: WorldCupOddsSnapshot) {
  const entries = getOddsEntries(snapshot).map(([label, value]) => ({
    label,
    displayLabel: getModalEntryLabel(snapshot.play_type, label),
    value,
    wide: label.includes('其它'),
  }))
  if (snapshot.play_type === 'win_draw_win' || snapshot.play_type === 'handicap_win_draw_win') {
    return entries.sort((left, right) => WIN_DRAW_WIN_ORDER.indexOf(left.label) - WIN_DRAW_WIN_ORDER.indexOf(right.label))
  }
  if (snapshot.play_type === 'total_goals') {
    return entries.sort((left, right) => TOTAL_GOALS_ORDER.indexOf(left.label) - TOTAL_GOALS_ORDER.indexOf(right.label))
  }
  if (snapshot.play_type === 'half_full_time') {
    return entries.sort((left, right) => HALF_FULL_TIME_ORDER.indexOf(left.label) - HALF_FULL_TIME_ORDER.indexOf(right.label))
  }
  if (snapshot.play_type === 'correct_score') {
    return entries.sort((left, right) => compareNumericTuple(getCorrectScoreSortValue(left.label), getCorrectScoreSortValue(right.label)))
  }
  return entries
}

function isTruthyStatus(value?: string | null) {
  const text = String(value || '').trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'single', '单场', '单关'].includes(text)
}

function isPassSaleStatus(value?: string | null) {
  const text = String(value || '').trim().toLowerCase()
  if (!text || ['0', 'false', 'closed', 'stop', 'stopped', '停售', '暂停销售'].includes(text)) return false
  return true
}

function OddsPlaySection({ active, snapshot }: { active: boolean; snapshot: WorldCupOddsSnapshot }) {
  const entries = getOrderedOddsEntries(snapshot)
  if (entries.length === 0) return null
  const title = snapshot.play_label || formatPlayType(snapshot.play_type)
  const hasGoalLine = snapshot.play_type === 'handicap_win_draw_win' && snapshot.goal_line
  const tileModifier = snapshot.play_type === 'correct_score'
    ? 'worldcup-odds-modal__tiles--score'
    : snapshot.play_type === 'total_goals'
      ? 'worldcup-odds-modal__tiles--goals'
      : 'worldcup-odds-modal__tiles--three'

  return (
    <section className={clsx('worldcup-odds-modal__section', `worldcup-odds-modal__section--${snapshot.play_type}`, active && 'is-priority')}>
      <div className="worldcup-odds-modal__section-header">
        <div className="worldcup-odds-modal__section-title">
          <span aria-hidden="true" />
          <h3>{title}</h3>
          <CircleHelp size={18} aria-hidden="true" />
        </div>
        <div className="worldcup-odds-modal__badges">
          {isTruthyStatus(snapshot.single_status) ? <span className="worldcup-odds-modal__badge worldcup-odds-modal__badge--single">单场</span> : null}
          {isPassSaleStatus(snapshot.sell_status) ? <span className="worldcup-odds-modal__badge">过关</span> : null}
        </div>
      </div>
      <div className={clsx('worldcup-odds-modal__section-body', hasGoalLine && 'has-goal-line')}>
        {hasGoalLine ? <span className="worldcup-odds-modal__goal-line">{formatGoalLine(snapshot.goal_line)}</span> : null}
        <div className={clsx('worldcup-odds-modal__tiles', tileModifier)}>
          {entries.map((entry) => (
            <div key={entry.label} className={clsx('worldcup-odds-modal__tile', entry.wide && 'is-wide')}>
              <span>{entry.displayLabel}</span>
              <strong>{entry.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function WorldCupOddsModal({ activePlayType, match, onClose }: {
  activePlayType: 'all' | WorldCupPlayType
  match: WorldCupMatch
  onClose: () => void
}) {
  const snapshots = sortOddsSnapshots(match.odds_snapshots || [], activePlayType).filter((snapshot) => getOddsEntries(snapshot).length > 0)
  if (snapshots.length === 0) return null

  return (
    <section className="worldcup-odds-modal" role="dialog" aria-modal="true" aria-label="世界杯赔率" onClick={onClose}>
      <div className="worldcup-odds-modal__panel" onClick={(event) => event.stopPropagation()}>
        <header className="worldcup-odds-modal__topline">{formatOddsModalTitle(match)}</header>
        <div className="worldcup-odds-modal__match-hero">
          <span>[主]</span>
          <strong>{match.home_team}</strong>
          <b>vs</b>
          <strong>{match.away_team}</strong>
          <ChevronDown size={18} aria-hidden="true" />
        </div>
        <div className="worldcup-odds-modal__body">
          {snapshots.map((snapshot) => (
            <OddsPlaySection
              key={snapshot.play_type}
              active={activePlayType !== 'all' && snapshot.play_type === activePlayType}
              snapshot={snapshot}
            />
          ))}
        </div>
        <footer className="worldcup-odds-modal__footer">
          <button type="button" onClick={onClose}>关闭</button>
        </footer>
      </div>
    </section>
  )
}

function RecommendationOddsSummary({ recommendation }: { recommendation: WorldCupRecommendation }) {
  const matchSnapshot = recommendation.match.odds_snapshots?.find((snapshot) => snapshot.play_type === recommendation.play_type)
  const snapshot: WorldCupOddsSnapshot = {
    play_type: recommendation.play_type,
    play_label: formatPlayType(recommendation.play_type),
    odds: recommendation.latest_odds || {},
    goal_line: matchSnapshot?.goal_line,
  }
  const entries = getOddsEntries(snapshot)
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="worldcup-card__odds-snapshot" aria-label={`${formatPlayType(recommendation.play_type)}赔率快照`}>
      <span>该玩法赔率快照</span>
      <div className="worldcup-odds-chip-list">
        {entries.slice(0, 5).map(([label, value]) => (
          <span key={label} className="worldcup-odds-chip">
            {label} {value}
          </span>
        ))}
      </div>
    </div>
  )
}

export function WorldCupPage() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [ageConfirmed, setAgeConfirmed] = useState(() => localStorage.getItem('worldcup-age-confirmed') === '1')
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'live' | 'finished'>('all')
  const [playTypeFilter, setPlayTypeFilter] = useState<'all' | WorldCupPlayType>('all')
  const [riskLevelFilter, setRiskLevelFilter] = useState<'all' | WorldCupRiskLevel>('all')
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [oddsModalMatchId, setOddsModalMatchId] = useState<string | null>(null)
  const [detailRecommendationId, setDetailRecommendationId] = useState<string | null>(null)
  const [copiedRecommendationId, setCopiedRecommendationId] = useState<string | null>(null)

  const matchesQuery = useQuery({
    queryKey: ['worldcup', 'matches', statusFilter],
    queryFn: () => apiClient.getWorldCupMatches({ status_filter: statusFilter }),
  })
  const matchRows = useMemo(() => matchesQuery.data?.matches || [], [matchesQuery.data?.matches])
  const selectedMatchIdForQuery = selectedMatchId && matchRows.some((item) => item.match_id === selectedMatchId)
    ? selectedMatchId
    : matchRows[0]?.match_id || null

  const recommendationsQuery = useQuery({
    queryKey: ['worldcup', 'recommendations', selectedMatchIdForQuery, playTypeFilter, riskLevelFilter],
    queryFn: () =>
      apiClient.getWorldCupRecommendations({
        match_id: selectedMatchIdForQuery || undefined,
        play_type_filter: playTypeFilter,
        risk_level_filter: riskLevelFilter,
      }),
    enabled: matchesQuery.isSuccess,
  })

  const detailQuery = useQuery({
    queryKey: ['worldcup', 'recommendation-detail', detailRecommendationId],
    queryFn: () => apiClient.getWorldCupRecommendationDetail(detailRecommendationId || ''),
    enabled: Boolean(detailRecommendationId),
  })

  const favoriteMutation = useMutation({
    mutationFn: async ({ recommendationId, favorite }: { recommendationId: string; favorite: boolean }) =>
      apiClient.favoriteWorldCupRecommendation(recommendationId, favorite),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['worldcup'] })
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : '操作失败', 'error')
    },
  })

  const simulationMutation = useMutation({
    mutationFn: async (recommendationId: string) => apiClient.createWorldCupSimulationFromRecommendation(recommendationId),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['worldcup', 'simulation'] })
      setCopiedRecommendationId(data.ticket.source_recommendation_id || null)
      showToast('已加入世界杯模拟试玩', 'success')
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : '生成失败', 'error')
    },
  })

  const selectedMatch = useMemo<WorldCupMatch | null>(
    () => matchRows.find((item) => item.match_id === selectedMatchIdForQuery) || null,
    [matchRows, selectedMatchIdForQuery],
  )
  const oddsModalMatch = useMemo<WorldCupMatch | null>(
    () => matchRows.find((item) => item.match_id === oddsModalMatchId) || null,
    [matchRows, oddsModalMatchId],
  )
  const recommendations = recommendationsQuery.data?.recommendations || []
  const detailRecommendation = detailQuery.data?.recommendation || null
  const latestBudgetMax = recommendations.reduce((max, item) => Math.max(max, item.budget_max || 0), 0)
  const overviewUpdatedAt = detailRecommendation?.updated_at || recommendations[0]?.updated_at || matchesQuery.data?.matches?.[0]?.odds_fetched_at || null

  const topMatches = useMemo(() => matchRows.slice(0, 5), [matchRows])

  const confirmAge = () => {
    localStorage.setItem('worldcup-age-confirmed', '1')
    setAgeConfirmed(true)
  }

  const openOddsModal = (match: WorldCupMatch) => {
    if (!hasAnyOdds(match)) return
    setSelectedMatchId(match.match_id)
    setOddsModalMatchId(match.match_id)
  }

  const copyChecklist = async (recommendation: WorldCupRecommendation) => {
    const text = [
      `${recommendation.match.home_team} vs ${recommendation.match.away_team}`,
      `玩法：${formatPlayType(recommendation.play_type)}`,
      `推荐：${recommendation.selection}`,
      recommendation.odds_value ? `中国竞彩网赔率：${recommendation.odds_value}` : '',
      `预算：${recommendation.budget_min}-${recommendation.budget_max} 元`,
      recommendation.compliance_notice,
      '请以线下实体店/官方公告为准。',
    ].filter(Boolean).join('\n')
    try {
      await navigator.clipboard?.writeText(text)
    } catch {
      // Clipboard access can be unavailable outside secure browser contexts.
    }
    setCopiedRecommendationId(recommendation.recommendation_id)
    showToast('已复制核对清单', 'success')
  }

  return (
    <div className="worldcup-page">
      <section className="worldcup-hero">
        <div className="worldcup-hero__copy">
          <p className="worldcup-hero__eyebrow">世界杯推荐</p>
          <h1 className="worldcup-hero__title">世界杯体彩预测参考</h1>
          <p className="worldcup-hero__description">展示赛程、推荐方向、预算控制与风险提示，只做研究参考和线下购彩辅助。</p>
        </div>
        <div className="worldcup-hero__stats" aria-label="推荐概览">
          <div><span>比赛</span><strong>{matchesQuery.data?.total_count ?? 0}</strong></div>
          <div><span>推荐</span><strong>{recommendationsQuery.data?.total_count ?? 0}</strong></div>
          <div><span>更新时间</span><strong>{overviewUpdatedAt ? formatDateTimeLocal(overviewUpdatedAt) : '-'}</strong></div>
          <div><span>预算上限</span><strong>{latestBudgetMax > 0 ? `${latestBudgetMax} 元` : '待生成'}</strong></div>
        </div>
      </section>

      <SiteDisclaimer />

      {!ageConfirmed ? (
        <section className="worldcup-gate" role="dialog" aria-modal="true" aria-label="年龄确认">
          <div className="worldcup-gate__card">
            <ShieldAlert size={28} aria-hidden="true" />
            <h2>请确认你已满 18 周岁</h2>
            <p>本板块仅供参考研究，不构成购彩建议。</p>
            <button className="primary-button" type="button" onClick={confirmAge}>
              我已确认
            </button>
          </div>
        </section>
      ) : null}

      <section className="worldcup-toolbar" aria-label="筛选条件">
        <div className="worldcup-toolbar__filters">
          {STATUS_OPTIONS.map((option) => (
            <button key={option.value} className={clsx('filter-chip', statusFilter === option.value && 'is-active')} type="button" onClick={() => setStatusFilter(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="worldcup-toolbar__filters">
          {PLAY_TYPE_OPTIONS.map((option) => (
            <button key={option.value} className={clsx('filter-chip', playTypeFilter === option.value && 'is-active')} type="button" onClick={() => setPlayTypeFilter(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="worldcup-toolbar__filters">
          {RISK_OPTIONS.map((option) => (
            <button key={option.value} className={clsx('filter-chip', riskLevelFilter === option.value && 'is-active')} type="button" onClick={() => setRiskLevelFilter(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="worldcup-grid">
        <div className="worldcup-column">
          <div className="worldcup-panel__header">
            <h2>近期比赛</h2>
          </div>
          <div className="worldcup-match-list">
            {topMatches.length === 0 ? (
              <div className="worldcup-empty">暂无真实赛程，请先在设置页维护列表抓取中国竞彩网世界杯赛程和赔率。</div>
            ) : topMatches.map((match) => (
              <article
                key={match.match_id}
                className={clsx('worldcup-match-card', selectedMatch?.match_id === match.match_id && 'is-active')}
              >
                <button className="worldcup-match-card__main" type="button" onClick={() => setSelectedMatchId(match.match_id)}>
                  <div>
                    <strong>{match.home_team} vs {match.away_team}</strong>
                    <p>{match.match_num_str ? `${match.match_num_str} · ` : ''}{match.stage} · {formatDateTimeLocal(match.kickoff_at)}</p>
                  </div>
                </button>
                {hasAnyOdds(match) ? (
                  <button className="worldcup-match-card__odds-action is-ready" type="button" onClick={() => openOddsModal(match)}>
                    赔率已同步
                  </button>
                ) : (
                  <div className="worldcup-match-card__odds-action">赔率待同步</div>
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="worldcup-column worldcup-column--wide">
          <div className="worldcup-panel__header">
            <h2>推荐方案</h2>
            <span>每场最多 3 条</span>
          </div>

          {recommendations.length === 0 ? (
            <div className="worldcup-empty">暂无真实 AI 推荐。请先抓取中国竞彩网赛程/赔率，再到设置页生成世界杯预测。</div>
          ) : (
            <div className="worldcup-card-list">
              {recommendations.map((recommendation) => (
                <article key={recommendation.recommendation_id} className="worldcup-card">
                  <div className="worldcup-card__header">
                    <div>
                      <p>{recommendation.match.home_team} vs {recommendation.match.away_team}</p>
                      <h3>{formatPlayType(recommendation.play_type)} · {recommendation.selection}</h3>
                    </div>
                    <button
                      className={clsx('worldcup-icon-btn', recommendation.is_favorite && 'is-active')}
                      type="button"
                      onClick={() => favoriteMutation.mutate({ recommendationId: recommendation.recommendation_id, favorite: !recommendation.is_favorite })}
                      aria-label="收藏推荐"
                    >
                      <Heart size={16} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="worldcup-card__meta">
                    <span>{confidenceLabel(recommendation.confidence_level)}</span>
                    <span>{riskLabel(recommendation.risk_level)}</span>
                    <span>{recommendation.budget_min}-{recommendation.budget_max} 元</span>
                    <span>{recommendation.odds_value ? `赔率 ${recommendation.odds_value}` : formatDateTimeLocal(recommendation.updated_at)}</span>
                  </div>

                  {recommendation.implied_probability ? (
                    <p className="worldcup-card__odds">中国竞彩网隐含概率约 {(recommendation.implied_probability * 100).toFixed(1)}%</p>
                  ) : null}

                  <RecommendationOddsSummary recommendation={recommendation} />

                  <p className="worldcup-card__reason">{recommendation.reason}</p>
                  <div className="worldcup-card__tags">
                    {recommendation.risk_tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <p className="worldcup-card__notice">{recommendation.compliance_notice}</p>

                  <div className="worldcup-card__actions">
                    <button className="ghost-button ghost-button--compact" type="button" onClick={() => setDetailRecommendationId(recommendation.recommendation_id)}>
                      查看详情
                    </button>
                    <button className="ghost-button ghost-button--compact" type="button" onClick={() => void copyChecklist(recommendation)}>
                      <Copy size={14} aria-hidden="true" /> 复制清单
                    </button>
                    <button className="ghost-button ghost-button--compact" type="button" onClick={() => simulationMutation.mutate(recommendation.recommendation_id)}>
                      <Shuffle size={14} aria-hidden="true" /> 加入模拟
                    </button>
                    {copiedRecommendationId === recommendation.recommendation_id ? <span className="worldcup-card__copy-state"><Check size={14} aria-hidden="true" /> 已复制</span> : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {detailRecommendation ? (
        <section className="worldcup-detail" role="dialog" aria-modal="true" aria-label="推荐详情" onClick={() => setDetailRecommendationId(null)}>
          <div className="worldcup-detail__card" onClick={(event) => event.stopPropagation()}>
            <div className="worldcup-panel__header">
              <h2>推荐详情</h2>
              <button className="worldcup-icon-btn" type="button" onClick={() => setDetailRecommendationId(null)}>×</button>
            </div>
            <p>{detailRecommendation.match.home_team} vs {detailRecommendation.match.away_team}</p>
            <p>{detailRecommendation.reason}</p>
            <p>模型来源：{detailRecommendation.model_sources.join(' / ')}</p>
            <p>{detailRecommendation.compliance_notice}</p>
          </div>
        </section>
      ) : null}
      {oddsModalMatch ? (
        <WorldCupOddsModal
          activePlayType={playTypeFilter}
          match={oddsModalMatch}
          onClose={() => setOddsModalMatchId(null)}
        />
      ) : null}
      <WorldCupTabStrip activeTab="overview" />
    </div>
  )
}
