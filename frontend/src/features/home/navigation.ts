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
  predictionPlayMode?: 'direct' | 'direct_sum'
}

export type HomeRulesRouteState = {
  lotteryCode?: 'dlt' | 'pl3' | 'pl5'
}

export const HOME_TAB_PATHS: Record<HomeTab, string> = {
  prediction: '/dashboard/prediction',
  analysis: '/dashboard/analysis',
  history: '/dashboard/history',
  simulation: '/dashboard/simulation',
  'my-bets': '/dashboard/my-bets',
}
export const HOME_RULES_PATH = '/dashboard/rules'

export function getDashboardPath(tab: HomeTab) {
  return HOME_TAB_PATHS[tab]
}

export function getHomeTabFromPath(pathname: string): HomeTab {
  const matchedTab = (Object.entries(HOME_TAB_PATHS) as Array<[HomeTab, string]>).find(([, path]) => path === pathname)
  return matchedTab?.[0] || 'prediction'
}
