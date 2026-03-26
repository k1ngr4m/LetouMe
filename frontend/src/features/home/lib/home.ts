import type {
  CurrentPredictionsResponse,
  LotteryCode,
  LotteryDraw,
  PredictionHistoryPeriodSummary,
  PredictionHistoryModelStat,
  PredictionsHistoryListResponse,
  PredictionsHistoryResponse,
  PredictionGroup,
  PredictionModel,
  ScoreProfile,
  ScoreSnapshot,
  ScoreWindowProfile,
} from '../../../shared/types/api'
import { byFrequencyDescending, padBall } from '../../../shared/lib/format'

export const SCORE_WINDOW = 20

export type ModelScore = {
  overallScore: number
  perBetScore: number
  perPeriodScore: number
  recentScore: number
  longTermScore: number
  componentScores: Record<string, number>
  recentWindow: ScoreWindowProfile
  longTermWindow: ScoreWindowProfile
  bestPeriod: ScoreSnapshot
  worstPeriod: ScoreSnapshot
  sampleSize: number
  betSampleSize: number
}

export type BallStatItem = {
  ball: string
  appearanceCount: number
  totalGroupCount: number
  matchedModelCount: number
  matchedModelIds: string[]
  selectedModelCount: number
  appearanceRatio: number
  weightedScore: number
}

export type ModelListScoreRange = 'all' | '0-30' | '31-60' | '61-80' | '81-100'
export type PredictionPlayType = 'direct' | 'direct_sum' | 'group3' | 'group6' | 'dlt_dantuo'

export type ModelListFilters = {
  nameQuery: string
  selectedProviders: string[]
  selectedTags: string[]
  scoreRange: ModelListScoreRange
}

export type HistoryFallbackResolutionInput = {
  hasHistoryRecords: boolean
  hasManualModelFilter: boolean
  hasCurrentModels: boolean
  filteredModelIds: string[]
  historyModelIds: string[]
  historyFallbackEnabled: boolean
}

export type HistoryFallbackResolution = {
  useHistoryFallbackModels: boolean
  needsHistoryFallbackPrompt: boolean
  hasHistoryModelIntersection: boolean
  noCurrentModelData: boolean
}

export type PredictionHitComparison = {
  redHits: string[]
  redHitCount: number
  blueHits: string[]
  blueHitCount: number
  digitHits: string[]
  digitHitCount: number
  digitHitIndexes: number[]
  totalHits: number
}

export function normalizeStrategyLabel(value?: string | null): string {
  const normalized = String(value || '').trim()
  return normalized || 'AI 组合策略'
}

export function normalizePredictionPlayType(value?: string | null): PredictionPlayType {
  if (value === 'dlt_dantuo') return 'dlt_dantuo'
  if (value === 'direct_sum') return 'direct_sum'
  if (value === 'group3') return 'group3'
  if (value === 'group6') return 'group6'
  return 'direct'
}

export function normalizePredictionModelPlayMode(
  model: { prediction_play_mode?: string | null; predictions?: PredictionGroup[]; [key: string]: unknown },
): 'direct' | 'direct_sum' | 'dantuo' {
  const explicitMode = String(model.prediction_play_mode || '').trim().toLowerCase()
  if (explicitMode === 'dantuo') return 'dantuo'
  if (explicitMode === 'direct_sum') return 'direct_sum'
  if (explicitMode === 'direct') return 'direct'
  const hasDantuoGroup = (model.predictions || []).some((group) => normalizePredictionPlayType(group.play_type) === 'dlt_dantuo')
  if (hasDantuoGroup) return 'dantuo'
  const hasDirectSumGroup = (model.predictions || []).some((group) => normalizePredictionPlayType(group.play_type) === 'direct_sum')
  return hasDirectSumGroup ? 'direct_sum' : 'direct'
}

export function groupMatchesPlayTypeFilters(group: PredictionGroup, playTypeFilters: PredictionPlayType[] = []) {
  if (!playTypeFilters.length) return true
  return playTypeFilters.includes(normalizePredictionPlayType(group.play_type))
}

