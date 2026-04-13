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

export type ModelScoreMap = Record<string, ModelScore>

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
export type PredictionPlayType = 'direct' | 'direct_sum' | 'group3' | 'group6' | 'pl3_dantuo' | 'dlt_dantuo' | 'dlt_compound' | 'qxc_compound'

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

export type HistoryTrendPoint = Record<string, string | number>

export type HistoryHeatmapCell = {
  period: string
  model_id: string
  model_name: string
  hit_count: number
  is_winning_period: boolean
}

export type HistoryProfitDistributionItem = {
  model_id: string
  model_name: string
  profitPeriods: number
  lossPeriods: number
  flatPeriods: number
}

export type NumberDistributionChartItem = {
  label: string
  count: number
  ratio?: number
}

export type NumberTrendChartItem = {
  period: string
  value: number
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
  if (value === 'pl3_dantuo') return 'pl3_dantuo'
  if (value === 'dlt_dantuo') return 'dlt_dantuo'
  if (value === 'dlt_compound') return 'dlt_compound'
  if (value === 'qxc_compound') return 'qxc_compound'
  if (value === 'direct_sum') return 'direct_sum'
  if (value === 'group3') return 'group3'
  if (value === 'group6') return 'group6'
  return 'direct'
}

export function normalizePredictionModelPlayMode(
  model: { prediction_play_mode?: string | null; predictions?: PredictionGroup[]; [key: string]: unknown },
): 'direct' | 'direct_sum' | 'compound' | 'dantuo' {
  const explicitMode = String(model.prediction_play_mode || '').trim().toLowerCase()
  if (explicitMode === 'dantuo') return 'dantuo'
  if (explicitMode === 'compound') return 'compound'
  if (explicitMode === 'direct_sum') return 'direct_sum'
  if (explicitMode === 'direct') return 'direct'
  const hasCompoundGroup = (model.predictions || []).some((group) => normalizePredictionPlayType(group.play_type) === 'dlt_compound')
  if (hasCompoundGroup) return 'compound'
  const hasDantuoGroup = (model.predictions || []).some((group) => ['dlt_dantuo', 'pl3_dantuo'].includes(normalizePredictionPlayType(group.play_type)))
  if (hasDantuoGroup) return 'dantuo'
  const hasDirectSumGroup = (model.predictions || []).some((group) => normalizePredictionPlayType(group.play_type) === 'direct_sum')
  const hasQxcCompoundGroup = (model.predictions || []).some((group) => normalizePredictionPlayType(group.play_type) === 'qxc_compound')
  if (hasQxcCompoundGroup) return 'compound'
  return hasDirectSumGroup ? 'direct_sum' : 'direct'
}

