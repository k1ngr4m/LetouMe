import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { StatusCard } from '../../shared/components/StatusCard'
import { formatDateTimeBeijing } from '../../shared/lib/format'
import type { ExpertConfig, ExpertPredictionTask, LotteryCode, SettingsExpert, SettingsExpertPayload } from '../../shared/types/api'

const DEFAULT_CONFIG: ExpertConfig = {
  dlt_front_weights: {
    big_small_ratio: 8,
    prime_composite_ratio: 8,
    five_zone_ratio: 8,
    mod3_ratio: 6,
    sum_value: 6,
    mean_value: 4,
    span_value: 5,
    max_gap: 4,
    tail_sum_distribution: 4,
    consecutive_numbers: 4,
    repeat_numbers: 4,
    neighbor_numbers: 4,
    skip_repeat_numbers: 4,
    hot_warm_cold_numbers: 6,
    omit_value: 6,
    position_dan: 3,
    dan3: 3,
    dan4: 2,
    dan5: 1,
    full_drag: 1,
    compound_front: 1,
    total_omit: 4,
    ac_value: 2,
    frequency_probability: 2,
  },
  dlt_back_weights: {
    three_zone_ratio: 10,
    fine_zone_ratio: 8,
    big_small: 8,
    prime_composite_ratio: 7,
    sum_value: 8,
    span_value: 8,
    gap_value: 6,
    consecutive_numbers: 5,
    repeat_numbers: 6,
    skip_repeat_numbers: 5,
    odd_even_shape: 7,
    dan1: 5,
    dan2: 4,
    dan3: 3,
    full_drag: 2,
    compound_back: 2,
    total_omit: 3,
    ac_value: 1,
    frequency_probability: 2,
  },
  strategy_preferences: {
    avg_omit: 8,
    max_omit: 7,
    current_omit: 8,
    omit_layer: 6,
    omit_sum: 5,
    hot_number: 6,
    warm_number: 5,
    cold_number: 5,
    hot_warm_cold_ratio: 6,
    sum_deviation: 5,
    tail_deviation: 4,
    zone_deviation: 4,
    odd_even_deviation: 4,
    ac_value: 5,
    neighbor_count: 4,
    repeat_count: 4,
    gap_distribution: 4,
    rebound_probability: 4,
    reversal_signal: 3,
    inertia_continuation: 3,
  },
  pl3_reserved_weights: {
    hundreds: 34,
    tens: 33,
    units: 33,
  },
}

const EMPTY_FORM: SettingsExpertPayload = {
  display_name: '',
  bio: '',
  model_code: '',
  lottery_code: 'dlt',
  is_active: true,
  config: DEFAULT_CONFIG,
}

type ConfigTabKey = 'dlt_front_weights' | 'dlt_back_weights' | 'strategy_preferences' | 'pl3_reserved_weights'

const CONFIG_TABS: Array<{ key: ConfigTabKey; label: string }> = [
  { key: 'dlt_front_weights', label: '前区权重' },
  { key: 'dlt_back_weights', label: '后区权重' },
  { key: 'strategy_preferences', label: '策略倾向' },
]

type WeightField = { key: string; label: string; hint?: string }
type WeightSection = { title: string; fields: WeightField[] }

