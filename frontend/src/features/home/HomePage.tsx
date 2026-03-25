import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  buildSummary,
  buildHistoryHitTrend,
  buildBlueFrequencyChart,
  buildOddEvenChart,
  filterPredictionGroupsByPlayType,
  getPredictionPlayTypeLabel,
  buildRedFrequencyChart,
  resolveHistoryFallbackState,
  buildSumTrendChart,
  compareNumbers,
  getActualResult,
  type ModelScore,
  type ModelListScoreRange,
  type PredictionPlayType,
  normalizePredictionModelPlayMode,
  normalizeStrategyLabel,
  normalizePredictionsHistory,
} from './lib/home'
import {
  buildBallRange,
  buildSimulationMatches,
  createRandomSelection,
  normalizeSimulationTicket,
  type SimulationPlayType,
  type SimulationSelection,
} from './lib/simulation'
import type { LotteryCode, LotteryDraw, PredictionGroup, PredictionModel, PredictionsHistoryListRecord, SimulationTicketPayload, SimulationTicketRecord } from '../../shared/types/api'
import { HOME_RULES_PATH, getDashboardPath, getHomeTabFromPath, type HomeDetailRouteState, type HomeModelView, type HomeRulesRouteState, type ScoreViewSortDirection, type ScoreViewSortKey } from './navigation'

const HISTORY_DEFAULT_PAGE_SIZE = 20
const HISTORY_PAGE_SIZE_OPTIONS = [10, 20, 50] as const
const LOTTERY_DEFAULT_PAGE_SIZE = 10
const MODEL_SCORE_FILTERS: Array<{ value: ModelListScoreRange; label: string }> = [
  { value: 'all', label: '全部评分' },
  { value: '0-30', label: '0-30 分' },
  { value: '31-60', label: '31-60 分' },
  { value: '61-80', label: '61-80 分' },
  { value: '81-100', label: '81-100 分' },
]
const AnalysisChartsPanel = lazy(() =>
  import('./HomeChartPanels').then((module) => ({ default: module.AnalysisChartsPanel })),
)
const HistoryHitTrendCard = lazy(() =>
  import('./HomeChartPanels').then((module) => ({ default: module.HistoryHitTrendCard })),
)
const MyBetsPanel = lazy(() => import('./MyBetsPanel').then((module) => ({ default: module.MyBetsPanel })))

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

