import { useEffect, useMemo, useState } from 'react'
import {
  buildHistoryHitTrend,
  buildModelScores,
  buildSummary,
  filterHistoryRecords,
  filterModels,
  type ModelListScoreRange,
  sortModels,
} from '../lib/home'
import type { PredictionModel, PredictionsHistoryListResponse } from '../../../shared/types/api'

type HomeModelFilterInitialState = {
  isModelFilterOpen?: boolean
  modelNameQuery?: string
  selectedProviders?: string[]
  selectedTags?: string[]
  selectedScoreRange?: ModelListScoreRange
}

export function useHomeModelFilters(
  models: PredictionModel[],
  history: PredictionsHistoryListResponse | undefined,
  pinnedModelIds: string[],
  initialState?: HomeModelFilterInitialState,
) {
  const [isModelFilterOpen, setIsModelFilterOpen] = useState(Boolean(initialState?.isModelFilterOpen))
  const [modelNameQuery, setModelNameQuery] = useState(initialState?.modelNameQuery || '')
  const [selectedProviders, setSelectedProviders] = useState<string[]>(initialState?.selectedProviders || [])
  const [selectedTags, setSelectedTags] = useState<string[]>(initialState?.selectedTags || [])
  const [selectedScoreRange, setSelectedScoreRange] = useState<ModelListScoreRange>(initialState?.selectedScoreRange || 'all')
  const [summarySelectedModelIds, setSummarySelectedModelIds] = useState<string[] | null>(null)

  const modelScores = useMemo(() => (history ? buildModelScores(history, models) : {}), [history, models])
  const orderedModels = useMemo(() => sortModels(models, modelScores, pinnedModelIds), [models, modelScores, pinnedModelIds])
  const availableProviders = useMemo(
    () => [...new Set(orderedModels.map((model) => model.model_provider).filter(Boolean))],
    [orderedModels],
  )
  const availableTags = useMemo(
    () => [...new Set(orderedModels.flatMap((model) => model.model_tags || []).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [orderedModels],
  )
  const filteredModels = useMemo(
    () =>
      filterModels(orderedModels, modelScores, {
        nameQuery: modelNameQuery,
        selectedProviders,
        selectedTags,
        scoreRange: selectedScoreRange,
      }),
    [orderedModels, modelScores, modelNameQuery, selectedProviders, selectedTags, selectedScoreRange],
  )
  const filteredModelIds = useMemo(() => filteredModels.map((model) => model.model_id), [filteredModels])

  useEffect(() => {
    setSummarySelectedModelIds((previous) => {
      if (previous === null) return null
      const next = previous.filter((modelId) => filteredModelIds.includes(modelId))
      return next.length === previous.length ? previous : next
    })
  }, [filteredModelIds])

  function toggleModelProvider(provider: string) {
    setSelectedProviders((previous) =>
      previous.includes(provider) ? previous.filter((item) => item !== provider) : [...previous, provider],
    )
  }

  function toggleModelTag(tag: string) {
    setSelectedTags((previous) => (previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag]))
  }

  function clearModelFilters() {
    setModelNameQuery('')
    setSelectedProviders([])
    setSelectedTags([])
    setSelectedScoreRange('all')
  }

  function toggleSummaryModel(modelId: string) {
    const fallbackIds = filteredModelIds
    setSummarySelectedModelIds((previous) => {
      const current = previous ?? fallbackIds
      return current.includes(modelId) ? current.filter((item) => item !== modelId) : [...current, modelId]
    })
  }

  function buildHistoryState(
    periodQuery: string,
    commonOnly: boolean,
    weightedSummary: boolean,
    historyModelIdsOverride?: string[],
    summaryStrategyFilters: string[] = [],
  ) {
    const selectedSummaryIds = summarySelectedModelIds ?? filteredModelIds
    const summary = buildSummary(filteredModels, modelScores, selectedSummaryIds, weightedSummary, commonOnly, summaryStrategyFilters)
    const historyModelIds = historyModelIdsOverride ?? filteredModelIds
    const filteredHistory = history ? filterHistoryRecords(history, historyModelIds, periodQuery) : []
    const historyHitTrend = buildHistoryHitTrend(filteredHistory, historyModelIds)

    return {
      selectedSummaryIds,
      summary,
      filteredHistory,
      historyHitTrend,
    }
  }

  return {
    isModelFilterOpen,
    setIsModelFilterOpen,
    modelNameQuery,
    setModelNameQuery,
    selectedProviders,
    setSelectedProviders,
    selectedTags,
    setSelectedTags,
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
  }
}
