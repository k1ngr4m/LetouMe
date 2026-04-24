export type LotteryCode = 'dlt' | 'pl3' | 'pl5' | 'qxc'

export type LotteryDraw = {
  lottery_code?: LotteryCode
  period: string
  date: string
  red_balls: string[]
  blue_balls: string[]
  digits?: string[]
  blue_ball?: string | null
  jackpot_pool_balance?: number
  previous_jackpot_pool?: number
  prize_breakdown?: PrizeBreakdownItem[]
  prize_breakdown_ready?: boolean
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
  last_updated: number
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
  position_hits?: string[][]
  is_exact_match?: boolean
  winning_bet_count?: number
  best_prize_level?: string | null
  total_hits: number
}

export type PredictionGroup = {
  group_id: number
  play_type?: 'direct' | 'direct_sum' | 'group3' | 'group6' | 'pl3_dantuo' | 'dlt_dantuo' | 'dlt_compound' | 'qxc_compound'
  sum_value?: string
  cost_amount?: number
  strategy?: string
  description?: string
  red_balls: string[]
  blue_balls: string[]
  front_dan?: string[]
  front_tuo?: string[]
  back_dan?: string[]
  back_tuo?: string[]
  digits?: string[]
  direct_hundreds_dan?: string[]
  direct_hundreds_tuo?: string[]
  direct_tens_dan?: string[]
  direct_tens_tuo?: string[]
  direct_units_dan?: string[]
  direct_units_tuo?: string[]
  position_selections?: string[][]
  blue_ball?: string | null
  hit_result?: PredictionHitResult
  winning_bet_count?: number
  prize_level?: string | null
  prize_amount?: number
  prize_source?: 'official' | 'fallback' | 'missing' | 'none'
}

export type PredictionPlayMode = 'direct' | 'direct_sum' | 'compound' | 'dantuo'

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
  cost_amount: number
  prize_amount: number
  net_profit: number
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
  prediction_play_mode?: PredictionPlayMode
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
  prediction_play_mode?: PredictionPlayMode
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
  prediction_play_mode?: PredictionPlayMode
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
  play_type?: 'dlt' | 'dlt_dantuo' | 'direct' | 'group3' | 'group6' | 'direct_sum' | 'pl3_dantuo' | 'qxc_compound'
  front_numbers: string[]
  back_numbers: string[]
  front_dan?: string[]
  front_tuo?: string[]
  back_dan?: string[]
  back_tuo?: string[]
  direct_ten_thousands?: string[]
  direct_thousands?: string[]
  direct_hundreds?: string[]
  direct_tens?: string[]
  direct_units?: string[]
  direct_hundreds_dan?: string[]
  direct_hundreds_tuo?: string[]
  direct_tens_dan?: string[]
  direct_tens_tuo?: string[]
  direct_units_dan?: string[]
  direct_units_tuo?: string[]
  group_numbers?: string[]
  sum_values?: string[]
  position_selections?: string[][]
}

export type SimulationTicketRecord = {
  id: number
  lottery_code?: LotteryCode
  play_type?: 'dlt' | 'dlt_dantuo' | 'direct' | 'group3' | 'group6' | 'direct_sum' | 'pl3_dantuo' | 'qxc_compound'
  front_numbers: string[]
  back_numbers: string[]
  front_dan?: string[]
  front_tuo?: string[]
  back_dan?: string[]
  back_tuo?: string[]
  direct_ten_thousands?: string[]
  direct_thousands?: string[]
  direct_hundreds?: string[]
  direct_tens?: string[]
  direct_units?: string[]
  direct_hundreds_dan?: string[]
  direct_hundreds_tuo?: string[]
  direct_tens_dan?: string[]
  direct_tens_tuo?: string[]
  direct_units_dan?: string[]
  direct_units_tuo?: string[]
  group_numbers?: string[]
  sum_values?: string[]
  position_selections?: string[][]
  bet_count: number
  amount: number
  created_at: number
}

export type SimulationTicketListResponse = {
  tickets: SimulationTicketRecord[]
}

export type SimulationTicketCreateResponse = {
  ticket: SimulationTicketRecord
}

export type SimulationTicketQuoteResponse = {
  lottery_code: LotteryCode
  play_type: 'dlt' | 'dlt_dantuo' | 'direct' | 'group3' | 'group6' | 'direct_sum' | 'pl3_dantuo' | 'qxc_compound'
  bet_count: number
  amount: number
}

