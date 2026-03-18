export type LotteryCode = 'dlt' | 'pl3'

export type LotteryDraw = {
  lottery_code?: LotteryCode
  period: string
  date: string
  red_balls: string[]
  blue_balls: string[]
  digits?: string[]
  blue_ball?: string | null
  prize_breakdown?: PrizeBreakdownItem[]
}

export type PrizeBreakdownItem = {
  prize_level: string
  prize_type: 'basic' | 'additional'
  winner_count: number
  prize_amount: number
  total_amount: number
}

export type NextDraw = {
  next_period: string
  next_date_display: string
  weekday_label?: string
}

export type LotteryHistoryResponse = {
  lottery_code: LotteryCode
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
  digit_hits?: string[]
  digit_hit_count?: number
  is_exact_match?: boolean
  total_hits: number
}

export type PredictionGroup = {
  group_id: number
  play_type?: 'direct' | 'group3' | 'group6'
  strategy?: string
  description?: string
  red_balls: string[]
  blue_balls: string[]
  digits?: string[]
  blue_ball?: string | null
  hit_result?: PredictionHitResult
  prize_level?: string | null
  prize_amount?: number
  prize_source?: 'official' | 'fallback' | 'missing' | 'none'
}

export type ScoreSnapshot = {
  target_period: string
  prediction_date: string
  bet_count: number
  winning_bet_count: number
  cost_amount: number
  prize_amount: number
  net_profit: number
  roi: number
  best_hit_count: number
}

export type ScoreWindowProfile = {
  overall_score: number
  per_bet_score: number
  per_period_score: number
  profit_score: number
  hit_score: number
  stability_score: number
  ceiling_score: number
  floor_score: number
  periods: number
  bets: number
  hit_rate_by_period: number
  hit_rate_by_bet: number
  roi: number
  avg_period_roi: number
  best_period: ScoreSnapshot
  worst_period: ScoreSnapshot
}

export type ScoreProfile = {
  overall_score: number
  per_bet_score: number
  per_period_score: number
  recent_score: number
  long_term_score: number
  component_scores: Record<string, number>
  recent_window: ScoreWindowProfile
  long_term_window: ScoreWindowProfile
  best_period_snapshot: ScoreSnapshot
  worst_period_snapshot: ScoreSnapshot
  sample_size_periods: number
  sample_size_bets: number
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
  bet_count?: number
  cost_amount?: number
  winning_bet_count?: number
  prize_amount?: number
  hit_period_win?: boolean
  win_rate_by_period?: number
  win_rate_by_bet?: number
  score_profile?: ScoreProfile
}

export type PredictionHistorySummaryModel = {
  model_id: string
  model_name: string
  model_provider: string
  model_version?: string | null
  model_api_model?: string | null
  best_group?: number | null
  best_hit_count?: number | null
  bet_count?: number
  cost_amount?: number
  winning_bet_count?: number
  prize_amount?: number
  hit_period_win?: boolean
  win_rate_by_period?: number
  win_rate_by_bet?: number
  score_profile?: ScoreProfile
}

export type PredictionHistoryPeriodSummary = {
  total_bet_count: number
  total_cost_amount: number
  total_prize_amount: number
}

export type PredictionHistoryModelStat = {
  model_id: string
  model_name: string
  periods: number
  winning_periods: number
  bet_count: number
  winning_bet_count: number
  cost_amount: number
  prize_amount: number
  win_rate_by_period: number
  win_rate_by_bet: number
  score_profile?: ScoreProfile
}

export type CurrentPredictionsResponse = {
  lottery_code: LotteryCode
  prediction_date: string
  target_period: string
  models: PredictionModel[]
}

export type PredictionsHistoryListRecord = {
  lottery_code?: LotteryCode
  prediction_date: string
  target_period: string
  actual_result: LotteryDraw | null
  models: PredictionHistorySummaryModel[]
  period_summary?: PredictionHistoryPeriodSummary
}

export type PredictionsHistoryListResponse = {
  lottery_code?: LotteryCode
  predictions_history: PredictionsHistoryListRecord[]
  total_count: number
  model_stats?: PredictionHistoryModelStat[]
  strategy_options?: string[]
}

export type PredictionsHistoryRecord = {
  lottery_code?: LotteryCode
  prediction_date: string
  target_period: string
  actual_result: LotteryDraw | null
  models: PredictionModel[]
}

export type PredictionsHistoryResponse = {
  predictions_history: PredictionsHistoryRecord[]
  total_count: number
  model_stats?: PredictionHistoryModelStat[]
}

