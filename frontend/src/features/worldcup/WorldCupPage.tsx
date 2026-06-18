import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Check, ChevronDown, CircleHelp, Copy, Heart, ShieldAlert, Shuffle, Sparkles } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'
import { formatDateTimeLocal } from '../../shared/lib/format'
import { useToast } from '../../shared/feedback/ToastProvider'
import type {
  WorldCupBaiduAnalysis,
  WorldCupBaiduIntelligence,
  WorldCupBaiduRecentRecord,
  WorldCupConfidenceLevel,
  WorldCupMatch,
  WorldCupOddsSnapshot,
  WorldCupPlayType,
  WorldCupRecommendation,
  WorldCupRiskLevel,
} from '../../shared/types/api'
import { WorldCupTabStrip } from './WorldCupTabStrip'

const PLAY_TYPE_OPTIONS: Array<{ value: 'all' | WorldCupPlayType; label: string }> = [
  { value: 'all', label: '全部玩法' },
  { value: 'win_draw_win', label: '胜平负' },
  { value: 'handicap_win_draw_win', label: '让球胜平负' },
  { value: 'total_goals', label: '总进球数' },
  { value: 'correct_score', label: '比分' },
  { value: 'half_full_time', label: '半全场' },
]

const STATUS_OPTIONS: Array<{ value: 'all' | 'scheduled' | 'live' | 'finished'; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'scheduled', label: '未开赛' },
  { value: 'live', label: '进行中' },
  { value: 'finished', label: '已结束' },
]

const HIDDEN_RECOMMENDATION_RISK_TAGS = new Set(['资讯不足', '阵容待确认'])

const PLAY_TYPE_ORDER = PLAY_TYPE_OPTIONS.filter((option): option is { value: WorldCupPlayType; label: string } => option.value !== 'all')
const WIN_DRAW_WIN_ORDER = ['胜', '平', '负']
const TOTAL_GOALS_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+']
const HALF_FULL_TIME_ORDER = ['胜胜', '胜平', '胜负', '平胜', '平平', '平负', '负胜', '负平', '负负']
const CORRECT_SCORE_OTHER_ORDER: Record<string, number> = {
  胜其它: 0,
  平其它: 1,
  负其它: 2,
}
const BEIJING_TIME_ZONE = 'Asia/Shanghai'

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

function confidenceScoreLabel(recommendation: WorldCupRecommendation) {
  if (typeof recommendation.confidence_score === 'number') {
    return `${Math.round(recommendation.confidence_score)}%`
  }
  return confidenceLabel(recommendation.confidence_level)
}

function riskLabel(level: WorldCupRiskLevel) {
  if (level === 'low') return '低风险'
  if (level === 'high') return '高风险'
  return '中风险'
}

