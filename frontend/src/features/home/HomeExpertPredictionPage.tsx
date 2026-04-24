import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { useLotterySelection } from '../../shared/lottery/LotterySelectionProvider'
import { HomeDashboardTabStrip } from './HomeDashboardTabStrip'

const TIER_OPTIONS: Array<{ key: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5'; label: string }> = [
  { key: 'tier1', label: '第一档' },
  { key: 'tier2', label: '第二档' },
  { key: 'tier3', label: '第三档' },
  { key: 'tier4', label: '第四档' },
  { key: 'tier5', label: '第五档' },
]

export function HomeExpertPredictionPage() {
  const { selectedLottery, setSelectedLottery } = useLotterySelection()
  const isDlt = selectedLottery === 'dlt'
  const [selectedExpertCode, setSelectedExpertCode] = useState('')
  const [selectedTier, setSelectedTier] = useState<'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5'>('tier1')

  const listQuery = useQuery({
    queryKey: ['experts-list', 'dlt'],
    queryFn: async () => apiClient.getExpertsList('dlt'),
    enabled: isDlt,
  })

  const experts = listQuery.data?.experts || []

  useEffect(() => {
    if (!experts.length) {
      setSelectedExpertCode('')
      return
    }
    if (!selectedExpertCode || !experts.some((item) => item.expert_code === selectedExpertCode)) {
      setSelectedExpertCode(experts[0].expert_code)
    }
  }, [experts, selectedExpertCode])

  const detailQuery = useQuery({
    queryKey: ['experts-detail', 'dlt', selectedExpertCode],
    enabled: isDlt && Boolean(selectedExpertCode),
    queryFn: async () => apiClient.getExpertCurrentDetail(selectedExpertCode, 'dlt'),
  })

  const selectedExpert = useMemo(
    () => experts.find((item) => item.expert_code === selectedExpertCode) || null,
    [experts, selectedExpertCode],
  )
  const detail = detailQuery.data
  const tier = detail?.tiers?.[selectedTier]
  const tierTrace = detail?.process?.tier_trace?.[selectedTier]
  const tierInsights = detail?.process?.number_insights?.[selectedTier]
  const strategyWeights = detail?.process?.strategy_weights

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
                    className={clsx('filter-chip', selectedExpertCode === expert.expert_code && 'is-active')}
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
        </>
      )}
    </div>
  )
}