export type SimulationTicketPayload = {
  lottery_code?: LotteryCode
  play_type?: 'dlt' | 'direct' | 'group3' | 'group6'
  front_numbers: string[]
  back_numbers: string[]
  direct_hundreds?: string[]
  direct_tens?: string[]
  direct_units?: string[]
  group_numbers?: string[]
}

export type SimulationTicketRecord = {
  id: number
  lottery_code?: LotteryCode
  play_type?: 'dlt' | 'direct' | 'group3' | 'group6'
  front_numbers: string[]
  back_numbers: string[]
  direct_hundreds?: string[]
  direct_tens?: string[]
  direct_units?: string[]
  group_numbers?: string[]
  bet_count: number
  amount: number
  created_at: string
}

export type SimulationTicketListResponse = {
  tickets: SimulationTicketRecord[]
}

export type SimulationTicketCreateResponse = {
  ticket: SimulationTicketRecord
}

export type SuccessResponse = {
  success: boolean
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
  lottery_codes: LotteryCode[]
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
  lottery_codes: LotteryCode[]
}

export type GenerateSettingsModelPredictionsPayload = {
  lottery_code: LotteryCode
  model_code: string
  mode: 'current' | 'history'
  overwrite: boolean
  start_period?: string
  end_period?: string
}

export type BulkSettingsModelActionPayload = {
  model_codes: string[]
  action: 'enable' | 'disable' | 'delete' | 'restore' | 'edit'
  updates?: {
    provider?: string
    base_url?: string
    api_key?: string
    tags?: string[]
    temperature?: number | null
    is_active?: boolean
  }
}

export type BulkGenerateSettingsModelPredictionsPayload = {
  lottery_code: LotteryCode
  model_codes: string[]
  mode: 'current' | 'history'
  overwrite: boolean
  parallelism?: number
  start_period?: string
  end_period?: string
}

export type BulkModelActionResult = {
  selected_count: number
  processed_count: number
  skipped_count: number
  failed_count: number
  processed_models: string[]
  skipped_models: string[]
  failed_models: string[]
}

export type PredictionGenerationFailureDetail = {
  model_code: string
  model_name?: string
  reason: string
}

export type PredictionGenerationTask = {
  task_id: string
  lottery_code?: LotteryCode
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
    selected_count?: number
    completed_count?: number
    processed_count: number
    skipped_count: number
    failed_count: number
    failed_periods: string[]
    processed_models?: string[]
    skipped_models?: string[]
    failed_models?: string[]
    failed_details?: PredictionGenerationFailureDetail[]
  }
  error_message?: string | null
}

export type LotteryFetchTask = {
  task_id: string
  lottery_code?: LotteryCode
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  created_at: string
  started_at?: string | null
  finished_at?: string | null
  progress_summary: {
    fetched_count: number
    saved_count: number
    latest_period?: string | null
    duration_ms: number
  }
  error_message?: string | null
}

export type SettingsPredictionRecordSummary = {
  lottery_code?: LotteryCode
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
  lottery_code?: LotteryCode
  record_type: 'current' | 'history'
  prediction_date: string
  target_period: string
  actual_result: LotteryDraw | null
  models: PredictionModel[]
  model_stats?: PredictionHistoryModelStat[]
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

export type ScheduleTaskType = 'lottery_fetch' | 'prediction_generate'
export type ScheduleMode = 'preset' | 'cron'
export type SchedulePresetType = 'daily' | 'weekly'

export type ScheduleTask = {
  task_code: string
  task_name: string
  task_type: ScheduleTaskType
  lottery_code: LotteryCode
  model_codes: string[]
  generation_mode: 'current'
  overwrite_existing: boolean
  schedule_mode: ScheduleMode
  preset_type?: SchedulePresetType | null
  time_of_day?: string | null
  weekdays: number[]
  cron_expression?: string | null
  is_active: boolean
  next_run_at?: string | null
  last_run_at?: string | null
  last_run_status?: string | null
  last_error_message?: string | null
  last_task_id?: string | null
  rule_summary?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type ScheduleTaskPayload = {
  task_name: string
  task_type: ScheduleTaskType
  lottery_code: LotteryCode
  model_codes: string[]
  generation_mode: 'current'
  overwrite_existing: boolean
  schedule_mode: ScheduleMode
  preset_type?: SchedulePresetType | null
  time_of_day?: string | null
  weekdays: number[]
  cron_expression?: string | null
  is_active: boolean
}

export type ScheduleTaskListResponse = {
  tasks: ScheduleTask[]
}
