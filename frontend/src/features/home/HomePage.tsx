import { useEffect, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import clsx from 'clsx'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { loadPinnedModels, savePinnedModels } from '../../shared/lib/storage'
import { useHomeData } from './hooks/useHomeData'
import {
  buildBlueFrequencyChart,
  buildCompoundSuggestions,
  buildHistoryHitTrend,
  buildModelScores,
  buildOddEvenChart,
  buildRedFrequencyChart,
  buildSumTrendChart,
  buildSummary,
  compareNumbers,
  filterHistoryRecords,
  getActualResult,
  getStats,
  sortModels,
} from './lib/home'
import type { LotteryDraw, PredictionGroup, PredictionModel } from '../../shared/types/api'

type HomeTab = 'prediction' | 'analysis' | 'history'

const HISTORY_BATCH_SIZE = 20
const LOTTERY_PAGE_SIZE = 20

export function HomePage() {
  const [activeTab, setActiveTab] = useState<HomeTab>('prediction')
  const [predictionLimit, setPredictionLimit] = useState(HISTORY_BATCH_SIZE)
  const [lotteryPage, setLotteryPage] = useState(1)
  const [pinnedModelIds, setPinnedModelIds] = useState<string[]>(() => loadPinnedModels())
  const [detailModelId, setDetailModelId] = useState<string | null>(null)
  const [summarySelectedModelIds, setSummarySelectedModelIds] = useState<string[] | null>(null)
  const [historySelectedModelIds, setHistorySelectedModelIds] = useState<string[] | null>(null)
  const [historyPeriodQuery, setHistoryPeriodQuery] = useState('')
  const [commonOnly, setCommonOnly] = useState(false)
  const [weightedSummary, setWeightedSummary] = useState(true)

  const { currentPredictions, lotteryCharts, predictionsHistory, pagedLotteryHistory } = useHomeData(
    predictionLimit,
    lotteryPage,
    LOTTERY_PAGE_SIZE,
  )

  const models = currentPredictions.data?.models || []
  const history = predictionsHistory.data
  const chartDraws = lotteryCharts.data?.data || []
  const pagedDraws = pagedLotteryHistory.data?.data || []
  const modelScores = history ? buildModelScores(history, models) : {}
  const validPinnedModelIds = pinnedModelIds.filter((modelId) => models.some((model) => model.model_id === modelId))
  const orderedModels = sortModels(models, modelScores, validPinnedModelIds)
  const highlightedModels = orderedModels.slice(0, 3)
  const actualResult = getActualResult(chartDraws, currentPredictions.data?.target_period || '')
  const stats = getStats(chartDraws)

  useEffect(() => {
    savePinnedModels(validPinnedModelIds)
  }, [validPinnedModelIds])

  const selectedSummaryIds = summarySelectedModelIds ?? models.map((model) => model.model_id)
  const selectedHistoryIds = historySelectedModelIds ?? models.map((model) => model.model_id)
  const summary = buildSummary(models, modelScores, selectedSummaryIds, weightedSummary, commonOnly)
  const compoundSuggestions = buildCompoundSuggestions(summary)
  const filteredHistory = history ? filterHistoryRecords(history, selectedHistoryIds, historyPeriodQuery) : []
  const historyHitTrend = buildHistoryHitTrend(filteredHistory, selectedHistoryIds)
  const totalLotteryPages = Math.max(1, Math.ceil((pagedLotteryHistory.data?.total_count || 0) / LOTTERY_PAGE_SIZE))
  const redChart = buildRedFrequencyChart(chartDraws)
  const blueChart = buildBlueFrequencyChart(chartDraws)
  const oddEvenChart = buildOddEvenChart(chartDraws)
  const sumTrendChart = buildSumTrendChart(chartDraws)
  const selectedDetailModel = orderedModels.find((model) => model.model_id === detailModelId) || null

  const isLoading = currentPredictions.isLoading || lotteryCharts.isLoading || predictionsHistory.isLoading
  const error =
    currentPredictions.error instanceof Error
      ? currentPredictions.error
      : lotteryCharts.error instanceof Error
        ? lotteryCharts.error
        : predictionsHistory.error instanceof Error
          ? predictionsHistory.error
          : null

  function togglePinned(modelId: string) {
    setPinnedModelIds((previous) => {
      if (previous.includes(modelId)) {
        return previous.filter((item) => item !== modelId)
      }
      return [modelId, ...previous]
    })
  }

  function toggleSummaryModel(modelId: string) {
    const fallbackIds = models.map((model) => model.model_id)
    setSummarySelectedModelIds((previous) => {
      const current = previous ?? fallbackIds
      return current.includes(modelId) ? current.filter((item) => item !== modelId) : [...current, modelId]
    })
  }

  function toggleHistoryModel(modelId: string) {
    const fallbackIds = models.map((model) => model.model_id)
    setHistorySelectedModelIds((previous) => {
      const current = previous ?? fallbackIds
      return current.includes(modelId) ? current.filter((item) => item !== modelId) : [...current, modelId]
    })
  }

  if (isLoading) {
    return <div className="state-shell">正在加载大乐透预测控制台...</div>
  }

  if (error) {
    return <div className="state-shell state-shell--error">加载失败：{error.message}</div>
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <p className="hero-panel__eyebrow">Prediction Command Center</p>
          <h2 className="hero-panel__title">大乐透AI预测</h2>
          <p className="hero-panel__description">
            当前目标期为 <strong>{currentPredictions.data?.target_period || '-'}</strong>，下期开奖日{' '}
            <strong>{lotteryCharts.data?.next_draw?.next_date_display || '-'}</strong>。
          </p>
          <div className="hero-panel__meta">
            <span>预测日期 {currentPredictions.data?.prediction_date || '-'}</span>
            <span>活跃模型 {models.length}</span>
            <span>历史窗口 {history?.total_count || 0}</span>
          </div>
        </div>
        <div className="hero-panel__orb" />
      </section>

      <section className="stats-grid">
        <StatTile label="数据样本" value={String(stats.totalDraws)} />
        <StatTile label="最热前区" value={stats.hottestRed} />
        <StatTile label="最热后区" value={stats.hottestBlue} />
        <StatTile label="平均前区和值" value={String(stats.avgSum)} />
      </section>

      <section className="tab-strip">
        <button className={clsx('tab-strip__item', activeTab === 'prediction' && 'is-active')} onClick={() => setActiveTab('prediction')}>
          预测总览
        </button>
        <button className={clsx('tab-strip__item', activeTab === 'analysis' && 'is-active')} onClick={() => setActiveTab('analysis')}>
          图表分析
        </button>
        <button className={clsx('tab-strip__item', activeTab === 'history' && 'is-active')} onClick={() => setActiveTab('history')}>
          历史回溯
        </button>
      </section>

      {activeTab === 'prediction' ? (
        <div className="page-section">
          <StatusCard title="焦点模型" subtitle="历史评分与置顶状态会影响这里的曝光顺序。">
            <div className="spotlight-grid">
              {highlightedModels.map((model) => (
                <SpotlightCard
                  key={model.model_id}
                  model={model}
                  score={modelScores[model.model_id]?.score100 || 0}
                  isPinned={validPinnedModelIds.includes(model.model_id)}
                  actualResult={actualResult}
                  onPin={() => togglePinned(model.model_id)}
                  onDetail={() => setDetailModelId(model.model_id)}
                />
              ))}
            </div>
          </StatusCard>

          <div className="split-grid">
            <StatusCard
              title="共识组合建议"
              subtitle="支持按模型筛选、共同出现过滤和历史评分加权。"
              actions={
                <div className="toolbar-inline">
                  <label className="toggle-chip">
                    <input type="checkbox" checked={commonOnly} onChange={(event) => setCommonOnly(event.target.checked)} />
                    <span>仅共同号码</span>
                  </label>
                  <label className="toggle-chip">
                    <input
                      type="checkbox"
                      checked={weightedSummary}
                      onChange={(event) => setWeightedSummary(event.target.checked)}
                    />
                    <span>评分加权</span>
                  </label>
                </div>
              }
            >
              <div className="filter-chip-group">
                {orderedModels.map((model) => (
                  <button
                    key={model.model_id}
                    className={clsx('filter-chip', selectedSummaryIds.includes(model.model_id) && 'is-active')}
                    onClick={() => toggleSummaryModel(model.model_id)}
                  >
                    {model.model_name}
                  </button>
                ))}
              </div>
              <div className="compound-grid">
                {Object.entries(compoundSuggestions).map(([label, value]) => (
                  <article key={label} className="compound-card">
                    <p className="compound-card__tag">{label}</p>
                    <div className="number-row">
                      {value.red.map((ball) => (
                        <NumberBall key={`${label}-r-${ball}`} value={ball} color="red" />
                      ))}
                      <span className="number-row__divider" />
                      {value.blue.map((ball) => (
                        <NumberBall key={`${label}-b-${ball}`} value={ball} color="blue" />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <div className="summary-columns">
                <SummaryList title="前区权重" items={summary.red.slice(0, 12)} />
                <SummaryList title="后区权重" items={summary.blue.slice(0, 12)} />
              </div>
            </StatusCard>

            <StatusCard title="模型矩阵" subtitle="保留全部模型详情，可查看最佳命中组和全量号码。">
              <div className="model-grid">
                {orderedModels.map((model) => (
                  <ModelCard
                    key={model.model_id}
                    model={model}
                    score={modelScores[model.model_id]?.score100 || 0}
                    isPinned={validPinnedModelIds.includes(model.model_id)}
                    actualResult={actualResult}
                    onPin={() => togglePinned(model.model_id)}
                    onDetail={() => setDetailModelId(model.model_id)}
                  />
                ))}
              </div>
            </StatusCard>
          </div>
        </div>
      ) : null}

      {activeTab === 'analysis' ? (
        <div className="page-section chart-grid">
          <ChartCard title="前区热号 Top 12">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={redChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="ball" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--red-500)" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="后区热号 Top 12">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={blueChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="ball" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--blue-500)" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="奇偶结构走势">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={oddEvenChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="odd" stackId="1" stroke="var(--red-500)" fill="rgba(215, 64, 90, 0.6)" />
                <Area type="monotone" dataKey="even" stackId="1" stroke="var(--amber-500)" fill="rgba(242, 165, 79, 0.6)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="前区和值趋势">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={sumTrendChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="sum" stroke="var(--blue-500)" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : null}

      {activeTab === 'history' ? (
        <div className="page-section">
          <ChartCard title="模型历史命中趋势">
            {historyHitTrend.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={historyHitTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {orderedModels
                    .filter((model) => selectedHistoryIds.includes(model.model_id))
                    .map((model, index) => (
                      <Line
                        key={model.model_id}
                        type="monotone"
                        dataKey={model.model_id}
                        name={model.model_name}
                        stroke={getModelTrendColor(index)}
                        strokeWidth={3}
                        dot={{ r: 2 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="state-shell">当前筛选条件下没有可展示的历史命中趋势。</div>
            )}
          </ChartCard>

          <StatusCard title="命中回溯" subtitle="按模型和期号筛选历史预测表现。">
            <div className="history-toolbar">
              <div className="filter-chip-group">
                {orderedModels.map((model) => (
                  <button
                    key={model.model_id}
                    className={clsx('filter-chip', selectedHistoryIds.includes(model.model_id) && 'is-active')}
                    onClick={() => toggleHistoryModel(model.model_id)}
                  >
                    {model.model_name}
                  </button>
                ))}
              </div>
              <input
                className="search-input"
                value={historyPeriodQuery}
                onChange={(event) => setHistoryPeriodQuery(event.target.value.replace(/[^\d]/g, ''))}
                placeholder="输入期号过滤"
              />
            </div>

            <div className="history-card-list">
              {filteredHistory.map((record) => (
                <HistoryRecordCard key={record.target_period} record={record} />
              ))}
            </div>

            {(history?.total_count || 0) > predictionLimit ? (
              <div className="load-more-row">
                <button className="primary-button" onClick={() => setPredictionLimit((value) => value + HISTORY_BATCH_SIZE)}>
                  加载更多命中记录
                </button>
              </div>
            ) : null}
          </StatusCard>

          <StatusCard title="开奖历史分页" subtitle={`第 ${lotteryPage} / ${totalLotteryPages} 页`}>
            <div className="table-shell">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>期号</th>
                    <th>日期</th>
                    <th>号码</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedDraws.map((draw) => (
                    <tr key={draw.period}>
                      <td>{draw.period}</td>
                      <td>{draw.date}</td>
                      <td>
                        <div className="number-row number-row--tight">
                          {draw.red_balls.map((ball) => (
                            <NumberBall key={`${draw.period}-r-${ball}`} value={ball} color="red" size="sm" />
                          ))}
                          <span className="number-row__divider" />
                          {draw.blue_balls.map((ball) => (
                            <NumberBall key={`${draw.period}-b-${ball}`} value={ball} color="blue" size="sm" />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination-row">
              <button className="ghost-button" disabled={lotteryPage <= 1} onClick={() => setLotteryPage((value) => Math.max(1, value - 1))}>
                上一页
              </button>
              <span>共 {pagedLotteryHistory.data?.total_count || 0} 条记录</span>
              <button
                className="ghost-button"
                disabled={lotteryPage >= totalLotteryPages}
                onClick={() => setLotteryPage((value) => Math.min(totalLotteryPages, value + 1))}
              >
                下一页
              </button>
            </div>
          </StatusCard>
        </div>
      ) : null}

      {selectedDetailModel ? (
        <div className="modal-shell" role="presentation" onClick={() => setDetailModelId(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <p className="modal-card__eyebrow">模型详情</p>
                <h3>{selectedDetailModel.model_name}</h3>
              </div>
              <button className="ghost-button" onClick={() => setDetailModelId(null)}>
                关闭
              </button>
            </div>
            <div className="detail-group-list">
              {selectedDetailModel.predictions.map((group) => (
                <PredictionGroupCard key={group.group_id} group={group} actualResult={actualResult} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="stat-tile">
      <p className="stat-tile__label">{label}</p>
      <strong className="stat-tile__value">{value}</strong>
    </article>
  )
}

function SpotlightCard({
  model,
  score,
  actualResult,
  isPinned,
  onPin,
  onDetail,
}: {
  model: PredictionModel
  score: number
  actualResult: LotteryDraw | null
  isPinned: boolean
  onPin: () => void
  onDetail: () => void
}) {
  const bestPrediction = model.predictions.reduce<{ group: PredictionGroup | null; hits: number }>(
    (best, current) => {
      const hitCount = compareNumbers(current, actualResult)?.totalHits || 0
      return hitCount > best.hits ? { group: current, hits: hitCount } : best
    },
    { group: model.predictions[0] || null, hits: 0 },
  )

  return (
    <article className="spotlight-card">
      <div className="spotlight-card__header">
        <div>
          <p className="spotlight-card__provider">{model.model_provider}</p>
          <h3>{model.model_name}</h3>
        </div>
        <button className={clsx('pin-button', isPinned && 'is-active')} onClick={onPin}>
          {isPinned ? '已置顶' : '置顶'}
        </button>
      </div>
      <p className="spotlight-card__score">历史评分 {score}</p>
      {bestPrediction.group ? <PredictionNumberRow group={bestPrediction.group} actualResult={actualResult} /> : null}
      <div className="spotlight-card__actions">
        <button className="ghost-button" onClick={onDetail}>
          查看全部组
        </button>
      </div>
    </article>
  )
}

function ModelCard({
  model,
  score,
  isPinned,
  actualResult,
  onPin,
  onDetail,
}: {
  model: PredictionModel
  score: number
  isPinned: boolean
  actualResult: LotteryDraw | null
  onPin: () => void
  onDetail: () => void
}) {
  return (
    <article className="model-card-react">
      <div className="model-card-react__header">
        <div>
          <p className="model-card-react__provider">{model.model_provider}</p>
          <h3>{model.model_name}</h3>
        </div>
        <button className={clsx('pin-button', isPinned && 'is-active')} onClick={onPin}>
          {isPinned ? '★' : '☆'}
        </button>
      </div>
      <p className="model-card-react__meta">
        历史评分 {score} · {model.model_api_model || model.model_id}
      </p>
      <div className="model-card-react__groups">
        {model.predictions.slice(0, 2).map((group) => (
          <PredictionGroupCard key={group.group_id} group={group} actualResult={actualResult} compact />
        ))}
      </div>
      <button className="ghost-button ghost-button--full" onClick={onDetail}>
        查看全部 {model.predictions.length} 组
      </button>
    </article>
  )
}

function PredictionGroupCard({
  group,
  actualResult,
  compact = false,
}: {
  group: PredictionGroup
  actualResult: LotteryDraw | null
  compact?: boolean
}) {
  const hit = compareNumbers(group, actualResult)
  return (
    <article className={clsx('prediction-group-card', compact && 'is-compact')}>
      <div className="prediction-group-card__header">
        <span className="prediction-group-card__badge">G-{group.group_id}</span>
        <span>{group.strategy || 'AI 组合策略'}</span>
        {hit ? <strong>{hit.totalHits} 中</strong> : null}
      </div>
      <PredictionNumberRow group={group} actualResult={actualResult} />
      {compact ? null : <p className="prediction-group-card__desc">{group.description || '暂无说明'}</p>}
    </article>
  )
}

function PredictionNumberRow({ group, actualResult }: { group: PredictionGroup; actualResult: LotteryDraw | null }) {
  const hit = compareNumbers(group, actualResult)
  return (
    <div className="number-row">
      {group.red_balls.map((ball) => (
        <NumberBall key={`r-${group.group_id}-${ball}`} value={ball} color="red" isHit={Boolean(hit?.redHits.includes(ball))} />
      ))}
      <span className="number-row__divider" />
      {group.blue_balls.map((ball) => (
        <NumberBall key={`b-${group.group_id}-${ball}`} value={ball} color="blue" isHit={Boolean(hit?.blueHits.includes(ball))} />
      ))}
    </div>
  )
}

function SummaryList({
  title,
  items,
}: {
  title: string
  items: Array<{ ball: string; count: number; matchedModelCount: number }>
}) {
  return (
    <div className="summary-list">
      <h3>{title}</h3>
      <div className="summary-list__items">
        {items.map((item) => (
          <div key={`${title}-${item.ball}`} className="summary-list__item">
            <span>{item.ball}</span>
            <span>
              {item.count} / {item.matchedModelCount} 模型
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel-card chart-card">
      <div className="panel-card__header">
        <h2 className="panel-card__title">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function getModelTrendColor(index: number) {
  const palette = [
    '#f2a54f',
    '#3d8df5',
    '#d7405a',
    '#3fc27d',
    '#c084fc',
    '#fb7185',
    '#22d3ee',
    '#f97316',
  ]
  return palette[index % palette.length]
}

function HistoryRecordCard({ record }: { record: { target_period: string; actual_result: LotteryDraw | null; models: PredictionModel[] } }) {
  return (
    <article className="history-record-card">
      <div className="history-record-card__header">
        <div>
          <p className="history-record-card__eyebrow">第 {record.target_period} 期</p>
          <h3>开奖回溯</h3>
        </div>
        <span>{record.actual_result?.date || '-'}</span>
      </div>
      {record.actual_result ? (
        <div className="number-row">
          {record.actual_result.red_balls.map((ball) => (
            <NumberBall key={`${record.target_period}-red-${ball}`} value={ball} color="red" />
          ))}
          <span className="number-row__divider" />
          {record.actual_result.blue_balls.map((ball) => (
            <NumberBall key={`${record.target_period}-blue-${ball}`} value={ball} color="blue" />
          ))}
        </div>
      ) : null}
      <div className="history-record-card__models">
        {record.models.map((model) => (
          <div key={`${record.target_period}-${model.model_id}`} className="history-record-card__model">
            <strong>{model.model_name}</strong>
            <span>最佳命中 {model.best_hit_count || 0}</span>
          </div>
        ))}
      </div>
    </article>
  )
}
