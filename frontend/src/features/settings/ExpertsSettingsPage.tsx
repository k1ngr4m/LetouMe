import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { StatusCard } from '../../shared/components/StatusCard'
import type { ExpertConfig, SettingsExpert, SettingsExpertPayload } from '../../shared/types/api'

const DEFAULT_CONFIG: ExpertConfig = {
  dlt_front_weights: {
    any3: 20,
    dan2: 20,
    dan1: 20,
    prime_composite_ratio: 20,
    big_small_ratio: 20,
  },
  dlt_back_weights: {
    quad_zone: 34,
    any2: 33,
    big_small: 33,
  },
  strategy_preferences: {
    miss_rebound: 40,
    hot_cold_pattern: 20,
    trend_deviation: 20,
    stability: 20,
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
  { key: 'dlt_front_weights', label: 'DLT 前区权重' },
  { key: 'dlt_back_weights', label: 'DLT 后区权重' },
  { key: 'strategy_preferences', label: '策略倾向' },
]

const TAB_FIELDS: Record<ConfigTabKey, Array<{ key: string; label: string }>> = {
  dlt_front_weights: [
    { key: 'any3', label: '任意3连' },
    { key: 'dan2', label: '2胆' },
    { key: 'dan1', label: '1胆' },
    { key: 'prime_composite_ratio', label: '质合比' },
    { key: 'big_small_ratio', label: '大小比' },
  ],
  dlt_back_weights: [
    { key: 'quad_zone', label: '四分区' },
    { key: 'any2', label: '任意2码' },
    { key: 'big_small', label: '大小' },
  ],
  strategy_preferences: [
    { key: 'miss_rebound', label: '遗漏回补' },
    { key: 'hot_cold_pattern', label: '冷热形态' },
    { key: 'trend_deviation', label: '走势偏差' },
    { key: 'stability', label: '形态稳定度' },
  ],
  pl3_reserved_weights: [
    { key: 'hundreds', label: '百位' },
    { key: 'tens', label: '十位' },
    { key: 'units', label: '个位' },
  ],
}

const STRICT_SUM_TABS: ConfigTabKey[] = ['dlt_front_weights', 'dlt_back_weights', 'strategy_preferences']

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

export function ExpertsSettingsPage() {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [editingCode, setEditingCode] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<SettingsExpertPayload>(EMPTY_FORM)
  const [activeConfigTab, setActiveConfigTab] = useState<ConfigTabKey>('dlt_front_weights')
  const [taskId, setTaskId] = useState('')

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
  const invalidStrictTabs = useMemo(
    () => STRICT_SUM_TABS.filter((key) => getTabTotal(normalizedConfig, key) !== 100),
    [normalizedConfig],
  )
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
                  <td>{new Date(expert.updated_at).toLocaleString()}</td>
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
                <div className="expert-weight-grid">
                  {TAB_FIELDS[activeConfigTab].map((field) => {
                    const value = Number(normalizedConfig[activeConfigTab][field.key] || 0)
                    return (
                      <article key={`${activeConfigTab}-${field.key}`} className="expert-weight-card">
                        <header className="expert-weight-card__header">
                          <strong>{field.label}</strong>
                          <span>{value}%</span>
                        </header>
                        <div className="expert-weight-card__controls">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={value}
                            onChange={(event) => updateWeight(activeConfigTab, field.key, Number(event.target.value))}
                          />
                          <input
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
