import type {
  CurrentPredictionsResponse,
  LotteryDraw,
  PredictionHistorySummaryModel,
  PredictionsHistoryListResponse,
  PredictionsHistoryResponse,
  PredictionGroup,
  PredictionModel,
} from '../../../shared/types/api'
import { average, byFrequencyDescending, padBall } from '../../../shared/lib/format'

export const SCORE_WINDOW = 20

export type ModelScore = {
  score100: number
  bestComponent: number
  avgComponent: number
  sampleSize: number
}

export type BallStatItem = {
  ball: string
  appearanceCount: number
  totalGroupCount: number
  matchedModelCount: number
  selectedModelCount: number
  appearanceRatio: number
  weightedScore: number
}

export type ModelListScoreRange = 'all' | '0-30' | '31-60' | '61-80' | '81-100'

export type ModelListFilters = {
  nameQuery: string
  selectedProviders: string[]
  selectedTags: string[]
  scoreRange: ModelListScoreRange
}

export function normalizeDraw(draw: LotteryDraw): LotteryDraw {
  return {
    ...draw,
    red_balls: (draw.red_balls || []).map(padBall).sort(),
    blue_balls: (draw.blue_balls || []).map(padBall).sort(),
    blue_ball: (draw.blue_balls || [])[0] || null,
  }
}

export function normalizeGroup(group: PredictionGroup): PredictionGroup {
  return {
    ...group,
    red_balls: (group.red_balls || []).map(padBall).sort(),
    blue_balls: (group.blue_balls || []).map(padBall).sort(),
    blue_ball: (group.blue_balls || [])[0] || null,
    hit_result: group.hit_result
      ? {
          ...group.hit_result,
          red_hits: (group.hit_result.red_hits || []).map(padBall).sort(),
          blue_hits: (group.hit_result.blue_hits || []).map(padBall).sort(),
        }
      : undefined,
  }
}

export function normalizeCurrentPredictions(data: CurrentPredictionsResponse): CurrentPredictionsResponse {
  return {
    ...data,
    models: (data.models || []).map((model) => ({
      ...model,
      predictions: (model.predictions || []).map(normalizeGroup),
    })),
  }
}

export function normalizePredictionsHistory(data: PredictionsHistoryResponse): PredictionsHistoryResponse {
  return {
    ...data,
    predictions_history: (data.predictions_history || []).map((record) => ({
      ...record,
      actual_result: record.actual_result ? normalizeDraw(record.actual_result) : null,
      models: (record.models || []).map((model) => ({
        ...model,
        predictions: (model.predictions || []).map(normalizeGroup),
      })),
    })),
  }
}

export function normalizePredictionsHistoryList(data: PredictionsHistoryListResponse): PredictionsHistoryListResponse {
  return {
    ...data,
    predictions_history: (data.predictions_history || []).map((record) => ({
      ...record,
      actual_result: record.actual_result ? normalizeDraw(record.actual_result) : null,
      models: record.models || [],
    })),
  }
}

export function compareNumbers(prediction: PredictionGroup, actualResult: LotteryDraw | null) {
  if (!actualResult) return null
  const redHits = prediction.red_balls.filter((ball) => actualResult.red_balls.includes(ball))
  const blueHits = prediction.blue_balls.filter((ball) => actualResult.blue_balls.includes(ball))
  return {
    redHits,
    redHitCount: redHits.length,
    blueHits,
    blueHitCount: blueHits.length,
    totalHits: redHits.length + blueHits.length,
  }
}

export function buildModelScores(history: PredictionsHistoryListResponse, models: PredictionModel[]): Record<string, ModelScore> {
  const records = (history.predictions_history || []).slice(0, SCORE_WINDOW)
  const result: Record<string, ModelScore> = {}

  for (const model of models) {
    const periods = records
      .map((record) => record.models.find((item) => item.model_id === model.model_id))
      .filter((item): item is PredictionHistorySummaryModel => Boolean(item))
      .map((historyModel) => {
        const bestScore = Number(historyModel.best_hit_count || 0) / 7
        const avgScore = bestScore
        return {
          bestScore,
          avgScore,
          periodScore: bestScore * 0.6 + avgScore * 0.4,
        }
      })

    result[model.model_id] = {
      score100: periods.length ? Math.round(average(periods.map((item) => item.periodScore)) * 100) : 0,
      bestComponent: periods.length ? Math.round(average(periods.map((item) => item.bestScore)) * 100) : 0,
      avgComponent: periods.length ? Math.round(average(periods.map((item) => item.avgScore)) * 100) : 0,
      sampleSize: periods.length,
    }
  }

  return result
}

export function getActualResult(draws: LotteryDraw[], targetPeriod: string) {
  return draws.find((draw) => draw.period === targetPeriod) || null
}

export function sortModels(models: PredictionModel[], scores: Record<string, ModelScore>, pinnedModelIds: string[]) {
  const pinnedIndex = new Map(pinnedModelIds.map((id, index) => [id, index]))
  return [...models].sort((left, right) => {
    const leftPinned = pinnedIndex.has(left.model_id)
    const rightPinned = pinnedIndex.has(right.model_id)
    if (leftPinned && rightPinned) return (pinnedIndex.get(left.model_id) || 0) - (pinnedIndex.get(right.model_id) || 0)
    if (leftPinned) return -1
    if (rightPinned) return 1
    return (scores[right.model_id]?.score100 || 0) - (scores[left.model_id]?.score100 || 0)
  })
}

function matchesScoreRange(score: number, scoreRange: ModelListScoreRange) {
  if (scoreRange === 'all') return true
  if (scoreRange === '0-30') return score >= 0 && score <= 30
  if (scoreRange === '31-60') return score >= 31 && score <= 60
  if (scoreRange === '61-80') return score >= 61 && score <= 80
  return score >= 81 && score <= 100
}