const WEIGHT_SECTIONS: Record<ConfigTabKey, WeightSection[]> = {
  dlt_front_weights: [
    {
      title: '基础比例 / 分布类',
      fields: [
        { key: 'big_small_ratio', label: '大小比', hint: '01-17 小号，18-35 大号' },
        { key: 'prime_composite_ratio', label: '质合比', hint: '前区质数与合数比例' },
        { key: 'five_zone_ratio', label: '五区比', hint: '01-07、08-14、15-21、22-28、29-35' },
        { key: 'mod3_ratio', label: '012路比', hint: '除3余0/1/2分布' },
      ],
    },
    {
      title: '和值 / 均值 / 跨度类',
      fields: [
        { key: 'sum_value', label: '和值' },
        { key: 'mean_value', label: '均值' },
        { key: 'span_value', label: '跨度' },
        { key: 'max_gap', label: '最大间距' },
        { key: 'tail_sum_distribution', label: '尾和 / 尾分布' },
      ],
    },
    {
      title: '连号 / 邻号 / 重码类',
      fields: [
        { key: 'consecutive_numbers', label: '连号' },
        { key: 'repeat_numbers', label: '重码' },
        { key: 'neighbor_numbers', label: '斜连码' },
        { key: 'skip_repeat_numbers', label: '隔期码' },
      ],
    },
    {
      title: '冷热 / 遗漏类',
      fields: [
        { key: 'hot_warm_cold_numbers', label: '热温冷号' },
        { key: 'omit_value', label: '遗漏值 / 平均遗漏' },
      ],
    },
    {
      title: '定位 / 胆拖 / 复式倾向',
      fields: [
        { key: 'position_dan', label: '定位胆' },
        { key: 'dan3', label: '3胆' },
        { key: 'dan4', label: '4胆' },
        { key: 'dan5', label: '5胆' },
        { key: 'full_drag', label: '全拖' },
        { key: 'compound_front', label: '前区复式' },
      ],
    },
    {
      title: '通用参数',
      fields: [
        { key: 'total_omit', label: '遗漏总值' },
        { key: 'ac_value', label: 'AC值' },
        { key: 'frequency_probability', label: '出号频率 / 概率' },
      ],
    },
  ],
  dlt_back_weights: [
    {
      title: '分区 / 比例类',
      fields: [
        { key: 'three_zone_ratio', label: '三区比', hint: '01-04、05-08、09-12' },
        { key: 'fine_zone_ratio', label: '五区 / 六区比' },
        { key: 'big_small', label: '大小比', hint: '01-06 小，07-12 大' },
        { key: 'prime_composite_ratio', label: '质合比' },
      ],
    },
    {
      title: '和值 / 跨度 / 间距类',
      fields: [
        { key: 'sum_value', label: '和值' },
        { key: 'span_value', label: '跨度' },
        { key: 'gap_value', label: '间距 / 差值' },
      ],
    },
    {
      title: '连号 / 重码 / 形态类',
      fields: [
        { key: 'consecutive_numbers', label: '后区连号' },
        { key: 'repeat_numbers', label: '重码' },
        { key: 'skip_repeat_numbers', label: '隔期码' },
        { key: 'odd_even_shape', label: '奇偶形态' },
      ],
    },
    {
      title: '胆拖 / 复式倾向',
      fields: [
        { key: 'dan1', label: '1胆' },
        { key: 'dan2', label: '2胆' },
        { key: 'dan3', label: '3胆' },
        { key: 'full_drag', label: '全拖' },
        { key: 'compound_back', label: '后区复式' },
      ],
    },
    {
      title: '通用参数',
      fields: [
        { key: 'total_omit', label: '遗漏总值' },
        { key: 'ac_value', label: 'AC值' },
        { key: 'frequency_probability', label: '出号频率 / 概率' },
      ],
    },
  ],
  strategy_preferences: [
    {
      title: '遗漏相关',
      fields: [
        { key: 'avg_omit', label: '平均遗漏' },
        { key: 'max_omit', label: '最大遗漏' },
        { key: 'current_omit', label: '当前遗漏' },
        { key: 'omit_layer', label: '遗漏层级' },
        { key: 'omit_sum', label: '遗漏和' },
      ],
    },
    {
      title: '冷热温形态',
      fields: [
        { key: 'hot_number', label: '热号' },
        { key: 'warm_number', label: '温号' },
        { key: 'cold_number', label: '冷号' },
        { key: 'hot_warm_cold_ratio', label: '热温冷比例' },
      ],
    },
    {
      title: '偏差类',
      fields: [
        { key: 'sum_deviation', label: '和值偏差' },
        { key: 'tail_deviation', label: '尾数偏差' },
        { key: 'zone_deviation', label: '区间偏差' },
        { key: 'odd_even_deviation', label: '奇偶偏差' },
      ],
    },
    {
      title: '形态稳定度',
      fields: [
        { key: 'ac_value', label: 'AC值' },
        { key: 'neighbor_count', label: '邻号个数' },
        { key: 'repeat_count', label: '重号个数' },
        { key: 'gap_distribution', label: '间距分布' },
      ],
    },
    {
      title: '回补信号',
      fields: [
        { key: 'rebound_probability', label: '欲出几率' },
        { key: 'reversal_signal', label: '反转信号' },
        { key: 'inertia_continuation', label: '惯性延续' },
      ],
    },
  ],
  pl3_reserved_weights: [
    {
      title: '排列3预留',
      fields: [
        { key: 'hundreds', label: '百位' },
        { key: 'tens', label: '十位' },
        { key: 'units', label: '个位' },
      ],
    },
  ],
}

