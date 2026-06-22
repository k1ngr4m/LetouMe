import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarDays, History, ShieldAlert } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'
import { formatDateTimeLocal } from '../../shared/lib/format'
import type { WorldCupHistoryPlayTypeGroup, WorldCupHistoryRecord, WorldCupPlayType } from '../../shared/types/api'
import { WorldCupTabStrip } from './WorldCupTabStrip'

const PLAY_TYPE_OPTIONS: Array<{ value: 'all' | WorldCupPlayType; label: string }> = [
  { value: 'all', label: '全部玩法' },
  { value: 'win_draw_win', label: '胜平负' },
  { value: 'handicap_win_draw_win', label: '让球胜平负' },
  { value: 'total_goals', label: '总进球数' },
  { value: 'correct_score', label: '比分' },
  { value: 'half_full_time', label: '半全场' },
]

function formatPlayType(playType: WorldCupPlayType) {
  return PLAY_TYPE_OPTIONS.find((item) => item.value === playType)?.label || playType
}

function resultLabel(hit?: boolean | null) {
  if (hit === true) return '命中'
  if (hit === false) return '未中'
  return '待判定'
}

function formatAccuracy(value?: number | null) {
  if (value == null) return '暂无已判定'
  return `${(Number(value) * 100).toFixed(1)}%`
}

function getAccuracyWidth(value?: number | null) {
  if (value == null) return '0%'
  return `${Math.max(0, Math.min(100, Number(value) * 100))}%`
}

function getHistoryRecordStats(record: WorldCupHistoryRecord) {
  const total = record.recommendations.length
  const settled = record.recommendations.filter((item) => item.result_status === 'settled').length
  const hit = record.recommendations.filter((item) => item.hit === true).length
  const miss = record.recommendations.filter((item) => item.hit === false).length
  const pending = Math.max(total - settled, 0)

  return { total, settled, hit, miss, pending }
}

function formatMatchScore(score?: string | null, status?: string) {
  if (score) return score
  if (status === 'finished') return '待同步'
  return '待开奖'
}

function formatScoreLabel(score?: string | null, status?: string) {
  if (score) return '完场比分'
  if (status === 'finished') return '赛果'
  return '状态'
}