export function filterModels(
  models: PredictionModel[],
  scores: Record<string, ModelScore>,
  filters: ModelListFilters,
) {
  const normalizedQuery = filters.nameQuery.trim().toLowerCase()
  return models.filter((model) => {
    const score = scores[model.model_id]?.score100 || 0
    const modelName = (model.model_name || '').toLowerCase()
    const modelId = (model.model_id || '').toLowerCase()
    const provider = model.model_provider || ''
    const tags = model.model_tags || []

    if (normalizedQuery && !modelName.includes(normalizedQuery) && !modelId.includes(normalizedQuery)) {
      return false
    }

    if (filters.selectedProviders.length && !filters.selectedProviders.includes(provider)) {
      return false
    }

    if (filters.selectedTags.length && !filters.selectedTags.every((tag) => tags.includes(tag))) {
      return false
    }

    if (!matchesScoreRange(score, filters.scoreRange)) {
      return false
    }

    return true
  })
}

export function buildSummary(models: PredictionModel[], scores: Record<string, ModelScore>, selectedIds: string[], weighted: boolean, commonOnly: boolean) {
  const selectedModels = models.filter((model) => selectedIds.includes(model.model_id))
  const redMap = new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>()
  const blueMap = new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>()
  const totalGroupCount = selectedModels.reduce((sum, model) => sum + model.predictions.length, 0)

  for (const model of selectedModels) {
    const weight = weighted ? (scores[model.model_id]?.score100 || 0) / 100 || 1 : 1
    const redSeen = new Set<string>()
    const blueSeen = new Set<string>()
    for (const group of model.predictions) {
      for (const red of group.red_balls) {
        const current = redMap.get(red) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
        current.appearanceCount += 1
        current.weightedScore += weight
        redMap.set(red, current)
        redSeen.add(red)
      }
      for (const blue of group.blue_balls) {
        const current = blueMap.get(blue) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
        current.appearanceCount += 1
        current.weightedScore += weight
        blueMap.set(blue, current)
        blueSeen.add(blue)
      }
    }
    for (const red of redSeen) redMap.get(red)?.models.add(model.model_id)
    for (const blue of blueSeen) blueMap.get(blue)?.models.add(model.model_id)
  }

  const modelCount = selectedModels.length
  const normalize = (source: Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>) =>
    [...source.entries()]
      .map(([ball, meta]) => ({
        ball,
        appearanceCount: meta.appearanceCount,
        totalGroupCount,
        matchedModelCount: meta.models.size,
        selectedModelCount: modelCount,
        appearanceRatio: totalGroupCount ? meta.appearanceCount / totalGroupCount : 0,
        weightedScore: Number(meta.weightedScore.toFixed(2)),
      }))
      .filter((item) => item.appearanceCount > 0)
      .filter((item) => !commonOnly || item.matchedModelCount === modelCount)
      .sort(
        (left, right) =>
          right.weightedScore - left.weightedScore ||
          right.appearanceCount - left.appearanceCount ||
          left.ball.localeCompare(right.ball),
      )

  return {
    red: normalize(redMap),
    blue: normalize(blueMap),
  }
}

export function buildRedFrequencyChart(draws: LotteryDraw[]) {
  const counter: Record<string, number> = {}
  for (const draw of draws) {
    for (const red of draw.red_balls) counter[red] = (counter[red] || 0) + 1
  }
  return byFrequencyDescending(Object.entries(counter).map(([ball, count]) => ({ ball, count }))).slice(0, 12)
}

export function buildBlueFrequencyChart(draws: LotteryDraw[]) {
  const counter: Record<string, number> = {}
  for (const draw of draws) {
    for (const blue of draw.blue_balls) counter[blue] = (counter[blue] || 0) + 1
  }
  return byFrequencyDescending(Object.entries(counter).map(([ball, count]) => ({ ball, count }))).slice(0, 12)
}

export function buildOddEvenChart(draws: LotteryDraw[]) {
  return draws.slice(0, 20).reverse().map((draw) => ({
    period: draw.period,
    odd: draw.red_balls.filter((ball) => Number(ball) % 2 === 1).length,
    even: draw.red_balls.filter((ball) => Number(ball) % 2 === 0).length,
  }))
}

export function buildSumTrendChart(draws: LotteryDraw[]) {
  return draws.slice(0, 20).reverse().map((draw) => ({
    period: draw.period,
    sum: draw.red_balls.reduce((total, ball) => total + Number(ball), 0),
  }))
}

export function buildHistoryHitTrend(
  records: PredictionsHistoryListResponse['predictions_history'],
  selectedModelIds: string[],
) {
  const seriesModelIds = selectedModelIds.length
    ? selectedModelIds
    : Array.from(
        new Set(
          (records || []).flatMap((record) => record.models.map((model) => model.model_id)),
        ),
      )

  return (records || []).map((record) => {
    const point: Record<string, string | number> = {
      period: record.target_period,
    }

    for (const modelId of seriesModelIds) {
      const model = record.models.find((item) => item.model_id === modelId)
      point[modelId] = Number(model?.best_hit_count || 0)
    }

    return point
  })
}

export function filterHistoryRecords(history: PredictionsHistoryListResponse, selectedModelIds: string[], periodQuery: string) {
  return (history.predictions_history || []).filter((record) => {
    const matchesPeriod = !periodQuery || record.target_period.includes(periodQuery)
    const matchesModel =
      !selectedModelIds.length ||
      record.models.some((model) => selectedModelIds.includes(model.model_id))
    return matchesPeriod && matchesModel
  })
}
