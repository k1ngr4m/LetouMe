import type { PredictionPlayMode } from '../../shared/types/api'

export type HomeTab = 'prediction' | 'worldcup' | 'charts' | 'backtest' | 'history' | 'simulation' | 'my-bets'
export type WorldCupTab = 'overview' | 'simulation' | 'history'
export type HomeModelView = 'card' | 'list' | 'score'
export type ScoreViewSortKey =
  | 'overallScore'
  | 'perBetScore'
  | 'perPeriodScore'
  | 'recentScore'
  | 'longTermScore'
  | 'profit'
  | 'hit_rate'
  | 'stability'
  | 'ceiling'
  | 'floor'
export type ScoreViewSortDirection = 'desc' | 'asc'
export type ModelListScoreRange = 'all' | '0-30' | '31-60' | '61-80' | '81-100'

export type HomePredictionReturnState = {
  scrollY?: number
  predictionPlayMode?: PredictionPlayMode
  modelListView?: HomeModelView
  scoreViewSortKey?: ScoreViewSortKey
  scoreViewSortDirection?: ScoreViewSortDirection
  modelNameQuery?: string
  selectedProviders?: string[]
  selectedTags?: string[]
  selectedScoreRange?: ModelListScoreRange
  summarySelectedModelIds?: string[] | null
  commonOnly?: boolean
  historyPeriodQuery?: string
  pl3PredictionMode?: 'direct' | 'direct_sum' | 'dantuo'
  dltPredictionMode?: 'direct' | 'compound' | 'dantuo'
}

export type HomeDetailRouteState = {
  scrollY?: number
  predictionPlayMode?: PredictionPlayMode
  focusBetRecordId?: number
  focusNonce?: string
  targetHistoryPeriod?: string
  predictionReturnState?: HomePredictionReturnState
}

export type HomeRulesRouteState = {
  lotteryCode?: 'dlt' | 'pl3' | 'pl5'
}

export const HOME_TAB_PATHS: Record<HomeTab, string> = {
  prediction: '/dashboard/prediction',
  worldcup: '/dashboard/worldcup',
  charts: '/dashboard/charts',
  backtest: '/dashboard/backtest',
  history: '/dashboard/history',
  simulation: '/dashboard/simulation',
  'my-bets': '/dashboard/my-bets',
}
export const HOME_RULES_PATH = '/dashboard/rules'
export const MESSAGE_CENTER_PATH = '/dashboard/messages'
export const WORLDCUP_TAB_PATHS: Record<WorldCupTab, string> = {
  overview: '/dashboard/worldcup',
  simulation: '/dashboard/worldcup/simulation',
  history: '/dashboard/worldcup/history',
}

export function getDashboardPath(tab: HomeTab) {
  return HOME_TAB_PATHS[tab]
}

export function getHomeTabFromPath(pathname: string): HomeTab {
  const matchedTab = (Object.entries(HOME_TAB_PATHS) as Array<[HomeTab, string]>).find(([, path]) => path === pathname)
  return matchedTab?.[0] || 'prediction'
}

export function getWorldCupTabFromPath(pathname: string): WorldCupTab {
  if (pathname === WORLDCUP_TAB_PATHS.simulation) return 'simulation'
  if (pathname === WORLDCUP_TAB_PATHS.history) return 'history'
  return 'overview'
}