export function filterPredictionGroupsByPlayType(groups: PredictionGroup[] = [], playTypeFilters: PredictionPlayType[] = []) {
  if (!playTypeFilters.length) return groups
  return groups.filter((group) => groupMatchesPlayTypeFilters(group, playTypeFilters))
}

export function inferPredictionGroupLotteryCode(group: PredictionGroup, actualResult: LotteryDraw | null = null): LotteryCode {
  const normalizedPlayType = normalizePredictionPlayType(group.play_type)
  const digitCount = (group.digits || []).length
  if (digitCount >= 5) return 'pl5'
  if (normalizedPlayType === 'dlt_dantuo') return 'dlt'
  if (normalizedPlayType === 'direct' && digitCount === 3) return 'pl3'
  if (normalizedPlayType === 'direct_sum' || normalizedPlayType === 'group3' || normalizedPlayType === 'group6') {
    return 'pl3'
  }
  if (actualResult?.lottery_code) return actualResult.lottery_code
  if (digitCount > 0) return 'pl3'
  return 'dlt'
}

export function normalizeDraw(draw: LotteryDraw): LotteryDraw {
  return {
    ...draw,
    lottery_code: draw.lottery_code || 'dlt',
    red_balls: (draw.red_balls || []).map(padBall).sort(),
    blue_balls: (draw.blue_balls || []).map(padBall).sort(),
    digits: (draw.digits || []).map(padBall),
    blue_ball: (draw.blue_balls || [])[0] || null,
    prize_breakdown: (draw.prize_breakdown || []).map((item) => ({
      ...item,
      prize_amount: Number(item.prize_amount || 0),
      total_amount: Number(item.total_amount || 0),
      winner_count: Number(item.winner_count || 0),
    })),
  }
}

export function normalizeGroup(group: PredictionGroup): PredictionGroup {
  return {
    ...group,
    sum_value: typeof group.sum_value === 'string' ? group.sum_value : undefined,
    cost_amount: Number(group.cost_amount || 0),
    red_balls: (group.red_balls || []).map(padBall).sort(),
    blue_balls: (group.blue_balls || []).map(padBall).sort(),
    digits: (group.digits || []).map(padBall),
    blue_ball: (group.blue_balls || [])[0] || null,
    prize_amount: Number(group.prize_amount || 0),
    hit_result: group.hit_result
      ? {
          ...group.hit_result,
          red_hits: (group.hit_result.red_hits || []).map(padBall).sort(),
          blue_hits: (group.hit_result.blue_hits || []).map(padBall).sort(),
          digit_hits: (group.hit_result.digit_hits || []).map(padBall),
        }
      : undefined,
  }
}

export function normalizeCurrentPredictions(data: CurrentPredictionsResponse): CurrentPredictionsResponse {
  return {
    ...data,
    lottery_code: data.lottery_code || 'dlt',
    models: (data.models || []).map((model) => ({
      ...model,
      prediction_play_mode: normalizePredictionModelPlayMode(model),
      predictions: (model.predictions || []).map(normalizeGroup),
    })),
  }
}

export function normalizePredictionsHistory(data: PredictionsHistoryResponse): PredictionsHistoryResponse {
  return {
    ...data,
    model_stats: (data.model_stats || []).map(normalizeModelStat),
    predictions_history: (data.predictions_history || []).map((record) => ({
      ...record,
      actual_result: record.actual_result ? normalizeDraw(record.actual_result) : null,
      models: (record.models || []).map((model) => ({
        ...model,
        prediction_play_mode: normalizePredictionModelPlayMode(model),
        bet_count: Number(model.bet_count || 0),
        cost_amount: Number(model.cost_amount || 0),
        winning_bet_count: Number(model.winning_bet_count || 0),
        prize_amount: Number(model.prize_amount || 0),
        win_rate_by_period: Number(model.win_rate_by_period || 0),
        win_rate_by_bet: Number(model.win_rate_by_bet || 0),
        score_profile: normalizeScoreProfile(model.score_profile),
        predictions: (model.predictions || []).map(normalizeGroup),
      })),
    })),
  }
}