export type MyBetRecordPayload = {
  lottery_code?: LotteryCode
  target_period: string
  play_type?: 'dlt' | 'dlt_dantuo' | 'direct' | 'group3' | 'group6' | 'direct_sum' | 'pl3_dantuo' | 'group_sum' | 'qxc_compound'
  front_numbers?: string[]
  back_numbers?: string[]
  front_dan?: string[]
  front_tuo?: string[]
  back_dan?: string[]
  back_tuo?: string[]
  direct_ten_thousands?: string[]
  direct_thousands?: string[]
  direct_hundreds?: string[]
  direct_tens?: string[]
  direct_units?: string[]
  direct_hundreds_dan?: string[]
  direct_hundreds_tuo?: string[]
  direct_tens_dan?: string[]
  direct_tens_tuo?: string[]
  direct_units_dan?: string[]
  direct_units_tuo?: string[]
  group_numbers?: string[]
  sum_values?: string[]
  position_selections?: string[][]
  multiplier?: number
  is_append?: boolean
  source_type?: 'manual' | 'ocr'
  ticket_image_url?: string
  ocr_text?: string
  ocr_provider?: string | null
  ocr_recognized_at?: number | null
  ticket_purchased_at?: number | null
  discount_amount?: number
  lines?: MyBetLinePayload[]
}

export type MyBetRecordUpdatePayload = MyBetRecordPayload & {
  record_id: number
}

export type MyBetLinePayload = {
  play_type?: 'dlt' | 'dlt_dantuo' | 'direct' | 'group3' | 'group6' | 'direct_sum' | 'pl3_dantuo' | 'group_sum' | 'qxc_compound'
  front_numbers?: string[]
  back_numbers?: string[]
  front_dan?: string[]
  front_tuo?: string[]
  back_dan?: string[]
  back_tuo?: string[]
  direct_ten_thousands?: string[]
  direct_thousands?: string[]
  direct_hundreds?: string[]
  direct_tens?: string[]
  direct_units?: string[]
  direct_hundreds_dan?: string[]
  direct_hundreds_tuo?: string[]
  direct_tens_dan?: string[]
  direct_tens_tuo?: string[]
  direct_units_dan?: string[]
  direct_units_tuo?: string[]
  group_numbers?: string[]
  sum_values?: string[]
  position_selections?: string[][]
  multiplier?: number
  is_append?: boolean
}

export type MyBetLine = {
  line_no: number
  play_type: 'dlt' | 'dlt_dantuo' | 'direct' | 'group3' | 'group6' | 'direct_sum' | 'pl3_dantuo' | 'group_sum' | 'qxc_compound'
  front_numbers: string[]
  back_numbers: string[]
  front_dan?: string[]
  front_tuo?: string[]
  back_dan?: string[]
  back_tuo?: string[]
  direct_ten_thousands: string[]
  direct_thousands: string[]
  direct_hundreds: string[]
  direct_tens: string[]
  direct_units: string[]
  direct_hundreds_dan: string[]
  direct_hundreds_tuo: string[]
  direct_tens_dan: string[]
  direct_tens_tuo: string[]
  direct_units_dan: string[]
  direct_units_tuo: string[]
  group_numbers: string[]
  sum_values?: string[]
  position_selections?: string[][]
  hit_front_numbers?: string[]
  hit_back_numbers?: string[]
  hit_direct_ten_thousands?: string[]
  hit_direct_thousands?: string[]
  hit_direct_hundreds?: string[]
  hit_direct_tens?: string[]
  hit_direct_units?: string[]
  hit_group_numbers?: string[]
  hit_sum_values?: string[]
  hit_position_selections?: string[][]
  multiplier: number
  is_append: boolean
  bet_count: number
  amount: number
}

export type MyBetRecord = {
  id: number
  lottery_code: LotteryCode
  target_period: string
  play_type: 'dlt' | 'dlt_dantuo' | 'direct' | 'group3' | 'group6' | 'direct_sum' | 'pl3_dantuo' | 'group_sum' | 'qxc_compound'
  front_numbers: string[]
  back_numbers: string[]
  front_dan?: string[]
  front_tuo?: string[]
  back_dan?: string[]
  back_tuo?: string[]
  direct_ten_thousands: string[]
  direct_thousands: string[]
  direct_hundreds: string[]
  direct_tens: string[]
  direct_units: string[]
  direct_hundreds_dan: string[]
  direct_hundreds_tuo: string[]
  direct_tens_dan: string[]
  direct_tens_tuo: string[]
  direct_units_dan: string[]
  direct_units_tuo: string[]
  group_numbers: string[]
  sum_values?: string[]
  position_selections?: string[][]
  multiplier: number
  is_append: boolean
  bet_count: number
  amount: number
  discount_amount: number
  net_amount: number
  settlement_status: 'pending' | 'settled'
  winning_bet_count: number
  prize_level: string | null
  prize_amount: number
  net_profit: number
  settled_at: number | null
  source_type: 'manual' | 'ocr'
  ticket_image_url: string
  ocr_text: string
  ocr_provider: string | null
  ocr_recognized_at: number | null
  ticket_purchased_at?: number | null
  actual_result?: LotteryDraw | null
  lines: MyBetLine[]
  created_at: number
  updated_at: number
}

