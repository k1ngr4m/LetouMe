import type { LotteryCode } from '../../shared/types/api'

export type HomeTab = 'prediction' | 'analysis' | 'history' | 'simulation' | 'my-bets'
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

export type HomeDetailRouteState = {
  scrollY?: number
}

export const DASHBOARD_BASE_PATH = '/dashboard'
export const HOME_TAB_SEGMENTS: Record<HomeTab, string> = {
  prediction: 'prediction',
  analysis: 'analysis',
  history: 'history',
  simulation: 'simulation',
  'my-bets': 'my-bets',
}
export const HOME_TAB_PATHS: Record<HomeTab, string> = {
  prediction: `${DASHBOARD_BASE_PATH}/prediction`,
  analysis: `${DASHBOARD_BASE_PATH}/analysis`,
  history: `${DASHBOARD_BASE_PATH}/history`,
  simulation: `${DASHBOARD_BASE_PATH}/simulation`,
  'my-bets': `${DASHBOARD_BASE_PATH}/my-bets`,
}
export const HOME_RULES_PATH = `${DASHBOARD_BASE_PATH}/rules`

export function normalizeLotteryCodeParam(value: string | undefined | null): LotteryCode {
  return value === 'pl3' || value === 'pl5' ? value : 'dlt'
}

export function getDashboardPath(tab: HomeTab, lotteryCode: LotteryCode) {
  return `${DASHBOARD_BASE_PATH}/${lotteryCode}/${HOME_TAB_SEGMENTS[tab]}`
}

export function getHomeRulesPath(lotteryCode: LotteryCode) {
  return `${DASHBOARD_BASE_PATH}/${lotteryCode}/rules`
}

export function getHomeModelDetailPath(lotteryCode: LotteryCode, modelId: string) {
  return `${DASHBOARD_BASE_PATH}/${lotteryCode}/models/${modelId}`
}

export function getDashboardLotteryFromPath(pathname: string): LotteryCode | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'dashboard') return null
  const candidate = segments[1]
  if (candidate !== 'dlt' && candidate !== 'pl3' && candidate !== 'pl5') return null
  return candidate
}

export function getDashboardPathForLottery(pathname: string, lotteryCode: LotteryCode) {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'dashboard') return getDashboardPath('prediction', lotteryCode)
  const maybeLotteryCode = segments[1]
  const offset = maybeLotteryCode === 'dlt' || maybeLotteryCode === 'pl3' || maybeLotteryCode === 'pl5' ? 2 : 1
  const section = segments[offset]
  if (section === 'rules') return getHomeRulesPath(lotteryCode)
  if (section === 'models' && segments[offset + 1]) return getHomeModelDetailPath(lotteryCode, segments[offset + 1])
  const tab = section === 'analysis' || section === 'history' || section === 'simulation' || section === 'my-bets' ? section : 'prediction'
  return getDashboardPath(tab, lotteryCode)
}

export function getHomeTabFromPath(pathname: string): HomeTab {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'dashboard') return 'prediction'
  const maybeLotteryCode = segments[1]
  const offset = maybeLotteryCode === 'dlt' || maybeLotteryCode === 'pl3' || maybeLotteryCode === 'pl5' ? 2 : 1
  const section = segments[offset]
  if (section === 'analysis' || section === 'history' || section === 'simulation' || section === 'my-bets') return section
  return 'prediction'
}
