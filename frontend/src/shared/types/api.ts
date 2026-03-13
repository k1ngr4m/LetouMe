export type LotteryDraw = {
  period: string
  date: string
  red_balls: string[]
  blue_balls: string[]
  blue_ball?: string | null
}

export type NextDraw = {
  next_period: string
  next_date_display: string
  weekday_label?: string
}

export type LotteryHistoryResponse = {
  last_updated: string
  data: LotteryDraw[]
  next_draw: NextDraw | null
  total_count: number
}

export type PredictionHitResult = {
  red_hits: string[]
  red_hit_count: number
  blue_hits: string[]
  blue_hit_count: number
  total_hits: number
}

export type PredictionGroup = {
  group_id: number
  strategy?: string
  description?: string
  red_balls: string[]
  blue_balls: string[]
  blue_ball?: string | null
  hit_result?: PredictionHitResult
}

export type PredictionModel = {
  model_id: string
  model_name: string
  model_provider: string
  model_version?: string | null
  model_tags?: string[]
  model_api_model?: string | null
  predictions: PredictionGroup[]
  best_group?: number | null
  best_hit_count?: number | null
}

export type PredictionHistorySummaryModel = {
  model_id: string
  model_name: string
  model_provider: string
  model_version?: string | null
  model_api_model?: string | null
  best_group?: number | null
  best_hit_count?: number | null
}

export type CurrentPredictionsResponse = {
  prediction_date: string
  target_period: string
  models: PredictionModel[]
}

export type PredictionsHistoryListRecord = {
  prediction_date: string
  target_period: string
  actual_result: LotteryDraw | null
  models: PredictionHistorySummaryModel[]
}

export type PredictionsHistoryListResponse = {
  predictions_history: PredictionsHistoryListRecord[]
  total_count: number
}

export type PredictionsHistoryRecord = {
  prediction_date: string
  target_period: string
  actual_result: LotteryDraw | null
  models: PredictionModel[]
}

export type PredictionsHistoryResponse = {
  predictions_history: PredictionsHistoryRecord[]
  total_count: number
}

export type SettingsModel = {
  model_code: string
  display_name: string
  provider: string
  api_model_name: string
  version: string
  tags: string[]
  base_url: string
  api_key: string
  app_code: string
  temperature: number | null
  is_active: boolean
  is_deleted: boolean
  updated_at: string
}

export type SettingsModelListResponse = {
  models: SettingsModel[]
}

export type SettingsProvider = {
  code: string
  name: string
}

export type SettingsProviderListResponse = {
  providers: SettingsProvider[]
}

export type SettingsModelPayload = {
  model_code?: string
  display_name: string
  provider: string
  api_model_name: string
  version: string
  tags: string[]
  base_url: string
  api_key: string
  app_code: string
  temperature: number | null
  is_active: boolean
}