const TAB_FIELDS: Record<ConfigTabKey, WeightField[]> = Object.fromEntries(
  Object.entries(WEIGHT_SECTIONS).map(([key, sections]) => [key, sections.flatMap((section) => section.fields)]),
) as Record<ConfigTabKey, WeightField[]>

const STRICT_SUM_TABS: ConfigTabKey[] = ['dlt_front_weights', 'dlt_back_weights', 'strategy_preferences']
type ExpertGenerationMode = 'current' | 'history'
type ExpertGenerationRangeMode = 'recent' | 'custom'
type ExpertGenerationRecentPeriodCount = '1' | '5' | '10' | '20'
type ExpertGenerationPromptHistoryPeriodCount = '30' | '50' | '100'

const GENERATION_RECENT_PERIOD_OPTIONS: Array<{ value: ExpertGenerationRecentPeriodCount; label: string }> = [
  { value: '1', label: '最近1期' },
  { value: '5', label: '最近5期' },
  { value: '10', label: '最近10期' },
  { value: '20', label: '最近20期' },
]

const GENERATION_PROMPT_HISTORY_PERIOD_OPTIONS: Array<{ value: ExpertGenerationPromptHistoryPeriodCount; label: string }> = [
  { value: '30', label: '近30期' },
  { value: '50', label: '近50期' },
  { value: '100', label: '近100期' },
]

const LOTTERY_LABELS: Record<LotteryCode, string> = {
  dlt: '大乐透',
  pl3: '排列3',
  pl5: '排列5',
  qxc: '七星彩',
}

function cloneDefaultConfig(): ExpertConfig {
  return {
    dlt_front_weights: { ...DEFAULT_CONFIG.dlt_front_weights },
    dlt_back_weights: { ...DEFAULT_CONFIG.dlt_back_weights },
    strategy_preferences: { ...DEFAULT_CONFIG.strategy_preferences },
    pl3_reserved_weights: { ...DEFAULT_CONFIG.pl3_reserved_weights },
  }
}

function normalizeExpertConfig(input: ExpertConfig | undefined | null): ExpertConfig {
  const source = input || cloneDefaultConfig()
  return {
    dlt_front_weights: {
      ...DEFAULT_CONFIG.dlt_front_weights,
      ...(source.dlt_front_weights || {}),
    },
    dlt_back_weights: {
      ...DEFAULT_CONFIG.dlt_back_weights,
      ...(source.dlt_back_weights || {}),
    },
    strategy_preferences: {
      ...DEFAULT_CONFIG.strategy_preferences,
      ...(source.strategy_preferences || {}),
    },
    pl3_reserved_weights: {
      ...DEFAULT_CONFIG.pl3_reserved_weights,
      ...(source.pl3_reserved_weights || {}),
    },
  }
}

