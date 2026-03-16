import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { loadPinnedModels, savePinnedModels } from '../../shared/lib/storage'
import { useHomeData } from './hooks/useHomeData'
import { useHomeModelFilters } from './hooks/useHomeModelFilters'
import {
  type BallStatItem,
  buildBlueFrequencyChart,
  buildOddEvenChart,
  buildRedFrequencyChart,
  buildSumTrendChart,
  compareNumbers,
  getActualResult,
  type ModelListScoreRange,
  normalizePredictionsHistory,
} from './lib/home'
import type {
  LotteryDraw,
  PredictionGroup,
  PredictionModel,
  PredictionsHistoryListRecord,
} from '../../shared/types/api'

type HomeTab = 'prediction' | 'analysis' | 'history'
type HomeModelView = 'card' | 'list'

const HISTORY_BATCH_SIZE = 20
const LOTTERY_PAGE_SIZE = 20
const MODEL_SCORE_FILTERS: Array<{ value: ModelListScoreRange; label: string }> = [
  { value: 'all', label: '全部评分' },
  { value: '0-30', label: '0-30 分' },
  { value: '31-60', label: '31-60 分' },
  { value: '61-80', label: '61-80 分' },
  { value: '81-100', label: '81-100 分' },
]

function HomeSvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function HomeListIcon() {
  return (
    <HomeSvgIcon>
      <path d="M7 5.5h8.5M7 10h8.5M7 14.5h8.5" />
      <path d="M3.8 5.5h.4M3.8 10h.4M3.8 14.5h.4" />
    </HomeSvgIcon>
  )
}

function HomeGridIcon() {
  return (
    <HomeSvgIcon>
      <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1" />
      <rect x="11" y="3.5" width="5.5" height="5.5" rx="1" />
      <rect x="3.5" y="11" width="5.5" height="5.5" rx="1" />
      <rect x="11" y="11" width="5.5" height="5.5" rx="1" />
    </HomeSvgIcon>
  )
}

function HomeIconButton({
  label,
  icon,
  active = false,
  onClick,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={clsx('icon-button', active && 'is-active')}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  )
}