export function normalizePredictionsHistoryList(data: PredictionsHistoryListResponse): PredictionsHistoryListResponse {
  return {
    ...data,
    model_stats: (data.model_stats || []).map(normalizeModelStat),
    predictions_history: (data.predictions_history || []).map((record) => ({
      ...record,
      actual_result: record.actual_result ? normalizeDraw(record.actual_result) : null,
      period_summary: normalizePeriodSummary(record.period_summary),
      models: (record.models || []).map((model) => ({
        ...model,
        prediction_play_mode: normalizePredictionModelPlayMode(model),
        bet_count: Number(model.bet_count || 0),
        cost_amount: Number(model.cost_amount || 0),
        winning_bet_count: Number(model.winning_bet_count || 0),
        prize_amount: Number(model.prize_amount || 0),
        win_rate_by_period: Number(model.win_rate_by_period || 0),
        win_rate_by_bet: Number(model.win_rate_by_bet || 0),
        score_profile: normalizeScoreProfile(model.score_profile),
      })),
    })),
  }
}

function normalizePeriodSummary(summary?: PredictionHistoryPeriodSummary): PredictionHistoryPeriodSummary {
  return {
    total_bet_count: Number(summary?.total_bet_count || 0),
    total_cost_amount: Number(summary?.total_cost_amount || 0),
    total_prize_amount: Number(summary?.total_prize_amount || 0),
  }
}

function normalizeScoreSnapshot(snapshot?: ScoreSnapshot): ScoreSnapshot {
  return {
    target_period: snapshot?.target_period || '',
    prediction_date: snapshot?.prediction_date || '',
    bet_count: Number(snapshot?.bet_count || 0),
    winning_bet_count: Number(snapshot?.winning_bet_count || 0),
    cost_amount: Number(snapshot?.cost_amount || 0),
    prize_amount: Number(snapshot?.prize_amount || 0),
    net_profit: Number(snapshot?.net_profit || 0),
    roi: Number(snapshot?.roi || 0),
    best_hit_count: Number(snapshot?.best_hit_count || 0),
  }
}

function normalizeScoreWindow(window?: ScoreWindowProfile): ScoreWindowProfile {
  return {
    overall_score: Number(window?.overall_score || 0),
    per_bet_score: Number(window?.per_bet_score || 0),
    per_period_score: Number(window?.per_period_score || 0),
    profit_score: Number(window?.profit_score || 0),
    hit_score: Number(window?.hit_score || 0),
    stability_score: Number(window?.stability_score || 0),
    ceiling_score: Number(window?.ceiling_score || 0),
    floor_score: Number(window?.floor_score || 0),
    periods: Number(window?.periods || 0),
    bets: Number(window?.bets || 0),
    hit_rate_by_period: Number(window?.hit_rate_by_period || 0),
    hit_rate_by_bet: Number(window?.hit_rate_by_bet || 0),
    cost_amount: Number(window?.cost_amount || 0),
    prize_amount: Number(window?.prize_amount || 0),
    net_profit: Number(window?.net_profit || 0),
    roi: Number(window?.roi || 0),
    avg_period_roi: Number(window?.avg_period_roi || 0),
    best_period: normalizeScoreSnapshot(window?.best_period),
    worst_period: normalizeScoreSnapshot(window?.worst_period),
  }
}

