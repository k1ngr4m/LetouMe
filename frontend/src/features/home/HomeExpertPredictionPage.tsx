import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { useLotterySelection } from '../../shared/lottery/LotterySelectionProvider'
import type {
  ExpertHistoryDetail,
  ExpertHistoryRecord,
  ExpertHistorySummary,
  ExpertTierHit,
  ExpertTierKey,
} from '../../shared/types/api'
import { HomeDashboardTabStrip } from './HomeDashboardTabStrip'

const TIER_OPTIONS: Array<{ key: ExpertTierKey; label: string }> = [
  { key: 'tier1', label: '第一档' },
  { key: 'tier2', label: '第二档' },
  { key: 'tier3', label: '第三档' },
  { key: 'tier4', label: '第四档' },
  { key: 'tier5', label: '第五档' },
]

type ExpertPageTab = 'overview' | 'history'

const EXPERT_PAGE_TABS: Array<{ key: ExpertPageTab; label: string }> = [
  { key: 'overview', label: '预测总览' },
  { key: 'history', label: '预测回溯' },
]

const HISTORY_PAGE_SIZE = 10

export function HomeExpertPredictionPage() {
  const { selectedLottery, setSelectedLottery } = useLotterySelection()
  const isDlt = selectedLottery === 'dlt'
  const [activeExpertTab, setActiveExpertTab] = useState<ExpertPageTab>('overview')
  const [selectedExpertCode, setSelectedExpertCode] = useState('')
  const [selectedTier, setSelectedTier] = useState<ExpertTierKey>('tier1')
  const [historyExpertCode, setHistoryExpertCode] = useState('')
  const [historyPeriodQuery, setHistoryPeriodQuery] = useState('')
  const [historyPage, setHistoryPage] = useState(1)
  const [selectedHistoryDetail, setSelectedHistoryDetail] = useState<{ targetPeriod: string; expertCode: string } | null>(null)

  const listQuery = useQuery({
    queryKey: ['experts-list', 'dlt'],
    queryFn: async () => apiClient.getExpertsList('dlt'),
    enabled: isDlt,
  })

  const experts = useMemo(() => listQuery.data?.experts || [], [listQuery.data?.experts])
  const effectiveSelectedExpertCode =
    selectedExpertCode && experts.some((item) => item.expert_code === selectedExpertCode)
      ? selectedExpertCode
      : experts[0]?.expert_code || ''

  const detailQuery = useQuery({
    queryKey: ['experts-detail', 'dlt', effectiveSelectedExpertCode],
    enabled: isDlt && activeExpertTab === 'overview' && Boolean(effectiveSelectedExpertCode),
    queryFn: async () => apiClient.getExpertCurrentDetail(effectiveSelectedExpertCode, 'dlt'),
  })

  const historyQuery = useQuery({
    queryKey: ['experts-history-list', 'dlt', historyExpertCode, historyPeriodQuery, historyPage],
    enabled: isDlt && activeExpertTab === 'history',
    queryFn: async () =>
      apiClient.getExpertHistoryList({
        lottery_code: 'dlt',
        expert_code: historyExpertCode || undefined,
        period_query: historyPeriodQuery.trim() || undefined,
        limit: HISTORY_PAGE_SIZE,
        offset: (historyPage - 1) * HISTORY_PAGE_SIZE,
      }),
  })
  const historyDetailQuery = useQuery({
    queryKey: ['experts-history-detail', 'dlt', selectedHistoryDetail?.targetPeriod, selectedHistoryDetail?.expertCode],
    enabled: isDlt && activeExpertTab === 'history' && Boolean(selectedHistoryDetail),
    queryFn: async () =>
      apiClient.getExpertHistoryDetail(
        selectedHistoryDetail?.targetPeriod || '',
        selectedHistoryDetail?.expertCode || '',
        'dlt',
      ),
  })

  const selectedExpert = useMemo(
    () => experts.find((item) => item.expert_code === effectiveSelectedExpertCode) || null,
    [experts, effectiveSelectedExpertCode],
  )
  const detail = detailQuery.data
  const tier = detail?.tiers?.[selectedTier]
  const tierTrace = detail?.process?.tier_trace?.[selectedTier]
  const tierInsights = detail?.process?.number_insights?.[selectedTier]
  const strategyWeights = detail?.process?.strategy_weights
  const totalHistoryPages = Math.max(1, Math.ceil((historyQuery.data?.total_count || 0) / HISTORY_PAGE_SIZE))

  return (
    <div className="page-stack expert-prediction-page">
      <HomeDashboardTabStrip activeTab="prediction" />

      {!isDlt ? (
        <StatusCard
          title="专家预测"
          subtitle="当前仅支持大乐透专家预测。切换到大乐透后可查看各专家五档结果。"
          actions={
            <button className="ghost-button" type="button" onClick={() => setSelectedLottery('dlt')}>
              切换到大乐透
            </button>
          }
        >
          <div className="state-shell">当前彩种：非大乐透</div>
        </StatusCard>
      ) : (
        <>
          <div className="expert-page-tabs" role="tablist" aria-label="专家预测二级导航">
            {EXPERT_PAGE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={clsx('expert-page-tabs__item', activeExpertTab === tab.key && 'is-active')}
                onClick={() => setActiveExpertTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeExpertTab === 'overview' ? (
            <StatusCard title="专家预测" subtitle={`目标期 ${listQuery.data?.target_period || '-'} · 单专家五档切换与过程明细`}>
              <div className="state-shell expert-prediction-page__hint">先选专家，再切换第一档~第五档查看号码与推算过程。</div>
              {listQuery.isLoading ? <div className="state-shell">正在加载专家列表...</div> : null}
              {!listQuery.isLoading && !experts.length ? <div className="state-shell">暂无可用专家方案。</div> : null}

              {experts.length ? (
                <div className="filter-chip-group" role="group" aria-label="专家选择">
                  {experts.map((expert) => (
                    <button
                      key={expert.expert_code}
                      type="button"
                      className={clsx('filter-chip', effectiveSelectedExpertCode === expert.expert_code && 'is-active')}
                      onClick={() => {
                        setSelectedExpertCode(expert.expert_code)
                        setSelectedTier('tier1')
                      }}
                    >
                      {expert.display_name}
                    </button>
                  ))}
                </div>
              ) : null}

              {selectedExpert ? (
                <div className="expert-prediction-card">
                  <p className="expert-prediction-card__bio">{selectedExpert.bio || '暂无专家简介'}</p>
                  {detailQuery.isLoading ? <div className="state-shell">正在加载专家详情...</div> : null}
                  {detailQuery.isError ? <div className="state-shell">专家详情加载失败，请稍后重试。</div> : null}

                  {detail ? (
                    <>
                      <div className="filter-chip-group expert-tier-tablist" role="tablist" aria-label="五档切换">
                        {TIER_OPTIONS.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className={clsx('filter-chip', selectedTier === item.key && 'is-active')}
                            onClick={() => setSelectedTier(item.key)}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      <article className="expert-tier-card">
                        <header className="expert-tier-card__header">
                          <h3>{TIER_OPTIONS.find((item) => item.key === selectedTier)?.label || '当前档位'}</h3>
                          <span>
                            前区 {(tier?.front || []).length} + 后区 {(tier?.back || []).length}
                          </span>
                        </header>
                        <div className="expert-tier-card__content">
                          <section>
                            <h4>前区</h4>
                            <div className="number-ball-row">
                              {(tier?.front || []).map((value) => (
                                <NumberBall key={`${selectedTier}-front-${value}`} value={value} color="dlt-front" />
                              ))}
                            </div>
                          </section>
                          <section>
                            <h4>后区</h4>
                            <div className="number-ball-row">
                              {(tier?.back || []).map((value) => (
                                <NumberBall key={`${selectedTier}-back-${value}`} value={value} color="dlt-back" />
                              ))}
                            </div>
                          </section>
                        </div>
                      </article>

                      <section className="expert-process-card" aria-label="推算过程">
                        <h3>推算过程</h3>
                        {tierTrace ? (
                          <div className="expert-process-trace">
                            <span>前区保留 {tierTrace.front.kept_from_previous.length} 个，剔除 {tierTrace.front.removed_from_previous.length} 个</span>
                            <span>后区保留 {tierTrace.back.kept_from_previous.length} 个，剔除 {tierTrace.back.removed_from_previous.length} 个</span>
                          </div>
                        ) : (
                          <div className="state-shell">当前档位暂无筛选轨迹。</div>
                        )}

                        {strategyWeights ? (
                          <div className="expert-process-weights">
                            <span>遗漏回补 {strategyWeights.miss_rebound}%</span>
                            <span>冷热形态 {strategyWeights.hot_cold_pattern}%</span>
                            <span>走势偏差 {strategyWeights.trend_deviation}%</span>
                            <span>形态稳定度 {strategyWeights.stability}%</span>
                          </div>
                        ) : null}

                        {tierInsights ? (
                          <div className="expert-process-tables">
                            <table className="expert-process-table">
                              <thead>
                                <tr>
                                  <th colSpan={5}>前区指标明细</th>
                                </tr>
                                <tr>
                                  <th>号码</th>
                                  <th>冷热</th>
                                  <th>遗漏</th>
                                  <th>趋势</th>
                                  <th>指标详解</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(tierInsights.front || []).map((item) => (
                                  <tr key={`insight-front-${item.number}`}>
                                    <td>{item.number}</td>
                                    <td>{item.temperature}</td>
                                    <td>
                                      {item.current_omit}/{item.avg_omit}
                                    </td>
                                    <td>{item.trend_score}</td>
                                    <td>{item.reason}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            <table className="expert-process-table">
                              <thead>
                                <tr>
                                  <th colSpan={5}>后区指标明细</th>
                                </tr>
                                <tr>
                                  <th>号码</th>
                                  <th>冷热</th>
                                  <th>遗漏</th>
                                  <th>趋势</th>
                                  <th>指标详解</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(tierInsights.back || []).map((item) => (
                                  <tr key={`insight-back-${item.number}`}>
                                    <td>{item.number}</td>
                                    <td>{item.temperature}</td>
                                    <td>
                                      {item.current_omit}/{item.avg_omit}
                                    </td>
                                    <td>{item.trend_score}</td>
                                    <td>{item.reason}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="state-shell">暂无指标明细。</div>
                        )}
                      </section>

                      {detail.analysis?.strategy_summary ? <div className="state-shell">{detail.analysis.strategy_summary}</div> : null}
                      {detail.analysis?.technical_style ? <div className="state-shell">{detail.analysis.technical_style}</div> : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </StatusCard>
          ) : (
            <StatusCard title="预测回溯" subtitle="按期号汇总已有专家历史结果，展示五档号码池命中情况。">
              <div className="expert-history-toolbar">
                <label className="field">
                  <span>专家筛选</span>
                  <select
                    value={historyExpertCode}
                    onChange={(event) => {
                      setHistoryExpertCode(event.target.value)
                      setHistoryPage(1)
                    }}
                  >
                    <option value="">全部专家</option>
                    {(historyQuery.data?.experts || []).map((expert) => (
                      <option key={expert.expert_code} value={expert.expert_code}>
                        {expert.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>期号搜索</span>
                  <input
                    value={historyPeriodQuery}
                    onChange={(event) => {
                      setHistoryPeriodQuery(event.target.value)
                      setHistoryPage(1)
                    }}
                    placeholder="输入期号关键字"
                  />
                </label>
              </div>

              {historyQuery.isLoading ? <div className="state-shell">正在加载专家回溯...</div> : null}
              {historyQuery.isError ? <div className="state-shell">专家回溯加载失败，请稍后重试。</div> : null}
              {!historyQuery.isLoading && !historyQuery.data?.records?.length ? <div className="state-shell">暂无专家历史回溯记录。</div> : null}

              <div className="expert-history-list">
                {(historyQuery.data?.records || []).map((record) => (
                  <ExpertHistoryRecordCard
                    key={record.target_period}
                    record={record}
                    onExpertSelect={(expertCode) => setSelectedHistoryDetail({ targetPeriod: record.target_period, expertCode })}
                  />
                ))}
              </div>

              {historyQuery.data?.records?.length ? (
                <div className="history-pagination-row">
                  <div className="history-pagination-row__meta">
                    第 {historyPage} / {totalHistoryPages} 页 · 共 {historyQuery.data.total_count} 期
                  </div>
                  <div className="history-pagination-row__actions">
                    <button
                      className="ghost-button ghost-button--compact"
                      type="button"
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                    >
                      上一页
                    </button>
                    <button
                      className="ghost-button ghost-button--compact"
                      type="button"
                      disabled={historyPage >= totalHistoryPages}
                      onClick={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
            </StatusCard>
          )}
          {selectedHistoryDetail ? (
            <ExpertHistoryDetailModal
              detail={historyDetailQuery.data || null}
              isLoading={historyDetailQuery.isLoading}
              isError={historyDetailQuery.isError}
              onClose={() => setSelectedHistoryDetail(null)}
            />
          ) : null}
        </>
      )}
    </div>
  )
}

function ExpertHistoryRecordCard({ record, onExpertSelect }: { record: ExpertHistoryRecord; onExpertSelect: (expertCode: string) => void }) {
  return (
    <article className="expert-history-record">
      <header className="expert-history-record__header">
        <div>
          <p className="history-record-card__eyebrow">第 {record.target_period} 期</p>
          <h3>专家历史命中</h3>
          <span>{record.actual_result.date || '开奖日期待补充'}</span>
        </div>
        <div className="expert-history-record__draw">
          <div className="number-ball-row">
            {(record.actual_result.red_balls || []).map((value) => (
              <NumberBall key={`${record.target_period}-actual-front-${value}`} value={value} color="dlt-front" />
            ))}
            {(record.actual_result.blue_balls || []).map((value) => (
              <NumberBall key={`${record.target_period}-actual-back-${value}`} value={value} color="dlt-back" />
            ))}
          </div>
        </div>
      </header>
      <div className="expert-history-record__experts">
        {record.experts.map((expert) => (
          <ExpertHistoryExpertCard key={`${record.target_period}-${expert.expert_code}`} expert={expert} onSelect={() => onExpertSelect(expert.expert_code)} />
        ))}
      </div>
    </article>
  )
}

function ExpertHistoryExpertCard({ expert, onSelect }: { expert: ExpertHistorySummary; onSelect: () => void }) {
  return (
    <button className="expert-history-expert-card" type="button" onClick={onSelect}>
      <header>
        <div>
          <strong>{expert.display_name}</strong>
          <span>{expert.expert_code}</span>
        </div>
        <em>最高命中 {expert.best_total_hit_count}</em>
      </header>
      <div className="expert-history-tier-grid">
        {TIER_OPTIONS.map((tier) => {
          const hit = expert.tier_hits?.[tier.key]
          return (
            <article key={`${expert.expert_code}-${tier.key}`} className="expert-history-tier-card">
              <div className="expert-history-tier-card__header">
                <strong>{tier.label}</strong>
                <span>{hit?.total_hit_count || 0} 中</span>
              </div>
              <div className="expert-history-tier-card__hits">
                <span>前区 {hit?.front_hit_count || 0}</span>
                <div className="number-ball-row">
                  {(hit?.front_hits || []).map((value) => (
                    <NumberBall key={`${expert.expert_code}-${tier.key}-front-${value}`} value={value} color="dlt-front" />
                  ))}
                </div>
                <span>后区 {hit?.back_hit_count || 0}</span>
                <div className="number-ball-row">
                  {(hit?.back_hits || []).map((value) => (
                    <NumberBall key={`${expert.expert_code}-${tier.key}-back-${value}`} value={value} color="dlt-back" />
                  ))}
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </button>
  )
}

function ExpertHistoryDetailModal({
  detail,
  isLoading,
  isError,
  onClose,
}: {
  detail: ExpertHistoryDetail | null
  isLoading: boolean
  isError: boolean
  onClose: () => void
}) {
  return createPortal(
    <div className="modal-shell" onClick={onClose}>
      <div className="modal-card expert-history-detail-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-card__header">
          <div>
            <p className="modal-card__eyebrow">专家历史详情</p>
            <h3>{detail ? `${detail.display_name} · 第 ${detail.target_period} 期` : '专家历史详情'}</h3>
            {detail ? <p className="modal-card__subtitle">{detail.actual_result.date || '开奖日期待补充'} · 五档命中与推算过程</p> : null}
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            关闭
          </button>
        </div>

        {isLoading ? <div className="state-shell">正在加载专家历史详情...</div> : null}
        {isError ? <div className="state-shell state-shell--error">专家历史详情加载失败，请稍后重试。</div> : null}

        {detail ? (
          <div className="expert-history-detail-modal__body">
            <section className="expert-history-detail-modal__draw">
              <div>
                <strong>开奖号码</strong>
                <span>第 {detail.target_period} 期</span>
              </div>
              <div className="number-ball-row">
                {(detail.actual_result.red_balls || []).map((value) => (
                  <NumberBall key={`history-detail-actual-front-${value}`} value={value} color="dlt-front" />
                ))}
                {(detail.actual_result.blue_balls || []).map((value) => (
                  <NumberBall key={`history-detail-actual-back-${value}`} value={value} color="dlt-back" />
                ))}
              </div>
            </section>

            <section className="expert-history-detail-section">
              <h4>五档命中详情</h4>
              <div className="expert-history-detail-tier-list">
                {TIER_OPTIONS.map((tierOption) => (
                  <ExpertHistoryDetailTier
                    key={`history-detail-${tierOption.key}`}
                    tierKey={tierOption.key}
                    label={tierOption.label}
                    tier={detail.tiers?.[tierOption.key]}
                    hit={detail.tier_hits?.[tierOption.key]}
                  />
                ))}
              </div>
            </section>

            <ExpertHistoryProcessSection detail={detail} />
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function ExpertHistoryDetailTier({
  tierKey,
  label,
  tier,
  hit,
}: {
  tierKey: ExpertTierKey
  label: string
  tier?: { front: string[]; back: string[] }
  hit?: ExpertTierHit
}) {
  const frontHits = new Set(hit?.front_hits || [])
  const backHits = new Set(hit?.back_hits || [])
  return (
    <article className="expert-history-detail-tier">
      <header>
        <strong>{label}</strong>
        <span>{hit?.total_hit_count || 0} 中</span>
      </header>
      <div className="expert-history-detail-tier__zone">
        <span>前区 {hit?.front_hit_count || 0}</span>
        <div className="number-ball-row" data-testid={`${tierKey}-front-numbers`}>
          {(tier?.front || []).map((value) => (
            <NumberBall key={`${tierKey}-detail-front-${value}`} value={value} color="dlt-front" tone={frontHits.has(value) ? 'default' : 'muted'} />
          ))}
        </div>
      </div>
      <div className="expert-history-detail-tier__zone">
        <span>后区 {hit?.back_hit_count || 0}</span>
        <div className="number-ball-row" data-testid={`${tierKey}-back-numbers`}>
          {(tier?.back || []).map((value) => (
            <NumberBall key={`${tierKey}-detail-back-${value}`} value={value} color="dlt-back" tone={backHits.has(value) ? 'default' : 'muted'} />
          ))}
        </div>
      </div>
    </article>
  )
}

function ExpertHistoryProcessSection({ detail }: { detail: ExpertHistoryDetail }) {
  const strategyWeights = detail.process?.strategy_weights
  return (
    <section className="expert-process-card" aria-label="历史推算过程">
      <h3>推算过程</h3>
      {detail.process?.tier_trace ? (
        <div className="expert-history-detail-trace-grid">
          {TIER_OPTIONS.map((tier) => {
            const trace = detail.process?.tier_trace?.[tier.key]
            return trace ? (
              <article key={`history-trace-${tier.key}`}>
                <strong>{tier.label}</strong>
                <span>前区保留 {trace.front.kept_from_previous.length} 个，剔除 {trace.front.removed_from_previous.length} 个</span>
                <span>后区保留 {trace.back.kept_from_previous.length} 个，剔除 {trace.back.removed_from_previous.length} 个</span>
              </article>
            ) : null
          })}
        </div>
      ) : (
        <div className="state-shell">当前详情暂无筛选轨迹。</div>
      )}

      {strategyWeights ? (
        <div className="expert-process-weights">
          <span>遗漏回补 {strategyWeights.miss_rebound}%</span>
          <span>冷热形态 {strategyWeights.hot_cold_pattern}%</span>
          <span>走势偏差 {strategyWeights.trend_deviation}%</span>
          <span>形态稳定度 {strategyWeights.stability}%</span>
        </div>
      ) : null}

      {detail.analysis?.strategy_summary ? <div className="state-shell">{detail.analysis.strategy_summary}</div> : null}
      {detail.analysis?.technical_style ? <div className="state-shell">{detail.analysis.technical_style}</div> : null}
    </section>
  )
}
