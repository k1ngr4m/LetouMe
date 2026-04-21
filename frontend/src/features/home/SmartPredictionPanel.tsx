import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { StatusCard } from '../../shared/components/StatusCard'
import { useAuth } from '../../shared/auth/AuthProvider'
import type { LotteryCode, SmartPredictionRun, SmartPredictionStrategyCode } from '../../shared/types/api'

const STRATEGY_OPTIONS: Array<{ code: SmartPredictionStrategyCode; label: string }> = [
  { code: 'hot', label: '增强型热号追随者' },
  { code: 'cold', label: '增强型冷号逆向者' },
  { code: 'balanced', label: '增强型平衡策略师' },
  { code: 'cycle', label: '增强型周期理论家' },
  { code: 'composite', label: '增强型综合决策者' },
]

const HISTORY_PERIOD_OPTIONS: Array<30 | 50 | 100> = [30, 50, 100]

function isDirectDltGroup(group: { play_type?: string | null; red_balls?: string[]; blue_balls?: string[] }) {
  const playType = String(group.play_type || 'direct').trim().toLowerCase()
  if (playType !== 'direct') return false
  return (group.red_balls || []).length === 5 && (group.blue_balls || []).length === 2
}

function isTaskRunning(run?: SmartPredictionRun | null) {
  if (!run) return false
  return ['queued', 'running'].includes(run.stage1_status) || ['queued', 'running'].includes(run.stage2_status)
}

function getStrategyLabel(strategyCode: SmartPredictionStrategyCode) {
  return STRATEGY_OPTIONS.find((item) => item.code === strategyCode)?.label || strategyCode
}

type SmartPredictionPanelProps = {
  lotteryCode: LotteryCode
}

export function SmartPredictionPanel({ lotteryCode }: SmartPredictionPanelProps) {
  const { user } = useAuth()
  if (user?.role !== 'super_admin') {
    return (
      <section className="smart-prediction-unavailable" aria-label="智能预测">
        <StatusCard title="智能预测" subtitle="该功能仅超级管理员可用。">
          <div className="state-shell">当前账号暂无权限访问智能预测模块。</div>
        </StatusCard>
      </section>
    )
  }

  if (lotteryCode !== 'dlt') {
    return (
      <section className="smart-prediction-unavailable" aria-label="智能预测">
        <StatusCard title="智能预测" subtitle="该功能目前仅支持大乐透（5+2）。">
          <div className="state-shell">当前彩种暂未开放智能预测，请切换到大乐透后使用。</div>
        </StatusCard>
      </section>
    )
  }

  return <SmartPredictionDltPanel />
}