function normalizeScoreProfile(profile?: ScoreProfile): ScoreProfile {
  return {
    overall_score: Number(profile?.overall_score || 0),
    per_bet_score: Number(profile?.per_bet_score || 0),
    per_period_score: Number(profile?.per_period_score || 0),
    recent_score: Number(profile?.recent_score || 0),
    long_term_score: Number(profile?.long_term_score || 0),
    component_scores: {
      profit: Number(profile?.component_scores?.profit || 0),
      hit_rate: Number(profile?.component_scores?.hit_rate || 0),
      stability: Number(profile?.component_scores?.stability || 0),
      ceiling: Number(profile?.component_scores?.ceiling || 0),
      floor: Number(profile?.component_scores?.floor || 0),
    },
    recent_window: normalizeScoreWindow(profile?.recent_window),
    long_term_window: normalizeScoreWindow(profile?.long_term_window),
    best_period_snapshot: normalizeScoreSnapshot(profile?.best_period_snapshot),
    worst_period_snapshot: normalizeScoreSnapshot(profile?.worst_period_snapshot),
    sample_size_periods: Number(profile?.sample_size_periods || 0),
    sample_size_bets: Number(profile?.sample_size_bets || 0),
  }
}

function normalizeModelStat(item: PredictionHistoryModelStat): PredictionHistoryModelStat {
  return {
    ...item,
    prediction_play_mode: normalizePredictionModelPlayMode(item),
    periods: Number(item.periods || 0),
    winning_periods: Number(item.winning_periods || 0),
    bet_count: Number(item.bet_count || 0),
    winning_bet_count: Number(item.winning_bet_count || 0),
    cost_amount: Number(item.cost_amount || 0),
    prize_amount: Number(item.prize_amount || 0),
    win_rate_by_period: Number(item.win_rate_by_period || 0),
    win_rate_by_bet: Number(item.win_rate_by_bet || 0),
    score_profile: normalizeScoreProfile(item.score_profile),
  }
}

export function compareNumbers(prediction: PredictionGroup, actualResult: LotteryDraw | null): PredictionHitComparison | null {
  if (!actualResult) return null
  const inferredLotteryCode = inferPredictionGroupLotteryCode(prediction, actualResult)
  if (inferredLotteryCode === 'pl3') {
    const playType = String(prediction.play_type || 'direct').trim().toLowerCase()
    if (playType === 'direct_sum') {
      const sumValue = Number(String(prediction.sum_value || '').trim())
      const actualDigits = ((actualResult.digits && actualResult.digits.length ? actualResult.digits : actualResult.red_balls) || []).map(padBall).slice(0, 3)
      const actualSum = actualDigits.reduce((total, digit) => total + Number(digit || 0), 0)
      const isHit = Number.isFinite(sumValue) && sumValue === actualSum
      return {
        redHits: [],
        redHitCount: 0,
        blueHits: [],
        blueHitCount: 0,
        digitHits: isHit ? [String(actualSum)] : [],
        digitHitCount: isHit ? 1 : 0,
        digitHitIndexes: isHit ? [0] : [],
        totalHits: isHit ? 1 : 0,
      }
    }
    const predictionDigits = ((prediction.digits && prediction.digits.length ? prediction.digits : prediction.red_balls) || []).map(padBall).slice(0, 3)
    const actualDigits = ((actualResult.digits && actualResult.digits.length ? actualResult.digits : actualResult.red_balls) || []).map(padBall).slice(0, 3)
    if (playType === 'group3') {
      const actualDigitSet = new Set(actualDigits)
      const seenDigits = new Set<string>()
      const digitHitIndexes: number[] = []
      for (const [index, digit] of predictionDigits.entries()) {
        if (!digit || seenDigits.has(digit)) continue
        seenDigits.add(digit)
        if (actualDigitSet.has(digit)) {
          digitHitIndexes.push(index)
        }
      }
      return {
        redHits: [],
        redHitCount: 0,
        blueHits: [],
        blueHitCount: 0,
        digitHits: digitHitIndexes.map((index) => predictionDigits[index]).filter(Boolean),
        digitHitCount: digitHitIndexes.length,
        digitHitIndexes,
        totalHits: digitHitIndexes.length,
      }
    }

    if (playType === 'group6') {
      const actualDigitSet = new Set(actualDigits)
      const digitHitIndexes = predictionDigits
        .map((digit, index) => (actualDigitSet.has(digit) ? index : -1))
        .filter((index) => index >= 0)
      return {
        redHits: [],
        redHitCount: 0,
        blueHits: [],
        blueHitCount: 0,
        digitHits: digitHitIndexes.map((index) => predictionDigits[index]).filter(Boolean),
        digitHitCount: digitHitIndexes.length,
        digitHitIndexes,
        totalHits: digitHitIndexes.length,
      }
    }

    const digitHitIndexes = predictionDigits
      .map((digit, index) => (digit === actualDigits[index] ? index : -1))
      .filter((index) => index >= 0)
    const digitHits = digitHitIndexes.map((index) => predictionDigits[index]).filter(Boolean)
    return {
      redHits: [],
      redHitCount: 0,
      blueHits: [],
      blueHitCount: 0,
      digitHits,
      digitHitCount: digitHits.length,
      digitHitIndexes,
      totalHits: digitHits.length,
    }
  }
  if (inferredLotteryCode === 'pl5') {
    const predictionDigits = ((prediction.digits && prediction.digits.length ? prediction.digits : prediction.red_balls) || []).map(padBall).slice(0, 5)
    const actualDigits = ((actualResult.digits && actualResult.digits.length ? actualResult.digits : actualResult.red_balls) || []).map(padBall).slice(0, 5)
    const digitHitIndexes = predictionDigits
      .map((digit, index) => (digit === actualDigits[index] ? index : -1))
      .filter((index) => index >= 0)
    const digitHits = digitHitIndexes.map((index) => predictionDigits[index]).filter(Boolean)
    return {
      redHits: [],
      redHitCount: 0,
      blueHits: [],
      blueHitCount: 0,
      digitHits,
      digitHitCount: digitHits.length,
      digitHitIndexes,
      totalHits: digitHits.length,
    }
  }
  const redHits = prediction.red_balls.filter((ball) => actualResult.red_balls.includes(ball))
  const blueHits = prediction.blue_balls.filter((ball) => actualResult.blue_balls.includes(ball))
  return {
    redHits,
    redHitCount: redHits.length,
    blueHits,
    blueHitCount: blueHits.length,
    digitHits: [],
    digitHitCount: 0,
    digitHitIndexes: [],
    totalHits: redHits.length + blueHits.length,
  }
}