export function HomePage() {
  const [activeTab, setActiveTab] = useState<HomeTab>('prediction')
  const [activeSection, setActiveSection] = useState<'models' | 'weights'>('models')
  const [modelListView, setModelListView] = useState<HomeModelView>('list')
  const [predictionLimit, setPredictionLimit] = useState(HISTORY_BATCH_SIZE)
  const [lotteryPage, setLotteryPage] = useState(1)
  const [pinnedModelIds, setPinnedModelIds] = useState<string[]>(() => loadPinnedModels())
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null)
  const [detailModelId, setDetailModelId] = useState<string | null>(null)
  const [historyPeriodQuery, setHistoryPeriodQuery] = useState('')
  const [commonOnly, setCommonOnly] = useState(false)
  const [weightedSummary] = useState(true)
  const modelSectionRef = useRef<HTMLElement | null>(null)
  const weightsSectionRef = useRef<HTMLElement | null>(null)

  const { currentPredictions, lotteryCharts, predictionsHistory, pagedLotteryHistory } = useHomeData(
    predictionLimit,
    lotteryPage,
    LOTTERY_PAGE_SIZE,
  )

  const models = currentPredictions.data?.models || []
  const history = predictionsHistory.data
  const chartDraws = lotteryCharts.data?.data || []
  const pagedDraws = pagedLotteryHistory.data?.data || []
  const validPinnedModelIds = pinnedModelIds.filter((modelId) => models.some((model) => model.model_id === modelId))
  const {
    isModelFilterOpen,
    setIsModelFilterOpen,
    modelNameQuery,
    setModelNameQuery,
    selectedProviders,
    selectedTags,
    selectedScoreRange,
    setSelectedScoreRange,
    orderedModels,
    modelScores,
    availableProviders,
    availableTags,
    filteredModels,
    filteredModelIds,
    toggleModelProvider,
    toggleModelTag,
    clearModelFilters,
    toggleSummaryModel,
    buildHistoryState,
  } = useHomeModelFilters(models, history, validPinnedModelIds)
  const actualResult = getActualResult(chartDraws, currentPredictions.data?.target_period || '')

  useEffect(() => {
    savePinnedModels(validPinnedModelIds)
  }, [validPinnedModelIds])

  useEffect(() => {
    if (activeTab !== 'prediction') return

    function syncActiveSection() {
      const sections = [
        { id: 'models' as const, element: modelSectionRef.current },
        { id: 'weights' as const, element: weightsSectionRef.current },
      ]
      const visibleSections = sections
        .map((section) => {
          const top = section.element?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
          return { id: section.id, top }
        })
        .filter((section) => Number.isFinite(section.top))
        .sort((left, right) => Math.abs(left.top - 120) - Math.abs(right.top - 120))

      if (visibleSections[0]) {
        setActiveSection(visibleSections[0].id)
      }
    }

    syncActiveSection()
    window.addEventListener('scroll', syncActiveSection, { passive: true })
    window.addEventListener('resize', syncActiveSection)
    return () => {
      window.removeEventListener('scroll', syncActiveSection)
      window.removeEventListener('resize', syncActiveSection)
    }
  }, [activeTab])

  const { selectedSummaryIds, summary, filteredHistory, historyHitTrend } = buildHistoryState(historyPeriodQuery, commonOnly, weightedSummary)
  const summaryModels = filteredModels.filter((model) => selectedSummaryIds.includes(model.model_id))
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
    setActiveActionMenuId(null)
  }

  function scrollToSection(section: 'models' | 'weights') {
    const target = section === 'models' ? modelSectionRef.current : weightsSectionRef.current
    setActiveSection(section)
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
        <div className="dashboard-layout">
          <aside className="dashboard-sidebar" aria-label="预测总览导航">
            <button
              className={clsx('dashboard-sidebar__link', activeSection === 'models' && 'is-active')}
              onClick={() => scrollToSection('models')}
            >
              模型列表
            </button>
            <button
              className={clsx('dashboard-sidebar__link', activeSection === 'weights' && 'is-active')}
              onClick={() => scrollToSection('weights')}
            >
              号码预测统计
            </button>
          </aside>

          <div className="page-section dashboard-content">
            <section ref={modelSectionRef} data-section="models">
              <StatusCard
                title="模型列表"
                subtitle="统一查看所有模型的历史评分、本期 5 组预测号码和更多操作。"
                actions={
                  <div className="toolbar-inline">
                    <div className="view-switch settings-model-toolbar__view-switch" role="tablist" aria-label="预测总览模型视图切换">
                      <HomeIconButton
                        label="列表视图"
                        icon={<HomeListIcon />}
                        active={modelListView === 'list'}
                        onClick={() => setModelListView('list')}
                      />
                      <HomeIconButton
                        label="卡片视图"
                        icon={<HomeGridIcon />}
                        active={modelListView === 'card'}
                        onClick={() => setModelListView('card')}
                      />
                    </div>
                    <button className={clsx('ghost-button', isModelFilterOpen && 'is-active')} onClick={() => setIsModelFilterOpen((value) => !value)}>
                      {isModelFilterOpen ? '收起筛选' : '展开筛选'}
                    </button>
                  </div>
                }
              >
                {isModelFilterOpen ? (
                  <ModelFilterPanel
                    modelNameQuery={modelNameQuery}
                    onModelNameQueryChange={setModelNameQuery}
                    filteredCount={filteredModels.length}
                    totalCount={orderedModels.length}
                    onClear={clearModelFilters}
                    availableProviders={availableProviders}
                    selectedProviders={selectedProviders}
                    onToggleProvider={toggleModelProvider}
                    availableTags={availableTags}
                    selectedTags={selectedTags}
                    onToggleTag={toggleModelTag}
                    selectedScoreRange={selectedScoreRange}
                    onSelectScoreRange={setSelectedScoreRange}
                  />
                ) : null}

                {modelListView === 'card' ? (
                  <div className="model-list">
                    {filteredModels.length ? (
                      filteredModels.map((model) => (
                        <ModelListCard
                          key={model.model_id}
                          model={model}
                          score={modelScores[model.model_id]?.score100 || 0}
                          isPinned={validPinnedModelIds.includes(model.model_id)}
                          actualResult={actualResult}
                          isActionMenuOpen={activeActionMenuId === model.model_id}
                          onToggleActionMenu={() =>
                            setActiveActionMenuId((previous) => (previous === model.model_id ? null : model.model_id))
                          }
                          onPin={() => togglePinned(model.model_id)}
                          onDetail={() => setDetailModelId(model.model_id)}
                        />
                      ))
                    ) : (
                      <div className="state-shell">没有符合当前筛选条件的模型。</div>
                    )}
                  </div>
                ) : (
                  <ModelListTable
                    models={filteredModels}
                    modelScores={modelScores}
                    validPinnedModelIds={validPinnedModelIds}
                    actualResult={actualResult}
                    activeActionMenuId={activeActionMenuId}
                    onToggleActionMenu={(modelId) =>
                      setActiveActionMenuId((previous) => (previous === modelId ? null : modelId))
                    }
                    onPin={togglePinned}
                    onDetail={setDetailModelId}
                  />
                )}
              </StatusCard>
            </section>

            <section ref={weightsSectionRef} data-section="weights">
              <StatusCard
                title="号码预测统计"
                subtitle="展示各个模型中每个号码出现的次数、命中模型数和命中占比。"
                actions={
                  <div className="toolbar-inline">
                    <label className="toggle-chip">
                      <input type="checkbox" checked={commonOnly} onChange={(event) => setCommonOnly(event.target.checked)} />
                      <span>仅共同号码</span>
                    </label>
                  </div>
                }
              >
                <div className="filter-chip-group">
                  {filteredModels.map((model) => (
                    <button
                      key={model.model_id}
                      className={clsx('filter-chip', selectedSummaryIds.includes(model.model_id) && 'is-active')}
                      onClick={() => toggleSummaryModel(model.model_id)}
                    >
                      {model.model_name}
                    </button>
                  ))}
                </div>
                {!filteredModels.length ? (
                  <div className="state-shell">当前筛选条件下没有可统计的模型。</div>
                ) : !selectedSummaryIds.length ? (
                  <div className="state-shell">请至少选择一个模型以查看号码统计。</div>
                ) : (
                  <div className="summary-columns">
                    <SummaryList title="前区统计" items={summary.red} color="red" models={summaryModels} />
                    <SummaryList title="后区统计" items={summary.blue} color="blue" models={summaryModels} />
                  </div>
                )}
              </StatusCard>
            </section>
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
            {filteredModels.length && historyHitTrend.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={historyHitTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {filteredModels.map((model, index) => (
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
            {isModelFilterOpen ? (
              <ModelFilterPanel
                modelNameQuery={modelNameQuery}
                onModelNameQueryChange={setModelNameQuery}
                filteredCount={filteredModels.length}
                totalCount={orderedModels.length}
                onClear={clearModelFilters}
                availableProviders={availableProviders}
                selectedProviders={selectedProviders}
                onToggleProvider={toggleModelProvider}
                availableTags={availableTags}
                selectedTags={selectedTags}
                onToggleTag={toggleModelTag}
                selectedScoreRange={selectedScoreRange}
                onSelectScoreRange={setSelectedScoreRange}
              />
            ) : null}
            <div className="history-toolbar">
              <button className={clsx('ghost-button', isModelFilterOpen && 'is-active')} onClick={() => setIsModelFilterOpen((value) => !value)}>
                {isModelFilterOpen ? '收起筛选' : '展开筛选'}
              </button>
              <input
                className="search-input"
                value={historyPeriodQuery}
                onChange={(event) => setHistoryPeriodQuery(event.target.value.replace(/[^\d]/g, ''))}
                placeholder="输入期号过滤"
              />
            </div>

            <div className="history-card-list">
              {!filteredModels.length ? <div className="state-shell">当前筛选条件下没有可展示的模型。</div> : null}
              {filteredModels.length && !filteredHistory.length ? <div className="state-shell">当前筛选条件下没有历史回溯记录。</div> : null}
              {filteredHistory.map((record) => (
                <HistoryRecordCard key={record.target_period} record={record} visibleModelIds={filteredModelIds} />
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

function ModelListCard({
  model,
  score,
  isPinned,
  actualResult,
  isActionMenuOpen,
  onToggleActionMenu,
  onPin,
  onDetail,
}: {
  model: PredictionModel
  score: number
  isPinned: boolean
  actualResult: LotteryDraw | null
  isActionMenuOpen: boolean
  onToggleActionMenu: () => void
  onPin: () => void
  onDetail: () => void
}) {
  return (
    <article className="model-list-card">
      <div className="model-list-card__header">
        <div>
          <p className="model-list-card__provider">{model.model_provider}</p>
          <h3>{model.model_name}</h3>
        </div>
        <div className="model-list-card__actions">
          {isPinned ? <span className="status-pill is-active">已置顶</span> : null}
          <div className="action-menu">
            <button className="ghost-button" onClick={onToggleActionMenu} aria-expanded={isActionMenuOpen}>
              更多操作
            </button>
            {isActionMenuOpen ? (
              <div className="action-menu__panel">
                <button className="action-menu__item action-menu__item--disabled" type="button" disabled title="暂未开放">
                  收藏
                  <span>暂未开放</span>
                </button>
                <button className="action-menu__item" type="button" onClick={onPin}>
                  {isPinned ? '取消置顶' : '置顶'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="model-list-card__meta">
        <div className="model-list-card__field">
          <span>模型名称</span>
          <strong>{model.model_name}</strong>
        </div>
        <div className="model-list-card__field">
          <span>历史评分</span>
          <strong>{score}</strong>
        </div>
        <div className="model-list-card__field">
          <span>接口模型</span>
          <strong>{model.model_api_model || model.model_id}</strong>
        </div>
      </div>
      <div className="model-list-card__groups">
        {model.predictions.map((group) => (
          <PredictionGroupCard key={group.group_id} group={group} actualResult={actualResult} compact />
        ))}
      </div>
      <div className="model-list-card__footer">
        <span>本期预测号码</span>
        <button className="ghost-button" onClick={onDetail}>
          查看详情
        </button>
      </div>
    </article>
  )
}

function ModelListTable({
  models,
  modelScores,
  validPinnedModelIds,
  actualResult,
  activeActionMenuId,
  onToggleActionMenu,
  onPin,
  onDetail,
}: {
  models: PredictionModel[]
  modelScores: Record<string, { score100: number }>
  validPinnedModelIds: string[]
  actualResult: LotteryDraw | null
  activeActionMenuId: string | null
  onToggleActionMenu: (modelId: string) => void
  onPin: (modelId: string) => void
  onDetail: (modelId: string) => void
}) {
  if (!models.length) {
    return <div className="state-shell">没有符合当前筛选条件的模型。</div>
  }

  return (
    <div className="table-shell home-model-list-table-shell">
      <table className="history-table home-model-list-table">
        <thead>
          <tr>
            <th>模型</th>
            <th>评分</th>
            <th>接口模型</th>
            <th>预测摘要</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            const isPinned = validPinnedModelIds.includes(model.model_id)
            return (
              <tr key={model.model_id}>
                <td>
                  <div className="home-model-list-table__title">
                    <strong>{model.model_name}</strong>
                    <span>{model.model_provider}</span>
                  </div>
                </td>
                <td>
                  <span className="home-model-list-table__score">{modelScores[model.model_id]?.score100 || 0}</span>
                </td>
                <td>
                  <span className="home-model-list-table__api" title={model.model_api_model || model.model_id}>
                    {model.model_api_model || model.model_id}
                  </span>
                </td>
                <td>
                  <div className="home-model-list-table__groups">
                    {model.predictions.map((group) => (
                      <PredictionGroupCard key={`${model.model_id}-${group.group_id}`} group={group} actualResult={actualResult} compact />
                    ))}
                  </div>
                </td>
                <td>
                  {isPinned ? <span className="status-pill is-active">已置顶</span> : null}
                </td>
                <td>
                  <div className="home-model-list-table__actions">
                    <button
                      className="icon-button home-model-list-table__detail-button"
                      onClick={() => onDetail(model.model_id)}
                      aria-label={`查看详情：${model.model_name}`}
                      title="查看详情"
                      type="button"
                    >
                      <DetailIcon />
                    </button>
                    <div className="action-menu">
                      <button
                        className="icon-button home-model-list-table__menu-button"
                        onClick={() => onToggleActionMenu(model.model_id)}
                        aria-expanded={activeActionMenuId === model.model_id}
                        aria-label={`更多操作：${model.model_name}`}
                        title="更多操作"
                        type="button"
                      >
                        <MoreMenuIcon />
                      </button>
                      {activeActionMenuId === model.model_id ? (
                        <div className="action-menu__panel">
                          <button className="action-menu__item action-menu__item--disabled" type="button" disabled title="暂未开放">
                            收藏
                            <span>暂未开放</span>
                          </button>
                          <button className="action-menu__item" type="button" onClick={() => onPin(model.model_id)}>
                            {isPinned ? '取消置顶' : '置顶'}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MoreMenuIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="4.5" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function DetailIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.8 10s2.7-4.4 7.2-4.4S17.2 10 17.2 10s-2.7 4.4-7.2 4.4S2.8 10 2.8 10Z" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  )
}

function PredictionGroupCard({
  group,
  actualResult,
  compact = false,
  grayMisses = false,
  emphasizeHitTier = false,
}: {
  group: PredictionGroup
  actualResult: LotteryDraw | null
  compact?: boolean
  grayMisses?: boolean
  emphasizeHitTier?: boolean
}) {
  const hit = compareNumbers(group, actualResult)
  const hitTierClass =
    emphasizeHitTier && hit
      ? hit.totalHits >= 6
        ? 'is-hit-tier-6'
        : hit.totalHits === 5
          ? 'is-hit-tier-5'
          : hit.totalHits === 4
            ? 'is-hit-tier-4'
            : null
      : null
  return (
    <article className={clsx('prediction-group-card', compact && 'is-compact', hitTierClass)}>
      <div className="prediction-group-card__header">
        <span className="prediction-group-card__badge">G-{group.group_id}</span>
        <span className="prediction-group-card__strategy">{group.strategy || 'AI 组合策略'}</span>
        {hit ? <strong className="prediction-group-card__hit">{hit.totalHits} 中</strong> : null}
      </div>
      <PredictionNumberRow group={group} actualResult={actualResult} grayMisses={grayMisses} compact={compact} />
      {compact ? null : <p className="prediction-group-card__desc">{group.description || '暂无说明'}</p>}
    </article>
  )
}

function PredictionNumberRow({
  group,
  actualResult,
  grayMisses = false,
  compact = false,
}: {
  group: PredictionGroup
  actualResult: LotteryDraw | null
  grayMisses?: boolean
  compact?: boolean
}) {
  const hit = compareNumbers(group, actualResult)
  return (
    <div className={clsx('number-row', compact && 'number-row--compact')}>
      {group.red_balls.map((ball) => {
        const isHit = Boolean(hit?.redHits.includes(ball))
        return (
          <NumberBall
            key={`r-${group.group_id}-${ball}`}
            value={ball}
            color="red"
            isHit={isHit}
            tone={grayMisses && !isHit ? 'muted' : 'default'}
          />
        )
      })}
      <span className="number-row__divider" />
      {group.blue_balls.map((ball) => {
        const isHit = Boolean(hit?.blueHits.includes(ball))
        return (
          <NumberBall
            key={`b-${group.group_id}-${ball}`}
            value={ball}
            color="blue"
            isHit={isHit}
            tone={grayMisses && !isHit ? 'muted' : 'default'}
          />
        )
      })}
    </div>
  )
}

function SummaryList({
  title,
  items,
  color,
  models,
}: {
  title: string
  items: BallStatItem[]
  color: 'red' | 'blue'
  models: PredictionModel[]
}) {
  return (
    <div className="summary-list">
      <h3>{title}</h3>
      <div className="summary-list__items">
        {items.map((item) => (
          <article key={`${title}-${item.ball}`} className="ball-stat-card">
            <div className="ball-stat-card__ball">
              <NumberBall value={item.ball} color={color} />
            </div>
            <p className="ball-stat-card__appearance">
              出现 {item.appearanceCount}/{item.totalGroupCount}
            </p>
            <SummaryHitTooltipBadge title={title} item={item} models={models} />
            <div className="ball-stat-card__bar">
              <div className="ball-stat-card__bar-fill" style={{ width: `${Math.round(item.appearanceRatio * 100)}%` }} />
            </div>
            <p className="ball-stat-card__ratio">命中占比 {Math.round(item.appearanceRatio * 100)}%</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function SummaryHitTooltipBadge({
  title,
  item,
  models,
}: {
  title: string
  item: BallStatItem
  models: PredictionModel[]
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      className="ball-stat-card__badge-shell"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button className="ball-stat-card__badge" type="button">
        命中 {item.matchedModelCount} 个模型
      </button>
      {isOpen ? (
        <div className="ball-stat-card__tooltip" role="tooltip">
          <p className="ball-stat-card__tooltip-title">命中模型</p>
          <div className="ball-stat-card__tooltip-models">
            {models.map((model) => {
              const isMatched = item.matchedModelIds.includes(model.model_id)
              return (
                <span
                  key={`${title}-${item.ball}-${model.model_id}`}
                  className={clsx('ball-stat-card__tooltip-model', isMatched && 'is-hit')}
                >
                  {model.model_name}
                </span>
              )
            })}
          </div>
        </div>
      ) : null}
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

function ModelFilterPanel({
  modelNameQuery,
  onModelNameQueryChange,
  filteredCount,
  totalCount,
  onClear,
  availableProviders,
  selectedProviders,
  onToggleProvider,
  availableTags,
  selectedTags,
  onToggleTag,
  selectedScoreRange,
  onSelectScoreRange,
}: {
  modelNameQuery: string
  onModelNameQueryChange: (value: string) => void
  filteredCount: number
  totalCount: number
  onClear: () => void
  availableProviders: string[]
  selectedProviders: string[]
  onToggleProvider: (provider: string) => void
  availableTags: string[]
  selectedTags: string[]
  onToggleTag: (tag: string) => void
  selectedScoreRange: ModelListScoreRange
  onSelectScoreRange: (value: ModelListScoreRange) => void
}) {
  return (
    <div className="model-filter-panel">
      <div className="model-filter-panel__top">
        <label className="model-filter-panel__search">
          <span>名称搜索</span>
          <input
            type="text"
            placeholder="按模型名称或ID筛选"
            value={modelNameQuery}
            onChange={(event) => onModelNameQueryChange(event.target.value)}
          />
        </label>
        <div className="model-filter-panel__summary">
          <span>
            已显示 {filteredCount} / {totalCount} 个模型
          </span>
          <button className="ghost-button" onClick={onClear}>
            清空筛选
          </button>
        </div>
      </div>

      <div className="model-filter-panel__grid">
        <div className="model-filter-panel__group">
          <strong>模型商</strong>
          <div className="filter-chip-group">
            {availableProviders.map((provider) => (
              <button
                key={provider}
                className={clsx('filter-chip', selectedProviders.includes(provider) && 'is-active')}
                onClick={() => onToggleProvider(provider)}
              >
                {provider}
              </button>
            ))}
          </div>
        </div>

        <div className="model-filter-panel__group">
          <strong>Tag</strong>
          <div className="filter-chip-group">
            {availableTags.length ? (
              availableTags.map((tag) => (
                <button
                  key={tag}
                  className={clsx('filter-chip', selectedTags.includes(tag) && 'is-active')}
                  onClick={() => onToggleTag(tag)}
                >
                  {tag}
                </button>
              ))
            ) : (
              <span className="model-filter-panel__empty">暂无 tag</span>
            )}
          </div>
        </div>

        <div className="model-filter-panel__group">
          <strong>近期评分</strong>
          <div className="filter-chip-group">
            {MODEL_SCORE_FILTERS.map((option) => (
              <button
                key={option.value}
                className={clsx('filter-chip', selectedScoreRange === option.value && 'is-active')}
                onClick={() => onSelectScoreRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function HistoryRecordCard({
  record,
  visibleModelIds,
}: {
  record: PredictionsHistoryListRecord
  visibleModelIds: string[]
}) {
  const [expanded, setExpanded] = useState(false)
  const detailQuery = useQuery({
    queryKey: ['predictions-history-detail', record.target_period],
    enabled: expanded,
    queryFn: async () => normalizePredictionsHistory(await apiClient.getPredictionsHistoryDetail(record.target_period)),
  })
  const detailRecord = detailQuery.data?.predictions_history?.[0]
    ? {
        ...detailQuery.data.predictions_history[0],
        models: visibleModelIds.length
          ? detailQuery.data.predictions_history[0].models.filter((model) => visibleModelIds.includes(model.model_id))
          : detailQuery.data.predictions_history[0].models,
      }
    : null

  return (
    <article className="history-record-card">
      <div className="history-record-card__header">
        <div>
          <p className="history-record-card__eyebrow">第 {record.target_period} 期</p>
          <h3>开奖回溯</h3>
        </div>
        <div className="history-record-card__actions">
          <span>{record.actual_result?.date || '-'}</span>
          <button className="ghost-button" onClick={() => setExpanded((value) => !value)}>
            {expanded ? '收起详情' : '展开详情'}
          </button>
        </div>
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
      {expanded ? (
        <div className="history-record-card__detail">
          {detailQuery.isLoading ? <div className="state-shell">正在加载该期预测详情...</div> : null}
          {detailQuery.error instanceof Error ? (
            <div className="state-shell state-shell--error">详情加载失败：{detailQuery.error.message}</div>
          ) : null}
          {!detailQuery.isLoading && !detailQuery.error && detailRecord ? (
            <div className="history-record-card__detail-list">
              {detailRecord.models.map((model) => (
                <section key={`${record.target_period}-${model.model_id}-detail`} className="history-record-card__detail-model">
                  <div className="history-record-card__detail-header">
                    <div>
                      <strong>{model.model_name}</strong>
                      <p>{model.model_provider}</p>
                    </div>
                    <span>最佳命中 {model.best_hit_count || 0}</span>
                  </div>
                  <div className="detail-group-list">
                    {model.predictions.map((group) => (
                      <PredictionGroupCard
                        key={`${record.target_period}-${model.model_id}-${group.group_id}`}
                        group={group}
                        actualResult={record.actual_result}
                        grayMisses
                        emphasizeHitTier
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
