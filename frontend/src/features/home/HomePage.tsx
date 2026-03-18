import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useLocation, useNavigate } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { formatDateTimeLocal } from '../../shared/lib/format'
import { loadPinnedModels, loadSelectedLottery, savePinnedModels, saveSelectedLottery } from '../../shared/lib/storage'
import { useHomeData } from './hooks/useHomeData'
import { useHomeModelFilters } from './hooks/useHomeModelFilters'
import {
  type BallStatItem,
  buildBlueFrequencyChart,
  buildOddEvenChart,
  getPredictionPlayTypeLabel,
  buildRedFrequencyChart,
  resolveHistoryFallbackState,
  buildSumTrendChart,
  compareNumbers,
  getActualResult,
  type ModelScore,
  type ModelListScoreRange,
  normalizePredictionsHistory,
} from './lib/home'
import {
  buildBallRange,
  buildSimulationMatches,
  calculateAmount,
  calculateBetCount,
  createRandomSelection,
  normalizeSimulationTicket,
  type SimulationPlayType,
  type SimulationSelection,
} from './lib/simulation'
import type { LotteryCode, LotteryDraw, PredictionGroup, PredictionModel, PredictionsHistoryListRecord, SimulationTicketRecord } from '../../shared/types/api'
import type { HomeDashboardState, HomeDetailRouteState, HomeModelView, HomeTab, ScoreViewSortDirection, ScoreViewSortKey } from './navigation'

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

function HomeScoreIcon() {
  return (
    <HomeSvgIcon>
      <path d="M4 15.5h12" />
      <path d="M5.5 13V9.5" />
      <path d="M10 13V6.5" />
      <path d="M14.5 13V4.5" />
    </HomeSvgIcon>
  )
}

function HomeFilterIcon() {
  return (
    <HomeSvgIcon>
      <path d="M4 5.5h12" />
      <path d="M6.8 10h6.4" />
      <path d="M8.8 14.5h2.4" />
    </HomeSvgIcon>
  )
}

function HomeResetIcon() {
  return (
    <HomeSvgIcon>
      <path d="M16 10a6 6 0 1 1-1.5-4" />
      <path d="M16 5v3.5h-3.5" />
    </HomeSvgIcon>
  )
}

function HomePlayIcon() {
  return (
    <HomeSvgIcon>
      <path d="M7 5.5v9l7-4.5-7-4.5Z" />
      <path d="M4 17h12" />
    </HomeSvgIcon>
  )
}

function PinIndicatorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7.2 4.2h5.6" />
      <path d="M8 4.2v4l-2.1 2.2h8.2L12 8.2v-4" />
      <path d="M10 10.4v5.4" />
      <path d="M10 15.8 8.6 17.2" />
    </svg>
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

type HistoryModelStatView = {
  model_id: string
  model_name: string
  periods: number
  winning_periods: number
  bet_count: number
  winning_bet_count: number
  cost_amount: number
  prize_amount: number
  win_rate_by_period: number
  win_rate_by_bet: number
  score_profile?: PredictionModel['score_profile']
}

type HistoryModelRef = {
  model_id: string
  model_name: string
}

function formatCurrency(value: number | undefined) {
  return `${Math.round(value || 0).toLocaleString('zh-CN')} 元`
}

function formatPercent(value: number | undefined) {
  return `${Math.round((value || 0) * 100)}%`
}

function buildHistoryModelStats(records: PredictionsHistoryListRecord[], models: HistoryModelRef[]): HistoryModelStatView[] {
  const stats = new Map<string, HistoryModelStatView>()

  for (const record of records) {
    for (const model of record.models || []) {
      const existing = stats.get(model.model_id) || {
        model_id: model.model_id,
        model_name: model.model_name,
        periods: 0,
        winning_periods: 0,
        bet_count: 0,
        winning_bet_count: 0,
        cost_amount: 0,
        prize_amount: 0,
        win_rate_by_period: 0,
        win_rate_by_bet: 0,
        score_profile: model.score_profile,
      }

      existing.periods += 1
      existing.winning_periods += model.hit_period_win ? 1 : 0
      existing.bet_count += model.bet_count || 0
      existing.winning_bet_count += model.winning_bet_count || 0
      existing.cost_amount += model.cost_amount || 0
      existing.prize_amount += model.prize_amount || 0
      existing.score_profile = model.score_profile || existing.score_profile
      stats.set(model.model_id, existing)
    }
  }

  return models
    .map((model) => stats.get(model.model_id))
    .filter((item): item is HistoryModelStatView => Boolean(item))
    .map((item) => ({
      ...item,
      win_rate_by_period: item.periods ? item.winning_periods / item.periods : 0,
      win_rate_by_bet: item.bet_count ? item.winning_bet_count / item.bet_count : 0,
    }))
    .sort(
      (left, right) =>
        (right.score_profile?.overall_score || 0) - (left.score_profile?.overall_score || 0) ||
        right.prize_amount - left.prize_amount ||
        right.win_rate_by_period - left.win_rate_by_period,
    )
}