function getVisibleRecommendationRiskTags(tags: string[]) {
  return tags.filter((tag) => !HIDDEN_RECOMMENDATION_RISK_TAGS.has(tag))
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

function formatBeijingDateKey(value: string | number | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(typeof value === 'number' ? value * 1000 : value)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return `${pick('year')}-${pick('month')}-${pick('day')}`
}

function addDateKeyDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function getMatchDateKey(match: WorldCupMatch) {
  return formatDateTimeLocal(match.kickoff_at).slice(0, 10)
}

function buildDateRangePayload(dateKey: string) {
  return {
    date_start: `${dateKey} 00:00:00`,
    date_end: `${dateKey} 23:59:59`,
  }
}

function formatScheduleDateLabel(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) return '今天'
  const [year, month, day] = dateKey.split('-').map(Number)
  const [todayYear, todayMonth, todayDay] = todayKey.split('-').map(Number)
  const dayValue = Date.UTC(year, month - 1, day)
  const todayValue = Date.UTC(todayYear, todayMonth - 1, todayDay)
  const diffDays = Math.round((dayValue - todayValue) / 86_400_000)
  if (diffDays === 1) return '明天'
  if (diffDays === -1) return '昨天'
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
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

type MatchCardOddsRow = {
  entries: ReturnType<typeof getOrderedOddsEntries>
  snapshot: WorldCupOddsSnapshot
  unavailableLabel?: string
}

function getMatchCardOddsRows(match: WorldCupMatch, activePlayType: 'all' | WorldCupPlayType): MatchCardOddsRow[] {
  const snapshots = sortOddsSnapshots(match.odds_snapshots || [], activePlayType)
  const snapshotsWithOdds = snapshots.filter((snapshot) => getOddsEntries(snapshot).length > 0)
  if (snapshotsWithOdds.length === 0) {
    return []
  }

  const snapshotByType = new Map(snapshots.map((snapshot) => [snapshot.play_type, snapshot]))
  const winDrawWinSnapshot: WorldCupOddsSnapshot = snapshotByType.get('win_draw_win') || {
    play_type: 'win_draw_win',
    play_label: '胜平负',
    odds: {},
  }
  const rows: MatchCardOddsRow[] = []
  const winDrawWinEntries = getOrderedOddsEntries(winDrawWinSnapshot).slice(0, 3)
  rows.push({
    entries: winDrawWinEntries,
    snapshot: winDrawWinSnapshot,
    unavailableLabel: winDrawWinEntries.length === 0 ? '胜平负游戏未开售' : undefined,
  })

  const handicapSnapshot = snapshotByType.get('handicap_win_draw_win')
  const handicapEntries = handicapSnapshot ? getOrderedOddsEntries(handicapSnapshot).slice(0, 3) : []
  if (handicapSnapshot && handicapEntries.length > 0) {
    rows.push({
      entries: handicapEntries,
      snapshot: handicapSnapshot,
    })
  }

  const usedPlayTypes = new Set(rows.map((row) => row.snapshot.play_type))
  for (const snapshot of snapshotsWithOdds) {
    if (rows.length >= 2) break
    if (usedPlayTypes.has(snapshot.play_type)) continue
    rows.push({
      entries: getOrderedOddsEntries(snapshot).slice(0, 3),
      snapshot,
    })
    usedPlayTypes.add(snapshot.play_type)
  }
  return rows.slice(0, 2)
}

function getMatchCardGoalLine(snapshot: WorldCupOddsSnapshot) {
  if (snapshot.play_type === 'handicap_win_draw_win' && snapshot.goal_line) {
    return formatGoalLine(snapshot.goal_line)
  }
  if (snapshot.play_type === 'win_draw_win') {
    return '-'
  }
  return snapshot.play_label || formatPlayType(snapshot.play_type)
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

function getLatestWorldCupDataTime(matches: WorldCupMatch[], recommendations: WorldCupRecommendation[], detailRecommendation: WorldCupRecommendation | null) {
  const timestamps = [
    detailRecommendation?.updated_at,
    detailRecommendation?.odds_fetched_at,
    ...recommendations.flatMap((recommendation) => [
      recommendation.updated_at,
      recommendation.odds_fetched_at,
      recommendation.match.odds_fetched_at,
      ...(recommendation.match.odds_snapshots || []).flatMap((snapshot) => [snapshot.fetched_at, snapshot.source_updated_at]),
    ]),
    ...matches.flatMap((match) => [
      match.odds_fetched_at,
      ...(match.odds_snapshots || []).flatMap((snapshot) => [snapshot.fetched_at, snapshot.source_updated_at]),
    ]),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)

  return timestamps.length ? Math.max(...timestamps) : null
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

function MatchCardOddsPreview({ activePlayType, match, onOpen }: {
  activePlayType: 'all' | WorldCupPlayType
  match: WorldCupMatch
  onOpen: (match: WorldCupMatch) => void
}) {
  const rows = getMatchCardOddsRows(match, activePlayType)
  if (rows.length === 0) {
    return <div className="worldcup-match-card__odds-action">赔率待同步</div>
  }
  return (
    <button
      className="worldcup-match-card__odds-preview"
      type="button"
      onClick={() => onOpen(match)}
      aria-label={`${match.home_team} vs ${match.away_team} 查看全部赔率`}
    >
      <div className="worldcup-match-card__odds-rows">
        {rows.map(({ entries, snapshot, unavailableLabel }) => {
          return (
            <div
              key={snapshot.play_type}
              className={clsx('worldcup-match-card__odds-row', activePlayType !== 'all' && activePlayType === snapshot.play_type && 'is-priority')}
            >
              <span className={clsx('worldcup-match-card__goal-line', snapshot.play_type === 'win_draw_win' && 'is-neutral')}>
                {getMatchCardGoalLine(snapshot)}
              </span>
              <div className="worldcup-match-card__odds-grid">
                {unavailableLabel ? (
                  <span className="worldcup-match-card__odds-unavailable">{unavailableLabel}</span>
                ) : (
                  entries.map((entry) => (
                    <span key={entry.label} className="worldcup-match-card__odds-tile">
                      <b>{entry.displayLabel}</b>
                      <strong>{entry.value}</strong>
                    </span>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
      <span className="worldcup-match-card__all-odds">全部玩法</span>
    </button>
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

function getPredictionValue(analysis: WorldCupBaiduAnalysis | undefined, key: 'victory' | 'draw' | 'lost') {
  const value = analysis?.pre_match_prediction?.percentage?.[key]
  return typeof value === 'string' && value ? value : '-'
}

function getRecordTitle(record: WorldCupBaiduRecentRecord) {
  if (record.scope === 'same_home_away') return `${record.team_name || '球队'} 同主客`
  return record.title || `${record.team_name || '球队'} 近期战绩`
}

function BaiduRecordBlock({ record }: { record: WorldCupBaiduRecentRecord }) {
  const matches = record.matches || []
  return (
    <section className="worldcup-baidu-record">
      <div className="worldcup-baidu-record__top">
        <div>
          <h4>{getRecordTitle(record)}</h4>
          <span>{record.result || '暂无战绩结论'}</span>
        </div>
        <div className="worldcup-baidu-record__metrics">
          {(record.probability || []).slice(0, 3).map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
      {matches.length ? (
        <div className="worldcup-baidu-record__table">
          {matches.slice(0, 4).map((item, index) => (
            <div key={`${item.date}-${item.score}-${index}`} className="worldcup-baidu-record__row">
              <span>{item.date || '-'}</span>
              <strong>{item.score || item.match || '-'}</strong>
              <em>{[item.handicap?.desc, item.total_goals?.desc].filter(Boolean).join(' / ') || '-'}</em>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function BaiduIntelligenceColumn({ items, title }: { items?: WorldCupBaiduIntelligence[]; title: string }) {
  const rows = (items || []).filter((item) => (item.items || []).length > 0)
  if (!rows.length) return null
  return (
    <section className="worldcup-baidu-intel">
      <h4>{title}</h4>
      <div className="worldcup-baidu-intel__grid">
        {rows.map((row) => (
          <div key={`${title}-${row.team_name}`} className="worldcup-baidu-intel__team">
            <strong>{row.team_name || '球队'}</strong>
            <ul>
              {(row.items || []).slice(0, 3).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function BaiduAnalysisPanel({
  analysis,
  error,
  isLoading,
  match,
}: {
  analysis?: WorldCupBaiduAnalysis
  error?: string
  isLoading: boolean
  match: WorldCupMatch | null
}) {
  const available = analysis?.status === 'available'
  const records = (analysis?.recent_records || []).slice(0, 4)
  return (
    <section className="worldcup-baidu-panel">
      <div className="worldcup-panel__header">
        <div>
          <h2>赛前分析</h2>
          <span>{match ? `${match.home_team} vs ${match.away_team}` : '请选择比赛'}</span>
        </div>
        <span className="worldcup-baidu-panel__source">Baidu 体育</span>
      </div>
      {isLoading ? (
        <div className="worldcup-baidu-panel__empty">正在同步赛前分析...</div>
      ) : !available ? (
        <div className="worldcup-baidu-panel__empty">{error || analysis?.error || '暂无 Baidu 赛前分析'}</div>
      ) : (
        <>
          <div className="worldcup-baidu-prediction">
            <div>
              <span>主胜</span>
              <strong>{getPredictionValue(analysis, 'victory')}</strong>
              <em>{match?.home_team || '主队'}</em>
            </div>
            <div>
              <span>平局</span>
              <strong>{getPredictionValue(analysis, 'draw')}</strong>
              <em>{analysis?.pre_match_prediction?.sample_count ? `${analysis.pre_match_prediction.sample_count} 样本` : '样本待同步'}</em>
            </div>
            <div>
              <span>客胜</span>
              <strong>{getPredictionValue(analysis, 'lost')}</strong>
              <em>{match?.away_team || '客队'}</em>
            </div>
          </div>
          {analysis?.squad_status?.status ? (
            <div className="worldcup-baidu-squad">
              <span>{analysis.squad_status.status}</span>
              {[analysis.squad_status.court, analysis.squad_status.referee]
                .filter((item): item is string => Boolean(item))
                .map((item) => <b key={item}>{item}</b>)}
            </div>
          ) : null}
          {records.length ? (
            <div className="worldcup-baidu-records">
              {records.map((record, index) => <BaiduRecordBlock key={`${record.team_name}-${record.scope}-${index}`} record={record} />)}
            </div>
          ) : null}
          <BaiduIntelligenceColumn title="有利情报" items={analysis?.positive_intelligence} />
          <BaiduIntelligenceColumn title="不利情报" items={analysis?.negative_intelligence} />
        </>
      )}
    </section>
  )
}

export function WorldCupPage() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const todayDateKey = useMemo(() => formatBeijingDateKey(), [])
  const defaultScheduleDateKey = useMemo(() => addDateKeyDays(todayDateKey, 1), [todayDateKey])
  const [ageConfirmed, setAgeConfirmed] = useState(() => localStorage.getItem('worldcup-age-confirmed') === '1')
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(defaultScheduleDateKey)
  const [statusFilter, setStatusFilter] = useState<'all' | 'scheduled' | 'live' | 'finished'>('all')
  const [playTypeFilter, setPlayTypeFilter] = useState<'all' | WorldCupPlayType>('all')
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [oddsModalMatchId, setOddsModalMatchId] = useState<string | null>(null)
  const [detailRecommendationId, setDetailRecommendationId] = useState<string | null>(null)
  const [copiedRecommendationId, setCopiedRecommendationId] = useState<string | null>(null)

  const scheduleCatalogQuery = useQuery({
    queryKey: ['worldcup', 'matches', 'date-catalog'],
    queryFn: () => apiClient.getWorldCupMatches({ status_filter: 'all' }),
  })
  const scheduleDateOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const match of scheduleCatalogQuery.data?.matches || []) {
      const dateKey = getMatchDateKey(match)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue
      counts.set(dateKey, (counts.get(dateKey) || 0) + 1)
    }
    return Array.from(counts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([value, count]) => ({
        value,
        count,
        label: formatScheduleDateLabel(value, todayDateKey),
      }))
  }, [scheduleCatalogQuery.data?.matches, todayDateKey])
  const visibleScheduleDateOptions = useMemo(() => {
    const upcoming = scheduleDateOptions.filter((option) => option.value >= todayDateKey)
    return upcoming.length ? upcoming : scheduleDateOptions
  }, [scheduleDateOptions, todayDateKey])
  const selectedDateRange = useMemo(() => buildDateRangePayload(selectedScheduleDate), [selectedScheduleDate])
  const matchesQuery = useQuery({
    queryKey: ['worldcup', 'matches', statusFilter, selectedScheduleDate],
    queryFn: () => apiClient.getWorldCupMatches({ status_filter: statusFilter, ...selectedDateRange }),
  })
  const matchRows = useMemo(() => matchesQuery.data?.matches || [], [matchesQuery.data?.matches])
  const selectedMatchIdForQuery = selectedMatchId && matchRows.some((item) => item.match_id === selectedMatchId)
    ? selectedMatchId
    : matchRows[0]?.match_id || null

  const recommendationsQuery = useQuery({
    queryKey: ['worldcup', 'recommendations', selectedMatchIdForQuery, playTypeFilter],
    queryFn: () =>
      apiClient.getWorldCupRecommendations({
        match_id: selectedMatchIdForQuery || undefined,
        play_type_filter: playTypeFilter,
      }),
    enabled: matchesQuery.isSuccess,
  })

  const detailQuery = useQuery({
    queryKey: ['worldcup', 'recommendation-detail', detailRecommendationId],
    queryFn: () => apiClient.getWorldCupRecommendationDetail(detailRecommendationId || ''),
    enabled: Boolean(detailRecommendationId),
  })
  const baiduAnalysisQuery = useQuery({
    queryKey: ['worldcup', 'baidu-analysis', selectedMatchIdForQuery],
    queryFn: () => apiClient.getWorldCupBaiduAnalysis(selectedMatchIdForQuery || ''),
    enabled: Boolean(selectedMatchIdForQuery) && matchesQuery.isSuccess,
    retry: false,
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
  const overviewUpdatedAt = getLatestWorldCupDataTime(matchRows, recommendations, detailRecommendation)

  const scheduleMatches = useMemo(() => matchRows, [matchRows])

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
      </section>

      <section className="worldcup-grid">
        <div className="worldcup-column">
          <div className="worldcup-panel__header worldcup-schedule-header">
            <div>
              <h2>赛程赔率</h2>
              <span>{selectedScheduleDate} · {matchesQuery.data?.total_count ?? 0} 场</span>
            </div>
            <label className="worldcup-date-input">
              <span>比赛日期</span>
              <input
                type="date"
                value={selectedScheduleDate}
                onChange={(event) => setSelectedScheduleDate(event.target.value || defaultScheduleDateKey)}
              />
            </label>
          </div>
          <div className="worldcup-date-strip" aria-label="比赛日期">
            {visibleScheduleDateOptions.length === 0 ? (
              <span className="worldcup-date-strip__empty">暂无可选赛程日期</span>
            ) : visibleScheduleDateOptions.map((option) => (
              <button
                key={option.value}
                className={clsx('worldcup-date-chip', selectedScheduleDate === option.value && 'is-active')}
                type="button"
                onClick={() => setSelectedScheduleDate(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{option.value}</span>
                <em>{option.count} 场</em>
              </button>
            ))}
          </div>
          <div className="worldcup-match-list">
            {scheduleMatches.length === 0 ? (
              <div className="worldcup-empty">当天暂无赛程或赔率，请切换日期查看，或先在设置页维护列表抓取中国竞彩网世界杯赛程和赔率。</div>
            ) : scheduleMatches.map((match) => (
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
                <MatchCardOddsPreview activePlayType={playTypeFilter} match={match} onOpen={openOddsModal} />
              </article>
            ))}
          </div>
        </div>

        <div className="worldcup-column worldcup-column--wide">
          <div className="worldcup-panel__header">
            <h2>推荐方案</h2>
            <span>每种玩法均展示</span>
          </div>

          {recommendations.length === 0 ? (
            <div className="worldcup-empty">暂无真实 AI 推荐。请先抓取中国竞彩网赛程/赔率，再到设置页生成世界杯预测。</div>
          ) : (
            <div className="worldcup-card-list">
              {recommendations.map((recommendation) => (
                <article key={recommendation.recommendation_id} className="worldcup-card">
                  <div className="worldcup-card__header">
                    <div className="worldcup-card__title-block">
                      <span className="worldcup-card__eyebrow"><Sparkles size={13} aria-hidden="true" /> AI 推荐</span>
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

                  <div className="worldcup-card__signal">
                    <div className="worldcup-card__pick">
                      <span>推荐选择</span>
                      <strong>{recommendation.selection}</strong>
                      <em>{formatPlayType(recommendation.play_type)}</em>
                    </div>
                    <div className="worldcup-card__edge">
                      <span>参考概率</span>
                      <strong>{recommendation.implied_probability ? `${(recommendation.implied_probability * 100).toFixed(1)}%` : '待确认'}</strong>
                      <em>{recommendation.odds_value ? `赔率 ${recommendation.odds_value}` : formatDateTimeLocal(recommendation.updated_at)}</em>
                    </div>
                  </div>

                  <div className="worldcup-card__meta">
                    <span className="worldcup-card__metric worldcup-card__metric--confidence"><small>置信值</small><strong>{confidenceScoreLabel(recommendation)}</strong></span>
                    <span className="worldcup-card__metric worldcup-card__metric--risk"><small>风险</small><strong>{riskLabel(recommendation.risk_level)}</strong></span>
                    <span className="worldcup-card__metric"><small>预算</small><strong>{recommendation.budget_min}-{recommendation.budget_max} 元</strong></span>
                    <span className="worldcup-card__metric"><small>盘口</small><strong>{recommendation.odds_value ? `赔率 ${recommendation.odds_value}` : formatDateTimeLocal(recommendation.updated_at)}</strong></span>
                  </div>

                  {recommendation.implied_probability ? (
                    <p className="worldcup-card__odds">中国竞彩网隐含概率约 {(recommendation.implied_probability * 100).toFixed(1)}%</p>
                  ) : null}

                  <RecommendationOddsSummary recommendation={recommendation} />

                  <p className="worldcup-card__reason">{recommendation.reason}</p>
                  {getVisibleRecommendationRiskTags(recommendation.risk_tags).length > 0 ? (
                    <div className="worldcup-card__tags">
                      {getVisibleRecommendationRiskTags(recommendation.risk_tags).map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                  ) : null}
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

          <BaiduAnalysisPanel
            analysis={baiduAnalysisQuery.data?.analysis}
            error={baiduAnalysisQuery.error instanceof Error ? baiduAnalysisQuery.error.message : undefined}
            isLoading={baiduAnalysisQuery.isLoading}
            match={selectedMatch}
          />
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