function SmartPredictionDltPanel() {
  const queryClient = useQueryClient()
  const [selectedDataModelCodes, setSelectedDataModelCodes] = useState<string[]>([])
  const [stage1ModelCode, setStage1ModelCode] = useState('')
  const [stage2ModelCode, setStage2ModelCode] = useState('')
  const [historyPeriodCount, setHistoryPeriodCount] = useState<30 | 50 | 100>(50)
  const [strategyCodes, setStrategyCodes] = useState<SmartPredictionStrategyCode[]>(() => STRATEGY_OPTIONS.map((item) => item.code))
  const [includeTrend, setIncludeTrend] = useState(true)
  const [includeScores, setIncludeScores] = useState(true)
  const [autoStage2, setAutoStage2] = useState(true)
  const [retryOnce, setRetryOnce] = useState(true)
  const [strictValidation, setStrictValidation] = useState(true)
  const [selectedRunId, setSelectedRunId] = useState<string>('')

  const inferenceModelsQuery = useQuery({
    queryKey: ['smart-prediction', 'inference-models'],
    queryFn: async () => {
      const payload = await apiClient.getSettingsModels(false, 'dlt')
      return (payload.models || [])
        .filter((item) => item.is_active && !item.is_deleted && (item.lottery_codes || []).includes('dlt'))
        .map((item) => ({ code: item.model_code, name: item.display_name || item.model_code }))
    },
  })

  const currentPredictionsQuery = useQuery({
    queryKey: ['smart-prediction', 'current-predictions'],
    queryFn: async () => apiClient.getCurrentPredictions('dlt'),
  })

  const dataModelOptions = useMemo(
    () =>
      (currentPredictionsQuery.data?.models || [])
        .filter((model) => (model.predictions || []).some((group) => isDirectDltGroup(group)))
        .map((model) => ({ code: model.model_id, name: model.model_name || model.model_id })),
    [currentPredictionsQuery.data?.models],
  )

  const historyQuery = useQuery({
    queryKey: ['smart-prediction', 'history'],
    queryFn: async () => apiClient.listSmartPredictionRuns({ limit: 20, offset: 0 }),
  })

  const activeRunId = selectedRunId || historyQuery.data?.runs?.[0]?.run_id || ''

  const detailQuery = useQuery({
    queryKey: ['smart-prediction', 'detail', activeRunId],
    queryFn: async () => apiClient.getSmartPredictionRunDetail(activeRunId),
    enabled: Boolean(activeRunId),
    refetchInterval: (query) => (isTaskRunning(query.state.data as SmartPredictionRun | undefined) ? 2500 : false),
  })

  const activeRun = detailQuery.data || historyQuery.data?.runs?.find((item) => item.run_id === activeRunId) || null

  const startRunMutation = useMutation({
    mutationFn: async () =>
      apiClient.startSmartPredictionRun({
        lottery_code: 'dlt',
        data_model_codes: selectedDataModelCodes,
        stage1_model_code: stage1ModelCode,
        stage2_model_code: stage2ModelCode,
        history_period_count: historyPeriodCount,
        strategy_codes: strategyCodes,
        include_trend: includeTrend,
        include_scores: includeScores,
        auto_stage2: autoStage2,
        retry_once: retryOnce,
        strict_validation: strictValidation,
      }),
    onSuccess: (run) => {
      setSelectedRunId(run.run_id)
      void queryClient.invalidateQueries({ queryKey: ['smart-prediction', 'history'] })
      void queryClient.invalidateQueries({ queryKey: ['smart-prediction', 'detail', run.run_id] })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => apiClient.cancelSmartPredictionRun(activeRunId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['smart-prediction', 'history'] })
      void queryClient.invalidateQueries({ queryKey: ['smart-prediction', 'detail', activeRunId] })
    },
  })

  const startStage2Mutation = useMutation({
    mutationFn: async () => apiClient.startSmartPredictionStage2(activeRunId, stage2ModelCode || undefined, true),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['smart-prediction', 'history'] })
      void queryClient.invalidateQueries({ queryKey: ['smart-prediction', 'detail', activeRunId] })
    },
  })

  const canStart = Boolean(selectedDataModelCodes.length && stage1ModelCode && stage2ModelCode && strategyCodes.length)
  const isRunning = isTaskRunning(activeRun)
  const canManuallyStartStage2 = Boolean(
    activeRun && activeRun.stage1_status === 'succeeded' && !['queued', 'running'].includes(activeRun.stage2_status),
  )

  function toggleDataModel(modelCode: string) {
    setSelectedDataModelCodes((previous) =>
      previous.includes(modelCode) ? previous.filter((item) => item !== modelCode) : [...previous, modelCode],
    )
  }

  function toggleStrategy(strategyCode: SmartPredictionStrategyCode) {
    setStrategyCodes((previous) => {
      const exists = previous.includes(strategyCode)
      if (exists) return previous.filter((item) => item !== strategyCode)
      return [...previous, strategyCode]
    })
  }

  function applyRunSettings(run: SmartPredictionRun) {
    setSelectedDataModelCodes([...(run.data_model_codes || [])])
    setStage1ModelCode(run.stage1_model_code || '')
    setStage2ModelCode(run.stage2_model_code || '')
    setHistoryPeriodCount(run.history_period_count || 50)
    setStrategyCodes([...(run.strategy_codes || [])])
    setIncludeTrend(run.options?.include_trend ?? true)
    setIncludeScores(run.options?.include_scores ?? true)
    setAutoStage2(run.options?.auto_stage2 ?? true)
    setRetryOnce(run.options?.retry_once ?? true)
    setStrictValidation(run.options?.strict_validation ?? true)
  }

  return (
    <section className="smart-prediction-layout" aria-label="智能预测">
      <div className="smart-prediction-main">
        <StatusCard title="智能预测" subtitle="仅支持大乐透。基于当前期模型数据与历史趋势，执行双阶段智能推演。">
          <div className="smart-prediction-form">
            <div className="smart-prediction-form__group">
              <h3>第一步：选择数据模型</h3>
              <p>仅显示当前期已有普通5+2预测的模型。</p>
              <div className="smart-prediction-chip-grid">
                {dataModelOptions.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className={clsx('filter-chip', selectedDataModelCodes.includes(item.code) && 'is-active')}
                    onClick={() => toggleDataModel(item.code)}
                  >
                    {item.name}
                  </button>
                ))}
                {!dataModelOptions.length ? <span className="settings-inline-hint">暂无可用数据模型。</span> : null}
              </div>
            </div>

            <div className="smart-prediction-form__group">
              <h3>第二步：配置推理模型与策略</h3>
              <div className="smart-prediction-field-grid">
                <label>
                  <span>阶段1推理模型</span>
                  <select value={stage1ModelCode} onChange={(event) => setStage1ModelCode(event.target.value)}>
                    <option value="">请选择</option>
                    {(inferenceModelsQuery.data || []).map((item) => (
                      <option key={`stage1-${item.code}`} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>阶段2推理模型</span>
                  <select value={stage2ModelCode} onChange={(event) => setStage2ModelCode(event.target.value)}>
                    <option value="">请选择</option>
                    {(inferenceModelsQuery.data || []).map((item) => (
                      <option key={`stage2-${item.code}`} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>历史窗口</span>
                  <select value={historyPeriodCount} onChange={(event) => setHistoryPeriodCount(Number(event.target.value) as 30 | 50 | 100)}>
                    {HISTORY_PERIOD_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        最近 {value} 期
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="smart-prediction-chip-grid">
                {STRATEGY_OPTIONS.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className={clsx('filter-chip', strategyCodes.includes(item.code) && 'is-active')}
                    onClick={() => toggleStrategy(item.code)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="smart-prediction-toggle-grid">
                <label>
                  <input type="checkbox" checked={includeTrend} onChange={(event) => setIncludeTrend(event.target.checked)} />
                  <span>包含历史命中趋势</span>
                </label>
                <label>
                  <input type="checkbox" checked={includeScores} onChange={(event) => setIncludeScores(event.target.checked)} />
                  <span>包含模型评分统计</span>
                </label>
                <label>
                  <input type="checkbox" checked={autoStage2} onChange={(event) => setAutoStage2(event.target.checked)} />
                  <span>阶段1成功后自动执行阶段2</span>
                </label>
                <label>
                  <input type="checkbox" checked={retryOnce} onChange={(event) => setRetryOnce(event.target.checked)} />
                  <span>失败自动重试1次</span>
                </label>
                <label>
                  <input type="checkbox" checked={strictValidation} onChange={(event) => setStrictValidation(event.target.checked)} />
                  <span>严格结构校验</span>
                </label>
              </div>
            </div>

            <div className="smart-prediction-actions">
              <button type="button" className="ghost-button" disabled={!canStart || startRunMutation.isPending} onClick={() => startRunMutation.mutate()}>
                {startRunMutation.isPending ? '启动中...' : '启动智能预测'}
              </button>
              <button type="button" className="ghost-button" disabled={!activeRunId || !canManuallyStartStage2 || startStage2Mutation.isPending} onClick={() => startStage2Mutation.mutate()}>
                {startStage2Mutation.isPending ? '启动中...' : '仅重跑第二阶段'}
              </button>
              <button type="button" className="ghost-button" disabled={!activeRunId || !isRunning || cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                {cancelMutation.isPending ? '取消中...' : '取消任务'}
              </button>
            </div>

            {startRunMutation.error instanceof Error ? <div className="state-shell">{startRunMutation.error.message}</div> : null}
            {startStage2Mutation.error instanceof Error ? <div className="state-shell">{startStage2Mutation.error.message}</div> : null}
            {cancelMutation.error instanceof Error ? <div className="state-shell">{cancelMutation.error.message}</div> : null}
          </div>
        </StatusCard>

        <StatusCard title="阶段结果" subtitle={activeRun ? `目标期 ${activeRun.target_period} · 当前状态 ${activeRun.status}` : '请选择一条运行记录查看详情。'}>
          {!activeRun ? <div className="state-shell">暂无智能预测运行记录。</div> : null}
          {activeRun?.warnings?.length ? (
            <div className="smart-prediction-warning-list">
              {activeRun.warnings.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          ) : null}
          {activeRun?.stage1_result?.rows?.length ? (
            <div className="smart-prediction-table-wrap">
              <table className="home-model-list-table smart-prediction-table">
                <thead>
                  <tr>
                    <th>策略</th>
                    <th>模型</th>
                    <th>本期预期号码</th>
                    <th>主预测值</th>
                    <th>期望值</th>
                    <th>高概率范围</th>
                    <th>区间概率</th>
                    <th>0</th>
                    <th>1</th>
                    <th>2</th>
                    <th>3</th>
                    <th>4</th>
                    <th>5</th>
                    <th>6</th>
                    <th>7</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRun.stage1_result.rows.map((row) => (
                    <tr key={`${row.model_id}-${row.strategy_code}`}>
                      <td>{getStrategyLabel(row.strategy_code)}</td>
                      <td>{row.model_name}</td>
                      <td>{row.expected_numbers}</td>
                      <td>{row.primary_hit}</td>
                      <td>{row.expected_value.toFixed(2)}</td>
                      <td>{row.high_prob_range}</td>
                      <td>{(row.interval_probability * 100).toFixed(1)}%</td>
                      <td>{(row.p0 * 100).toFixed(1)}%</td>
                      <td>{(row.p1 * 100).toFixed(1)}%</td>
                      <td>{(row.p2 * 100).toFixed(1)}%</td>
                      <td>{(row.p3 * 100).toFixed(1)}%</td>
                      <td>{(row.p4 * 100).toFixed(1)}%</td>
                      <td>{(row.p5 * 100).toFixed(1)}%</td>
                      <td>{(row.p6 * 100).toFixed(1)}%</td>
                      <td>{(row.p7 * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {activeRun?.stage2_result?.tickets?.length ? (
            <div className="smart-prediction-ticket-grid">
              {activeRun.stage2_result.tickets.map((ticket, index) => (
                <article key={`ticket-${index + 1}`}>
                  <h4>推荐 #{index + 1}</h4>
                  <p>{ticket.red_balls.join(' ')}</p>
                  <p>+ {ticket.blue_balls.join(' ')}</p>
                </article>
              ))}
            </div>
          ) : null}
          {activeRun?.stage2_result?.top15_numbers?.length ? (
            <div className="smart-prediction-top15">
              <h4>概率最高15个号码</h4>
              <div className="smart-prediction-top15__grid">
                {activeRun.stage2_result.top15_numbers.map((item, index) => (
                  <article key={`${item.zone}-${item.number}-${index}`}>
                    <strong>{item.zone === 'front' ? '前区' : '后区'}-{item.number}</strong>
                    <span>{(item.probability * 100).toFixed(2)}%</span>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          {activeRun?.stage2_result?.dantuo ? (
            <div className="smart-prediction-dantuo">
              <h4>胆拖</h4>
              <p>前区胆：{activeRun.stage2_result.dantuo.front_dan.join(' ') || '—'}</p>
              <p>前区拖：{activeRun.stage2_result.dantuo.front_tuo.join(' ') || '—'}</p>
              <p>后区胆：{activeRun.stage2_result.dantuo.back_dan.join(' ') || '—'}</p>
              <p>后区拖：{activeRun.stage2_result.dantuo.back_tuo.join(' ') || '—'}</p>
            </div>
          ) : null}
          {activeRun?.error_message ? <div className="state-shell">{activeRun.error_message}</div> : null}
        </StatusCard>

        <StatusCard title="历史记录" subtitle="保留完整快照，可选择历史运行并一键复用参数。">
          {!historyQuery.data?.runs?.length ? <div className="state-shell">暂无历史记录。</div> : null}
          <div className="smart-prediction-history-list">
            {(historyQuery.data?.runs || []).map((item) => (
              <article key={item.run_id} className={clsx(activeRunId === item.run_id && 'is-active')}>
                <button type="button" className="smart-prediction-history-list__select" onClick={() => setSelectedRunId(item.run_id)}>
                  <strong>{item.target_period}</strong>
                  <span>{item.status}</span>
                </button>
                <button type="button" className="ghost-button" onClick={() => applyRunSettings(item)}>
                  复用参数
                </button>
              </article>
            ))}
          </div>
        </StatusCard>
      </div>

      <aside className="smart-prediction-flow" aria-label="智能预测流程">
        <h3>流程</h3>
        <ol>
          <li className={clsx(selectedDataModelCodes.length > 0 && 'is-done')}>选择数据模型与策略</li>
          <li className={clsx(stage1ModelCode && stage2ModelCode && 'is-done')}>配置阶段1/阶段2推理模型</li>
          <li className={clsx(activeRun?.stage1_status === 'succeeded' && 'is-done', ['queued', 'running'].includes(activeRun?.stage1_status || '') && 'is-running')}>
            阶段1：策略评估表
          </li>
          <li className={clsx(activeRun?.stage2_status === 'succeeded' && 'is-done', ['queued', 'running'].includes(activeRun?.stage2_status || '') && 'is-running')}>
            阶段2：5注+胆拖
          </li>
          <li className={clsx(activeRun?.status === 'succeeded' && 'is-done')}>完成并保存历史</li>
        </ol>
      </aside>
    </section>
  )
}