export function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const restoredState = (location.state as HomeDetailRouteState | null)?.dashboardState
  const [activeTab, setActiveTab] = useState<HomeTab>(restoredState?.activeTab || 'prediction')
  const [activeSection, setActiveSection] = useState<'models' | 'weights'>(restoredState?.activeSection || 'models')
  const [modelListView, setModelListView] = useState<HomeModelView>(restoredState?.modelListView || 'list')
  const [scoreViewSortKey, setScoreViewSortKey] = useState<ScoreViewSortKey>(restoredState?.scoreViewSortKey || 'overallScore')
  const [scoreViewSortDirection, setScoreViewSortDirection] = useState<ScoreViewSortDirection>(restoredState?.scoreViewSortDirection || 'desc')
  const [predictionLimit, setPredictionLimit] = useState(restoredState?.predictionLimit || HISTORY_BATCH_SIZE)
  const [lotteryPage, setLotteryPage] = useState(restoredState?.lotteryPage || 1)
  const [selectedLottery, setSelectedLottery] = useState<LotteryCode>(() => loadSelectedLottery())
  const [pinnedModelIds, setPinnedModelIds] = useState<string[]>(() => loadPinnedModels(loadSelectedLottery()))
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null)
  const [historyPeriodQuery, setHistoryPeriodQuery] = useState(restoredState?.historyPeriodQuery || '')
  const [commonOnly, setCommonOnly] = useState(Boolean(restoredState?.commonOnly))
  const [historyFallbackSignature, setHistoryFallbackSignature] = useState<string | null>(null)
  const [weightedSummary] = useState(true)
  const modelSectionRef = useRef<HTMLElement | null>(null)
  const weightsSectionRef = useRef<HTMLElement | null>(null)
  const hasRestoredScrollRef = useRef(false)

  const { currentPredictions, lotteryCharts, predictionsHistory, pagedLotteryHistory } = useHomeData(
    selectedLottery,
    predictionLimit,
    lotteryPage,
    LOTTERY_PAGE_SIZE,
  )
  const lotteryLabel = selectedLottery === 'pl3' ? '排列3' : '大乐透'

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
  } = useHomeModelFilters(models, history, validPinnedModelIds, {
    isModelFilterOpen: restoredState?.isModelFilterOpen,
    modelNameQuery: restoredState?.modelNameQuery,
    selectedProviders: restoredState?.selectedProviders,
    selectedTags: restoredState?.selectedTags,
    selectedScoreRange: restoredState?.selectedScoreRange,
  })
  const actualResult = getActualResult(chartDraws, currentPredictions.data?.target_period || '')

  useEffect(() => {
    savePinnedModels(validPinnedModelIds, selectedLottery)
  }, [selectedLottery, validPinnedModelIds])

  useEffect(() => {
    saveSelectedLottery(selectedLottery)
    setPinnedModelIds(loadPinnedModels(selectedLottery))
  }, [selectedLottery])

  useEffect(() => {
    setHistoryFallbackSignature(null)
  }, [selectedLottery])

  useEffect(() => {
    if (hasRestoredScrollRef.current || typeof restoredState?.scrollY !== 'number') return
    hasRestoredScrollRef.current = true
    const frameId = requestAnimationFrame(() => window.scrollTo({ top: restoredState.scrollY }))
    return () => cancelAnimationFrame(frameId)
  }, [restoredState?.scrollY])

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

  const historyAllModelRefs = useMemo<HistoryModelRef[]>(() => {
    const references = new Map<string, HistoryModelRef>()
    for (const stat of history?.model_stats || []) {
      if (!stat.model_id) continue
      references.set(stat.model_id, {
        model_id: stat.model_id,
        model_name: stat.model_name || stat.model_id,
      })
    }
    for (const record of history?.predictions_history || []) {
      for (const model of record.models || []) {
        if (!model.model_id) continue
        references.set(model.model_id, {
          model_id: model.model_id,
          model_name: model.model_name || model.model_id,
        })
      }
    }
    return [...references.values()]
  }, [history])
  const historyFilterSignature = useMemo(
    () =>
      JSON.stringify({
        modelNameQuery: modelNameQuery.trim(),
        selectedProviders: [...selectedProviders].sort(),
        selectedTags: [...selectedTags].sort(),
        selectedScoreRange,
      }),
    [modelNameQuery, selectedProviders, selectedTags, selectedScoreRange],
  )
  const historyFallbackEnabled = historyFallbackSignature === historyFilterSignature
  const hasManualModelFilter = Boolean(
    modelNameQuery.trim() ||
      selectedProviders.length ||
      selectedTags.length ||
      selectedScoreRange !== 'all',
  )
  const { useHistoryFallbackModels, needsHistoryFallbackPrompt } = resolveHistoryFallbackState({
    hasHistoryRecords: Boolean(history?.predictions_history?.length),
    hasManualModelFilter,
    hasCurrentModels: models.length > 0,
    filteredModelIds,
    historyModelIds: historyAllModelRefs.map((item) => item.model_id),
    historyFallbackEnabled,
  })
  const historyVisibleModelIds = useMemo(
    () => (useHistoryFallbackModels ? historyAllModelRefs.map((item) => item.model_id) : filteredModelIds),
    [filteredModelIds, historyAllModelRefs, useHistoryFallbackModels],
  )
  const historyVisibleModels = useMemo<HistoryModelRef[]>(
    () =>
      useHistoryFallbackModels
        ? historyAllModelRefs
        : filteredModels.map((model) => ({ model_id: model.model_id, model_name: model.model_name })),
    [filteredModels, historyAllModelRefs, useHistoryFallbackModels],
  )

  const { selectedSummaryIds, summary, filteredHistory, historyHitTrend } = buildHistoryState(
    historyPeriodQuery,
    commonOnly,
    weightedSummary,
    historyVisibleModelIds,
  )
  const summaryModels = filteredModels.filter((model) => selectedSummaryIds.includes(model.model_id))
  const historyModelStats = buildHistoryModelStats(filteredHistory, historyVisibleModels)
  const totalLotteryPages = Math.max(1, Math.ceil((pagedLotteryHistory.data?.total_count || 0) / LOTTERY_PAGE_SIZE))
  const redChart = buildRedFrequencyChart(chartDraws)
  const blueChart = buildBlueFrequencyChart(chartDraws)
  const oddEvenChart = buildOddEvenChart(chartDraws)
  const sumTrendChart = buildSumTrendChart(chartDraws)
  const scoreViewModels = useMemo(
    () => sortModelsForScoreView(filteredModels, modelScores, validPinnedModelIds, scoreViewSortKey, scoreViewSortDirection),
    [filteredModels, modelScores, validPinnedModelIds, scoreViewSortDirection, scoreViewSortKey],
  )

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
    return <div className="state-shell">正在加载{lotteryLabel}预测控制台...</div>
  }

  if (error) {
    return <div className="state-shell state-shell--error">加载失败：{error.message}</div>
  }

  function openModelDetail(modelId: string) {
    const dashboardState: HomeDashboardState = {
      activeTab,
      activeSection,
      modelListView,
      scoreViewSortKey,
      scoreViewSortDirection,
      predictionLimit,
      lotteryPage,
      historyPeriodQuery,
      commonOnly,
      isModelFilterOpen,
      modelNameQuery,
      selectedProviders,
      selectedTags,
      selectedScoreRange,
      scrollY: window.scrollY,
    }

    navigate(`/dashboard/models/${modelId}`, {
      state: {
        dashboardState,
      } satisfies HomeDetailRouteState,
    })
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <p className="hero-panel__eyebrow">Prediction Command Center</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['dlt', 'pl3'] as LotteryCode[]).map((code) => (
              <button
                key={code}
                type="button"
                className={clsx('chip-button', selectedLottery === code && 'is-active')}
                onClick={() => setSelectedLottery(code)}
              >
                {code === 'pl3' ? '排列3' : '大乐透'}
              </button>
            ))}
          </div>
          <h2 className="hero-panel__title">{lotteryLabel}AI预测</h2>
          <p className="hero-panel__description">
            当前目标期为 <strong>{currentPredictions.data?.target_period || '-'}</strong>，下期开奖日{' '}
            <strong>{lotteryCharts.data?.next_draw?.next_date_display || '-'}</strong>。
          </p>
        </div>
        <div className="hero-panel__summary" aria-label="当前预测摘要">
          <article className="hero-panel__summary-card">
            <span>目标期号</span>
            <strong>{currentPredictions.data?.target_period || '-'}</strong>
          </article>
          <article className="hero-panel__summary-card">
            <span>预测日期</span>
            <strong>{currentPredictions.data?.prediction_date || '-'}</strong>
          </article>
          <article className="hero-panel__summary-card">
            <span>开奖状态</span>
            <strong>{actualResult ? '已开奖' : '待开奖'}</strong>
            <small>{actualResult ? '已可查看命中结果' : '等待官方开奖结果'}</small>
          </article>
          <article className="hero-panel__summary-card">
            <span>模型覆盖</span>
            <strong>{models.length}</strong>
            <small>当前参与预测的活跃模型</small>
          </article>
        </div>
      </section>

      <section className="tab-strip">
        <button className={clsx('tab-strip__item', activeTab === 'prediction' && 'is-active')} onClick={() => setActiveTab('prediction')}>
          预测总览
        </button>
        <button className={clsx('tab-strip__item', activeTab === 'simulation' && 'is-active')} onClick={() => setActiveTab('simulation')}>
          模拟试玩
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
              预测统计
            </button>
          </aside>

          <div className="page-section dashboard-content">
            <section ref={modelSectionRef} data-section="models">
              <StatusCard
                title="模型列表"
                subtitle="列表页和卡片视图先看号码，评分视图更直观比较各模型评分，详情再看完整能力画像。"
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
                      <HomeIconButton
                        label="评分视图"
                        icon={<HomeScoreIcon />}
                        active={modelListView === 'score'}
                        onClick={() => setModelListView('score')}
                      />
                    </div>
                    <button
                      className={clsx('icon-button', isModelFilterOpen && 'is-active')}
                      onClick={() => setIsModelFilterOpen((value) => !value)}
                      aria-label="筛选"
                      title="筛选"
                      type="button"
                    >
                      <HomeFilterIcon />
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
                          score={modelScores[model.model_id]}
                          isPinned={validPinnedModelIds.includes(model.model_id)}
                          actualResult={actualResult}
                          isActionMenuOpen={activeActionMenuId === model.model_id}
                          onToggleActionMenu={() =>
                            setActiveActionMenuId((previous) => (previous === model.model_id ? null : model.model_id))
                          }
                          onPin={() => togglePinned(model.model_id)}
                          onDetail={() => openModelDetail(model.model_id)}
                        />
                      ))
                    ) : (
                      <div className="state-shell">没有符合当前筛选条件的模型。</div>
                    )}
                  </div>
                ) : modelListView === 'score' ? (
                  <ModelScoreComparisonTable
                    models={scoreViewModels}
                    modelScores={modelScores}
                    validPinnedModelIds={validPinnedModelIds}
                    sortKey={scoreViewSortKey}
                    sortDirection={scoreViewSortDirection}
                    onSortChange={(key) => {
                      if (key === scoreViewSortKey) {
                        setScoreViewSortDirection((value) => (value === 'desc' ? 'asc' : 'desc'))
                        return
                      }
                      setScoreViewSortKey(key)
                      setScoreViewSortDirection('desc')
                    }}
                    onDetail={openModelDetail}
                  />
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
                    onDetail={openModelDetail}
                  />
                )}
              </StatusCard>
            </section>

            <section ref={weightsSectionRef} data-section="weights">
              <StatusCard
                title="预测统计"
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

      {activeTab === 'simulation' ? <SimulationPlayground lotteryCode={selectedLottery} draws={chartDraws} targetPeriod={currentPredictions.data?.target_period || ''} /> : null}

      {activeTab === 'history' ? (
        <div className="page-section">
          <ChartCard title="模型历史命中趋势">
            {historyVisibleModels.length && historyHitTrend.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={historyHitTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {historyVisibleModels.map((model, index) => (
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
              <button
                className={clsx('icon-button', isModelFilterOpen && 'is-active')}
                onClick={() => setIsModelFilterOpen((value) => !value)}
                aria-label="筛选"
                title="筛选"
                type="button"
              >
                <HomeFilterIcon />
              </button>
              <input
                className="search-input"
                value={historyPeriodQuery}
                onChange={(event) => setHistoryPeriodQuery(event.target.value.replace(/[^\d]/g, ''))}
                placeholder="输入期号过滤"
              />
            </div>
            {needsHistoryFallbackPrompt ? (
              <div className="state-shell">
                当前筛选模型在历史回溯中暂无匹配记录。
                <button className="ghost-button" type="button" onClick={() => setHistoryFallbackSignature(historyFilterSignature)}>
                  展示全部历史模型
                </button>
              </div>
            ) : null}

            <div className="history-card-list">
              {historyModelStats.length ? (
                <div className="history-stats-grid">
                  {historyModelStats.map((item) => (
                    <article key={item.model_id} className="history-stat-card">
                      <div className="history-stat-card__header">
                        <strong>{item.model_name}</strong>
                        <span>综合分 {item.score_profile?.overall_score || 0}</span>
                      </div>
                      <div className="history-stat-card__metrics">
                        <span>按注 {item.score_profile?.per_bet_score || 0}</span>
                        <span>按期 {item.score_profile?.per_period_score || 0}</span>
                        <span>按期中奖率 {formatPercent(item.win_rate_by_period)}</span>
                        <span>按注中奖率 {formatPercent(item.win_rate_by_bet)}</span>
                        <span>近期/长期 {item.score_profile?.recent_score || 0}/{item.score_profile?.long_term_score || 0}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              {!historyVisibleModels.length ? <div className="state-shell">当前筛选条件下没有可展示的模型。</div> : null}
              {historyVisibleModels.length && !filteredHistory.length ? <div className="state-shell">当前筛选条件下没有历史回溯记录。</div> : null}
              {filteredHistory.map((record) => (
                <HistoryRecordCard
                  key={`${selectedLottery}-${record.target_period}`}
                  record={record}
                  lotteryCode={selectedLottery}
                  visibleModelIds={historyVisibleModelIds}
                />
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
                  {pagedDraws.map((draw) => {
                    const mainBalls = selectedLottery === 'pl3' ? (draw.digits?.length ? draw.digits : draw.red_balls) : draw.red_balls
                    return (
                      <tr key={draw.period}>
                        <td>{draw.period}</td>
                        <td>{draw.date}</td>
                        <td>
                          <div className="number-row number-row--tight">
                            {mainBalls.map((ball, index) => (
                              <NumberBall key={`${draw.period}-r-${index}-${ball}`} value={ball} color="red" size="sm" />
                            ))}
                            {selectedLottery === 'dlt' ? <span className="number-row__divider" /> : null}
                            {selectedLottery === 'dlt'
                              ? draw.blue_balls.map((ball, index) => (
                                  <NumberBall key={`${draw.period}-b-${index}-${ball}`} value={ball} color="blue" size="sm" />
                                ))
                              : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
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
    </div>
  )
}

function SimulationPlayground({ lotteryCode, draws, targetPeriod }: { lotteryCode: LotteryCode; draws: LotteryDraw[]; targetPeriod: string }) {
  const queryClient = useQueryClient()
  const [selectedFront, setSelectedFront] = useState<string[]>([])
  const [selectedBack, setSelectedBack] = useState<string[]>([])
  const [pl3PlayType, setPl3PlayType] = useState<'direct' | 'group3' | 'group6'>('direct')
  const [selectedHundreds, setSelectedHundreds] = useState<string[]>([])
  const [selectedTens, setSelectedTens] = useState<string[]>([])
  const [selectedUnits, setSelectedUnits] = useState<string[]>([])
  const [selectedGroupNumbers, setSelectedGroupNumbers] = useState<string[]>([])
  const [matchWindow, setMatchWindow] = useState<30 | 50>(30)
  const [showMatches, setShowMatches] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const frontOptions = useMemo(() => buildBallRange(35), [])
  const backOptions = useMemo(() => buildBallRange(12), [])
  const digitOptions = useMemo(() => buildBallRange(10, 0), [])
  const lotteryLabel = lotteryCode === 'pl3' ? '排列3' : '大乐透'
  const playTypeLabel = pl3PlayType === 'direct' ? '直选' : pl3PlayType === 'group3' ? '组选3' : '组选6'
  const selection = useMemo<SimulationSelection>(() => {
    const playType: SimulationPlayType = lotteryCode === 'dlt' ? 'dlt' : pl3PlayType
    return {
      lotteryCode,
      playType,
      frontNumbers: selectedFront,
      backNumbers: selectedBack,
      directHundreds: selectedHundreds,
      directTens: selectedTens,
      directUnits: selectedUnits,
      groupNumbers: selectedGroupNumbers,
    }
  }, [lotteryCode, pl3PlayType, selectedFront, selectedBack, selectedHundreds, selectedTens, selectedUnits, selectedGroupNumbers])
  const betCount = useMemo(() => calculateBetCount(selection), [selection])
  const amount = useMemo(() => calculateAmount(selection), [selection])
  const canSubmit = betCount > 0
  const matches = useMemo(
    () => (showMatches && canSubmit ? buildSimulationMatches(selection, draws, matchWindow) : []),
    [canSubmit, draws, matchWindow, selection, showMatches],
  )
  const ticketsQuery = useQuery({
    queryKey: ['simulation-tickets', lotteryCode],
    queryFn: async () => (await apiClient.getSimulationTickets(lotteryCode)).tickets.map(normalizeSimulationTicket),
  })
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.createSimulationTicket({
        lottery_code: lotteryCode,
        play_type: lotteryCode === 'dlt' ? 'dlt' : pl3PlayType,
        front_numbers: selectedFront,
        back_numbers: selectedBack,
        direct_hundreds: selectedHundreds,
        direct_tens: selectedTens,
        direct_units: selectedUnits,
        group_numbers: selectedGroupNumbers,
      })
      return normalizeSimulationTicket(response.ticket)
    },
    onSuccess: async () => {
      setMessage('投注方案已保存。')
      await queryClient.invalidateQueries({ queryKey: ['simulation-tickets', lotteryCode] })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: async (ticketId: number) => apiClient.deleteSimulationTicket(ticketId, lotteryCode),
    onSuccess: async () => {
      setMessage('已删除保存方案。')
      await queryClient.invalidateQueries({ queryKey: ['simulation-tickets', lotteryCode] })
    },
  })

  useEffect(() => {
    setShowMatches(false)
    setMessage(null)
  }, [lotteryCode, pl3PlayType, selectedFront, selectedBack, selectedHundreds, selectedTens, selectedUnits, selectedGroupNumbers])

  useEffect(() => {
    if (lotteryCode === 'dlt') return
    setSelectedFront([])
    setSelectedBack([])
    setPl3PlayType('direct')
    setSelectedHundreds([])
    setSelectedTens([])
    setSelectedUnits([])
    setSelectedGroupNumbers([])
  }, [lotteryCode])

  function toggleSelection(value: string, zone: 'front' | 'back') {
    const updater = zone === 'front' ? setSelectedFront : setSelectedBack
    updater((previous) => (previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value].sort()))
  }

  function togglePositionSelection(value: string, position: 'hundreds' | 'tens' | 'units') {
    const updater = position === 'hundreds' ? setSelectedHundreds : position === 'tens' ? setSelectedTens : setSelectedUnits
    updater((previous) => (previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value].sort()))
  }

  function toggleGroupSelection(value: string) {
    setSelectedGroupNumbers((previous) => (previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value].sort()))
  }

  function handleRandomPick() {
    const randomSelection = createRandomSelection(lotteryCode, lotteryCode === 'dlt' ? 'dlt' : pl3PlayType)
    setSelectedFront(randomSelection.frontNumbers)
    setSelectedBack(randomSelection.backNumbers)
    setSelectedHundreds(randomSelection.directHundreds)
    setSelectedTens(randomSelection.directTens)
    setSelectedUnits(randomSelection.directUnits)
    setSelectedGroupNumbers(randomSelection.groupNumbers)
    setMessage('已为你生成一组随机机选号码。')
  }

  function handleClear() {
    setSelectedFront([])
    setSelectedBack([])
    setSelectedHundreds([])
    setSelectedTens([])
    setSelectedUnits([])
    setSelectedGroupNumbers([])
    setMessage('已清空当前选号。')
  }

  function handleCompare() {
    if (!canSubmit) return
    setShowMatches(true)
    setMessage(`已按近 ${matchWindow} 期历史开奖完成匹配。`)
  }

  function handleSave() {
    if (!canSubmit) return
    setMessage(null)
    saveMutation.mutate()
  }

  return (
    <div className="page-section simulation-page">
      <StatusCard
        title="模拟试玩"
        subtitle={`当前按目标期 ${targetPeriod || '-'} 的${lotteryLabel}选号策略模拟投注。`}
        actions={
          <div className="toolbar-inline">
            <button className="ghost-button" type="button" onClick={handleRandomPick}>
              <HomePlayIcon />
              随机机选
            </button>
            <button className="ghost-button" type="button" onClick={handleClear}>
              <HomeResetIcon />
              清空
            </button>
          </div>
        }
      >
        <div className="simulation-layout">
          {lotteryCode === 'dlt' ? (
            <>
              <section className="simulation-section">
                <div className="simulation-section__header">
                  <div>
                    <p className="hero-panel__eyebrow">Front Zone</p>
                    <h3>前区选号</h3>
                  </div>
                  <span>至少 5 个，可复式</span>
                </div>
                <div className="simulation-ball-grid" aria-label="前区选号">
                  {frontOptions.map((ball) => (
                    <button
                      key={`front-${ball}`}
                      type="button"
                      className={clsx('simulation-ball', 'is-front', selectedFront.includes(ball) && 'is-selected')}
                      onClick={() => toggleSelection(ball, 'front')}
                      aria-label={`前区 ${ball}`}
                    >
                      {ball}
                    </button>
                  ))}
                </div>
              </section>

              <section className="simulation-section">
                <div className="simulation-section__header">
                  <div>
                    <p className="hero-panel__eyebrow">Back Zone</p>
                    <h3>后区选号</h3>
                  </div>
                  <span>至少 2 个，可复式</span>
                </div>
                <div className="simulation-ball-grid" aria-label="后区选号">
                  {backOptions.map((ball) => (
                    <button
                      key={`back-${ball}`}
                      type="button"
                      className={clsx('simulation-ball', 'is-back', selectedBack.includes(ball) && 'is-selected')}
                      onClick={() => toggleSelection(ball, 'back')}
                      aria-label={`后区 ${ball}`}
                    >
                      {ball}
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="simulation-section">
                <div className="simulation-section__header">
                  <div>
                    <p className="hero-panel__eyebrow">Play Type</p>
                    <h3>玩法切换</h3>
                  </div>
                  <span>{playTypeLabel}</span>
                </div>
                <div className="tab-strip" role="tablist" aria-label="排列3玩法切换">
                  <button className={clsx('tab-strip__item', pl3PlayType === 'direct' && 'is-active')} type="button" onClick={() => setPl3PlayType('direct')}>
                    直选
                  </button>
                  <button className={clsx('tab-strip__item', pl3PlayType === 'group3' && 'is-active')} type="button" onClick={() => setPl3PlayType('group3')}>
                    组选3
                  </button>
                  <button className={clsx('tab-strip__item', pl3PlayType === 'group6' && 'is-active')} type="button" onClick={() => setPl3PlayType('group6')}>
                    组选6
                  </button>
                </div>
              </section>

              {pl3PlayType === 'direct' ? (
                <>
                  <section className="simulation-section">
                    <div className="simulation-section__header">
                      <div>
                        <p className="hero-panel__eyebrow">Hundreds</p>
                        <h3>百位选号</h3>
                      </div>
                      <span>至少 1 个</span>
                    </div>
                    <div className="simulation-ball-grid" aria-label="百位选号">
                      {digitOptions.map((ball) => (
                        <button
                          key={`hundreds-${ball}`}
                          type="button"
                          className={clsx('simulation-ball', 'is-front', selectedHundreds.includes(ball) && 'is-selected')}
                          onClick={() => togglePositionSelection(ball, 'hundreds')}
                          aria-label={`百位 ${ball}`}
                        >
                          {ball}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="simulation-section">
                    <div className="simulation-section__header">
                      <div>
                        <p className="hero-panel__eyebrow">Tens</p>
                        <h3>十位选号</h3>
                      </div>
                      <span>至少 1 个</span>
                    </div>
                    <div className="simulation-ball-grid" aria-label="十位选号">
                      {digitOptions.map((ball) => (
                        <button
                          key={`tens-${ball}`}
                          type="button"
                          className={clsx('simulation-ball', 'is-front', selectedTens.includes(ball) && 'is-selected')}
                          onClick={() => togglePositionSelection(ball, 'tens')}
                          aria-label={`十位 ${ball}`}
                        >
                          {ball}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="simulation-section">
                    <div className="simulation-section__header">
                      <div>
                        <p className="hero-panel__eyebrow">Units</p>
                        <h3>个位选号</h3>
                      </div>
                      <span>至少 1 个</span>
                    </div>
                    <div className="simulation-ball-grid" aria-label="个位选号">
                      {digitOptions.map((ball) => (
                        <button
                          key={`units-${ball}`}
                          type="button"
                          className={clsx('simulation-ball', 'is-front', selectedUnits.includes(ball) && 'is-selected')}
                          onClick={() => togglePositionSelection(ball, 'units')}
                          aria-label={`个位 ${ball}`}
                        >
                          {ball}
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <section className="simulation-section">
                  <div className="simulation-section__header">
                    <div>
                      <p className="hero-panel__eyebrow">Digits</p>
                      <h3>{pl3PlayType === 'group3' ? '组选3选号' : '组选6选号'}</h3>
                    </div>
                    <span>{pl3PlayType === 'group3' ? '至少 2 个' : '至少 3 个'}</span>
                  </div>
                  <div className="simulation-ball-grid" aria-label="组选选号">
                    {digitOptions.map((ball) => (
                      <button
                        key={`group-${ball}`}
                        type="button"
                        className={clsx('simulation-ball', 'is-front', selectedGroupNumbers.includes(ball) && 'is-selected')}
                        onClick={() => toggleGroupSelection(ball)}
                        aria-label={`组选 ${ball}`}
                      >
                        {ball}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="simulation-summary-bar">
          <div className="simulation-summary-bar__numbers">
            {lotteryCode === 'dlt' ? (
              <>
                <span>已选前区 {selectedFront.length} 个 / 后区 {selectedBack.length} 个</span>
                <div className="number-row number-row--tight">
                  {selectedFront.map((ball) => (
                    <NumberBall key={`selected-front-${ball}`} value={ball} color="red" size="sm" />
                  ))}
                  {selectedBack.length ? <span className="number-row__divider" /> : null}
                  {selectedBack.map((ball) => (
                    <NumberBall key={`selected-back-${ball}`} value={ball} color="blue" size="sm" />
                  ))}
                </div>
              </>
            ) : (
              <>
                <span>{`当前玩法：${playTypeLabel}`}</span>
                <div className="number-row number-row--tight">
                  {(pl3PlayType === 'direct' ? selectedHundreds : selectedGroupNumbers).map((ball) => (
                    <NumberBall key={`selected-a-${ball}`} value={ball} color="red" size="sm" />
                  ))}
                  {pl3PlayType === 'direct' ? <span className="number-row__divider" /> : null}
                  {pl3PlayType === 'direct'
                    ? selectedTens.map((ball) => <NumberBall key={`selected-b-${ball}`} value={ball} color="red" size="sm" />)
                    : null}
                  {pl3PlayType === 'direct' ? <span className="number-row__divider" /> : null}
                  {pl3PlayType === 'direct'
                    ? selectedUnits.map((ball) => <NumberBall key={`selected-c-${ball}`} value={ball} color="red" size="sm" />)
                    : null}
                </div>
              </>
            )}
          </div>
          <div className="simulation-summary-bar__meta">
            <strong>{`已选 ${betCount} 注，共 ${amount} 元`}</strong>
            {!canSubmit ? (
              <span>
                {lotteryCode === 'dlt'
                  ? '前区至少 5 个号码，后区至少 2 个号码后可投注。'
                  : pl3PlayType === 'direct'
                    ? '直选需百位、十位、个位各至少 1 个号码。'
                    : pl3PlayType === 'group3'
                      ? '组选3至少选择 2 个号码。'
                      : '组选6至少选择 3 个号码。'}
              </span>
            ) : (
              <span>已满足投注条件，可进行历史匹配或保存方案。</span>
            )}
          </div>
          <div className="simulation-summary-bar__actions">
            <div className="tab-strip" role="tablist" aria-label="历史匹配期数切换">
              <button className={clsx('tab-strip__item', matchWindow === 30 && 'is-active')} type="button" onClick={() => setMatchWindow(30)}>
                近30期
              </button>
              <button className={clsx('tab-strip__item', matchWindow === 50 && 'is-active')} type="button" onClick={() => setMatchWindow(50)}>
                近50期
              </button>
            </div>
            <button className="ghost-button" type="button" disabled={!canSubmit} onClick={handleCompare}>
              历史中奖匹配
            </button>
            <button className="primary-button" type="button" disabled={!canSubmit || saveMutation.isPending} onClick={handleSave}>
              {saveMutation.isPending ? '保存中...' : '保存方案'}
            </button>
          </div>
        </div>

        {message ? <div className="simulation-inline-message">{message}</div> : null}
      </StatusCard>

      <StatusCard title="历史匹配结果" subtitle={`将当前选号与近 ${matchWindow} 期开奖数据进行对比，展示命中号码和最高奖级。`}>
        {!showMatches ? (
          <div className="state-shell">点击“历史中奖匹配”后展示对比结果。</div>
        ) : matches.length ? (
          <div className="simulation-match-list">
            {matches.map((match) => (
              <article key={match.period} className="simulation-match-card">
                <div className="simulation-match-card__header">
                  <div>
                    <p className="history-record-card__eyebrow">第 {match.period} 期</p>
                    <strong>{match.topPrizeLevel}</strong>
                  </div>
                  <div className="simulation-match-card__meta">
                    <span>{match.date}</span>
                    <span>{match.totalWinningBets ? `中奖 ${match.totalWinningBets} 注` : '未中奖'}</span>
                  </div>
                </div>
                <div className="simulation-match-card__section">
                  <span>开奖号码</span>
                  <div className="number-row number-row--tight">
                    {(lotteryCode === 'dlt'
                      ? match.actualResult.red_balls
                      : (match.actualResult.digits || match.actualResult.red_balls)
                    ).map((ball, index) => (
                      <NumberBall
                        key={`${match.period}-actual-main-${index}-${ball}`}
                        value={ball}
                        color="red"
                        size="sm"
                        isHit={lotteryCode === 'dlt' ? match.redHits.includes(ball) : match.digitHits.includes(ball)}
                      />
                    ))}
                    {lotteryCode === 'dlt' ? <span className="number-row__divider" /> : null}
                    {lotteryCode === 'dlt'
                      ? match.actualResult.blue_balls.map((ball, index) => (
                          <NumberBall key={`${match.period}-actual-blue-${index}-${ball}`} value={ball} color="blue" size="sm" isHit={match.blueHits.includes(ball)} />
                        ))
                      : null}
                  </div>
                </div>
                <div className="simulation-match-card__section">
                  <span>
                    {lotteryCode === 'dlt'
                      ? `命中前区 ${match.redHits.length} 个 / 后区 ${match.blueHits.length} 个`
                      : `命中位置 ${match.digitHits.length} 个`}
                  </span>
                  <div className="simulation-prize-list">
                    {match.prizes.length ? match.prizes.map((prize) => <span key={`${match.period}-${prize.level}`}>{`${prize.level} × ${prize.count}`}</span>) : <span>未形成中奖注数</span>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="state-shell">当前历史数据不足以生成匹配结果。</div>
        )}
      </StatusCard>

      <StatusCard title="已保存方案" subtitle="保存后的投注方案会同步到当前账号，可在此查看和删除。">
        {ticketsQuery.isLoading ? (
          <div className="state-shell">正在读取已保存方案...</div>
        ) : ticketsQuery.data?.length ? (
          <div className="simulation-saved-list">
            {ticketsQuery.data.map((ticket) => (
              <SavedSimulationTicketCard
                key={ticket.id}
                lotteryCode={lotteryCode}
                ticket={ticket}
                onDelete={(ticketId) => deleteMutation.mutate(ticketId)}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <div className="state-shell">暂时还没有已保存方案。</div>
        )}
      </StatusCard>
    </div>
  )
}

function SavedSimulationTicketCard({
  lotteryCode,
  ticket,
  onDelete,
  isDeleting,
}: {
  lotteryCode: LotteryCode
  ticket: SimulationTicketRecord
  onDelete: (ticketId: number) => void
  isDeleting: boolean
}) {
  return (
    <article className="simulation-saved-card">
      <div className="simulation-saved-card__header">
        <div>
          <strong>{`方案 #${ticket.id}`}</strong>
          <span>{formatDateTimeLocal(ticket.created_at)}</span>
        </div>
        <button className="ghost-button" type="button" disabled={isDeleting} onClick={() => onDelete(ticket.id)}>
          删除
        </button>
      </div>
      <div className="simulation-saved-card__numbers">
        {lotteryCode === 'dlt' ? (
          <div className="number-row number-row--tight">
            {ticket.front_numbers.map((ball) => (
              <NumberBall key={`${ticket.id}-front-${ball}`} value={ball} color="red" size="sm" />
            ))}
            <span className="number-row__divider" />
            {ticket.back_numbers.map((ball) => (
              <NumberBall key={`${ticket.id}-back-${ball}`} value={ball} color="blue" size="sm" />
            ))}
          </div>
        ) : ticket.play_type === 'direct' ? (
          <div className="number-row number-row--tight">
            {(ticket.direct_hundreds || []).map((ball) => (
              <NumberBall key={`${ticket.id}-h-${ball}`} value={ball} color="red" size="sm" />
            ))}
            <span className="number-row__divider" />
            {(ticket.direct_tens || []).map((ball) => (
              <NumberBall key={`${ticket.id}-t-${ball}`} value={ball} color="red" size="sm" />
            ))}
            <span className="number-row__divider" />
            {(ticket.direct_units || []).map((ball) => (
              <NumberBall key={`${ticket.id}-u-${ball}`} value={ball} color="red" size="sm" />
            ))}
          </div>
        ) : (
          <div className="number-row number-row--tight">
            {(ticket.group_numbers || []).map((ball) => (
              <NumberBall key={`${ticket.id}-g-${ball}`} value={ball} color="red" size="sm" />
            ))}
          </div>
        )}
      </div>
      <div className="simulation-saved-card__footer">
        <span>{`${lotteryCode === 'dlt' ? '复式' : ticket.play_type === 'group3' ? '组选3' : ticket.play_type === 'group6' ? '组选6' : '直选'} · ${ticket.bet_count} 注`}</span>
        <span>{formatCurrency(ticket.amount)}</span>
      </div>
    </article>
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
  score?: ModelScore
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
          {isPinned ? (
            <span className="model-list-card__pin-indicator" aria-label="已置顶" title="已置顶">
              <PinIndicatorIcon />
            </span>
          ) : null}
          <button
            className="icon-button model-list-card__detail-button"
            onClick={onDetail}
            aria-label={`查看详情：${model.model_name}`}
            title="查看详情"
            type="button"
          >
            <DetailIcon />
          </button>
          <div className="action-menu">
            <button
              className="icon-button"
              onClick={onToggleActionMenu}
              aria-expanded={isActionMenuOpen}
              aria-label={`更多操作：${model.model_name}`}
              title="更多操作"
              type="button"
            >
              <MoreMenuIcon />
            </button>
            {isActionMenuOpen ? (
              <div className="action-menu__panel">
                <button className="action-menu__item" type="button" onClick={onPin}>
                  {isPinned ? '取消置顶' : '置顶'}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="model-list-card__groups">
        {model.predictions.map((group) => (
          <PredictionGroupCard key={group.group_id} group={group} actualResult={actualResult} compact />
        ))}
      </div>
      {score ? <ModelScoreInline score={score} /> : null}
      <div className="model-list-card__footer">
        <span>本期预测号码</span>
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
  modelScores: Record<string, ModelScore>
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
            <th>预测号码</th>
            <th>评分摘要</th>
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
                  <div className="home-model-list-table__groups">
                    {model.predictions.map((group) => (
                      <PredictionGroupCard key={group.group_id} group={group} actualResult={actualResult} compact />
                    ))}
                  </div>
                </td>
                <td>
                  <ModelScoreInline score={modelScores[model.model_id]} />
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

export function PredictionGroupCard({
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
  const playTypeLabel = getPredictionPlayTypeLabel(group, actualResult)
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
        {playTypeLabel !== '复式' ? <span className="prediction-group-card__play-type">{playTypeLabel}</span> : null}
        <span className="prediction-group-card__strategy">{group.strategy || 'AI 组合策略'}</span>
        {hit ? <strong className="prediction-group-card__hit">{hit.totalHits} 中</strong> : null}
      </div>
      <PredictionNumberRow group={group} actualResult={actualResult} grayMisses={grayMisses} compact={compact} />
      {group.prize_level ? (
        <div className="prediction-group-card__prize">
          <strong>{group.prize_level}</strong>
          <span>{formatCurrency(group.prize_amount)}</span>
          {group.prize_source === 'fallback' ? <small>固定奖兜底</small> : null}
          {group.prize_source === 'missing' ? <small>浮动奖待补全</small> : null}
        </div>
      ) : null}
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
  const isPl3Group = getPredictionPlayTypeLabel(group, actualResult) !== '复式'
  const pl3Digits = ((group.digits && group.digits.length ? group.digits : group.red_balls) || []).slice(0, 3)
  if (isPl3Group) {
    return (
      <div className={clsx('number-row', compact && 'number-row--compact')}>
        {pl3Digits.map((digit, index) => {
          const isHit = Boolean((hit?.digitHitIndexes || []).includes(index))
          return (
            <NumberBall
              key={`d-${group.group_id}-${index}-${digit}`}
              value={digit}
              color="red"
              isHit={isHit}
              tone={grayMisses && !isHit ? 'muted' : 'default'}
            />
          )
        })}
      </div>
    )
  }
  return (
    <div className={clsx('number-row', compact && 'number-row--compact')}>
      {group.red_balls.map((ball, index) => {
        const isHit = Boolean((hit?.redHits || []).includes(ball))
        return (
          <NumberBall
            key={`r-${group.group_id}-${index}-${ball}`}
            value={ball}
            color="red"
            isHit={isHit}
            tone={grayMisses && !isHit ? 'muted' : 'default'}
          />
        )
      })}
      <span className="number-row__divider" />
      {group.blue_balls.map((ball, index) => {
        const isHit = Boolean((hit?.blueHits || []).includes(ball))
        return (
          <NumberBall
            key={`b-${group.group_id}-${index}-${ball}`}
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

export function ModelScoreShowcase({ score, compact = false }: { score?: ModelScore; compact?: boolean }) {
  if (!score) return null

  const components = [
    { label: '收益', value: score.componentScores.profit || 0 },
    { label: '命中', value: score.componentScores.hit_rate || 0 },
    { label: '稳定', value: score.componentScores.stability || 0 },
    { label: '上限', value: score.componentScores.ceiling || 0 },
    { label: '下限', value: score.componentScores.floor || 0 },
  ]

  return (
    <div className={clsx('score-showcase', compact && 'is-compact')}>
      <div className="score-showcase__hero">
        <div className="score-showcase__headline">
          <span>综合分</span>
          <strong>{score.overallScore}</strong>
        </div>
        <div className="score-showcase__triplet">
          <span>按注 {score.perBetScore}</span>
          <span>按期 {score.perPeriodScore}</span>
          <span>近期/长期 {score.recentScore}/{score.longTermScore}</span>
        </div>
      </div>
      <div className="score-showcase__components">
        {components.map((item) => (
          <div key={item.label} className="score-showcase__component">
            <div className="score-showcase__component-label">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
            <div className="score-showcase__bar">
              <span style={{ width: `${item.value}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="score-showcase__windows">
        <div className="score-showcase__window">
          <span>近期 20 期</span>
          <strong>ROI {Math.round((score.recentWindow.roi || 0) * 100)}%</strong>
          <small>{score.recentWindow.periods} 期 / {score.recentWindow.bets} 注</small>
        </div>
        <div className="score-showcase__window">
          <span>长期全量</span>
          <strong>ROI {Math.round((score.longTermWindow.roi || 0) * 100)}%</strong>
          <small>{score.sampleSize} 期 / {score.betSampleSize} 注</small>
        </div>
      </div>
      {!compact ? (
        <div className="score-showcase__limits">
          <div className="score-showcase__limit-card">
            <span>能力上限</span>
            <strong>第 {score.bestPeriod.target_period || '-'} 期</strong>
            <small>净收益 {formatCurrency(score.bestPeriod.net_profit)} / 最佳命中 {score.bestPeriod.best_hit_count}</small>
          </div>
          <div className="score-showcase__limit-card is-floor">
            <span>能力下限</span>
            <strong>第 {score.worstPeriod.target_period || '-'} 期</strong>
            <small>净收益 {formatCurrency(score.worstPeriod.net_profit)} / 最佳命中 {score.worstPeriod.best_hit_count}</small>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const SCORE_VIEW_COLUMNS: Array<{ key: ScoreViewSortKey; label: string; description: string }> = [
  { key: 'overallScore', label: '综合分', description: '综合模型历史收益、命中、稳定性、上限和下限后的总评分。' },
  { key: 'perBetScore', label: '按注分', description: '按每一注历史表现计算的能力评分，更看重单注命中和回报。' },
  { key: 'perPeriodScore', label: '按期分', description: '按每一期整体表现计算的能力评分，更看重单期是否能打出结果。' },
  { key: 'recentScore', label: '近期分', description: '更强调最近一段历史表现的评分，用来看模型最近状态。' },
  { key: 'longTermScore', label: '长期分', description: '基于全历史表现的评分，用来看模型长期能力。' },
  { key: 'profit', label: '收益分', description: '反映模型历史奖金回报和盈利能力的评分。' },
  { key: 'hit_rate', label: '命中分', description: '反映模型历史中奖频率和命中能力的评分。' },
  { key: 'stability', label: '稳定性', description: '反映模型表现波动大小与持续稳定程度的评分。' },
  { key: 'ceiling', label: '上限分', description: '反映模型历史最好表现有多强的评分。' },
  { key: 'floor', label: '下限分', description: '反映模型历史较差表现是否仍然可控的评分。' },
]

function getScoreViewValue(score: ModelScore | undefined, key: ScoreViewSortKey) {
  if (!score) return 0
  if (key === 'overallScore') return score.overallScore
  if (key === 'perBetScore') return score.perBetScore
  if (key === 'perPeriodScore') return score.perPeriodScore
  if (key === 'recentScore') return score.recentScore
  if (key === 'longTermScore') return score.longTermScore
  return Number(score.componentScores[key] || 0)
}

function sortModelsForScoreView(
  models: PredictionModel[],
  modelScores: Record<string, ModelScore>,
  pinnedModelIds: string[],
  sortKey: ScoreViewSortKey,
  sortDirection: ScoreViewSortDirection,
) {
  const pinnedIndex = new Map(pinnedModelIds.map((id, index) => [id, index]))
  const directionFactor = sortDirection === 'desc' ? -1 : 1

  return [...models].sort((left, right) => {
    const leftPinned = pinnedIndex.has(left.model_id)
    const rightPinned = pinnedIndex.has(right.model_id)
    if (leftPinned && rightPinned) {
      const pinCompare = (pinnedIndex.get(left.model_id) || 0) - (pinnedIndex.get(right.model_id) || 0)
      if (pinCompare !== 0) return pinCompare
    } else if (leftPinned) {
      return -1
    } else if (rightPinned) {
      return 1
    }

    const leftValue = getScoreViewValue(modelScores[left.model_id], sortKey)
    const rightValue = getScoreViewValue(modelScores[right.model_id], sortKey)
    if (leftValue !== rightValue) {
      return leftValue < rightValue ? -1 * directionFactor : 1 * directionFactor
    }

    const overallDiff = (modelScores[right.model_id]?.overallScore || 0) - (modelScores[left.model_id]?.overallScore || 0)
    if (overallDiff !== 0) return overallDiff
    return left.model_name.localeCompare(right.model_name, 'zh-CN')
  })
}

function ModelScoreComparisonTable({
  models,
  modelScores,
  validPinnedModelIds,
  sortKey,
  sortDirection,
  onSortChange,
  onDetail,
}: {
  models: PredictionModel[]
  modelScores: Record<string, ModelScore>
  validPinnedModelIds: string[]
  sortKey: ScoreViewSortKey
  sortDirection: ScoreViewSortDirection
  onSortChange: (key: ScoreViewSortKey) => void
  onDetail: (modelId: string) => void
}) {
  if (!models.length) {
    return <div className="state-shell">没有符合当前筛选条件的模型。</div>
  }

  return (
    <div className="table-shell score-view-table-shell">
      <table className="history-table score-view-table">
        <thead>
          <tr>
            <th>模型</th>
            {SCORE_VIEW_COLUMNS.map((column) => (
              <th key={column.key}>
                <div className="score-view-table__head">
                  <button
                    type="button"
                    className={clsx('score-view-table__sort-button', sortKey === column.key && 'is-active')}
                    onClick={() => onSortChange(column.key)}
                    aria-label={`${column.label}排序`}
                  >
                    <span>{column.label}</span>
                    <small>{sortKey === column.key ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}</small>
                  </button>
                  <ScoreInfoTooltip label={column.label} description={column.description} />
                </div>
              </th>
            ))}
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => {
            const score = modelScores[model.model_id]
            const isPinned = validPinnedModelIds.includes(model.model_id)
            return (
              <tr key={model.model_id}>
                <td>
                  <div className="score-view-table__model">
                    <strong>{model.model_name}</strong>
                    <span>{model.model_provider}</span>
                  </div>
                </td>
                {SCORE_VIEW_COLUMNS.map((column) => (
                  <td key={`${model.model_id}-${column.key}`}>
                    <ScoreMetricCell label={column.label} value={getScoreViewValue(score, column.key)} />
                  </td>
                ))}
                <td>{isPinned ? <span className="status-pill is-active">已置顶</span> : <span className="score-view-table__status">普通</span>}</td>
                <td>
                  <button
                    className="icon-button score-view-table__detail-button"
                    type="button"
                    onClick={() => onDetail(model.model_id)}
                    aria-label={`查看详情：${model.model_name}`}
                    title="查看详情"
                  >
                    <DetailIcon />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ScoreInfoTooltip({ label, description }: { label: string; description: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      className="score-info-tooltip"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button type="button" className="score-info-tooltip__trigger" aria-label={`${label}定义`} onClick={(event) => event.preventDefault()}>
        ?
      </button>
      {isOpen ? (
        <div className="score-info-tooltip__panel" role="tooltip">
          <strong>{label}</strong>
          <span>{description}</span>
        </div>
      ) : null}
    </div>
  )
}

function ScoreMetricCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="score-metric-cell" aria-label={`${label} ${value}分`}>
      <strong>{value}</strong>
      <div className="score-metric-cell__bar" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

function ModelScoreInline({ score }: { score?: ModelScore }) {
  if (!score) return null

  return (
    <div className="score-inline" aria-label="评分摘要">
      <span className="score-inline__pill is-primary">综合 {score.overallScore}</span>
      <span className="score-inline__pill">按注 {score.perBetScore}</span>
      <span className="score-inline__pill">按期 {score.perPeriodScore}</span>
      <span className="score-inline__pill">近期/长期 {score.recentScore}/{score.longTermScore}</span>
    </div>
  )
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
          <span className="model-filter-panel__summary-badge">
            已显示 {filteredCount} / {totalCount} 个模型
          </span>
          <button className="icon-button model-filter-panel__clear-button" onClick={onClear} aria-label="清空筛选" title="清空筛选" type="button">
            <HomeResetIcon />
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
          <strong>综合评分</strong>
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
  lotteryCode,
  visibleModelIds,
}: {
  record: PredictionsHistoryListRecord
  lotteryCode: LotteryCode
  visibleModelIds: string[]
}) {
  const [expanded, setExpanded] = useState(false)
  const detailQuery = useQuery({
    queryKey: ['predictions-history-detail', lotteryCode, record.target_period],
    enabled: expanded,
    queryFn: async () => normalizePredictionsHistory(await apiClient.getPredictionsHistoryDetail(record.target_period, lotteryCode)),
  })
  const detailRecord = detailQuery.data?.predictions_history?.[0]
    ? {
        ...detailQuery.data.predictions_history[0],
        models: visibleModelIds.length
          ? detailQuery.data.predictions_history[0].models.filter((model) => visibleModelIds.includes(model.model_id))
          : detailQuery.data.predictions_history[0].models,
      }
    : null
  const listModels = record.models
  const periodSummary = listModels.reduce(
    (accumulator, model) => ({
      total_bet_count: accumulator.total_bet_count + (model.bet_count || 0),
      total_cost_amount: accumulator.total_cost_amount + (model.cost_amount || 0),
      total_prize_amount: accumulator.total_prize_amount + (model.prize_amount || 0),
    }),
    { total_bet_count: 0, total_cost_amount: 0, total_prize_amount: 0 },
  )
  const actualLotteryCode = record.actual_result?.lottery_code || 'dlt'
  const actualMainBalls = actualLotteryCode === 'pl3'
    ? (record.actual_result?.digits?.length ? record.actual_result.digits : (record.actual_result?.red_balls || []))
    : (record.actual_result?.red_balls || [])

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
          {actualMainBalls.map((ball, index) => (
            <NumberBall key={`${record.target_period}-red-${index}-${ball}`} value={ball} color="red" />
          ))}
          {actualLotteryCode === 'dlt' ? <span className="number-row__divider" /> : null}
          {actualLotteryCode === 'dlt'
            ? record.actual_result.blue_balls.map((ball, index) => (
                <NumberBall key={`${record.target_period}-blue-${index}-${ball}`} value={ball} color="blue" />
              ))
            : null}
        </div>
      ) : null}
      <div className="history-record-card__summary">
        <span>{periodSummary.total_bet_count} 注</span>
        <span>成本 {formatCurrency(periodSummary.total_cost_amount)}</span>
        <span>奖金 {formatCurrency(periodSummary.total_prize_amount)}</span>
      </div>
      <div className="history-record-card__models">
        {listModels.map((model) => (
          <div key={`${record.target_period}-${model.model_id}`} className="history-record-card__model">
            <strong>{model.model_name}</strong>
            <span>
              {model.bet_count || 0} 注 / {formatCurrency(model.cost_amount)} / {formatCurrency(model.prize_amount)}
            </span>
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
                    <span>
                      中奖率 {formatPercent(model.win_rate_by_period)} / {formatPercent(model.win_rate_by_bet)}
                    </span>
                  </div>
                  <div className="history-record-card__detail-summary">
                    <span>{model.bet_count || 0} 注</span>
                    <span>成本 {formatCurrency(model.cost_amount)}</span>
                    <span>奖金 {formatCurrency(model.prize_amount)}</span>
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