export type MyBetSummary = {
  total_count: number
  total_amount: number
  total_discount_amount: number
  total_net_amount: number
  total_prize_amount: number
  total_net_profit: number
  settled_count: number
  pending_count: number
}

export type MyBetRecordListResponse = {
  records: MyBetRecord[]
  summary: MyBetSummary
}

export type MyBetRecordCreateResponse = {
  record: MyBetRecord
}

export type MyBetRecordUpdateResponse = {
  record: MyBetRecord
}

export type MyBetOCRDraftResponse = {
  lottery_code: LotteryCode
  target_period: string
  source_type: 'ocr'
  ticket_image_url: string
  ocr_text: string
  ocr_provider: string | null
  ocr_recognized_at: number | null
  ticket_purchased_at?: number | null
  lines: MyBetLine[]
  warnings: string[]
}

export type MyBetOCRImageUploadResponse = {
  lottery_code: LotteryCode
  ticket_image_url: string
}

export type MessageStatusFilter = 'all' | 'unread' | 'read'
export type MessageResultFilter = 'all' | 'won' | 'lost'
export type MessageDateFilter = {
  date_start?: string
  date_end?: string
}

export type SiteMessage = {
  id: number
  lottery_code: LotteryCode
  target_period: string
  my_bet_record_id: number
  message_type: 'bet_settlement'
  title: string
  content: string
  snapshot?: Record<string, unknown> | null
  is_read: boolean
  read_at: number | null
  created_at: number
}

export type SiteMessageListResponse = {
  messages: SiteMessage[]
  total_count: number
}

export type SiteMessageUnreadCountResponse = {
  unread_count: number
}

export type SuccessResponse = {
  success: boolean
}

export type SettingsModel = {
  model_code: string
  display_name: string
  provider: string
  provider_model_id?: number | null
  provider_model_name?: string
  api_format?: string
  api_model_name: string
  version?: string
  tags?: string[]
  base_url: string
  api_key: string
  app_code: string
  temperature?: number | null
  is_active: boolean
  is_deleted: boolean
  lottery_codes: LotteryCode[]
  updated_at: number
}

export type SettingsModelListResponse = {
  models: SettingsModel[]
}

export type SettingsProvider = {
  id?: number
  code: string
  name: string
  api_format?: 'openai_responses' | 'openai_compatible' | 'anthropic' | 'amazon_bedrock' | 'google_gemini'
  remark?: string
  website_url?: string
  api_key?: string
  base_url?: string
  extra_options?: Record<string, unknown>
  is_system_preset?: boolean
  model_configs?: Array<{
    id: number
    model_id: string
    display_name: string
  }>
}

export type SettingsProviderListResponse = {
  providers: SettingsProvider[]
}

export type SettingsProviderModelDiscoveryPayload = {
  provider: string
  base_url?: string
  api_key?: string
}

export type SettingsProviderDiscoveredModel = {
  model_id: string
  display_name: string
}

export type SettingsProviderModelDiscoveryResponse = {
  models: SettingsProviderDiscoveredModel[]
}

export type SettingsModelPayload = {
  model_code?: string
  display_name: string
  provider: string
  provider_model_id?: number | null
  provider_model_name?: string
  api_format?: string
  api_model_name: string
  version?: string
  tags?: string[]
  base_url: string
  api_key: string
  app_code: string
  temperature?: number | null
  is_active: boolean
  lottery_codes: LotteryCode[]
}

export type SettingsModelConnectivityTestPayload = {
  provider: string
  api_format?: string
  api_model_name: string
  base_url?: string
  api_key?: string
  app_code?: string
  temperature?: number
}

export type SettingsModelConnectivityTestResponse = {
  ok: boolean
  message: string
  duration_ms: number
}

export type ExpertConfig = {
  dlt_front_weights: Record<string, number>
  dlt_back_weights: Record<string, number>
  strategy_preferences: Record<string, number>
  pl3_reserved_weights: Record<string, number>
}

export type SettingsExpert = {
  id: number
  expert_code: string
  display_name: string
  bio: string
  model_code: string
  lottery_code: LotteryCode
  history_window_count: number
  is_active: boolean
  is_deleted: boolean
  config: ExpertConfig
  updated_at: number
  created_at: number
}