export function WorldCupHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'finished' | 'pending'>('all')
  const [playTypeFilter, setPlayTypeFilter] = useState<'all' | WorldCupPlayType>('all')
  const [selectedHistoryDate, setSelectedHistoryDate] = useState('')
  const historyDateRange = selectedHistoryDate
    ? {
        date_start: `${selectedHistoryDate} 00:00:00`,
        date_end: `${selectedHistoryDate} 23:59:59`,
      }
    : {}
  const historyQuery = useQuery({
    queryKey: ['worldcup', 'history', statusFilter, playTypeFilter, selectedHistoryDate],
    queryFn: () => apiClient.getWorldCupHistory({ status_filter: statusFilter, play_type_filter: playTypeFilter, ...historyDateRange }),
  })

  const records = historyQuery.data?.records || []
  const summary = historyQuery.data?.summary
  const playTypeGroups = historyQuery.data?.play_type_groups || []

  return (
    <div className="worldcup-page worldcup-page--history">
      <SiteDisclaimer />

      <section className="worldcup-toolbar" aria-label="回溯筛选">
        <div className="worldcup-toolbar__filters worldcup-toolbar__filters--date">
          <label className="worldcup-date-input">
            <span>比赛日期</span>
            <input
              aria-label="比赛日期"
              type="date"
              value={selectedHistoryDate}
              onChange={(event) => setSelectedHistoryDate(event.target.value)}
            />
          </label>
          <button
            className={clsx('filter-chip', !selectedHistoryDate && 'is-active')}
            type="button"
            onClick={() => setSelectedHistoryDate('')}
          >
            全部日期
          </button>
        </div>
        <div className="worldcup-toolbar__filters">
          {[
            { value: 'all', label: '全部' },
            { value: 'finished', label: '已完赛' },
            { value: 'pending', label: '待开奖' },
          ].map((option) => (
            <button key={option.value} className={clsx('filter-chip', statusFilter === option.value && 'is-active')} type="button" onClick={() => setStatusFilter(option.value as typeof statusFilter)}>
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

      {historyQuery.data && playTypeGroups.length ? (
        <section className="worldcup-history-performance" aria-label="玩法表现">
          <div className="worldcup-history-performance__header">
            <div>
              <p>玩法表现</p>
              <h2>按玩法统计模型正确率</h2>
            </div>
            {summary ? (
              <div className="worldcup-history-performance__score">
                <span>整体正确率</span>
                <strong>{formatAccuracy(summary.accuracy)}</strong>
                <small>{summary.hit_count}/{summary.settled_count} 已判定命中</small>
              </div>
            ) : null}
          </div>

          <div className="worldcup-history-performance__overview" aria-label="回溯统计总览">
            <span><b>{summary?.total_count || 0}</b> 推荐</span>
            <span><b>{summary?.settled_count || 0}</b> 已判定</span>
            <span className="is-hit"><b>{summary?.hit_count || 0}</b> 命中</span>
            <span className="is-miss"><b>{summary?.miss_count || 0}</b> 未中</span>
            <span><b>{summary?.pending_count || 0}</b> 待开奖</span>
            <span><b>{summary?.unknown_count || 0}</b> 无法判定</span>
          </div>

          <div className="worldcup-history-play-grid">
            {playTypeGroups.map((group) => (
              <PlayTypePerformanceCard key={group.play_type} group={group} />
            ))}
          </div>
        </section>
      ) : null}

      {historyQuery.isLoading ? (
        <div className="worldcup-empty">正在加载回溯记录...</div>
      ) : records.length === 0 ? (
        <div className="worldcup-empty">暂无回溯记录，等待赛程、推荐或赛果同步。</div>
      ) : (
        <section className="worldcup-history-list">
          {records.map((record) => {
            const stats = getHistoryRecordStats(record)
            const scoreText = formatMatchScore(record.match.score, record.match.status)

            return (
              <article key={record.match.match_id} className="worldcup-history-card">
                <div className="worldcup-history-card__top">
                  <div className="worldcup-history-match">
                    <div className="worldcup-history-match__meta">
                      <span>{record.match.match_num_str || '世界杯'}</span>
                      <span><CalendarDays size={14} aria-hidden="true" /> {formatDateTimeLocal(record.match.kickoff_at)}</span>
                      <span>{record.match.stage}</span>
                    </div>
                    <h2>{record.match.home_team} vs {record.match.away_team}</h2>
                  </div>
                  <div className={clsx('worldcup-history-score', record.match.score && 'has-score')}>
                    <span>{formatScoreLabel(record.match.score, record.match.status)}</span>
                    <strong>{scoreText}</strong>
                  </div>
                </div>

                <div className="worldcup-history-summary" aria-label={`${record.match.home_team} vs ${record.match.away_team} 推荐概览`}>
                  <span><b>{stats.total}</b> 推荐</span>
                  <span><b>{stats.settled}</b> 已判定</span>
                  <span className="is-hit"><b>{stats.hit}</b> 命中</span>
                  <span className="is-miss"><b>{stats.miss}</b> 未中</span>
                  <span><b>{stats.pending}</b> 待判定</span>
                </div>

                <div className="worldcup-history-card__rows">
                  {record.recommendations.map((item) => (
                    <div key={item.recommendation.recommendation_id} className="worldcup-history-row">
                      <div className="worldcup-history-row__pick">
                        <span>{formatPlayType(item.recommendation.play_type as WorldCupPlayType)}</span>
                        <strong>{item.recommendation.selection}</strong>
                      </div>
                      <div className="worldcup-history-row__result">
                        <span>实际结果</span>
                        <p>{item.actual_result || item.settlement_note}</p>
                      </div>
                      <span className={clsx('worldcup-result-pill', item.hit === true && 'is-hit', item.hit === false && 'is-miss')}>
                        {resultLabel(item.hit)}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
        </section>
      )}

      <section className="worldcup-card worldcup-card--flat">
        <div className="worldcup-card__header">
          <div>
            <p>判定说明</p>
            <h2>回溯只按已同步数据计算</h2>
          </div>
          <History size={20} aria-hidden="true" />
        </div>
        <p className="worldcup-card__reason">
          <ShieldAlert size={14} aria-hidden="true" /> {historyQuery.data?.compliance_notice || '预测仅供参考研究，不保证命中；请以官方公告为准。'}
        </p>
      </section>
      <WorldCupTabStrip activeTab="history" />
    </div>
  )
}

function PlayTypePerformanceCard({ group }: { group: WorldCupHistoryPlayTypeGroup }) {
  return (
    <article className="worldcup-history-play-card">
      <div className="worldcup-history-play-card__top">
        <div>
          <span>{formatPlayType(group.play_type)}</span>
          <strong>{formatAccuracy(group.accuracy)}</strong>
        </div>
        <small>{group.hit_count}/{group.settled_count} 已判定命中</small>
      </div>

      <div className="worldcup-history-play-card__stats">
        <span>{group.total_count} 推荐</span>
        <span>{group.pending_count} 待开奖</span>
        <span>{group.unknown_count} 无法判定</span>
      </div>

      <div className="worldcup-history-model-rank">
        {group.models.map((model) => (
          <div key={`${model.play_type}-${model.model_code}`} className="worldcup-history-model-rank__row">
            <div className="worldcup-history-model-rank__main">
              <strong>{model.model_name}</strong>
              <span>{model.model_code}</span>
            </div>
            <div className="worldcup-history-model-rank__meter" aria-label={`${model.model_name} ${formatPlayType(model.play_type)} 正确率 ${formatAccuracy(model.accuracy)}`}>
              <div className="worldcup-history-model-rank__track">
                <div className="worldcup-history-model-rank__bar" style={{ width: getAccuracyWidth(model.accuracy) }} />
              </div>
              <span>{formatAccuracy(model.accuracy)}</span>
            </div>
            <small>{model.hit_count}/{model.settled_count} 命中</small>
          </div>
        ))}
      </div>
    </article>
  )
}
