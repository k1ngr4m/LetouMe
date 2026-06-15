import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { History, ShieldAlert } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'
import { formatDateTimeLocal } from '../../shared/lib/format'
import type { WorldCupPlayType } from '../../shared/types/api'
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

export function WorldCupHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'finished' | 'pending'>('all')
  const [playTypeFilter, setPlayTypeFilter] = useState<'all' | WorldCupPlayType>('all')
  const historyQuery = useQuery({
    queryKey: ['worldcup', 'history', statusFilter, playTypeFilter],
    queryFn: () => apiClient.getWorldCupHistory({ status_filter: statusFilter, play_type_filter: playTypeFilter }),
  })

  const records = historyQuery.data?.records || []
  const settledCount = records.reduce((sum, record) => sum + record.recommendations.filter((item) => item.result_status === 'settled').length, 0)
  const hitCount = records.reduce((sum, record) => sum + record.recommendations.filter((item) => item.hit === true).length, 0)

  return (
    <div className="worldcup-page">
      <section className="worldcup-hero worldcup-hero--compact">
        <div className="worldcup-hero__copy">
          <p className="worldcup-hero__eyebrow">开奖回溯</p>
          <h1 className="worldcup-hero__title">世界杯赛果复盘</h1>
          <p className="worldcup-hero__description">按已同步赛果回看 AI 推荐表现；比分或字段缺失时保持待判定。</p>
        </div>
        <div className="worldcup-hero__stats" aria-label="回溯概览">
          <div><span>比赛</span><strong>{records.length}</strong></div>
          <div><span>已判定</span><strong>{settledCount}</strong></div>
          <div><span>命中</span><strong>{hitCount}</strong></div>
        </div>
      </section>

      <SiteDisclaimer />

      <section className="worldcup-toolbar" aria-label="回溯筛选">
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

      {historyQuery.isLoading ? (
        <div className="worldcup-empty">正在加载回溯记录...</div>
      ) : records.length === 0 ? (
        <div className="worldcup-empty">暂无回溯记录，等待赛程、推荐或赛果同步。</div>
      ) : (
        <section className="worldcup-history-list">
          {records.map((record) => (
            <article key={record.match.match_id} className="worldcup-history-card">
              <div className="worldcup-card__header">
                <div>
                  <p>{formatDateTimeLocal(record.match.kickoff_at)} · {record.match.stage}</p>
                  <h2>{record.match.home_team} vs {record.match.away_team}</h2>
                </div>
                <span className="worldcup-score">{record.match.score || '待开奖'}</span>
              </div>
              <div className="worldcup-history-card__rows">
                {record.recommendations.map((item) => (
                  <div key={item.recommendation.recommendation_id} className="worldcup-history-row">
                    <div>
                      <strong>{formatPlayType(item.recommendation.play_type as WorldCupPlayType)} · {item.recommendation.selection}</strong>
                      <p>{item.actual_result || item.settlement_note}</p>
                    </div>
                    <span className={clsx('worldcup-result-pill', item.hit === true && 'is-hit', item.hit === false && 'is-miss')}>
                      {resultLabel(item.hit)}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          ))}
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