export type SettingsExpertListResponse = {
  experts: SettingsExpert[]
}

export type SettingsExpertPayload = {
  expert_code?: string
  display_name: string
  bio?: string
  model_code: string
  lottery_code: LotteryCode
  is_active: boolean
  config: ExpertConfig
}

export type ExpertPredictionTask = {
  task_id: string
  lottery_code?: LotteryCode
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'partial_succeeded'
  created_at: number
  started_at?: number | null
  finished_at?: number | null
  progress_summary: {
    lottery_code?: LotteryCode
    target_period?: string
    selected_count?: number
    processed_count?: number
    skipped_count?: number
    failed_count?: number
    processed_experts?: string[]
    failed_experts?: Array<{ expert_code: string; reason: string }>
  }
  error_message?: string | null
}

export type SettingsProviderPayload = {
  code?: string
  name: string
  api_format: 'openai_responses' | 'openai_compatible' | 'anthropic' | 'amazon_bedrock' | 'google_gemini'
  remark: string
  website_url: string
  api_key: string
  base_url: string
  extra_options: Record<string, unknown>
  model_configs: Array<{
    id?: number
    model_id: string
    display_name: string
  }>
}

export type GenerateSettingsModelPredictionsPayload = {
  lottery_code: LotteryCode
  model_code: string
  mode: 'current' | 'history'
  prediction_play_mode: PredictionPlayMode
  overwrite: boolean
  parallelism?: number
  start_period?: string
  end_period?: string
  recent_period_count?: 1 | 5 | 10 | 20
  prompt_history_period_count?: 30 | 50 | 100
}

export type BulkSettingsModelActionPayload = {
  model_codes: string[]
  action: 'enable' | 'disable' | 'delete' | 'restore' | 'edit'
  updates?: {
    provider?: string
    base_url?: string
    api_key?: string
    is_active?: boolean
  }
}

export type BulkGenerateSettingsModelPredictionsPayload = {
  lottery_code: LotteryCode
  model_codes: string[]
  mode: 'current' | 'history'
  prediction_play_mode: PredictionPlayMode
  overwrite: boolean
  parallelism?: number
  start_period?: string
  end_period?: string
  recent_period_count?: 1 | 5 | 10 | 20
  prompt_history_period_count?: 30 | 50 | 100
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
  created_at: number
  started_at?: number | null
  finished_at?: number | null
  progress_summary: {
    mode: string
    model_code: string
    target_period?: string | null
    parallelism?: number
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
    task_total_count?: number
    task_completed_count?: number
    task_processed_count?: number
    task_skipped_count?: number
    task_failed_count?: number
  }
  error_message?: string | null
}

export type LotteryFetchTask = {
  task_id: string
  lottery_code?: LotteryCode
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  created_at: number
  started_at?: number | null
  finished_at?: number | null
  progress_summary: {
    fetched_count: number
    saved_count: number
    latest_period?: string | null
    duration_ms: number
  }
  error_message?: string | null
}

export type MaintenanceRunLog = {
  id: number
  task_id: string
  schedule_task_code?: string | null
  lottery_code: LotteryCode
  trigger_type: 'manual' | 'schedule'
  task_type?: 'lottery_fetch' | 'prediction_generate'
  mode?: 'current' | 'history' | string | null
  model_code?: string | null
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  started_at?: number | null
  finished_at?: number | null
  fetched_count: number
  saved_count: number
  processed_count?: number
  skipped_count?: number
  failed_count?: number
  latest_period?: string | null
  duration_ms: number
  error_message?: string | null
  created_at?: number | null
  updated_at?: number | null
}

