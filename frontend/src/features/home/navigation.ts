export type HomeTab = 'prediction' | 'analysis' | 'history'
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

export type HomeDashboardState = {
  activeTab: HomeTab
  activeSection: 'models' | 'weights'
  modelListView: HomeModelView
  scoreViewSortKey: ScoreViewSortKey
  scoreViewSortDirection: ScoreViewSortDirection
  predictionLimit: number
  lotteryPage: number
  historyPeriodQuery: string
  commonOnly: boolean
  isModelFilterOpen: boolean
  modelNameQuery: string
  selectedProviders: string[]
  selectedTags: string[]
  selectedScoreRange: 'all' | '0-30' | '31-60' | '61-80' | '81-100'
  scrollY: number
}

export type HomeDetailRouteState = {
  dashboardState?: HomeDashboardState
}