function HomeChevronIcon({ open }: { open: boolean }) {
  return (
    <HomeSvgIcon>
      {open ? <path d="M6.5 12.2 10 8.7l3.5 3.5" /> : <path d="M6.5 8.2 10 11.7l3.5-3.5" />}
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

function Pl3PredictionModeSwitch({
  value,
  onChange,
}: {
  value: 'direct' | 'direct_sum'
  onChange: (value: 'direct' | 'direct_sum') => void
}) {
  return (
    <div className="view-switch settings-model-toolbar__view-switch" role="tablist" aria-label="排列3玩法切换">
      <button className={clsx('tab-strip__item', value === 'direct' && 'is-active')} type="button" onClick={() => onChange('direct')}>
        直选
      </button>
      <button className={clsx('tab-strip__item', value === 'direct_sum' && 'is-active')} type="button" onClick={() => onChange('direct_sum')}>
        和值
      </button>
    </div>
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
  prediction_play_mode?: 'direct' | 'direct_sum'
}

function resolveHistoryModelModeKey(model: {
  model_id: string
  prediction_play_mode?: 'direct' | 'direct_sum' | null
  predictions?: PredictionGroup[]
}) {
  return `${model.model_id}::${normalizePredictionModelPlayMode(model)}`
}

function formatCurrency(value: number | undefined) {
  return `${Math.round(value || 0).toLocaleString('zh-CN')} 元`
}

function formatPercent(value: number | undefined) {
  return `${Math.round((value || 0) * 100)}%`
}

const PL3_DIRECT_SUM_COST_RULES: Record<number, number> = {
  0: 2,
  1: 6,
  2: 12,
  3: 20,
  4: 30,
  5: 42,
  6: 56,
  7: 72,
  8: 90,
  9: 110,
  10: 126,
  11: 138,
  12: 146,
  13: 150,
  14: 150,
  15: 146,
  16: 138,
  17: 126,
  18: 110,
  19: 90,
  20: 72,
  21: 56,
  22: 42,
  23: 30,
  24: 20,
  25: 12,
  26: 6,
  27: 2,
}

function resolveHistoryPredictionGroupCost(group: PredictionGroup, lotteryCode: LotteryCode) {
  const explicitCost = Number(group.cost_amount || 0)
  if (explicitCost > 0) return explicitCost
  const playType = String(group.play_type || 'direct').trim().toLowerCase()
  if (lotteryCode !== 'pl3' || playType !== 'direct_sum') return 2
  const sumValue = Number(String(group.sum_value || '').trim())
  if (!Number.isInteger(sumValue)) return 2
  return PL3_DIRECT_SUM_COST_RULES[sumValue] || 2
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
  const activeTab = getHomeTabFromPath(location.pathname)
  const navigationState = location.state as HomeDetailRouteState | null
  const [activeSection, setActiveSection] = useState<'models' | 'weights'>('models')
  const [modelListView, setModelListView] = useState<HomeModelView>('list')
  const [scoreViewSortKey, setScoreViewSortKey] = useState<ScoreViewSortKey>('overallScore')
  const [scoreViewSortDirection, setScoreViewSortDirection] = useState<ScoreViewSortDirection>('desc')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(HISTORY_DEFAULT_PAGE_SIZE)
  const [lotteryPage, setLotteryPage] = useState(1)
  const [lotteryPageSize, setLotteryPageSize] = useState(LOTTERY_DEFAULT_PAGE_SIZE)
  const [selectedLottery, setSelectedLottery] = useState<LotteryCode>(() => loadSelectedLottery())
  const [pinnedModelIds, setPinnedModelIds] = useState<string[]>(() => loadPinnedModels(loadSelectedLottery()))
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null)
  const [historyPeriodQuery, setHistoryPeriodQuery] = useState('')
  const [commonOnly, setCommonOnly] = useState(false)
  const [pl3PredictionMode, setPl3PredictionMode] = useState<'direct' | 'direct_sum'>('direct')
  const [summaryStrategyFilters, setSummaryStrategyFilters] = useState<string[]>([])
  const [historyStrategyFilters, setHistoryStrategyFilters] = useState<string[]>([])
  const summaryPlayTypeFilters = useMemo<PredictionPlayType[]>(
    () => (selectedLottery === 'pl3' ? (pl3PredictionMode === 'direct_sum' ? ['direct_sum'] : ['direct']) : []),
    [pl3PredictionMode, selectedLottery],
  )
  const historyPlayTypeFilters = useMemo<PredictionPlayType[]>(
    () => (selectedLottery === 'pl3' ? (pl3PredictionMode === 'direct_sum' ? ['direct_sum'] : ['direct']) : []),
    [pl3PredictionMode, selectedLottery],
  )
  const [historyFallbackSignature, setHistoryFallbackSignature] = useState<string | null>(null)
  const [weightedSummary] = useState(true)
  const modelSectionRef = useRef<HTMLElement | null>(null)
  const weightsSectionRef = useRef<HTMLElement | null>(null)
  const hasRestoredScrollRef = useRef(false)
  const hasInitializedLotteryRef = useRef(false)

  const { currentPredictions, lotteryCharts, predictionsHistory, pagedLotteryHistory } = useHomeData(
    selectedLottery,
    historyPage,
    historyPageSize,
    historyStrategyFilters,
    historyPlayTypeFilters,
    lotteryPage,
    lotteryPageSize,
    {
      enableCurrentPredictions: true,
      enableLotteryCharts: true,
      enablePredictionsHistory: activeTab === 'history',
      enablePagedLotteryHistory: activeTab === 'history',
    },
  )
  const lotteryLabel = selectedLottery === 'dlt' ? '大乐透' : selectedLottery === 'pl3' ? '排列3' : '排列5'

  const allModels = currentPredictions.data?.models || []
  const models = useMemo(
    () =>
      selectedLottery === 'pl3'
        ? allModels.filter((model) => normalizePredictionModelPlayMode(model) === pl3PredictionMode)
        : allModels,
    [allModels, pl3PredictionMode, selectedLottery],
  )
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
    summarySelectedModelIds,
    toggleModelProvider,
    toggleModelTag,
    clearModelFilters,
    toggleSummaryModel,
    buildHistoryState,
  } = useHomeModelFilters(models, history, validPinnedModelIds, {
    isModelFilterOpen: false,
    modelNameQuery: '',
    selectedProviders: [],
    selectedTags: [],
    selectedScoreRange: 'all',
  })
  const effectiveSelectedModelIds = useMemo(() => {
    const baseModelIds = filteredModelIds
    const selectedModelIds = (summarySelectedModelIds ?? baseModelIds).filter((modelId) => baseModelIds.includes(modelId))
    return selectedModelIds.length ? selectedModelIds : baseModelIds
  }, [filteredModelIds, summarySelectedModelIds])
  const effectiveSelectedModels = useMemo(
    () => filteredModels.filter((model) => effectiveSelectedModelIds.includes(model.model_id)),
    [effectiveSelectedModelIds, filteredModels],
  )
  const panelSelectedModelIds = useMemo(
    () =>
      (summarySelectedModelIds ?? filteredModelIds).filter((modelId) =>
        orderedModels.some((model) => model.model_id === modelId),
      ),
    [filteredModelIds, orderedModels, summarySelectedModelIds],
  )
  const actualResult = getActualResult(chartDraws, currentPredictions.data?.target_period || '')

  useEffect(() => {
    savePinnedModels(validPinnedModelIds, selectedLottery)
  }, [selectedLottery, validPinnedModelIds])

  useEffect(() => {
    saveSelectedLottery(selectedLottery)
    setPinnedModelIds(loadPinnedModels(selectedLottery))
  }, [selectedLottery])

  useEffect(() => {
    if (!hasInitializedLotteryRef.current) {
      hasInitializedLotteryRef.current = true
      return
    }
    setHistoryFallbackSignature(null)
    setHistoryPage(1)
    setLotteryPage(1)
    setSummaryStrategyFilters([])
    setHistoryStrategyFilters([])
  }, [selectedLottery])

  useEffect(() => {
    if (selectedLottery !== 'pl3') {
      setPl3PredictionMode('direct')
      return
    }
    setHistoryFallbackSignature(null)
    setHistoryPage(1)
    setSummaryStrategyFilters([])
    setHistoryStrategyFilters([])
  }, [pl3PredictionMode, selectedLottery])

  useEffect(() => {
    if (hasRestoredScrollRef.current || typeof navigationState?.scrollY !== 'number') return
    hasRestoredScrollRef.current = true
    const frameId = requestAnimationFrame(() => window.scrollTo({ top: navigationState.scrollY }))
    return () => cancelAnimationFrame(frameId)
  }, [navigationState?.scrollY])

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
    const resolveKey = (model: { model_id: string; prediction_play_mode?: 'direct' | 'direct_sum' }) =>
      `${model.model_id}::${model.prediction_play_mode || 'direct'}`
    for (const stat of history?.model_stats || []) {
      if (!stat.model_id) continue
      const normalizedMode = normalizePredictionModelPlayMode(stat)
      references.set(resolveKey({ model_id: stat.model_id, prediction_play_mode: normalizedMode }), {
        model_id: stat.model_id,
        model_name: stat.model_name || stat.model_id,
        prediction_play_mode: normalizedMode,
      })
    }
    for (const record of history?.predictions_history || []) {
      for (const model of record.models || []) {
        if (!model.model_id) continue
        const normalizedMode = normalizePredictionModelPlayMode(model)
        references.set(resolveKey({ model_id: model.model_id, prediction_play_mode: normalizedMode }), {
          model_id: model.model_id,
          model_name: model.model_name || model.model_id,
          prediction_play_mode: normalizedMode,
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
    filteredModelIds: effectiveSelectedModelIds,
    historyModelIds: historyAllModelRefs.map((item) => item.model_id),
    historyFallbackEnabled,
  })
  const historyVisibleModelIds = useMemo(
    () =>
      useHistoryFallbackModels
        ? [...new Set(historyAllModelRefs.map((item) => item.model_id))]
        : effectiveSelectedModelIds,
    [effectiveSelectedModelIds, historyAllModelRefs, useHistoryFallbackModels],
  )
  const historyVisibleModels = useMemo<HistoryModelRef[]>(
    () =>
      useHistoryFallbackModels
        ? historyAllModelRefs
        : effectiveSelectedModels.map((model) => ({ model_id: model.model_id, model_name: model.model_name })),
    [effectiveSelectedModels, historyAllModelRefs, useHistoryFallbackModels],
  )
  const summaryStrategyOptions = useMemo(
    () =>
      [...new Set(effectiveSelectedModels.flatMap((model) => (model.predictions || []).map((group) => normalizeStrategyLabel(group.strategy))))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [effectiveSelectedModels],
  )
  const historyStrategyOptions = useMemo(
    () => [...new Set((history?.strategy_options || []).map((item) => normalizeStrategyLabel(item)))].sort((left, right) => left.localeCompare(right)),
    [history?.strategy_options],
  )

  useEffect(() => {
    setSummaryStrategyFilters((previous) => {
      const next = previous.filter((item) => summaryStrategyOptions.includes(item))
      return next.length === previous.length && next.every((item, index) => item === previous[index]) ? previous : next
    })
  }, [summaryStrategyOptions])

  useEffect(() => {
    if (predictionsHistory.isFetching && !historyStrategyOptions.length) return
    setHistoryStrategyFilters((previous) => {
      const next = previous.filter((item) => historyStrategyOptions.includes(item))
      return next.length === previous.length && next.every((item, index) => item === previous[index]) ? previous : next
    })
  }, [historyStrategyOptions, predictionsHistory.isFetching])

  const summaryFilteredModels = useMemo(
    () =>
      summaryPlayTypeFilters.length
        ? effectiveSelectedModels
            .map((model) => ({
              ...model,
              predictions: filterPredictionGroupsByPlayType(model.predictions || [], summaryPlayTypeFilters),
            }))
            .filter((model) => model.predictions.length > 0)
        : effectiveSelectedModels,
    [effectiveSelectedModels, summaryPlayTypeFilters],
  )

  const { selectedSummaryIds, summary, filteredHistory } = buildHistoryState(
    historyPeriodQuery,
    commonOnly,
    weightedSummary,
    historyVisibleModelIds,
    summaryStrategyFilters,
    summaryFilteredModels,
    summaryPlayTypeFilters,
  )
  const summaryModels = summaryFilteredModels.filter((model) => selectedSummaryIds.includes(model.model_id))
  const historyModelStats = buildHistoryModelStats(filteredHistory, historyVisibleModels)
  const historyHitTrend = useMemo(
    () => buildHistoryHitTrend(filteredHistory, historyVisibleModelIds),
    [filteredHistory, historyVisibleModelIds],
  )
  const totalHistoryPages = Math.max(1, Math.ceil((history?.total_count || 0) / historyPageSize))
  const totalLotteryPages = Math.max(1, Math.ceil((pagedLotteryHistory.data?.total_count || 0) / lotteryPageSize))
  const redChart = buildRedFrequencyChart(chartDraws)
  const blueChart = buildBlueFrequencyChart(chartDraws)
  const oddEvenChart = buildOddEvenChart(chartDraws)
  const sumTrendChart = buildSumTrendChart(chartDraws)
  const scoreViewModels = useMemo(
    () => sortModelsForScoreView(effectiveSelectedModels, modelScores, validPinnedModelIds, scoreViewSortKey, scoreViewSortDirection),
    [effectiveSelectedModels, modelScores, validPinnedModelIds, scoreViewSortDirection, scoreViewSortKey],
  )
  const summaryViewModels = modelListView === 'score' ? effectiveSelectedModels : summaryFilteredModels

  const isLoading = currentPredictions.isLoading || lotteryCharts.isLoading || (!predictionsHistory.data && predictionsHistory.isLoading)
  const error =
    currentPredictions.error instanceof Error
      ? currentPredictions.error
      : lotteryCharts.error instanceof Error
        ? lotteryCharts.error
        : predictionsHistory.error instanceof Error
          ? predictionsHistory.error
          : null

  useEffect(() => {
    setHistoryPage((currentPage) => Math.min(currentPage, totalHistoryPages))
  }, [totalHistoryPages])

  useEffect(() => {
    setLotteryPage((currentPage) => Math.min(currentPage, totalLotteryPages))
  }, [totalLotteryPages])

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
    navigate(`/dashboard/models/${modelId}`, {
      state: {
        scrollY: window.scrollY,
        predictionPlayMode: selectedLottery === 'pl3' ? pl3PredictionMode : undefined,
      } satisfies HomeDetailRouteState,
    })
  }

  function handleHistoryPageSizeChange(nextPageSize: number) {
    setHistoryPage((currentPage) => calculatePageForPageSize(currentPage, historyPageSize, nextPageSize))
    setHistoryPageSize(nextPageSize)
  }

  function handleLotteryPageSizeChange(nextPageSize: number) {
    setLotteryPage((currentPage) => calculatePageForPageSize(currentPage, lotteryPageSize, nextPageSize))
    setLotteryPageSize(nextPageSize)
  }

  function toggleSummaryStrategyFilter(strategy: string) {
    const normalized = normalizeStrategyLabel(strategy)
    setSummaryStrategyFilters((previous) =>
      previous.includes(normalized) ? previous.filter((item) => item !== normalized) : [...previous, normalized],
    )
  }

  function updateHistoryStrategyFilters(updater: (previous: string[]) => string[]) {
    setHistoryPage(1)
    setHistoryStrategyFilters((previous) => updater(previous))
  }

  function toggleHistoryStrategyFilter(strategy: string) {
    const normalized = normalizeStrategyLabel(strategy)
    updateHistoryStrategyFilters((previous) =>
      previous.includes(normalized) ? previous.filter((item) => item !== normalized) : [...previous, normalized],
    )
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div className="hero-panel__copy">
          <p className="hero-panel__eyebrow">Prediction Command Center</p>
          <div className="lottery-switch" role="tablist" aria-label="彩种切换">
            {(['dlt', 'pl3', 'pl5'] as LotteryCode[]).map((code) => (
              <button
                key={code}
                type="button"
                className={clsx('chip-button', selectedLottery === code && 'is-active')}
                onClick={() => setSelectedLottery(code)}
                aria-label={code === 'pl3' ? '排列3' : code === 'pl5' ? '排列5' : '大乐透'}
                aria-pressed={selectedLottery === code}
              >
                <span className="chip-button__title">{code === 'pl3' ? '排列3' : code === 'pl5' ? '排列5' : '大乐透'}</span>
                <span className="chip-button__meta">{code === 'dlt' ? '前区后区复式预测' : code === 'pl3' ? '支持直选与和值预测' : '仅直选定位玩法'}</span>
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

      <section className="tab-strip dashboard-tab-strip">
        <button
          className={clsx('tab-strip__item', activeTab === 'prediction' && 'is-active')}
          onClick={() => navigate(getDashboardPath('prediction'))}
        >
          预测总览
        </button>
        <button
          className={clsx('tab-strip__item', activeTab === 'simulation' && 'is-active')}
          onClick={() => navigate(getDashboardPath('simulation'))}
        >
          模拟试玩
        </button>
        <button
          className={clsx('tab-strip__item', activeTab === 'analysis' && 'is-active')}
          onClick={() => navigate(getDashboardPath('analysis'))}
        >
          图表分析
        </button>
        <button
          className={clsx('tab-strip__item', activeTab === 'history' && 'is-active')}
          onClick={() => navigate(getDashboardPath('history'))}
        >
          历史回溯
        </button>
        <button
          className="tab-strip__item"
          onClick={() => navigate(HOME_RULES_PATH, { state: { lotteryCode: selectedLottery } satisfies HomeRulesRouteState })}
        >
          规则与奖金
        </button>
        <button
          className={clsx('tab-strip__item', activeTab === 'my-bets' && 'is-active')}
          onClick={() => navigate(getDashboardPath('my-bets'))}
        >
          我的投注
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
                    {selectedLottery === 'pl3' ? <Pl3PredictionModeSwitch value={pl3PredictionMode} onChange={setPl3PredictionMode} /> : null}
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
                    modelCandidates={orderedModels}
                    selectedModelIds={panelSelectedModelIds}
                    onToggleSelectedModel={toggleSummaryModel}
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
                    {summaryViewModels.length ? (
                      summaryViewModels.map((model) => (
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
                    models={summaryViewModels}
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
                  {summaryFilteredModels.map((model) => (
                    <button
                      key={model.model_id}
                      className={clsx('filter-chip', selectedSummaryIds.includes(model.model_id) && 'is-active')}
                      onClick={() => toggleSummaryModel(model.model_id)}
                    >
                      {model.model_name}
                    </button>
                  ))}
                </div>
                {selectedLottery === 'dlt' ? (
                  <div className="history-strategy-filter">
                    <span className="history-strategy-filter__label">方案筛选</span>
                    {summaryStrategyOptions.length ? (
                      <div className="filter-chip-group">
                        {summaryStrategyOptions.map((strategy) => (
                          <button
                            key={`summary-strategy-${strategy}`}
                            className={clsx('filter-chip', summaryStrategyFilters.includes(strategy) && 'is-active')}
                            onClick={() => toggleSummaryStrategyFilter(strategy)}
                            type="button"
                          >
                            {strategy}
                          </button>
                        ))}
                        {summaryStrategyFilters.length ? (
                          <button className="ghost-button ghost-button--compact" type="button" onClick={() => setSummaryStrategyFilters([])}>
                            清空方案
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="model-filter-panel__empty">当前暂无可选方案</span>
                    )}
                  </div>
                ) : null}
                {!summaryFilteredModels.length ? (
                  <div className="state-shell">当前筛选条件下没有可统计的模型。</div>
	                ) : !selectedSummaryIds.length ? (
	                  <div className="state-shell">请至少选择一个模型以查看号码统计。</div>
	                ) : (
	                  <div className="summary-columns">
	                    {selectedLottery === 'pl5' ? (
                      <>
                        <SummaryList title="第一位（万位）统计" items={summary.positions?.[0] || []} color="red" models={summaryModels} />
                        <SummaryList title="第二位（千位）统计" items={summary.positions?.[1] || []} color="red" models={summaryModels} />
                        <SummaryList title="第三位（百位）统计" items={summary.positions?.[2] || []} color="red" models={summaryModels} />
                        <SummaryList title="第四位（十位）统计" items={summary.positions?.[3] || []} color="red" models={summaryModels} />
                        <SummaryList title="第五位（个位）统计" items={summary.positions?.[4] || []} color="red" models={summaryModels} />
                      </>
	                    ) : selectedLottery === 'pl3' ? (
	                      <>
	                        {pl3PredictionMode === 'direct_sum' ? (
	                          <SummaryList title="和值统计" items={summary.sums || []} color="red" models={summaryModels} />
	                        ) : (
	                          <>
	                            <SummaryList title="第一位（百位）统计" items={summary.positions?.[0] || []} color="red" models={summaryModels} />
	                            <SummaryList title="第二位（十位）统计" items={summary.positions?.[1] || []} color="red" models={summaryModels} />
	                            <SummaryList title="第三位（个位）统计" items={summary.positions?.[2] || []} color="red" models={summaryModels} />
	                          </>
	                        )}
	                      </>
	                    ) : (
	                      <>
	                        <SummaryList title="前区统计" items={summary.red} color="red" models={summaryModels} />
                        <SummaryList title="后区统计" items={summary.blue} color="blue" models={summaryModels} />
                      </>
                    )}
                  </div>
                )}
              </StatusCard>
            </section>
          </div>
        </div>
      ) : null}

      {activeTab === 'analysis' ? (
        <Suspense fallback={<div className="state-shell">正在加载分析图表...</div>}>
          <AnalysisChartsPanel redChart={redChart} blueChart={blueChart} oddEvenChart={oddEvenChart} sumTrendChart={sumTrendChart} />
        </Suspense>
      ) : null}

      {activeTab === 'simulation' ? <SimulationPlayground lotteryCode={selectedLottery} draws={chartDraws} targetPeriod={currentPredictions.data?.target_period || ''} /> : null}

      {activeTab === 'history' ? (
        <div className="page-section">
          <Suspense fallback={<div className="state-shell">正在加载历史图表...</div>}>
            <HistoryHitTrendCard historyVisibleModels={historyVisibleModels} historyHitTrend={historyHitTrend} />
          </Suspense>

          <StatusCard title="命中回溯" subtitle="按模型和期号筛选历史预测表现。">
            {isModelFilterOpen ? (
              <ModelFilterPanel
                modelNameQuery={modelNameQuery}
                onModelNameQueryChange={setModelNameQuery}
                filteredCount={filteredModels.length}
                totalCount={orderedModels.length}
                onClear={clearModelFilters}
                modelCandidates={orderedModels}
                selectedModelIds={panelSelectedModelIds}
                onToggleSelectedModel={toggleSummaryModel}
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
              {selectedLottery === 'pl3' ? <Pl3PredictionModeSwitch value={pl3PredictionMode} onChange={setPl3PredictionMode} /> : null}
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
                {selectedLottery === 'dlt' ? (
              <div className="history-strategy-filter">
                <span className="history-strategy-filter__label">开奖方案筛选</span>
                {historyStrategyOptions.length ? (
                  <div className="filter-chip-group">
                    {historyStrategyOptions.map((strategy) => (
                      <button
                        key={`history-strategy-${strategy}`}
                        className={clsx('filter-chip', historyStrategyFilters.includes(strategy) && 'is-active')}
                        onClick={() => toggleHistoryStrategyFilter(strategy)}
                        type="button"
                      >
                        {strategy}
                      </button>
                    ))}
                    {historyStrategyFilters.length ? (
                      <button className="ghost-button ghost-button--compact" type="button" onClick={() => updateHistoryStrategyFilters(() => [])}>
                        清空方案
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <span className="model-filter-panel__empty">当前暂无可选方案</span>
                )}
              </div>
            ) : null}
            {selectedLottery === 'dlt' && predictionsHistory.isFetching ? <div className="state-shell">正在更新开奖方案筛选结果...</div> : null}
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
                        <span className="history-metric-pill">按注 {item.score_profile?.per_bet_score || 0}</span>
                        <span className="history-metric-pill">按期 {item.score_profile?.per_period_score || 0}</span>
                        <span className="history-metric-pill">按期中奖率 {formatPercent(item.win_rate_by_period)}</span>
                        <span className="history-metric-pill">按注中奖率 {formatPercent(item.win_rate_by_bet)}</span>
                        <span className="history-metric-pill">近期/长期 {item.score_profile?.recent_score || 0}/{item.score_profile?.long_term_score || 0}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              {!historyVisibleModels.length ? <div className="state-shell">当前筛选条件下没有可展示的模型。</div> : null}
              {historyVisibleModels.length && !filteredHistory.length ? <div className="state-shell">当前筛选条件下没有历史回溯记录。</div> : null}
              {filteredHistory.length ? (
                <div className="history-card-list__records">
                  {filteredHistory.map((record) => (
                    <HistoryRecordCard
                      key={`${selectedLottery}-${record.target_period}`}
                      record={record}
                      lotteryCode={selectedLottery}
                      visibleModelIds={historyVisibleModelIds}
                      strategyFilters={historyStrategyFilters}
                      playTypeFilters={historyPlayTypeFilters}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            <PagerControls
              page={historyPage}
              totalPages={totalHistoryPages}
              totalCount={history?.total_count || 0}
              pageSize={historyPageSize}
              pageSizeOptions={HISTORY_PAGE_SIZE_OPTIONS}
              unitLabel="期"
              onPageSizeChange={handleHistoryPageSizeChange}
              onPrevious={() => setHistoryPage((value) => Math.max(1, value - 1))}
              onNext={() => setHistoryPage((value) => Math.min(totalHistoryPages, value + 1))}
            />
          </StatusCard>

          <StatusCard title="开奖历史" subtitle="分页查看历史开奖号码。">
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
                    const mainBalls = selectedLottery === 'dlt' ? draw.red_balls : (draw.digits?.length ? draw.digits : draw.red_balls)
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

            <PagerControls
              page={lotteryPage}
              totalPages={totalLotteryPages}
              totalCount={pagedLotteryHistory.data?.total_count || 0}
              pageSize={lotteryPageSize}
              pageSizeOptions={HISTORY_PAGE_SIZE_OPTIONS}
              unitLabel="期"
              onPageSizeChange={handleLotteryPageSizeChange}
              onPrevious={() => setLotteryPage((value) => Math.max(1, value - 1))}
              onNext={() => setLotteryPage((value) => Math.min(totalLotteryPages, value + 1))}
            />
          </StatusCard>
        </div>
      ) : null}

      {activeTab === 'my-bets' ? (
        <Suspense fallback={<div className="state-shell">正在加载投注面板...</div>}>
          <MyBetsPanel lotteryCode={selectedLottery} targetPeriod={currentPredictions.data?.target_period || ''} />
        </Suspense>
      ) : null}
    </div>
  )
}

function SimulationPlayground({ lotteryCode, draws, targetPeriod }: { lotteryCode: LotteryCode; draws: LotteryDraw[]; targetPeriod: string }) {
  const queryClient = useQueryClient()
  const [selectedFront, setSelectedFront] = useState<string[]>([])
  const [selectedBack, setSelectedBack] = useState<string[]>([])
  const [pl3PlayType, setPl3PlayType] = useState<'direct' | 'group3' | 'group6'>('direct')
  const [selectedTenThousands, setSelectedTenThousands] = useState<string[]>([])
  const [selectedThousands, setSelectedThousands] = useState<string[]>([])
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
  const lotteryLabel = lotteryCode === 'dlt' ? '大乐透' : lotteryCode === 'pl3' ? '排列3' : '排列5'
  const isPl3 = lotteryCode === 'pl3'
  const isPl5 = lotteryCode === 'pl5'
  const playTypeLabel = pl3PlayType === 'direct' ? '直选' : pl3PlayType === 'group3' ? '组选3' : '组选6'
  const selection = useMemo<SimulationSelection>(() => {
    const playType: SimulationPlayType = lotteryCode === 'dlt' ? 'dlt' : lotteryCode === 'pl5' ? 'direct' : pl3PlayType
    return {
      lotteryCode,
      playType,
      frontNumbers: selectedFront,
      backNumbers: selectedBack,
      directTenThousands: selectedTenThousands,
      directThousands: selectedThousands,
      directHundreds: selectedHundreds,
      directTens: selectedTens,
      directUnits: selectedUnits,
      groupNumbers: selectedGroupNumbers,
    }
  }, [lotteryCode, pl3PlayType, selectedFront, selectedBack, selectedTenThousands, selectedThousands, selectedHundreds, selectedTens, selectedUnits, selectedGroupNumbers])
  const simulationPayload = useMemo<SimulationTicketPayload>(
    () => ({
      lottery_code: lotteryCode,
      play_type: lotteryCode === 'dlt' ? 'dlt' : lotteryCode === 'pl5' ? 'direct' : pl3PlayType,
      front_numbers: selectedFront,
      back_numbers: selectedBack,
      direct_ten_thousands: selectedTenThousands,
      direct_thousands: selectedThousands,
      direct_hundreds: selectedHundreds,
      direct_tens: selectedTens,
      direct_units: selectedUnits,
      group_numbers: selectedGroupNumbers,
    }),
    [lotteryCode, pl3PlayType, selectedFront, selectedBack, selectedTenThousands, selectedThousands, selectedHundreds, selectedTens, selectedUnits, selectedGroupNumbers],
  )
  const ticketsQuery = useQuery({
    queryKey: ['simulation-tickets', lotteryCode],
    queryFn: async () => (await apiClient.getSimulationTickets(lotteryCode)).tickets.map(normalizeSimulationTicket),
  })
  const ticketQuoteQuery = useQuery({
    queryKey: ['simulation-ticket-quote', simulationPayload],
    queryFn: async () => apiClient.quoteSimulationTicket(simulationPayload),
  })
  const betCount = ticketQuoteQuery.data?.bet_count || 0
  const amount = ticketQuoteQuery.data?.amount || 0
  const canSubmit = betCount > 0
  const matches = useMemo(
    () => (showMatches && canSubmit ? buildSimulationMatches(selection, draws, matchWindow) : []),
    [canSubmit, draws, matchWindow, selection, showMatches],
  )
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.createSimulationTicket(simulationPayload)
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
  }, [lotteryCode, pl3PlayType, selectedFront, selectedBack, selectedTenThousands, selectedThousands, selectedHundreds, selectedTens, selectedUnits, selectedGroupNumbers])

  useEffect(() => {
    if (lotteryCode === 'dlt') return
    setSelectedFront([])
    setSelectedBack([])
    setPl3PlayType('direct')
    setSelectedTenThousands([])
    setSelectedThousands([])
    setSelectedHundreds([])
    setSelectedTens([])
    setSelectedUnits([])
    setSelectedGroupNumbers([])
  }, [lotteryCode])

  function toggleSelection(value: string, zone: 'front' | 'back') {
    const updater = zone === 'front' ? setSelectedFront : setSelectedBack
    updater((previous) => (previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value].sort()))
  }

  function togglePositionSelection(value: string, position: 'ten_thousands' | 'thousands' | 'hundreds' | 'tens' | 'units') {
    const updater =
      position === 'ten_thousands'
        ? setSelectedTenThousands
        : position === 'thousands'
          ? setSelectedThousands
          : position === 'hundreds'
            ? setSelectedHundreds
            : position === 'tens'
              ? setSelectedTens
              : setSelectedUnits
    updater((previous) => (previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value].sort()))
  }

  function toggleGroupSelection(value: string) {
    setSelectedGroupNumbers((previous) => (previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value].sort()))
  }

  function handleRandomPick() {
    const randomSelection = createRandomSelection(lotteryCode, lotteryCode === 'dlt' ? 'dlt' : lotteryCode === 'pl5' ? 'direct' : pl3PlayType)
    setSelectedFront(randomSelection.frontNumbers)
    setSelectedBack(randomSelection.backNumbers)
    setSelectedTenThousands(randomSelection.directTenThousands)
    setSelectedThousands(randomSelection.directThousands)
    setSelectedHundreds(randomSelection.directHundreds)
    setSelectedTens(randomSelection.directTens)
    setSelectedUnits(randomSelection.directUnits)
    setSelectedGroupNumbers(randomSelection.groupNumbers)
    setMessage('已为你生成一组随机机选号码。')
  }

  function handleClear() {
    setSelectedFront([])
    setSelectedBack([])
    setSelectedTenThousands([])
    setSelectedThousands([])
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
          ) : isPl3 ? (
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
          ) : (
            <>
              <section className="simulation-section">
                <div className="simulation-section__header">
                  <div>
                    <p className="hero-panel__eyebrow">Ten Thousands</p>
                    <h3>万位选号</h3>
                  </div>
                  <span>至少 1 个</span>
                </div>
                <div className="simulation-ball-grid" aria-label="万位选号">
                  {digitOptions.map((ball) => (
                    <button
                      key={`ten-thousands-${ball}`}
                      type="button"
                      className={clsx('simulation-ball', 'is-front', selectedTenThousands.includes(ball) && 'is-selected')}
                      onClick={() => togglePositionSelection(ball, 'ten_thousands')}
                      aria-label={`万位 ${ball}`}
                    >
                      {ball}
                    </button>
                  ))}
                </div>
              </section>
              <section className="simulation-section">
                <div className="simulation-section__header">
                  <div>
                    <p className="hero-panel__eyebrow">Thousands</p>
                    <h3>千位选号</h3>
                  </div>
                  <span>至少 1 个</span>
                </div>
                <div className="simulation-ball-grid" aria-label="千位选号">
                  {digitOptions.map((ball) => (
                    <button
                      key={`thousands-${ball}`}
                      type="button"
                      className={clsx('simulation-ball', 'is-front', selectedThousands.includes(ball) && 'is-selected')}
                      onClick={() => togglePositionSelection(ball, 'thousands')}
                      aria-label={`千位 ${ball}`}
                    >
                      {ball}
                    </button>
                  ))}
                </div>
              </section>
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
                      key={`hundreds-pl5-${ball}`}
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
                      key={`tens-pl5-${ball}`}
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
                      key={`units-pl5-${ball}`}
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
                <span>{isPl3 ? `当前玩法：${playTypeLabel}` : '当前玩法：直选'}</span>
                <div className="number-row number-row--tight">
                  {(isPl3 ? (pl3PlayType === 'direct' ? selectedHundreds : selectedGroupNumbers) : selectedTenThousands).map((ball) => (
                    <NumberBall key={`selected-a-${ball}`} value={ball} color="red" size="sm" />
                  ))}
                  {(isPl3 ? pl3PlayType === 'direct' : true) ? <span className="number-row__divider" /> : null}
                  {isPl3
                    ? pl3PlayType === 'direct'
                      ? selectedTens.map((ball) => <NumberBall key={`selected-b-${ball}`} value={ball} color="red" size="sm" />)
                      : null
                    : selectedThousands.map((ball) => <NumberBall key={`selected-b-${ball}`} value={ball} color="red" size="sm" />)}
                  {(isPl3 ? pl3PlayType === 'direct' : true) ? <span className="number-row__divider" /> : null}
                  {isPl3
                    ? pl3PlayType === 'direct'
                      ? selectedUnits.map((ball) => <NumberBall key={`selected-c-${ball}`} value={ball} color="red" size="sm" />)
                      : null
                    : selectedHundreds.map((ball) => <NumberBall key={`selected-c-${ball}`} value={ball} color="red" size="sm" />)}
                  {!isPl3 ? <span className="number-row__divider" /> : null}
                  {!isPl3 ? selectedTens.map((ball) => <NumberBall key={`selected-d-${ball}`} value={ball} color="red" size="sm" />) : null}
                  {!isPl3 ? <span className="number-row__divider" /> : null}
                  {!isPl3 ? selectedUnits.map((ball) => <NumberBall key={`selected-e-${ball}`} value={ball} color="red" size="sm" />) : null}
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
                  : isPl5
                    ? '直选需万位、千位、百位、十位、个位各至少 1 个号码。'
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
        ) : lotteryCode === 'pl5' ? (
          <div className="number-row number-row--tight">
            {(ticket.direct_ten_thousands || []).map((ball) => (
              <NumberBall key={`${ticket.id}-tt-${ball}`} value={ball} color="red" size="sm" />
            ))}
            <span className="number-row__divider" />
            {(ticket.direct_thousands || []).map((ball) => (
              <NumberBall key={`${ticket.id}-th-${ball}`} value={ball} color="red" size="sm" />
            ))}
            <span className="number-row__divider" />
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
        <span>{`${lotteryCode === 'dlt' ? '复式' : lotteryCode === 'pl5' ? '直选' : ticket.play_type === 'group3' ? '组选3' : ticket.play_type === 'group6' ? '组选6' : '直选'} · ${ticket.bet_count} 注`}</span>
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
  showCost = false,
  showDescriptionInCompact = false,
}: {
  group: PredictionGroup
  actualResult: LotteryDraw | null
  compact?: boolean
  grayMisses?: boolean
  emphasizeHitTier?: boolean
  showCost?: boolean
  showDescriptionInCompact?: boolean
}) {
  const hit = compareNumbers(group, actualResult)
  const description = group.description?.trim() || '暂无说明'
  const playTypeLabel = getPredictionPlayTypeLabel(group, actualResult)
  const inferredLotteryCode: LotteryCode =
    actualResult?.lottery_code || ((group.digits || []).length >= 5 ? 'pl5' : group.play_type || (group.digits || []).length ? 'pl3' : 'dlt')
  const groupCostAmount = showCost ? resolveHistoryPredictionGroupCost(group, inferredLotteryCode) : 0
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
      {group.prize_level || showCost ? (
        <div className="prediction-group-card__prize">
          {group.prize_level ? (
            <>
              <strong>{group.prize_level}</strong>
              <span>{formatCurrency(group.prize_amount)}</span>
              {group.prize_source === 'fallback' ? <small>固定奖兜底</small> : null}
              {group.prize_source === 'missing' ? <small>浮动奖待补全</small> : null}
            </>
          ) : null}
          {showCost ? <span>{`成本 ${formatCurrency(groupCostAmount)}`}</span> : null}
        </div>
      ) : null}
      {compact && !showDescriptionInCompact ? null : (
        <p
          className={clsx('prediction-group-card__desc', compact && 'prediction-group-card__desc--compact')}
          title={description}
        >
          {description}
        </p>
      )}
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
  const inferredLotteryCode =
    actualResult?.lottery_code || ((group.digits || []).length >= 5 ? 'pl5' : group.play_type || (group.digits || []).length ? 'pl3' : 'dlt')
  const normalizedPlayType = String(group.play_type || 'direct').trim().toLowerCase()
  if (inferredLotteryCode === 'pl3' && normalizedPlayType === 'direct_sum') {
    const sumValue = String(group.sum_value || '').trim() || '-'
    const isHit = Boolean((hit?.totalHits || 0) > 0)
    return (
      <div className={clsx('number-row', compact && 'number-row--compact')}>
        <NumberBall
          key={`s-${group.group_id}-${sumValue}`}
          value={sumValue}
          color="red"
          isHit={isHit}
          tone={grayMisses && !isHit ? 'muted' : 'default'}
        />
      </div>
    )
  }
  const digitLength = inferredLotteryCode === 'pl5' ? 5 : 3
  const digits = ((group.digits && group.digits.length ? group.digits : group.red_balls) || []).slice(0, digitLength)
  if (inferredLotteryCode === 'pl3' || inferredLotteryCode === 'pl5') {
    return (
      <div className={clsx('number-row', compact && 'number-row--compact')}>
        {digits.map((digit, index) => {
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
  compact = false,
  hitSet,
}: {
  title: string
  items: BallStatItem[]
  color: 'red' | 'blue'
  models: PredictionModel[]
  compact?: boolean
  hitSet?: Set<string>
}) {
  return (
    <div className={clsx('summary-list', compact && 'summary-list--compact')}>
      <h3>{title}</h3>
      <div className="summary-list__items">
        {items.map((item) => (
          <article key={`${title}-${item.ball}`} className="ball-stat-card">
            <div className="ball-stat-card__ball">
              <NumberBall value={item.ball} color={color} tone={hitSet && !hitSet.has(item.ball) ? 'muted' : 'default'} />
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
        命中 {item.matchedModelCount}/{item.selectedModelCount}
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

function calculatePageForPageSize(currentPage: number, currentPageSize: number, nextPageSize: number) {
  const currentOffset = (currentPage - 1) * currentPageSize
  return Math.floor(currentOffset / nextPageSize) + 1
}

function PagerControls({
  page,
  totalPages,
  totalCount,
  pageSize,
  pageSizeOptions,
  unitLabel,
  onPageSizeChange,
  onPrevious,
  onNext,
}: {
  page: number
  totalPages: number
  totalCount: number
  pageSize: number
  pageSizeOptions: readonly number[]
  unitLabel: string
  onPageSizeChange: (nextPageSize: number) => void
  onPrevious: () => void
  onNext: () => void
}) {
  if (totalCount <= 0) return null

  return (
    <div className="pagination-row history-pagination-row">
      <div className="history-pagination-row__meta">
        <span>第 {page} / {totalPages} 页</span>
        <span>共 {totalCount} 条记录</span>
      </div>
      <div className="history-pagination-row__actions">
        <label className="history-pagination-row__size">
          <span>每页</span>
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} {unitLabel}
              </option>
            ))}
          </select>
        </label>
        <button className="ghost-button" disabled={page <= 1} onClick={onPrevious}>
          上一页
        </button>
        <button className="ghost-button" disabled={page >= totalPages} onClick={onNext}>
          下一页
        </button>
      </div>
    </div>
  )
}

export function ModelScoreShowcase({ score, compact = false, lotteryCode = 'dlt' }: { score?: ModelScore; compact?: boolean; lotteryCode?: LotteryCode }) {
  if (!score) return null
  const lotteryLabel = lotteryCode === 'dlt' ? '大乐透' : lotteryCode === 'pl3' ? '排列3' : '排列5'

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
          <small>{lotteryLabel}近期净盈亏 {formatCurrency(score.recentWindow.net_profit)}</small>
          <small>{score.recentWindow.periods} 期 / {score.recentWindow.bets} 注</small>
        </div>
        <div className="score-showcase__window">
          <span>长期全量</span>
          <strong>ROI {Math.round((score.longTermWindow.roi || 0) * 100)}%</strong>
          <small>{lotteryLabel}长期净盈亏 {formatCurrency(score.longTermWindow.net_profit)}</small>
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
  modelCandidates,
  selectedModelIds,
  onToggleSelectedModel,
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
  modelCandidates: PredictionModel[]
  selectedModelIds: string[]
  onToggleSelectedModel: (modelId: string) => void
  availableProviders: string[]
  selectedProviders: string[]
  onToggleProvider: (provider: string) => void
  availableTags: string[]
  selectedTags: string[]
  onToggleTag: (tag: string) => void
  selectedScoreRange: ModelListScoreRange
  onSelectScoreRange: (value: ModelListScoreRange) => void
}) {
  const selectedModels = useMemo(() => modelCandidates, [modelCandidates])
  const normalizedQuery = modelNameQuery.trim().toLowerCase()
  const matchedModels = useMemo(
    () =>
      normalizedQuery
        ? modelCandidates.filter((model) => {
            const modelName = (model.model_name || '').toLowerCase()
            const modelId = (model.model_id || '').toLowerCase()
            return modelName.includes(normalizedQuery) || modelId.includes(normalizedQuery)
          })
        : [],
    [modelCandidates, normalizedQuery],
  )

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

      <div className="model-filter-panel__group">
        <strong>已选中模型</strong>
        <div className="filter-chip-group">
          {selectedModels.length ? (
            selectedModels.map((model) => (
              <button
                key={`selected-model-${model.model_id}`}
                className={clsx('filter-chip', selectedModelIds.includes(model.model_id) ? 'is-active' : 'is-inactive')}
                type="button"
                onClick={() => onToggleSelectedModel(model.model_id)}
              >
                {model.model_name}
              </button>
            ))
          ) : (
            <span className="model-filter-panel__empty">暂无已选模型</span>
          )}
        </div>
      </div>

      <div className="model-filter-panel__group">
        <strong>搜索匹配模型</strong>
        <div className="filter-chip-group">
          {normalizedQuery ? (
            matchedModels.length ? (
              matchedModels.map((model) => (
                <button
                  key={`matched-model-${model.model_id}`}
                  className={clsx('filter-chip', selectedModelIds.includes(model.model_id) && 'is-active')}
                  type="button"
                  onClick={() => onToggleSelectedModel(model.model_id)}
                >
                  {model.model_name}
                </button>
              ))
            ) : (
              <span className="model-filter-panel__empty">无匹配模型</span>
            )
          ) : (
            <span className="model-filter-panel__empty">输入关键词后展示匹配模型</span>
          )}
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
  strategyFilters,
  playTypeFilters,
}: {
  record: PredictionsHistoryListRecord
  lotteryCode: LotteryCode
  visibleModelIds: string[]
  strategyFilters: string[]
  playTypeFilters: PredictionPlayType[]
}) {
  const [expandedModelIds, setExpandedModelIds] = useState<string[]>([])
  const [isPeriodSummaryOpen, setIsPeriodSummaryOpen] = useState(false)
  const hasExpandedModels = expandedModelIds.length > 0
  const detailQuery = useQuery({
    queryKey: ['predictions-history-detail', lotteryCode, record.target_period],
    enabled: hasExpandedModels || isPeriodSummaryOpen,
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
  const listModels = record.models || []
  const detailModelCandidatesById = useMemo(() => {
    const mappings = new Map<string, PredictionModel[]>()
    for (const model of detailRecord?.models || []) {
      const candidates = mappings.get(model.model_id) || []
      candidates.push(model)
      mappings.set(model.model_id, candidates)
    }
    return mappings
  }, [detailRecord])
  const normalizedStrategyFilters = useMemo(
    () => strategyFilters.map((item) => normalizeStrategyLabel(item)),
    [strategyFilters],
  )
  const normalizedPlayTypeFilters = useMemo(
    () => playTypeFilters,
    [playTypeFilters],
  )
  const isPl3SumMode = useMemo(
    () => lotteryCode === 'pl3' && normalizedPlayTypeFilters.length > 0 && normalizedPlayTypeFilters.every((playType) => playType === 'direct_sum'),
    [lotteryCode, normalizedPlayTypeFilters],
  )
  const strategyFilterSet = useMemo(
    () => new Set(normalizedStrategyFilters),
    [normalizedStrategyFilters],
  )
  const periodSummary = listModels.reduce(
    (accumulator, model) => ({
      total_bet_count: accumulator.total_bet_count + (model.bet_count || 0),
      total_cost_amount: accumulator.total_cost_amount + (model.cost_amount || 0),
      total_prize_amount: accumulator.total_prize_amount + (model.prize_amount || 0),
    }),
    { total_bet_count: 0, total_cost_amount: 0, total_prize_amount: 0 },
  )
  const actualLotteryCode = record.actual_result?.lottery_code || 'dlt'
  const actualMainBalls = actualLotteryCode === 'dlt'
    ? (record.actual_result?.red_balls || [])
    : (record.actual_result?.digits?.length ? record.actual_result.digits : (record.actual_result?.red_balls || []))
  const allListModelModeKeys = useMemo(() => listModels.map((model) => resolveHistoryModelModeKey(model)), [listModels])
  const availableModelModeKeys = useMemo(() => new Set(allListModelModeKeys), [allListModelModeKeys])
  const areAllModelsExpanded = allListModelModeKeys.length > 0 && allListModelModeKeys.every((modelKey) => expandedModelIds.includes(modelKey))
  const periodSummaryModels = detailRecord?.models || []
  const periodSummaryModelIds = useMemo(() => periodSummaryModels.map((model) => model.model_id), [periodSummaryModels])
  const periodPredictionSummary = useMemo(
    () => buildSummary(periodSummaryModels, {}, periodSummaryModelIds, false, false, strategyFilters, playTypeFilters),
    [periodSummaryModelIds, periodSummaryModels, playTypeFilters, strategyFilters],
  )
  const hasPeriodSummaryStats = useMemo(
    () =>
      periodPredictionSummary.red.length > 0 ||
      periodPredictionSummary.blue.length > 0 ||
      periodPredictionSummary.sums.length > 0 ||
      (periodPredictionSummary.positions || []).some((items) => items.length > 0),
    [periodPredictionSummary],
  )
  const periodSummaryHitSets = useMemo(() => {
    const redHits = new Set((record.actual_result?.red_balls || []).map((ball) => String(ball).padStart(2, '0')))
    const blueHits = new Set((record.actual_result?.blue_balls || []).map((ball) => String(ball).padStart(2, '0')))
    const digitSource = (record.actual_result?.digits?.length
      ? record.actual_result.digits
      : record.actual_result?.red_balls || []
    ).map((ball) => String(ball).padStart(2, '0'))
    const sumHits = new Set<string>([String(digitSource.slice(0, 3).reduce((total, digit) => total + Number(digit || 0), 0))])
    const positionHits = Array.from({ length: 5 }, (_, index) =>
      digitSource[index] ? new Set([digitSource[index]]) : new Set<string>(),
    )
    return { redHits, blueHits, sumHits, positionHits }
  }, [record.actual_result])

  useEffect(() => {
    setExpandedModelIds((previous) => {
      const next = previous.filter((modelKey) => availableModelModeKeys.has(modelKey))
      return next.length === previous.length ? previous : next
    })
  }, [availableModelModeKeys])

  function toggleModelExpansion(modelModeKey: string) {
    setExpandedModelIds((previous) =>
      previous.includes(modelModeKey) ? previous.filter((id) => id !== modelModeKey) : [...previous, modelModeKey],
    )
  }

  function toggleAllModelExpansion() {
    setExpandedModelIds(areAllModelsExpanded ? [] : allListModelModeKeys)
  }

  function togglePeriodSummary() {
    setIsPeriodSummaryOpen((previous) => !previous)
  }

  return (
    <article className="history-record-card">
      <div className="history-record-card__header">
        <div className="history-record-card__title-block">
          <p className="history-record-card__eyebrow">第 {record.target_period} 期</p>
          <h3>开奖回溯</h3>
        </div>
        <div className="history-record-card__actions">
          {allListModelModeKeys.length ? (
            <button
              type="button"
              className="ghost-button ghost-button--compact history-record-card__bulk-toggle"
              onClick={toggleAllModelExpansion}
              aria-label={`${areAllModelsExpanded ? '收起该期全部模型详情' : '展开该期全部模型详情'}：第 ${record.target_period} 期`}
              title={`${areAllModelsExpanded ? '收起该期全部模型详情' : '展开该期全部模型详情'}：第 ${record.target_period} 期`}
            >
              {areAllModelsExpanded ? '收起全部' : '展开全部'}
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button ghost-button--compact history-record-card__bulk-toggle"
            onClick={togglePeriodSummary}
            aria-label={`${isPeriodSummaryOpen ? '隐藏该期预测统计' : '显示该期预测统计'}：第 ${record.target_period} 期`}
            title={`${isPeriodSummaryOpen ? '隐藏该期预测统计' : '显示该期预测统计'}：第 ${record.target_period} 期`}
          >
            {isPeriodSummaryOpen ? '隐藏统计' : '显示统计'}
          </button>
          <span className="history-record-card__date">{record.actual_result?.date || '-'}</span>
        </div>
      </div>
      {record.actual_result ? (
        <div className="number-row history-record-card__numbers">
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
        <span className="history-metric-pill">{periodSummary.total_bet_count} 注</span>
        <span className="history-metric-pill">成本 {formatCurrency(periodSummary.total_cost_amount)}</span>
        <span className="history-metric-pill">奖金 {formatCurrency(periodSummary.total_prize_amount)}</span>
      </div>
      <div className="history-record-card__models">
        {listModels.map((model) => {
          const modelModeKey = resolveHistoryModelModeKey(model)
          const isExpanded = expandedModelIds.includes(modelModeKey)
          const listModelMode = normalizePredictionModelPlayMode(model)
          const currentPl3Mode: 'direct' | 'direct_sum' | null = lotteryCode === 'pl3' ? (isPl3SumMode ? 'direct_sum' : 'direct') : null
          const detailCandidates = detailModelCandidatesById.get(model.model_id) || []
          const detailCandidateMetrics = detailCandidates.map((candidate) => {
            const candidateMode = normalizePredictionModelPlayMode(candidate)
            const candidatePredictions = candidate.predictions || []
            const candidateStrategies = new Set(candidatePredictions.map((group) => normalizeStrategyLabel(group.strategy)))
            const candidateMatchesStrategies =
              !normalizedStrategyFilters.length ||
              normalizedStrategyFilters.every((strategy) => candidateStrategies.has(strategy))
            const playTypeFilteredPredictions = filterPredictionGroupsByPlayType(candidatePredictions, normalizedPlayTypeFilters)
            const filteredPredictions = !normalizedStrategyFilters.length
              ? playTypeFilteredPredictions
              : playTypeFilteredPredictions.filter((group) => strategyFilterSet.has(normalizeStrategyLabel(group.strategy)))
            const score =
              (filteredPredictions.length > 0 ? 100 : 0) +
              (playTypeFilteredPredictions.length > 0 ? 10 : 0) +
              (currentPl3Mode && candidateMode === currentPl3Mode ? 2 : 0) +
              (candidateMode === listModelMode ? 1 : 0)
            return {
              candidate,
              candidateMatchesStrategies,
              playTypeFilteredPredictions,
              filteredPredictions,
              score,
            }
          })
          const preferredCandidate = detailCandidateMetrics.reduce<(typeof detailCandidateMetrics)[number] | null>((best, metric) => {
            if (!best) return metric
            return metric.score > best.score ? metric : best
          }, null)
          const detailModel = preferredCandidate?.candidate || null
          const detailId = `history-record-card-${record.target_period}-${modelModeKey.replace(/[^a-zA-Z0-9_-]/g, '-')}-detail`
          const matchesAllStrategies =
            !normalizedStrategyFilters.length ||
            detailCandidateMetrics.some((metric) => metric.candidateMatchesStrategies)
          const filteredDetailPredictions = preferredCandidate?.filteredPredictions || []
          const matchesPlayTypes =
            !normalizedPlayTypeFilters.length ||
            detailCandidateMetrics.some((metric) => metric.playTypeFilteredPredictions.length > 0)
          const filteredDetailBetCount = filteredDetailPredictions.length
          const filteredDetailWinningBetCount = filteredDetailPredictions.filter((group) => Number(group.prize_amount || 0) > 0).length
          const filteredDetailPrizeAmount = filteredDetailPredictions.reduce((sum, group) => sum + Number(group.prize_amount || 0), 0)
          const filteredDetailCostAmount = filteredDetailPredictions.reduce(
            (sum, group) => sum + resolveHistoryPredictionGroupCost(group, lotteryCode),
            0,
          )
          const filteredWinRateByPeriod = filteredDetailWinningBetCount > 0 ? 1 : 0
          const filteredWinRateByBet = filteredDetailBetCount ? filteredDetailWinningBetCount / filteredDetailBetCount : 0

          return (
            <section key={`${record.target_period}-${modelModeKey}`} className={clsx('history-record-card__model', isExpanded && 'is-expanded')}>
              <button
                type="button"
                className={clsx('history-record-card__model-trigger', isExpanded && 'is-expanded')}
                onClick={() => toggleModelExpansion(modelModeKey)}
                aria-expanded={isExpanded}
                aria-controls={detailId}
                aria-label={`${isExpanded ? '收起模型详情' : '展开模型详情'}：${model.model_name}`}
                title={`${isExpanded ? '收起模型详情' : '展开模型详情'}：${model.model_name}`}
              >
                <div className="history-record-card__model-nameplate">
                  <strong className="history-record-card__model-name">{model.model_name}</strong>
                </div>
                <div className="history-record-card__model-grid">
                  <span className="history-record-card__metric-cell">
                    <small>注数</small>
                    <strong>{model.bet_count || 0}</strong>
                  </span>
                  <span className="history-record-card__metric-cell">
                    <small>成本</small>
                    <strong>{formatCurrency(model.cost_amount)}</strong>
                  </span>
                  <span className="history-record-card__metric-cell">
                    <small>奖金</small>
                    <strong>{formatCurrency(model.prize_amount)}</strong>
                  </span>
                </div>
                <span className={clsx('history-record-card__model-expand-indicator', isExpanded && 'is-expanded')} aria-hidden="true">
                  <HomeChevronIcon open={isExpanded} />
                </span>
              </button>
              {isExpanded ? (
                <div id={detailId} className="history-record-card__model-detail">
                  {detailQuery.isLoading ? <div className="state-shell">正在加载该模型预测详情...</div> : null}
                  {detailQuery.error instanceof Error ? (
                    <div className="state-shell state-shell--error">详情加载失败：{detailQuery.error.message}</div>
                  ) : null}
                  {!detailQuery.isLoading && !detailQuery.error && !detailModel ? (
                    <div className="state-shell">暂无该模型预测详情。</div>
                  ) : null}
                  {!detailQuery.isLoading && !detailQuery.error && detailModel && !matchesAllStrategies ? (
                    <div className="state-shell">该模型不满足所选方案组合。</div>
                  ) : null}
                  {!detailQuery.isLoading && !detailQuery.error && detailModel && matchesAllStrategies && !matchesPlayTypes ? (
                    <div className="state-shell">该模型不满足所选玩法。</div>
                  ) : null}
                  {!detailQuery.isLoading && !detailQuery.error && detailModel && matchesAllStrategies && matchesPlayTypes ? (
                    <section className="history-record-card__detail-model">
                      <div className="history-record-card__detail-header">
                        <div className="history-record-card__detail-heading">
                          <strong>{detailModel.model_name}</strong>
                          <p>{detailModel.model_provider}</p>
                        </div>
                        <div className="history-record-card__detail-rate-grid">
                          <span className="history-record-card__metric-cell">
                            <small>按期中奖率</small>
                            <strong>{formatPercent(filteredWinRateByPeriod)}</strong>
                          </span>
                          <span className="history-record-card__metric-cell">
                            <small>按注中奖率</small>
                            <strong>{formatPercent(filteredWinRateByBet)}</strong>
                          </span>
                        </div>
                      </div>
                      <div className="history-record-card__detail-summary">
                        <span className="history-metric-pill">{filteredDetailBetCount} 注</span>
                        <span className="history-metric-pill">成本 {formatCurrency(filteredDetailCostAmount)}</span>
                        <span className="history-metric-pill">奖金 {formatCurrency(filteredDetailPrizeAmount)}</span>
                      </div>
                      <div className="detail-group-list">
                        {filteredDetailPredictions.map((group) => (
                          <PredictionGroupCard
                            key={`${record.target_period}-${detailModel.model_id}-${group.group_id}`}
                            group={group}
                            actualResult={record.actual_result}
                            compact
                            grayMisses
                            emphasizeHitTier
                            showCost
                            showDescriptionInCompact
                          />
                        ))}
                      </div>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
      {isPeriodSummaryOpen ? (
        <div className="history-record-card__period-summary">
          {detailQuery.isLoading ? <div className="state-shell">正在加载该期预测统计...</div> : null}
          {detailQuery.error instanceof Error ? (
            <div className="state-shell state-shell--error">统计加载失败：{detailQuery.error.message}</div>
          ) : null}
          {!detailQuery.isLoading && !detailQuery.error && !detailRecord ? (
            <div className="state-shell">暂无该期预测详情，无法统计。</div>
          ) : null}
          {!detailQuery.isLoading && !detailQuery.error && detailRecord && !hasPeriodSummaryStats ? (
            <div className="state-shell">当前筛选条件下暂无可统计号码。</div>
          ) : null}
          {!detailQuery.isLoading && !detailQuery.error && detailRecord && hasPeriodSummaryStats ? (
            <div className="summary-columns">
              {lotteryCode === 'pl5' ? (
                <>
                  <SummaryList title="第一位（万位）统计" items={periodPredictionSummary.positions?.[0] || []} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.positionHits[0]} />
                  <SummaryList title="第二位（千位）统计" items={periodPredictionSummary.positions?.[1] || []} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.positionHits[1]} />
                  <SummaryList title="第三位（百位）统计" items={periodPredictionSummary.positions?.[2] || []} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.positionHits[2]} />
                  <SummaryList title="第四位（十位）统计" items={periodPredictionSummary.positions?.[3] || []} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.positionHits[3]} />
                  <SummaryList title="第五位（个位）统计" items={periodPredictionSummary.positions?.[4] || []} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.positionHits[4]} />
                </>
	              ) : lotteryCode === 'pl3' ? (
	                <>
	                  {isPl3SumMode ? (
	                    <SummaryList title="和值统计" items={periodPredictionSummary.sums || []} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.sumHits} />
	                  ) : (
	                    <>
	                      <SummaryList title="第一位（百位）统计" items={periodPredictionSummary.positions?.[0] || []} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.positionHits[0]} />
	                      <SummaryList title="第二位（十位）统计" items={periodPredictionSummary.positions?.[1] || []} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.positionHits[1]} />
	                      <SummaryList title="第三位（个位）统计" items={periodPredictionSummary.positions?.[2] || []} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.positionHits[2]} />
	                    </>
	                  )}
	                </>
	              ) : (
                <>
                  <SummaryList title="前区统计" items={periodPredictionSummary.red} color="red" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.redHits} />
                  <SummaryList title="后区统计" items={periodPredictionSummary.blue} color="blue" models={periodSummaryModels} compact hitSet={periodSummaryHitSets.blueHits} />
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