export type MaintenanceRunLogListResponse = {
  logs: MaintenanceRunLog[]
  total_count: number
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

export type SmartPredictionStrategyCode = 'hot' | 'cold' | 'balanced' | 'cycle' | 'composite'

export type SmartPredictionStage1Row = {
  strategy_code: SmartPredictionStrategyCode
  strategy_label: string
  model_id: string
  model_name: string
  expected_numbers: string
  primary_hit: number
  expected_value: number
  high_prob_range: string
  interval_probability: number
  p0: number
  p1: number
  p2: number
  p3: number
  p4: number
  p5: number
  p6: number
  p7: number
}

export type SmartPredictionStage1Result = {
  target_period: string
  generated_at: string
  rows: SmartPredictionStage1Row[]
  warnings: string[]
}

export type SmartPredictionStage2Ticket = {
  red_balls: string[]
  blue_balls: string[]
}

export type SmartPredictionTop15Number = {
  zone: 'front' | 'back'
  number: string
  probability: number
  source: 'stat' | 'hybrid'
}

export type SmartPredictionStage2Result = {
  target_period: string
  generated_at: string
  tickets: SmartPredictionStage2Ticket[]
  dantuo: {
    front_dan: string[]
    front_tuo: string[]
    back_dan: string[]
    back_tuo: string[]
  }
  top15_numbers?: SmartPredictionTop15Number[]
}

export type SmartPredictionRun = {
  run_id: string
  lottery_code: LotteryCode
  target_period: string
  created_by_user_id: number
  status: string
  stage1_task_id?: string | null
  stage2_task_id?: string | null
  stage1_status: string
  stage2_status: string
  stage1_model_code: string
  stage2_model_code: string
  history_period_count: 30 | 50 | 100
  data_model_codes: string[]
  strategy_codes: SmartPredictionStrategyCode[]
  options: {
    include_trend: boolean
    include_scores: boolean
    auto_stage2: boolean
    retry_once: boolean
    strict_validation: boolean
  }
  warnings: string[]
  stage1_result?: SmartPredictionStage1Result | null
  stage2_result?: SmartPredictionStage2Result | null
  error_message?: string | null
  created_at?: number | null
  updated_at?: number | null
}

export type ExpertListItem = {
  expert_code: string
  display_name: string
  bio: string
  lottery_code: LotteryCode
  target_period: string
  model_code: string
  dlt_front_weights: Record<string, number>
  dlt_back_weights: Record<string, number>
  strategy_preferences: Record<string, number>
  generated_at?: number | null
}

export type ExpertPublicListResponse = {
  lottery_code: LotteryCode
  target_period: string
  experts: ExpertListItem[]
}

export type ExpertCurrentDetail = {
  expert_code: string
  display_name: string
  bio: string
  model_code: string
  lottery_code: LotteryCode
  target_period: string
  config: ExpertConfig
  tiers: {
    tier1?: { front: string[]; back: string[] }
    tier2?: { front: string[]; back: string[] }
    tier3?: { front: string[]; back: string[] }
    tier4?: { front: string[]; back: string[] }
    tier5?: { front: string[]; back: string[] }
  }
  analysis: {
    strategy_summary?: string
    technical_style?: string
  }
  generated_at?: number | null
}

export type SmartPredictionRunStartPayload = {
  lottery_code?: LotteryCode
  data_model_codes: string[]
  stage1_model_code: string
  stage2_model_code: string
  history_period_count: 30 | 50 | 100
  strategy_codes: SmartPredictionStrategyCode[]
  include_trend: boolean
  include_scores: boolean
  auto_stage2: boolean
  retry_once: boolean
  strict_validation: boolean
}

export type SmartPredictionRunListResponse = {
  runs: SmartPredictionRun[]
  total_count: number
}

export type AuthUser = {
  id: number
  username: string
  email?: string | null
  nickname: string
  avatar_url?: string | null
  role: string
  role_name: string
  is_active: boolean
  permissions: string[]
  last_login_at?: number | null
  created_at?: number | null
}

export type CurrentUserResponse = {
  user: AuthUser | null
}

export type LoginPayload = {
  identifier: string
  password: string
}

export type RegisterPayload = {
  username: string
  email: string
  password: string
  code: string
}

export type ForgotPasswordSendCodePayload = {
  email: string
}

export type RegisterSendCodePayload = {
  email: string
}

export type ForgotPasswordResetPayload = {
  email: string
  code: string
  new_password: string
}

export type OAuthStartResponse = {
  provider: string
  enabled: boolean
  auth_url?: string | null
  message?: string | null
}

export type AdminUserCreatePayload = {
  username: string
  email?: string
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
  fetch_limit?: number
  model_codes: string[]
  generation_mode: 'current'
  prediction_play_mode: PredictionPlayMode
  overwrite_existing: boolean
  schedule_mode: ScheduleMode
  preset_type?: SchedulePresetType | null
  time_of_day?: string | null
  weekdays: number[]
  cron_expression?: string | null
  is_active: boolean
  next_run_at?: number | null
  last_run_at?: number | null
  last_run_status?: string | null
  last_error_message?: string | null
  last_task_id?: string | null
  rule_summary?: string | null
  created_at?: number | null
  updated_at?: number | null
}

export type ScheduleTaskPayload = {
  task_name: string
  task_type: ScheduleTaskType
  lottery_code: LotteryCode
  fetch_limit?: number
  model_codes: string[]
  generation_mode: 'current'
  prediction_play_mode: PredictionPlayMode
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