export function getPredictionPlayTypeLabel(group: PredictionGroup, actualResult: LotteryDraw | null = null): string {
  const inferredLotteryCode = inferPredictionGroupLotteryCode(group, actualResult)
  if (inferredLotteryCode === 'dlt') {
    return normalizePredictionPlayType(group.play_type) === 'dlt_dantuo' ? '胆拖' : '普通'
  }
  if (inferredLotteryCode === 'pl5') {
    return '直选'
  }
  if (normalizePredictionPlayType(group.play_type) === 'group3') {
    return '组选3'
  }
  if (normalizePredictionPlayType(group.play_type) === 'group6') {
    return '组选6'
  }
  if (normalizePredictionPlayType(group.play_type) === 'direct_sum') {
    return '和值'
  }
  return '直选'
}

export function buildModelScores(history: PredictionsHistoryListResponse, models: PredictionModel[]): Record<string, ModelScore> {
  const result: Record<string, ModelScore> = {}
  const statsMap = new Map((history.model_stats || []).map((item) => [item.model_id, item]))

  for (const model of models) {
    const stat = statsMap.get(model.model_id)
    const profile = normalizeScoreProfile(stat?.score_profile || model.score_profile)
    result[model.model_id] = {
      overallScore: profile.overall_score,
      perBetScore: profile.per_bet_score,
      perPeriodScore: profile.per_period_score,
      recentScore: profile.recent_score,
      longTermScore: profile.long_term_score,
      componentScores: profile.component_scores,
      recentWindow: profile.recent_window,
      longTermWindow: profile.long_term_window,
      bestPeriod: profile.best_period_snapshot,
      worstPeriod: profile.worst_period_snapshot,
      sampleSize: profile.sample_size_periods,
      betSampleSize: profile.sample_size_bets,
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
    return (scores[right.model_id]?.overallScore || 0) - (scores[left.model_id]?.overallScore || 0)
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
    const score = scores[model.model_id]?.overallScore || 0
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

export function buildSummary(
  models: PredictionModel[],
  scores: Record<string, ModelScore>,
  selectedIds: string[],
  weighted: boolean,
  commonOnly: boolean,
  strategyFilters: string[] = [],
  playTypeFilters: PredictionPlayType[] = [],
) {
  const normalizedStrategyFilters = strategyFilters.map(normalizeStrategyLabel)
  const strategyFilterSet = new Set(normalizedStrategyFilters)
  const selectedModels = models.filter((model) => selectedIds.includes(model.model_id))
  const redMap = new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>()
  const blueMap = new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>()
  const frontDanMap = new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>()
  const frontTuoMap = new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>()
  const backDanMap = new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>()
  const backTuoMap = new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>()
  const sumMap = new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>()
  const positionMaps = Array.from({ length: 5 }, () => new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>())
  let totalGroupCount = 0
  let selectedModelCount = 0

  for (const model of selectedModels) {
    let activeGroups = model.predictions || []
    activeGroups = filterPredictionGroupsByPlayType(activeGroups, playTypeFilters)
    if (normalizedStrategyFilters.length) {
      const modelStrategies = new Set(activeGroups.map((group) => normalizeStrategyLabel(group.strategy)))
      if (!normalizedStrategyFilters.every((strategy) => modelStrategies.has(strategy))) {
        continue
      }
      activeGroups = activeGroups.filter((group) => strategyFilterSet.has(normalizeStrategyLabel(group.strategy)))
    }
    if (!activeGroups.length) continue
    selectedModelCount += 1
    totalGroupCount += activeGroups.length

    const weight = weighted ? (scores[model.model_id]?.overallScore || 0) / 100 || 1 : 1
    const redSeen = new Set<string>()
    const blueSeen = new Set<string>()
    const frontDanSeen = new Set<string>()
    const frontTuoSeen = new Set<string>()
    const backDanSeen = new Set<string>()
    const backTuoSeen = new Set<string>()
    const sumSeen = new Set<string>()
    const positionSeen = Array.from({ length: 5 }, () => new Set<string>())
    for (const group of activeGroups) {
      const inferredLotteryCode = inferPredictionGroupLotteryCode(group)
      const normalizedPlayType = normalizePredictionPlayType(group.play_type)
      if (inferredLotteryCode === 'pl5') {
        const digits = ((group.digits && group.digits.length ? group.digits : group.red_balls) || []).map(padBall).slice(0, 5)
        digits.forEach((digit, index) => {
          const current = positionMaps[index].get(digit) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
          current.appearanceCount += 1
          current.weightedScore += weight
          positionMaps[index].set(digit, current)
          positionSeen[index].add(digit)
        })
        continue
      }
      if (inferredLotteryCode === 'pl3') {
        if (normalizedPlayType === 'direct_sum') {
          const normalizedSum = Number.parseInt(String(group.sum_value || '').trim(), 10)
          if (!Number.isNaN(normalizedSum) && normalizedSum >= 0 && normalizedSum <= 27) {
            const sumValue = String(normalizedSum)
            const current = sumMap.get(sumValue) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
            current.appearanceCount += 1
            current.weightedScore += weight
            sumMap.set(sumValue, current)
            sumSeen.add(sumValue)
          }
          continue
        }
        const digits = ((group.digits && group.digits.length ? group.digits : group.red_balls) || []).map(padBall).slice(0, 3)
        digits.forEach((digit, index) => {
          const current = positionMaps[index].get(digit) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
          current.appearanceCount += 1
          current.weightedScore += weight
          positionMaps[index].set(digit, current)
          positionSeen[index].add(digit)
        })
        continue
      }
      if (inferredLotteryCode === 'dlt' && normalizedPlayType === 'dlt_dantuo') {
        for (const ball of (group.front_dan || []).map(padBall)) {
          const current = frontDanMap.get(ball) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
          current.appearanceCount += 1
          current.weightedScore += weight
          frontDanMap.set(ball, current)
          frontDanSeen.add(ball)
        }
        for (const ball of (group.front_tuo || []).map(padBall)) {
          const current = frontTuoMap.get(ball) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
          current.appearanceCount += 1
          current.weightedScore += weight
          frontTuoMap.set(ball, current)
          frontTuoSeen.add(ball)
        }
        for (const ball of (group.back_dan || []).map(padBall)) {
          const current = backDanMap.get(ball) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
          current.appearanceCount += 1
          current.weightedScore += weight
          backDanMap.set(ball, current)
          backDanSeen.add(ball)
        }
        for (const ball of (group.back_tuo || []).map(padBall)) {
          const current = backTuoMap.get(ball) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
          current.appearanceCount += 1
          current.weightedScore += weight
          backTuoMap.set(ball, current)
          backTuoSeen.add(ball)
        }
        continue
      }
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
    for (const ball of frontDanSeen) frontDanMap.get(ball)?.models.add(model.model_id)
    for (const ball of frontTuoSeen) frontTuoMap.get(ball)?.models.add(model.model_id)
    for (const ball of backDanSeen) backDanMap.get(ball)?.models.add(model.model_id)
    for (const ball of backTuoSeen) backTuoMap.get(ball)?.models.add(model.model_id)
    for (const sumValue of sumSeen) sumMap.get(sumValue)?.models.add(model.model_id)
    positionSeen.forEach((seen, index) => {
      for (const digit of seen) positionMaps[index].get(digit)?.models.add(model.model_id)
    })
  }

  const modelCount = selectedModelCount
  const normalize = (source: Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>) =>
    [...source.entries()]
      .map(([ball, meta]) => ({
        ball,
        appearanceCount: meta.appearanceCount,
        totalGroupCount,
        matchedModelCount: meta.models.size,
        matchedModelIds: [...meta.models].sort((left, right) => left.localeCompare(right)),
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
    frontDan: normalize(frontDanMap),
    frontTuo: normalize(frontTuoMap),
    backDan: normalize(backDanMap),
    backTuo: normalize(backTuoMap),
    sums: normalize(sumMap),
    positions: positionMaps.map((positionMap) => normalize(positionMap)),
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
  return (history.predictions_history || [])
    .map((record) => ({
      ...record,
      models: selectedModelIds.length
        ? (record.models || []).filter((model) => selectedModelIds.includes(model.model_id))
        : record.models || [],
    }))
    .filter((record) => {
      const matchesPeriod = !periodQuery || record.target_period.includes(periodQuery)
      const matchesModel = !selectedModelIds.length || record.models.length > 0
      return matchesPeriod && matchesModel
    })
}

export function resolveHistoryFallbackState({
  hasHistoryRecords,
  hasManualModelFilter,
  hasCurrentModels,
  filteredModelIds,
  historyModelIds,
  historyFallbackEnabled,
}: HistoryFallbackResolutionInput): HistoryFallbackResolution {
  const historyModelIdSet = new Set(historyModelIds)
  const hasHistoryModelIntersection = filteredModelIds.some((modelId) => historyModelIdSet.has(modelId))
  const noCurrentModelData = !hasCurrentModels && historyModelIds.length > 0
  const hasModelCandidates = filteredModelIds.length > 0 && historyModelIds.length > 0
  const noIntersection = hasModelCandidates && !hasHistoryModelIntersection
  const autoFallbackWithoutManualFilter = !hasManualModelFilter && noIntersection
  const manualFallbackEnabled = hasManualModelFilter && historyFallbackEnabled

  const useHistoryFallbackModels = noCurrentModelData || autoFallbackWithoutManualFilter || (manualFallbackEnabled && noIntersection)
  const needsHistoryFallbackPrompt = hasHistoryRecords && hasManualModelFilter && !noCurrentModelData && noIntersection && !historyFallbackEnabled

  return {
    useHistoryFallbackModels,
    needsHistoryFallbackPrompt,
    hasHistoryModelIntersection,
    noCurrentModelData,
  }
}
