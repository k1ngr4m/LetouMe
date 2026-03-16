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

export type GenerateSettingsModelPredictionsPayload = {
  model_code: string
  mode: 'current' | 'history'
  overwrite: boolean
  start_period?: string
  end_period?: string
}

export type PredictionGenerationTask = {
  task_id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  mode: 'current' | 'history'
  model_code: string
  created_at: string
  started_at?: string | null
  finished_at?: string | null
  progress_summary: {
    mode: string
    model_code: string
    target_period?: string | null
    processed_count: number
    skipped_count: number
    failed_count: number
    failed_periods: string[]
  }
  error_message?: string | null
}

export type SettingsPredictionRecordSummary = {
  record_type: 'current' | 'history'
  target_period: string
  prediction_date: string
  actual_result: LotteryDraw | null
  model_count: number
  status_label: string
}

export type SettingsPredictionRecordListResponse = {
  records: SettingsPredictionRecordSummary[]
}

export type SettingsPredictionRecordDetail = {
  record_type: 'current' | 'history'
  prediction_date: string
  target_period: string
  actual_result: LotteryDraw | null
  models: PredictionModel[]
}

export type AuthUser = {
  id: number
  username: string
  nickname: string
  role: string
  role_name: string
  is_active: boolean
  permissions: string[]
  last_login_at?: string | null
  created_at?: string | null
}

export type CurrentUserResponse = {
  user: AuthUser | null
}

export type LoginPayload = {
  username: string
  password: string
}

export type RegisterPayload = {
  username: string
  password: string
}

export type AdminUserCreatePayload = {
  username: string
  nickname?: string
  password: string
  role: string
  is_active: boolean
}

export type AdminUserUpdatePayload = {
  user_id: number
  role: string
  is_active: boolean
}

export type AdminUserResetPasswordPayload = {
  user_id: number
  password: string
}

export type UserListResponse = {
  users: AuthUser[]
}

export type RoleItem = {
  role_code: string
  role_name: string
  is_system: boolean
  member_count: number
  permissions: string[]
}

export type RoleListResponse = {
  roles: RoleItem[]
}

export type PermissionItem = {
  permission_code: string
  permission_name: string
  permission_description: string
}

export type PermissionListResponse = {
  permissions: PermissionItem[]
}

export type RolePayload = {
  role_code: string
  role_name: string
  permissions: string[]
}

export type PermissionUpdatePayload = {
  permission_code: string
  permission_name: string
  permission_description: string
}

export type ProfileUpdatePayload = {
  nickname: string
}

export type PasswordChangePayload = {
  current_password: string
  new_password: string
}