export function buildModelScoreKey(model: {
  model_id?: string | null
  prediction_play_mode?: string | null
  predictions?: PredictionGroup[]
  [key: string]: unknown
}) {
  const modelId = String(model.model_id || '').trim()
  if (!modelId) return ''
  return `${modelId}::${normalizePredictionModelPlayMode(model)}`
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
  if ((group.position_selections || []).length === 7) return 'qxc'
  if (digitCount >= 7) return 'qxc'
  if (digitCount >= 5) return 'pl5'
  if (normalizedPlayType === 'dlt_dantuo') return 'dlt'
  if (normalizedPlayType === 'dlt_compound') return 'dlt'
  if (normalizedPlayType === 'pl3_dantuo') return 'pl3'
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
    jackpot_pool_balance:
      draw.jackpot_pool_balance === undefined || draw.jackpot_pool_balance === null
        ? undefined
        : Number(draw.jackpot_pool_balance),
    previous_jackpot_pool:
      draw.previous_jackpot_pool === undefined || draw.previous_jackpot_pool === null
        ? undefined
        : Number(draw.previous_jackpot_pool),
    prize_breakdown_ready:
      draw.prize_breakdown_ready === undefined || draw.prize_breakdown_ready === null
        ? undefined
        : Boolean(draw.prize_breakdown_ready),
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
    position_selections: (group.position_selections || []).map((values) => (values || []).map(padBall)),
    blue_ball: (group.blue_balls || [])[0] || null,
    prize_amount: Number(group.prize_amount || 0),
    hit_result: group.hit_result
      ? {
          ...group.hit_result,
          red_hits: (group.hit_result.red_hits || []).map(padBall).sort(),
          blue_hits: (group.hit_result.blue_hits || []).map(padBall).sort(),
          digit_hits: (group.hit_result.digit_hits || []).map(padBall),
          position_hits: (group.hit_result.position_hits || []).map((values) => (values || []).map(padBall)),
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
    if (playType === 'pl3_dantuo') {
      const actualDigits = ((actualResult.digits && actualResult.digits.length ? actualResult.digits : actualResult.red_balls) || []).map(padBall).slice(0, 3)
      const positionSelections = [
        [...(prediction.direct_hundreds_dan || []), ...(prediction.direct_hundreds_tuo || [])].map(padBall),
        [...(prediction.direct_tens_dan || []), ...(prediction.direct_tens_tuo || [])].map(padBall),
        [...(prediction.direct_units_dan || []), ...(prediction.direct_units_tuo || [])].map(padBall),
      ]
      const digitHitIndexes = positionSelections
        .map((values, index) => (values.includes(actualDigits[index]) ? index : -1))
        .filter((index) => index >= 0)
      const digitHits = digitHitIndexes.map((index) => actualDigits[index]).filter(Boolean)
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
  if (inferredLotteryCode === 'qxc') {
    const actualDigits = ((actualResult.digits && actualResult.digits.length ? actualResult.digits : actualResult.red_balls) || [])
      .map(padBall)
      .slice(0, 7)
    const playType = String(prediction.play_type || 'direct').trim().toLowerCase()
    if (playType === 'qxc_compound' && (prediction.position_selections || []).length >= 7) {
      const selections = (prediction.position_selections || [])
        .slice(0, 7)
        .map((values) => (values || []).map(padBall))
      const digitHitIndexes = selections
        .map((values, index) => (actualDigits[index] && values.includes(actualDigits[index]) ? index : -1))
        .filter((index) => index >= 0)
      const redHits = digitHitIndexes.filter((index) => index < 6).map((index) => actualDigits[index]).filter(Boolean)
      const blueHits = digitHitIndexes.filter((index) => index === 6).map((index) => actualDigits[index]).filter(Boolean)
      return {
        redHits,
        redHitCount: redHits.length,
        blueHits,
        blueHitCount: blueHits.length,
        digitHits: digitHitIndexes.map((index) => actualDigits[index]).filter(Boolean),
        digitHitCount: digitHitIndexes.length,
        digitHitIndexes,
        totalHits: digitHitIndexes.length,
      }
    }
    const predictionDigits = ((prediction.digits && prediction.digits.length ? prediction.digits : prediction.red_balls) || [])
      .map(padBall)
      .slice(0, 7)
    const digitHitIndexes = predictionDigits
      .map((digit, index) => (digit === actualDigits[index] ? index : -1))
      .filter((index) => index >= 0)
    const redHits = digitHitIndexes.filter((index) => index < 6).map((index) => predictionDigits[index]).filter(Boolean)
    const blueHits = digitHitIndexes.filter((index) => index === 6).map((index) => predictionDigits[index]).filter(Boolean)
    return {
      redHits,
      redHitCount: redHits.length,
      blueHits,
      blueHitCount: blueHits.length,
      digitHits: digitHitIndexes.map((index) => predictionDigits[index]).filter(Boolean),
      digitHitCount: digitHitIndexes.length,
      digitHitIndexes,
      totalHits: digitHitIndexes.length,
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
  const normalizedPlayType = normalizePredictionPlayType(group.play_type)
  if (inferredLotteryCode === 'dlt') {
    if (normalizedPlayType === 'dlt_dantuo') return '胆拖'
    if (normalizedPlayType === 'dlt_compound') return '复式'
    return '普通'
  }
  if (inferredLotteryCode === 'qxc') {
    return normalizedPlayType === 'qxc_compound' ? '复式' : '直选'
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
  if (normalizePredictionPlayType(group.play_type) === 'pl3_dantuo') {
    return '直选胆拖'
  }
  if (normalizePredictionPlayType(group.play_type) === 'direct_sum') {
    return '和值'
  }
  return '直选'
}

export function resolveModelScore(modelScores: ModelScoreMap, model: {
  model_id?: string | null
  prediction_play_mode?: string | null
  predictions?: PredictionGroup[]
  [key: string]: unknown
}) {
  const modelKey = buildModelScoreKey(model)
  if (modelKey && modelScores[modelKey]) {
    return modelScores[modelKey]
  }
  const modelId = String(model.model_id || '').trim()
  return modelScores[modelId]
}

export function buildModelScores(history: PredictionsHistoryListResponse, models: PredictionModel[]): ModelScoreMap {
  const result: ModelScoreMap = {}
  const statsMap = new Map((history.model_stats || []).map((item) => [buildModelScoreKey(item), item]))

  for (const model of models) {
    const modelKey = buildModelScoreKey(model)
    const stat = statsMap.get(modelKey)
    const profile = normalizeScoreProfile(stat?.score_profile || model.score_profile)
    const normalizedScore = {
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
    if (modelKey) {
      result[modelKey] = normalizedScore
    }
    if (!result[model.model_id]) {
      result[model.model_id] = normalizedScore
    }
  }

  return result
}

export function getActualResult(draws: LotteryDraw[], targetPeriod: string) {
  return draws.find((draw) => draw.period === targetPeriod) || null
}

export function sortModels(models: PredictionModel[], scores: ModelScoreMap, pinnedModelIds: string[]) {
  const pinnedIndex = new Map(pinnedModelIds.map((id, index) => [id, index]))
  return [...models].sort((left, right) => {
    const leftPinned = pinnedIndex.has(left.model_id)
    const rightPinned = pinnedIndex.has(right.model_id)
    if (leftPinned && rightPinned) return (pinnedIndex.get(left.model_id) || 0) - (pinnedIndex.get(right.model_id) || 0)
    if (leftPinned) return -1
    if (rightPinned) return 1
    return (resolveModelScore(scores, right)?.overallScore || 0) - (resolveModelScore(scores, left)?.overallScore || 0)
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
  scores: ModelScoreMap,
  filters: ModelListFilters,
) {
  const normalizedQuery = filters.nameQuery.trim().toLowerCase()
  return models.filter((model) => {
    const score = resolveModelScore(scores, model)?.overallScore || 0
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
  scores: ModelScoreMap,
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
  const positionMaps = Array.from({ length: 7 }, () => new Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>())
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

    const weight = weighted ? (resolveModelScore(scores, model)?.overallScore || 0) / 100 || 1 : 1
    const redSeen = new Set<string>()
    const blueSeen = new Set<string>()
    const frontDanSeen = new Set<string>()
    const frontTuoSeen = new Set<string>()
    const backDanSeen = new Set<string>()
    const backTuoSeen = new Set<string>()
    const sumSeen = new Set<string>()
    const positionSeen = Array.from({ length: 7 }, () => new Set<string>())
    const accumulateBall = (
      targetMap: Map<string, { appearanceCount: number; weightedScore: number; models: Set<string> }>,
      targetSeen: Set<string>,
      ball: string,
    ) => {
      const current = targetMap.get(ball) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
      current.appearanceCount += 1
      current.weightedScore += weight
      targetMap.set(ball, current)
      targetSeen.add(ball)
    }
    for (const group of activeGroups) {
      const inferredLotteryCode = inferPredictionGroupLotteryCode(group)
      const normalizedPlayType = normalizePredictionPlayType(group.play_type)
      if (inferredLotteryCode === 'qxc') {
        if (normalizedPlayType === 'qxc_compound' && (group.position_selections || []).length >= 7) {
          const positionSelections = (group.position_selections || [])
            .slice(0, 7)
            .map((values) => (values || []).map(padBall))
          positionSelections.forEach((values, index) => {
            values.forEach((ball) => {
              const positionCurrent = positionMaps[index].get(ball) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
              positionCurrent.appearanceCount += 1
              positionCurrent.weightedScore += weight
              positionMaps[index].set(ball, positionCurrent)
              positionSeen[index].add(ball)
              if (index === 6) {
                accumulateBall(blueMap, blueSeen, ball)
              } else {
                accumulateBall(redMap, redSeen, ball)
              }
            })
          })
          continue
        }
        const digits = ((group.digits && group.digits.length ? group.digits : group.red_balls) || []).map(padBall).slice(0, 7)
        digits.forEach((digit, index) => {
          const positionCurrent = positionMaps[index].get(digit) || { appearanceCount: 0, weightedScore: 0, models: new Set<string>() }
          positionCurrent.appearanceCount += 1
          positionCurrent.weightedScore += weight
          positionMaps[index].set(digit, positionCurrent)
          positionSeen[index].add(digit)
          if (index === 6) {
            accumulateBall(blueMap, blueSeen, digit)
          } else {
            accumulateBall(redMap, redSeen, digit)
          }
        })
        continue
      }
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
    positions: positionMaps
      .map((positionMap) => normalize(positionMap))
      .filter((items, index, source) => items.length > 0 || source.slice(index + 1).some((nextItems) => nextItems.length > 0)),
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

const PL3_DIGITS = Array.from({ length: 10 }, (_, index) => padBall(String(index)))
const PL5_DIGITS = Array.from({ length: 10 }, (_, index) => padBall(String(index)))
const QXC_FRONT_DIGITS = Array.from({ length: 10 }, (_, index) => padBall(String(index)))
const QXC_BACK_DIGITS = Array.from({ length: 15 }, (_, index) => padBall(String(index)))

function resolvePl3Digits(draw: LotteryDraw) {
  const sourceDigits = draw.digits?.length ? draw.digits : draw.red_balls
  return sourceDigits.map(padBall).slice(0, 3)
}

function resolvePl5Digits(draw: LotteryDraw) {
  const sourceDigits = draw.digits?.length ? draw.digits : draw.red_balls
  return sourceDigits.map(padBall).slice(0, 5)
}

function resolveQxcDigits(draw: LotteryDraw) {
  const sourceDigits = draw.digits?.length ? draw.digits : [...draw.red_balls, ...draw.blue_balls]
  return sourceDigits.map(padBall).slice(0, 7)
}

export function buildPl3PositionHotChart(draws: LotteryDraw[], positionIndex: 0 | 1 | 2) {
  const counter: Record<string, number> = Object.fromEntries(PL3_DIGITS.map((digit) => [digit, 0]))
  for (const draw of draws.slice(0, 120)) {
    const digits = resolvePl3Digits(draw)
    const digit = digits[positionIndex]
    if (!digit) continue
    counter[digit] = (counter[digit] || 0) + 1
  }
  return byFrequencyDescending(Object.entries(counter).map(([ball, count]) => ({ ball, count }))).slice(0, 10)
}

export function buildPl3SumTrendChart(draws: LotteryDraw[]) {
  return draws.slice(0, 20).reverse().map((draw) => {
    const sum = resolvePl3Digits(draw).reduce((total, digit) => total + Number(digit), 0)
    return {
      period: draw.period,
      sum,
    }
  })
}

export function buildPl3OddEvenStructureChart(draws: LotteryDraw[]) {
  return draws.slice(0, 20).reverse().map((draw) => {
    const oddCount = resolvePl3Digits(draw).filter((digit) => Number(digit) % 2 === 1).length
    return {
      period: draw.period,
      oddCount,
      structure: `${oddCount}:${3 - oddCount}`,
    }
  })
}

export function buildPl5PositionHotChart(draws: LotteryDraw[], positionIndex: 0 | 1 | 2 | 3 | 4) {
  const counter: Record<string, number> = Object.fromEntries(PL5_DIGITS.map((digit) => [digit, 0]))
  for (const draw of draws.slice(0, 120)) {
    const digits = resolvePl5Digits(draw)
    const digit = digits[positionIndex]
    if (!digit) continue
    counter[digit] = (counter[digit] || 0) + 1
  }
  return byFrequencyDescending(Object.entries(counter).map(([ball, count]) => ({ ball, count }))).slice(0, 10)
}

export function buildQxcPositionHotChart(draws: LotteryDraw[], positionIndex: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
  const digitPool = positionIndex === 6 ? QXC_BACK_DIGITS : QXC_FRONT_DIGITS
  const counter: Record<string, number> = Object.fromEntries(digitPool.map((digit) => [digit, 0]))
  for (const draw of draws.slice(0, 120)) {
    const digits = resolveQxcDigits(draw)
    const digit = digits[positionIndex]
    if (!digit) continue
    counter[digit] = (counter[digit] || 0) + 1
  }
  return byFrequencyDescending(Object.entries(counter).map(([ball, count]) => ({ ball, count }))).slice(0, digitPool.length)
}

export function buildPl5SumTrendChart(draws: LotteryDraw[]) {
  return draws.slice(0, 20).reverse().map((draw) => {
    const sum = resolvePl5Digits(draw).reduce((total, digit) => total + Number(digit), 0)
    return {
      period: draw.period,
      sum,
    }
  })
}

export function buildPl5OddEvenStructureChart(draws: LotteryDraw[]) {
  return draws.slice(0, 20).reverse().map((draw) => {
    const oddCount = resolvePl5Digits(draw).filter((digit) => Number(digit) % 2 === 1).length
    return {
      period: draw.period,
      oddCount,
      structure: `${oddCount}:${5 - oddCount}`,
    }
  })
}

export function buildQxcSumTrendChart(draws: LotteryDraw[]) {
  return draws.slice(0, 20).reverse().map((draw) => ({
    period: draw.period,
    sum: resolveQxcDigits(draw).reduce((total, digit) => total + Number(digit), 0),
  }))
}

export function buildQxcOddEvenStructureChart(draws: LotteryDraw[]) {
  return draws.slice(0, 20).reverse().map((draw) => {
    const oddCount = resolveQxcDigits(draw).filter((digit) => Number(digit) % 2 === 1).length
    return {
      period: draw.period,
      oddCount,
      structure: `${oddCount}:${7 - oddCount}`,
    }
  })
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

function buildDistributionFromCounter(counter: Record<string, number>) {
  return Object.entries(counter)
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

function resolveDltFrontAreas(draw: LotteryDraw) {
  const areas = [0, 0, 0]
  for (const ball of draw.red_balls) {
    const value = Number(ball)
    if (value <= 12) areas[0] += 1
    else if (value <= 24) areas[1] += 1
    else areas[2] += 1
  }
  return areas
}

function resolveModuloPattern(values: string[]) {
  const buckets = [0, 0, 0]
  for (const value of values) {
    buckets[Number(value) % 3] += 1
  }
  return `${buckets[0]}-${buckets[1]}-${buckets[2]}`
}

export function buildSumDistributionChart(draws: LotteryDraw[], lotteryCode: LotteryCode) {
  const counter: Record<string, number> = {}
  const sourceDraws = draws.slice(0, 120)
  for (const draw of sourceDraws) {
    const sum =
      lotteryCode === 'pl3'
        ? resolvePl3Digits(draw).reduce((total, digit) => total + Number(digit), 0)
        : lotteryCode === 'pl5'
          ? resolvePl5Digits(draw).reduce((total, digit) => total + Number(digit), 0)
          : lotteryCode === 'qxc'
            ? resolveQxcDigits(draw).reduce((total, digit) => total + Number(digit), 0)
          : draw.red_balls.reduce((total, ball) => total + Number(ball), 0)
    const label = String(sum)
    counter[label] = (counter[label] || 0) + 1
  }
  return buildDistributionFromCounter(counter)
}

export function buildOddEvenDistributionChart(draws: LotteryDraw[], lotteryCode: LotteryCode) {
  const counter: Record<string, number> = {}
  const sourceDraws = draws.slice(0, 120)
  for (const draw of sourceDraws) {
    const oddCount =
      lotteryCode === 'pl3'
        ? resolvePl3Digits(draw).filter((digit) => Number(digit) % 2 === 1).length
        : lotteryCode === 'pl5'
          ? resolvePl5Digits(draw).filter((digit) => Number(digit) % 2 === 1).length
          : lotteryCode === 'qxc'
            ? resolveQxcDigits(draw).filter((digit) => Number(digit) % 2 === 1).length
          : draw.red_balls.filter((ball) => Number(ball) % 2 === 1).length
    const totalCount = lotteryCode === 'pl3' ? 3 : lotteryCode === 'pl5' ? 5 : lotteryCode === 'qxc' ? 7 : 5
    const label = `${oddCount}:${totalCount - oddCount}`
    counter[label] = (counter[label] || 0) + 1
  }
  return buildDistributionFromCounter(counter)
}

export function buildZoneShareDistributionChart(draws: LotteryDraw[], lotteryCode: LotteryCode) {
  const sourceDraws = draws.slice(0, 120)
  const counter: Record<string, number> = {}
  let total = 0

  for (const draw of sourceDraws) {
    const values =
      lotteryCode === 'pl3'
        ? resolvePl3Digits(draw).map((value) => ({ value: Number(value), isQxcBack: false }))
        : lotteryCode === 'pl5'
          ? resolvePl5Digits(draw).map((value) => ({ value: Number(value), isQxcBack: false }))
          : lotteryCode === 'qxc'
            ? resolveQxcDigits(draw).map((value, index) => ({ value: Number(value), isQxcBack: index === 6 }))
            : draw.red_balls.map((value) => ({ value: Number(value), isQxcBack: false }))

    for (const item of values) {
      const label =
        lotteryCode === 'dlt'
          ? item.value <= 12
            ? '一区（01-12）'
            : item.value <= 24
              ? '二区（13-24）'
              : '三区（25-35）'
          : lotteryCode === 'qxc' && item.isQxcBack
            ? item.value <= 4
              ? '第七位低位区（00-04）'
              : item.value <= 9
                ? '第七位中位区（05-09）'
                : '第七位高位区（10-14）'
            : item.value <= 3
              ? '低位区（0-3）'
              : item.value <= 6
                ? '中位区（4-6）'
                : '高位区（7-9）'
      counter[label] = (counter[label] || 0) + 1
      total += 1
    }
  }

  const orderedLabels =
    lotteryCode === 'dlt'
      ? ['一区（01-12）', '二区（13-24）', '三区（25-35）']
      : lotteryCode === 'qxc'
        ? ['低位区（0-3）', '中位区（4-6）', '高位区（7-9）', '第七位低位区（00-04）', '第七位中位区（05-09）', '第七位高位区（10-14）']
      : ['低位区（0-3）', '中位区（4-6）', '高位区（7-9）']

  return orderedLabels.map((label) => {
    const count = counter[label] || 0
    return {
      label,
      count,
      ratio: total > 0 ? count / total : 0,
    }
  })
}

export function buildSpanTrendChart(draws: LotteryDraw[], lotteryCode: LotteryCode) {
  return draws.slice(0, 20).reverse().map((draw) => {
    const values =
      lotteryCode === 'pl3'
        ? resolvePl3Digits(draw).map(Number)
        : lotteryCode === 'pl5'
          ? resolvePl5Digits(draw).map(Number)
          : lotteryCode === 'qxc'
            ? resolveQxcDigits(draw).map(Number)
          : draw.red_balls.map(Number)
    return {
      period: draw.period,
      value: Math.max(...values) - Math.min(...values),
    }
  })
}

export function buildZoneDistributionChart(draws: LotteryDraw[], lotteryCode: LotteryCode) {
  const counter: Record<string, number> = {}
  const sourceDraws = draws.slice(0, 120)
  for (const draw of sourceDraws) {
    let label = ''
    if (lotteryCode === 'pl3') {
      const digits = resolvePl3Digits(draw).map(Number)
      const low = digits.filter((digit) => digit <= 3).length
      const mid = digits.filter((digit) => digit >= 4 && digit <= 6).length
      const high = digits.filter((digit) => digit >= 7).length
      label = `${low}-${mid}-${high}`
    } else if (lotteryCode === 'pl5') {
      const digits = resolvePl5Digits(draw).map(Number)
      const low = digits.filter((digit) => digit <= 3).length
      const mid = digits.filter((digit) => digit >= 4 && digit <= 6).length
      const high = digits.filter((digit) => digit >= 7).length
      label = `${low}-${mid}-${high}`
    } else if (lotteryCode === 'qxc') {
      const digits = resolveQxcDigits(draw).map(Number)
      const frontDigits = digits.slice(0, 6)
      const backDigit = digits[6]
      const low = frontDigits.filter((digit) => digit <= 3).length
      const mid = frontDigits.filter((digit) => digit >= 4 && digit <= 6).length
      const high = frontDigits.filter((digit) => digit >= 7).length
      const backZone = backDigit === undefined ? '—' : backDigit <= 4 ? '低' : backDigit <= 9 ? '中' : '高'
      label = `${low}-${mid}-${high} / 第七位${backZone}`
    } else {
      label = resolveDltFrontAreas(draw).join('-')
    }
    counter[label] = (counter[label] || 0) + 1
  }
  return buildDistributionFromCounter(counter)
}

export function buildModuloTrendChart(draws: LotteryDraw[], lotteryCode: LotteryCode) {
  return draws.slice(0, 20).reverse().map((draw) => {
    const values =
      lotteryCode === 'pl3'
        ? resolvePl3Digits(draw)
        : lotteryCode === 'pl5'
          ? resolvePl5Digits(draw)
          : lotteryCode === 'qxc'
            ? resolveQxcDigits(draw)
          : draw.red_balls
    const pattern = resolveModuloPattern(values)
    const [mod0, mod1, mod2] = pattern.split('-').map(Number)
    return {
      period: draw.period,
      value: mod0 * 100 + mod1 * 10 + mod2,
      pattern,
    }
  })
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
    const point: HistoryTrendPoint = {
      period: record.target_period,
    }

    for (const modelId of seriesModelIds) {
      const model = record.models.find((item) => item.model_id === modelId)
      point[modelId] = Number(model?.best_hit_count || 0)
    }

    return point
  })
}

export function buildHistoryProfitTrend(
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
    const point: HistoryTrendPoint = {
      period: record.target_period,
    }

    for (const modelId of seriesModelIds) {
      const model = record.models.find((item) => item.model_id === modelId)
      point[modelId] = Number(model?.prize_amount || 0) - Number(model?.cost_amount || 0)
    }

    return point
  })
}

function resolveHistorySeriesModelIds(
  records: PredictionsHistoryListResponse['predictions_history'],
  selectedModelIds: string[],
) {
  return selectedModelIds.length
    ? selectedModelIds
    : Array.from(new Set((records || []).flatMap((record) => record.models.map((model) => model.model_id))))
}

function sortHistoryRecordsByPeriod(records: PredictionsHistoryListResponse['predictions_history']) {
  return [...(records || [])].sort((left, right) => {
    const leftPeriod = Number(left.target_period)
    const rightPeriod = Number(right.target_period)
    if (Number.isFinite(leftPeriod) && Number.isFinite(rightPeriod)) return leftPeriod - rightPeriod
    return String(left.target_period || '').localeCompare(String(right.target_period || ''))
  })
}

function resolveModelPeriodNetProfit(record: PredictionsHistoryListResponse['predictions_history'][number], modelId: string) {
  const model = record.models.find((item) => item.model_id === modelId)
  return Number(model?.prize_amount || 0) - Number(model?.cost_amount || 0)
}

function resolveModelPeriodCost(record: PredictionsHistoryListResponse['predictions_history'][number], modelId: string) {
  const model = record.models.find((item) => item.model_id === modelId)
  return Number(model?.cost_amount || 0)
}

function resolveModelPeriodHitCount(record: PredictionsHistoryListResponse['predictions_history'][number], modelId: string) {
  const model = record.models.find((item) => item.model_id === modelId)
  return Number(model?.best_hit_count || 0)
}

function resolveModelPeriodWin(record: PredictionsHistoryListResponse['predictions_history'][number], modelId: string) {
  const model = record.models.find((item) => item.model_id === modelId)
  return Boolean(model?.hit_period_win)
}

export function buildHistoryCumulativeProfitTrend(
  records: PredictionsHistoryListResponse['predictions_history'],
  selectedModelIds: string[],
) {
  const seriesModelIds = resolveHistorySeriesModelIds(records, selectedModelIds)
  const sortedRecords = sortHistoryRecordsByPeriod(records)
  const cumulativeMap = new Map(seriesModelIds.map((modelId) => [modelId, 0]))

  return sortedRecords.map((record) => {
    const point: HistoryTrendPoint = { period: record.target_period }
    for (const modelId of seriesModelIds) {
      const nextValue = Number(cumulativeMap.get(modelId) || 0) + resolveModelPeriodNetProfit(record, modelId)
      cumulativeMap.set(modelId, nextValue)
      point[modelId] = nextValue
    }
    return point
  })
}

export function buildHistoryCumulativeRoiTrend(
  records: PredictionsHistoryListResponse['predictions_history'],
  selectedModelIds: string[],
) {
  const seriesModelIds = resolveHistorySeriesModelIds(records, selectedModelIds)
  const sortedRecords = sortHistoryRecordsByPeriod(records)
  const cumulativeProfitMap = new Map(seriesModelIds.map((modelId) => [modelId, 0]))
  const cumulativeCostMap = new Map(seriesModelIds.map((modelId) => [modelId, 0]))

  return sortedRecords.map((record) => {
    const point: HistoryTrendPoint = { period: record.target_period }
    for (const modelId of seriesModelIds) {
      const nextProfit = Number(cumulativeProfitMap.get(modelId) || 0) + resolveModelPeriodNetProfit(record, modelId)
      const nextCost = Number(cumulativeCostMap.get(modelId) || 0) + resolveModelPeriodCost(record, modelId)
      cumulativeProfitMap.set(modelId, nextProfit)
      cumulativeCostMap.set(modelId, nextCost)
      point[modelId] = nextCost > 0 ? nextProfit / nextCost : 0
    }
    return point
  })
}

export function buildHistoryRollingHitRateTrend(
  records: PredictionsHistoryListResponse['predictions_history'],
  selectedModelIds: string[],
  windowSize: number = 10,
) {
  const seriesModelIds = resolveHistorySeriesModelIds(records, selectedModelIds)
  const sortedRecords = sortHistoryRecordsByPeriod(records)
  const safeWindowSize = Math.max(1, Math.trunc(windowSize) || 1)

  return sortedRecords.map((record, index) => {
    const windowRecords = sortedRecords.slice(Math.max(0, index - safeWindowSize + 1), index + 1)
    const point: HistoryTrendPoint = { period: record.target_period }
    for (const modelId of seriesModelIds) {
      const wins = windowRecords.reduce((sum, item) => sum + (resolveModelPeriodWin(item, modelId) ? 1 : 0), 0)
      point[modelId] = windowRecords.length ? wins / windowRecords.length : 0
    }
    return point
  })
}

export function buildHistoryDrawdownTrend(
  records: PredictionsHistoryListResponse['predictions_history'],
  selectedModelIds: string[],
) {
  const seriesModelIds = resolveHistorySeriesModelIds(records, selectedModelIds)
  const sortedRecords = sortHistoryRecordsByPeriod(records)
  const cumulativeMap = new Map(seriesModelIds.map((modelId) => [modelId, 0]))
  const peakMap = new Map(seriesModelIds.map((modelId) => [modelId, 0]))

  return sortedRecords.map((record) => {
    const point: HistoryTrendPoint = { period: record.target_period }
    for (const modelId of seriesModelIds) {
      const nextCumulative = Number(cumulativeMap.get(modelId) || 0) + resolveModelPeriodNetProfit(record, modelId)
      const nextPeak = Math.max(Number(peakMap.get(modelId) || 0), nextCumulative)
      cumulativeMap.set(modelId, nextCumulative)
      peakMap.set(modelId, nextPeak)
      point[modelId] = nextCumulative - nextPeak
    }
    return point
  })
}

export function buildHistoryRankTrend(
  records: PredictionsHistoryListResponse['predictions_history'],
  selectedModelIds: string[],
) {
  const seriesModelIds = resolveHistorySeriesModelIds(records, selectedModelIds)
  const sortedRecords = sortHistoryRecordsByPeriod(records)
  const cumulativeMap = new Map(seriesModelIds.map((modelId) => [modelId, 0]))

  return sortedRecords.map((record) => {
    for (const modelId of seriesModelIds) {
      cumulativeMap.set(modelId, Number(cumulativeMap.get(modelId) || 0) + resolveModelPeriodNetProfit(record, modelId))
    }

    const rankings = [...seriesModelIds]
      .sort((left, right) => Number(cumulativeMap.get(right) || 0) - Number(cumulativeMap.get(left) || 0) || left.localeCompare(right))
      .reduce<Record<string, number>>((result, modelId, index) => {
        result[modelId] = index + 1
        return result
      }, {})

    const point: HistoryTrendPoint = { period: record.target_period }
    for (const modelId of seriesModelIds) {
      point[modelId] = rankings[modelId] || seriesModelIds.length
    }
    return point
  })
}

export function buildHistoryHitHeatmap(
  records: PredictionsHistoryListResponse['predictions_history'],
  selectedModelIds: string[],
  modelNameMap?: Record<string, string>,
) {
  const seriesModelIds = resolveHistorySeriesModelIds(records, selectedModelIds)
  const sortedRecords = sortHistoryRecordsByPeriod(records)
  const fallbackNameMap = modelNameMap || {}

  return sortedRecords.flatMap((record) =>
    seriesModelIds.map((modelId) => ({
      period: record.target_period,
      model_id: modelId,
      model_name:
        record.models.find((item) => item.model_id === modelId)?.model_name || fallbackNameMap[modelId] || modelId,
      hit_count: resolveModelPeriodHitCount(record, modelId),
      is_winning_period: resolveModelPeriodWin(record, modelId),
    })),
  )
}

export function buildHistoryProfitDistribution(
  records: PredictionsHistoryListResponse['predictions_history'],
  selectedModelIds: string[],
  modelNameMap?: Record<string, string>,
) {
  const seriesModelIds = resolveHistorySeriesModelIds(records, selectedModelIds)
  const sortedRecords = sortHistoryRecordsByPeriod(records)
  const fallbackNameMap = modelNameMap || {}

  return seriesModelIds.map((modelId) => {
    let profitPeriods = 0
    let lossPeriods = 0
    let flatPeriods = 0

    for (const record of sortedRecords) {
      const netProfit = resolveModelPeriodNetProfit(record, modelId)
      if (netProfit > 0) profitPeriods += 1
      else if (netProfit < 0) lossPeriods += 1
      else flatPeriods += 1
    }

    const sampleModel = sortedRecords.flatMap((record) => record.models).find((item) => item.model_id === modelId)
    return {
      model_id: modelId,
      model_name: sampleModel?.model_name || fallbackNameMap[modelId] || modelId,
      profitPeriods,
      lossPeriods,
      flatPeriods,
    }
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
  const autoFallbackWithManualFilter = hasManualModelFilter && noIntersection

  const useHistoryFallbackModels = noCurrentModelData || autoFallbackWithoutManualFilter || autoFallbackWithManualFilter
  const needsHistoryFallbackPrompt = hasHistoryRecords && hasManualModelFilter && !noCurrentModelData && noIntersection && !historyFallbackEnabled && !autoFallbackWithManualFilter

  return {
    useHistoryFallbackModels,
    needsHistoryFallbackPrompt,
    hasHistoryModelIntersection,
    noCurrentModelData,
  }
}