function clampWeight(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getTaskStatusLabel(status: string | undefined) {
  if (status === 'queued') return '排队中'
  if (status === 'running') return '执行中'
  if (status === 'succeeded') return '已完成'
  if (status === 'partial_succeeded') return '部分完成'
  if (status === 'failed') return '失败'
  return status || '-'
}

export function ExpertsSettingsPage() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<SettingsExpertPayload>(EMPTY_FORM)
  const [activeConfigTab, setActiveConfigTab] = useState<ConfigTabKey>('dlt_front_weights')
  const [taskId, setTaskId] = useState('')
  const [generationExpert, setGenerationExpert] = useState<SettingsExpert | null>(null)
  const [generationTask, setGenerationTask] = useState<ExpertPredictionTask | null>(null)
  const [generationForm, setGenerationForm] = useState({
    mode: 'current' as ExpertGenerationMode,
    overwrite: false,
    parallelism: '3',
    historyRangeMode: 'recent' as ExpertGenerationRangeMode,
    recentPeriodCount: '10' as ExpertGenerationRecentPeriodCount,
    startPeriod: '',
    endPeriod: '',
    promptHistoryPeriodCount: '50' as ExpertGenerationPromptHistoryPeriodCount,
  })

  const expertsQuery = useQuery({
    queryKey: ['settings-experts'],
    queryFn: async () => apiClient.getSettingsExperts(false),
  })
  const modelsQuery = useQuery({
    queryKey: ['settings-models', 'experts'],
    queryFn: async () => apiClient.getSettingsModels(false, 'dlt'),
  })
  const runTaskQuery = useQuery({
    queryKey: ['settings-expert-run-task', taskId],
    queryFn: async () => apiClient.getSettingsExpertPredictionTask(taskId),
    enabled: Boolean(taskId),
    refetchInterval: (query) => {
      const status = String(query.state.data?.status || '')
      return status === 'queued' || status === 'running' ? 1500 : false
    },
  })
  const generationTaskQuery = useQuery({
    queryKey: ['settings-expert-generation-task', generationTask?.task_id],
    queryFn: async () => apiClient.getSettingsExpertPredictionTask(generationTask?.task_id || ''),
    enabled: Boolean(generationTask?.task_id),
    refetchInterval: (query) => {
      const status = String(query.state.data?.status || '')
      return status === 'queued' || status === 'running' ? 1500 : false
    },
  })

  const activeModels = useMemo(
    () => (modelsQuery.data?.models || []).filter((item) => item.is_active && !item.is_deleted && (item.lottery_codes || []).includes('dlt')),
    [modelsQuery.data?.models],
  )

  const saveMutation = useMutation({
    mutationFn: async () => {
      const normalizedConfig = normalizeExpertConfig(form.config)
      const invalidTabs = STRICT_SUM_TABS.filter((key) => getTabTotal(normalizedConfig, key) !== 100)
      if (invalidTabs.length) {
        const tabLabels = CONFIG_TABS.filter((item) => invalidTabs.includes(item.key))
          .map((item) => item.label)
          .join('、')
        throw new Error(`${tabLabels}权重总和必须为100`)
      }
      const payload: SettingsExpertPayload = { ...form, config: normalizedConfig, lottery_code: 'dlt' }
      if (editingCode) {
        return apiClient.updateSettingsExpert(editingCode, payload)
      }
      return apiClient.createSettingsExpert(payload)
    },
    onSuccess: () => {
      setMessage(editingCode ? '专家配置已更新' : '专家已创建')
      setMessageType('success')
      setFormOpen(false)
      setEditingCode(null)
      void queryClient.invalidateQueries({ queryKey: ['settings-experts'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '保存失败')
      setMessageType('error')
    },
  })

  const statusMutation = useMutation({
    mutationFn: async (payload: { expertCode: string; isActive: boolean }) =>
      apiClient.toggleSettingsExpert(payload.expertCode, payload.isActive),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings-experts'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (expertCode: string) => apiClient.deleteSettingsExpert(expertCode),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings-experts'] }),
  })

  const runMutation = useMutation({
    mutationFn: async () => apiClient.startSettingsExpertPredictionRun('dlt'),
    onSuccess: (task) => {
      setTaskId(task.task_id)
      setMessage('已启动专家预测生成任务')
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-experts'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '任务启动失败')
      setMessageType('error')
    },
  })

  const generationMutation = useMutation({
    mutationFn: async () => {
      if (!generationExpert) throw new Error('请选择专家')
      const historyRangePayload =
        generationForm.mode === 'history'
          ? generationForm.historyRangeMode === 'recent'
            ? { recent_period_count: Number(generationForm.recentPeriodCount) as 1 | 5 | 10 | 20 }
            : {
                start_period: generationForm.startPeriod.trim(),
                end_period: generationForm.endPeriod.trim(),
              }
          : {}
      return apiClient.startSettingsExpertPredictionRun({
        lottery_code: generationExpert.lottery_code,
        expert_code: generationExpert.expert_code,
        mode: generationForm.mode,
        overwrite: generationForm.overwrite,
        parallelism: Number(generationForm.parallelism.trim()) || 3,
        prompt_history_period_count: Number(generationForm.promptHistoryPeriodCount) as 30 | 50 | 100,
        ...historyRangePayload,
      })
    },
    onSuccess: (task) => {
      setGenerationTask(task)
      setMessage('已启动专家预测生成任务')
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-experts'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '任务启动失败')
      setMessageType('error')
    },
  })

  function openCreate() {
    setEditingCode(null)
    setForm({ ...EMPTY_FORM, config: cloneDefaultConfig() })
    setActiveConfigTab('dlt_front_weights')
    setFormOpen(true)
  }

  function openEdit(expert: SettingsExpert) {
    setEditingCode(expert.expert_code)
    setForm({
      display_name: expert.display_name,
      bio: expert.bio,
      model_code: expert.model_code,
      lottery_code: 'dlt',
      is_active: expert.is_active,
      config: normalizeExpertConfig(expert.config),
    })
    setActiveConfigTab('dlt_front_weights')
    setFormOpen(true)
  }

  function openGeneration(expert: SettingsExpert) {
    setGenerationExpert(expert)
    setGenerationTask(null)
    setGenerationForm({
      mode: 'current',
      overwrite: false,
      parallelism: '3',
      historyRangeMode: 'recent',
      recentPeriodCount: '10',
      startPeriod: '',
      endPeriod: '',
      promptHistoryPeriodCount: '50',
    })
  }

  function updateWeight(tab: ConfigTabKey, fieldKey: string, value: number) {
    setForm((previous) => {
      const normalizedConfig = normalizeExpertConfig(previous.config)
      return {
        ...previous,
        config: {
          ...normalizedConfig,
          [tab]: {
            ...normalizedConfig[tab],
            [fieldKey]: clampWeight(value),
          },
        },
      }
    })
  }

  function getTabTotal(config: ExpertConfig, tab: ConfigTabKey) {
    const fields = TAB_FIELDS[tab]
    return fields.reduce((sum, field) => sum + Number(config[tab][field.key] || 0), 0)
  }

  const normalizedConfig = useMemo(() => normalizeExpertConfig(form.config), [form.config])
  const invalidStrictTabs = STRICT_SUM_TABS.filter((key) => getTabTotal(normalizedConfig, key) !== 100)
  const canSubmit = invalidStrictTabs.length === 0
  const activeTabTotal = getTabTotal(normalizedConfig, activeConfigTab)
  const activeTabProgress = Math.max(0, Math.min(100, activeTabTotal))
  const activeTabStrict = STRICT_SUM_TABS.includes(activeConfigTab)
  const activeTabStatus = activeTabStrict
    ? activeTabTotal === 100
      ? 'ok'
      : activeTabTotal > 100
        ? 'over'
        : 'under'
    : 'normal'

  const taskStatusText = runTaskQuery.data
    ? `任务状态：${runTaskQuery.data.status}（成功 ${runTaskQuery.data.progress_summary?.processed_count || 0} / 失败 ${runTaskQuery.data.progress_summary?.failed_count || 0}）`
    : ''
  const visibleGenerationTask = generationTaskQuery.data || generationTask
  const generationSummary = visibleGenerationTask?.progress_summary || {}
  const generationTaskTotal = generationSummary.task_total_count || generationSummary.selected_count || 1
  const generationTaskCompleted =
    generationSummary.task_completed_count ||
    (generationSummary.processed_count || 0) + (generationSummary.skipped_count || 0) + (generationSummary.failed_count || 0)
  const generationProgressPercent = generationTaskTotal > 0 ? Math.round((generationTaskCompleted / generationTaskTotal) * 100) : 0
  const generationFailedDetails = generationSummary.failed_details || []

  return (
    <div className="page-section">
      <StatusCard
        title="专家管理"
        subtitle="配置拟人化专家策略，并手动触发当期大乐透五档方案生成。"
        actions={
          <div className="toolbar-inline">
            <button className="ghost-button" type="button" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
              {runMutation.isPending ? '启动中...' : '手动生成当期'}
            </button>
            <button className="primary-button" type="button" onClick={openCreate}>
              新建专家
            </button>
          </div>
        }
      >
        {message ? <div className={clsx('state-shell', messageType === 'error' && 'state-shell--error')}>{message}</div> : null}
        {taskStatusText ? <div className="state-shell">{taskStatusText}</div> : null}
        <div className="table-shell settings-model-table-shell">
          <table className="history-table settings-model-table">
            <thead>
              <tr>
                <th>专家</th>
                <th>底层模型</th>
                <th>彩种</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {(expertsQuery.data?.experts || []).map((expert) => (
                <tr key={expert.expert_code}>
                  <td>
                    <div className="settings-model-table__title">
                      <strong>{expert.display_name}</strong>
                      <span>{expert.expert_code}</span>
                    </div>
                  </td>
                  <td>{expert.model_code}</td>
                  <td>{expert.lottery_code.toUpperCase()}</td>
                  <td>
                    <span className={clsx('status-pill', expert.is_active ? 'is-active' : 'is-muted')}>{expert.is_active ? '启用中' : '已停用'}</span>
                  </td>
                  <td>{formatDateTimeBeijing(expert.updated_at)}</td>
                  <td>
                    <div className="settings-model-table__actions">
                      <button className="ghost-button ghost-button--compact" type="button" onClick={() => openEdit(expert)}>
                        编辑
                      </button>
                      <button
                        className="ghost-button ghost-button--compact"
                        type="button"
                        onClick={() => statusMutation.mutate({ expertCode: expert.expert_code, isActive: !expert.is_active })}
                      >
                        {expert.is_active ? '停用' : '启用'}
                      </button>
                      <button className="ghost-button ghost-button--compact" type="button" onClick={() => openGeneration(expert)}>
                        生成预测
                      </button>
                      <button className="ghost-button ghost-button--compact" type="button" onClick={() => deleteMutation.mutate(expert.expert_code)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!expertsQuery.data?.experts?.length ? (
                <tr>
                  <td colSpan={6}>
                    <div className="state-shell">暂无专家配置。</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </StatusCard>

      {generationExpert ? (
        <div className="modal-overlay" onClick={() => setGenerationExpert(null)}>
          <div className="modal-card modal-card--form generation-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form
              className="settings-form-grid generation-modal__form"
              onSubmit={(event) => {
                event.preventDefault()
                generationMutation.mutate()
              }}
            >
              <div className="modal-card__header generation-modal__header">
                <div className="generation-modal__header-main">
                  <p className="modal-card__eyebrow">专家预测生成</p>
                  <h3>{generationExpert.display_name}</h3>
                  <p className="generation-modal__lottery">当前生成彩种：{LOTTERY_LABELS[generationExpert.lottery_code] || generationExpert.lottery_code.toUpperCase()}</p>
                </div>
                <button className="ghost-button" type="button" onClick={() => setGenerationExpert(null)}>
                  关闭
                </button>
              </div>
              <section className="generation-modal__section generation-modal__section--config">
                <div className="generation-modal__section-title">
                  <strong>任务参数</strong>
                  <span>设置模式、覆盖策略、并发线程数与Prompt历史期数。</span>
                </div>
                <div className="generation-modal__grid">
                  <label className="field">
                    <span>彩种</span>
                    <input value={LOTTERY_LABELS[generationExpert.lottery_code] || generationExpert.lottery_code.toUpperCase()} readOnly disabled />
                  </label>
                  <label className="field">
                    <span>生成模式</span>
                    <select
                      value={generationForm.mode}
                      onChange={(event) => setGenerationForm((previous) => ({ ...previous, mode: event.target.value as ExpertGenerationMode }))}
                    >
                      <option value="current">当前期生成</option>
                      <option value="history">历史重算</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>结果策略</span>
                    <select
                      value={generationForm.overwrite ? 'overwrite' : 'skip'}
                      onChange={(event) => setGenerationForm((previous) => ({ ...previous, overwrite: event.target.value === 'overwrite' }))}
                    >
                      <option value="skip">已有结果时跳过</option>
                      <option value="overwrite">已有结果时覆盖</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>并发线程数</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      step={1}
                      value={generationForm.parallelism}
                      onChange={(event) => setGenerationForm((previous) => ({ ...previous, parallelism: event.target.value }))}
                      placeholder="默认 3"
                    />
                  </label>
                  <label className="field">
                    <span>Prompt历史期数</span>
                    <select
                      value={generationForm.promptHistoryPeriodCount}
                      onChange={(event) =>
                        setGenerationForm((previous) => ({
                          ...previous,
                          promptHistoryPeriodCount: event.target.value as ExpertGenerationPromptHistoryPeriodCount,
                        }))
                      }
                    >
                      {GENERATION_PROMPT_HISTORY_PERIOD_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {generationForm.mode === 'history' ? (
                  <div className="generation-modal__history-grid">
                    <label className="field">
                      <span>历史范围</span>
                      <select
                        value={generationForm.historyRangeMode === 'recent' ? generationForm.recentPeriodCount : 'custom'}
                        onChange={(event) => {
                          const nextValue = event.target.value
                          setGenerationForm((previous) => ({
                            ...previous,
                            historyRangeMode: nextValue === 'custom' ? 'custom' : 'recent',
                            recentPeriodCount: nextValue === 'custom' ? previous.recentPeriodCount : (nextValue as ExpertGenerationRecentPeriodCount),
                          }))
                        }}
                      >
                        <option value="custom">自定义</option>
                        {GENERATION_RECENT_PERIOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>开始期号</span>
                      <input
                        value={generationForm.startPeriod}
                        onChange={(event) => setGenerationForm((previous) => ({ ...previous, startPeriod: event.target.value }))}
                        required={generationForm.historyRangeMode === 'custom'}
                        disabled={generationForm.historyRangeMode === 'recent'}
                      />
                    </label>
                    <label className="field">
                      <span>结束期号</span>
                      <input
                        value={generationForm.endPeriod}
                        onChange={(event) => setGenerationForm((previous) => ({ ...previous, endPeriod: event.target.value }))}
                        required={generationForm.historyRangeMode === 'custom'}
                        disabled={generationForm.historyRangeMode === 'recent'}
                      />
                    </label>
                  </div>
                ) : null}
              </section>
              {visibleGenerationTask ? (
                <section className="generation-modal__section generation-modal__section--task" aria-live="polite">
                  <div className="generation-modal__section-title">
                    <strong>任务状态</strong>
                    <span>创建后会持续刷新执行进度与失败明细。</span>
                  </div>
                  <section className="generation-task-panel">
                    <div className="generation-task-panel__header">
                      <div>
                        <p className="modal-card__eyebrow">任务状态</p>
                        <h4>{generationSummary.mode === 'history' ? '专家历史生成任务' : '专家当前期生成任务'}</h4>
                      </div>
                      <span className={clsx('status-pill', visibleGenerationTask.status === 'succeeded' && 'is-active', visibleGenerationTask.status === 'failed' && 'is-deleted')}>
                        {getTaskStatusLabel(visibleGenerationTask.status)}
                      </span>
                    </div>
                    <div className="generation-task-panel__progress-meta">
                      <strong>{generationProgressPercent}%</strong>
                      <span>{generationTaskCompleted} / {generationTaskTotal} 个任务</span>
                    </div>
                    <div className="generation-task-panel__progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={generationTaskTotal} aria-valuenow={generationTaskCompleted}>
                      <span style={{ width: `${generationProgressPercent}%` }} />
                    </div>
                    <div className="generation-task-panel__stats">
                      <article>
                        <strong>{generationSummary.parallelism || '-'}</strong>
                        <span>并发线程数</span>
                      </article>
                      <article>
                        <strong>{generationSummary.processed_count || 0}</strong>
                        <span>成功</span>
                      </article>
                      <article>
                        <strong>{generationSummary.skipped_count || 0}</strong>
                        <span>跳过</span>
                      </article>
                      <article>
                        <strong>{generationSummary.failed_count || 0}</strong>
                        <span>失败</span>
                      </article>
                    </div>
                    {generationFailedDetails.length ? (
                      <div className="generation-task-panel__failures">
                        <div className="generation-task-panel__failures-title">
                          <strong>失败期号</strong>
                          <span>{generationFailedDetails.length} 个</span>
                        </div>
                        <div className="generation-task-panel__failure-list">
                          {generationFailedDetails.map((item) => (
                            <article key={`${item.target_period || 'current'}-${item.reason}`} className="generation-task-panel__failure-item">
                              <div>
                                <strong>{item.target_period || generationSummary.target_period || '-'}</strong>
                                <span>{generationExpert.expert_code}</span>
                              </div>
                              <p>{item.reason}</p>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {visibleGenerationTask.error_message ? <div className="state-shell state-shell--error">任务失败：{visibleGenerationTask.error_message}</div> : null}
                  </section>
                </section>
              ) : null}
              <div className="form-actions generation-modal__actions">
                <button className="primary-button" type="submit" disabled={generationMutation.isPending}>
                  {generationMutation.isPending ? '创建中...' : '创建任务'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div className="modal-overlay" onClick={() => setFormOpen(false)}>
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <h2>{editingCode ? '编辑专家' : '新建专家'}</h2>
            <form
              className="settings-form-grid model-config-modal__form"
              onSubmit={(event) => {
                event.preventDefault()
                saveMutation.mutate()
              }}
            >
              {editingCode ? (
                <label className="field">
                  <span>专家编码</span>
                  <input value={editingCode} readOnly disabled />
                </label>
              ) : null}
              <label className="field">
                <span>专家名称</span>
                <input value={form.display_name} onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))} required />
              </label>
              <label className="field">
                <span>底层模型</span>
                <select value={form.model_code} onChange={(event) => setForm((prev) => ({ ...prev, model_code: event.target.value }))} required>
                  <option value="">请选择模型</option>
                  {activeModels.map((model) => (
                    <option key={model.model_code} value={model.model_code}>
                      {model.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field field--full">
                <span>专家简介</span>
                <textarea rows={3} value={form.bio || ''} onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))} />
              </label>
              <section className="field field--full expert-config-panel">
                <span>专家配置（可视化权重）</span>
                <div className="expert-config-tabs" role="tablist" aria-label="专家配置分组">
                  {CONFIG_TABS.map((tab) => {
                    const tabTotal = getTabTotal(normalizedConfig, tab.key)
                    const strict = STRICT_SUM_TABS.includes(tab.key)
                    const status = strict ? (tabTotal === 100 ? 'ok' : tabTotal > 100 ? 'over' : 'under') : 'normal'
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        className={clsx('expert-config-tab', activeConfigTab === tab.key && 'is-active', status !== 'normal' && `is-${status}`)}
                        onClick={() => setActiveConfigTab(tab.key)}
                        role="tab"
                        aria-selected={activeConfigTab === tab.key}
                      >
                        <span>{tab.label}</span>
                        <small>{tabTotal}/100</small>
                      </button>
                    )
                  })}
                </div>
                <div className="expert-config-progress">
                  <div className={clsx('expert-config-progress__bar', `is-${activeTabStatus}`)} style={{ width: `${activeTabProgress}%` }} />
                </div>
                <div className={clsx('expert-config-progress__meta', activeTabStatus === 'ok' && 'is-ok', activeTabStatus === 'over' && 'is-over')}>
                  {activeTabStrict
                    ? `当前分组总和 ${activeTabTotal}/100${activeTabTotal === 100 ? '（已满足）' : activeTabTotal > 100 ? '（超出）' : '（不足）'}`
                    : `当前分组总和 ${activeTabTotal}/100（PL3 预留不强制总和）`}
                </div>
                <div className="expert-weight-sections">
                  {WEIGHT_SECTIONS[activeConfigTab].map((section, sectionIndex) => (
                    <details key={`${activeConfigTab}-${section.title}`} className="expert-weight-section" open={sectionIndex < 2}>
                      <summary>
                        <strong>{section.title}</strong>
                        <span>{section.fields.reduce((sum, field) => sum + Number(normalizedConfig[activeConfigTab][field.key] || 0), 0)}/100</span>
                      </summary>
                      <div className="expert-weight-grid">
                        {section.fields.map((field) => {
                          const value = Number(normalizedConfig[activeConfigTab][field.key] || 0)
                          return (
                            <article key={`${activeConfigTab}-${field.key}`} className="expert-weight-card">
                              <header className="expert-weight-card__header">
                                <div>
                                  <strong>{field.label}</strong>
                                  {field.hint ? <small>{field.hint}</small> : null}
                                </div>
                                <span>{value}%</span>
                              </header>
                              <div className="expert-weight-card__controls">
                                <input
                                  aria-label={`${field.label}权重滑杆`}
                                  type="range"
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={value}
                                  onChange={(event) => updateWeight(activeConfigTab, field.key, Number(event.target.value))}
                                />
                                <input
                                  aria-label={`${field.label}权重`}
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={value}
                                  onChange={(event) => updateWeight(activeConfigTab, field.key, Number(event.target.value))}
                                />
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </details>
                  ))}
                </div>
              </section>
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                />
                <span>启用专家</span>
              </label>
              <div className="form-actions">
                {!canSubmit ? (
                  <div className="state-shell state-shell--error">
                    {CONFIG_TABS.filter((item) => invalidStrictTabs.includes(item.key))
                      .map((item) => item.label)
                      .join('、')}
                    权重总和必须为100
                  </div>
                ) : null}
                <button className="ghost-button" type="button" onClick={() => setFormOpen(false)}>
                  取消
                </button>
                <button className="primary-button" type="submit" disabled={saveMutation.isPending || !canSubmit}>
                  {saveMutation.isPending ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
