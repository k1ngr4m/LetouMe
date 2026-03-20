import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { formatDateTimeLocal } from '../../shared/lib/format'
import type { LotteryCode, MyBetRecord, MyBetRecordPayload, MyBetRecordUpdatePayload } from '../../shared/types/api'
import { buildBallRange } from './lib/simulation'

type Pl3PlayType = 'direct' | 'group3' | 'group6'

type BetFormState = {
  targetPeriod: string
  multiplier: number
  isAppend: boolean
  playType: Pl3PlayType
  frontNumbers: string[]
  backNumbers: string[]
  directHundreds: string[]
  directTens: string[]
  directUnits: string[]
  groupNumbers: string[]
}

const pl3PlayTypeOptions: Array<{ value: Pl3PlayType; label: string }> = [
  { value: 'direct', label: '直选' },
  { value: 'group3', label: '组选3' },
  { value: 'group6', label: '组选6' },
]

function formatCurrency(value: number | undefined) {
  return `${Math.round(value || 0).toLocaleString('zh-CN')} 元`
}

function combination(total: number, choose: number) {
  if (choose < 0 || choose > total) return 0
  if (choose === 0 || choose === total) return 1
  const actualChoose = Math.min(choose, total - choose)
  let result = 1
  for (let index = 1; index <= actualChoose; index += 1) {
    result = (result * (total - actualChoose + index)) / index
  }
  return Math.round(result)
}

function createDefaultFormState(targetPeriod: string): BetFormState {
  return {
    targetPeriod,
    multiplier: 1,
    isAppend: false,
    playType: 'direct',
    frontNumbers: [],
    backNumbers: [],
    directHundreds: [],
    directTens: [],
    directUnits: [],
    groupNumbers: [],
  }
}

function buildFormFromRecord(record: MyBetRecord): BetFormState {
  return {
    targetPeriod: record.target_period,
    multiplier: record.multiplier || 1,
    isAppend: Boolean(record.is_append),
    playType: (record.play_type === 'group3' || record.play_type === 'group6' ? record.play_type : 'direct') as Pl3PlayType,
    frontNumbers: record.front_numbers || [],
    backNumbers: record.back_numbers || [],
    directHundreds: record.direct_hundreds || [],
    directTens: record.direct_tens || [],
    directUnits: record.direct_units || [],
    groupNumbers: record.group_numbers || [],
  }
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

function estimateFromForm(lotteryCode: LotteryCode, form: BetFormState) {
  const multiplier = Math.max(1, form.multiplier || 1)
  if (lotteryCode === 'dlt') {
    const betCount =
      form.frontNumbers.length >= 5 && form.backNumbers.length >= 2
        ? combination(form.frontNumbers.length, 5) * combination(form.backNumbers.length, 2)
        : 0
    const amount = betCount * 2 * multiplier + (form.isAppend ? betCount * multiplier : 0)
    return { betCount, amount }
  }
  if (form.playType === 'direct') {
    const betCount =
      form.directHundreds.length && form.directTens.length && form.directUnits.length
        ? form.directHundreds.length * form.directTens.length * form.directUnits.length
        : 0
    return { betCount, amount: betCount * 2 * multiplier }
  }
  const groupCount = form.groupNumbers.length
  const betCount = form.playType === 'group3' ? (groupCount >= 2 ? groupCount * (groupCount - 1) : 0) : combination(groupCount, 3)
  return { betCount, amount: betCount * 2 * multiplier }
}

function formatPlayType(lotteryCode: LotteryCode, playType: string) {
  if (lotteryCode === 'dlt') return '大乐透复式'
  if (playType === 'group3') return '组选3'
  if (playType === 'group6') return '组选6'
  return '直选'
}

function buildPayload(lotteryCode: LotteryCode, form: BetFormState): MyBetRecordPayload {
  const commonPayload = {
    lottery_code: lotteryCode,
    target_period: form.targetPeriod,
    multiplier: Math.max(1, form.multiplier || 1),
  } as MyBetRecordPayload
  if (lotteryCode === 'dlt') {
    return {
      ...commonPayload,
      play_type: 'dlt',
      front_numbers: form.frontNumbers,
      back_numbers: form.backNumbers,
      is_append: form.isAppend,
    }
  }
  if (form.playType === 'direct') {
    return {
      ...commonPayload,
      play_type: 'direct',
      direct_hundreds: form.directHundreds,
      direct_tens: form.directTens,
      direct_units: form.directUnits,
      is_append: false,
    }
  }
  return {
    ...commonPayload,
    play_type: form.playType,
    group_numbers: form.groupNumbers,
    is_append: false,
  }
}

function renderRecordNumbers(record: MyBetRecord) {
  if (record.lottery_code === 'dlt') {
    return (
      <div className="number-row number-row--tight">
        {(record.front_numbers || []).map((ball) => (
          <NumberBall key={`${record.id}-front-${ball}`} value={ball} color="red" size="sm" />
        ))}
        <span className="number-row__divider" />
        {(record.back_numbers || []).map((ball) => (
          <NumberBall key={`${record.id}-back-${ball}`} value={ball} color="blue" size="sm" />
        ))}
      </div>
    )
  }
  if (record.play_type === 'direct') {
    return (
      <div className="number-row number-row--tight">
        {(record.direct_hundreds || []).map((ball) => (
          <NumberBall key={`${record.id}-h-${ball}`} value={ball} color="red" size="sm" />
        ))}
        <span className="number-row__divider" />
        {(record.direct_tens || []).map((ball) => (
          <NumberBall key={`${record.id}-t-${ball}`} value={ball} color="red" size="sm" />
        ))}
        <span className="number-row__divider" />
        {(record.direct_units || []).map((ball) => (
          <NumberBall key={`${record.id}-u-${ball}`} value={ball} color="red" size="sm" />
        ))}
      </div>
    )
  }
  return (
    <div className="number-row number-row--tight">
      {(record.group_numbers || []).map((ball) => (
        <NumberBall key={`${record.id}-g-${ball}`} value={ball} color="red" size="sm" />
      ))}
    </div>
  )
}

export function MyBetsPanel({ lotteryCode, targetPeriod }: { lotteryCode: LotteryCode; targetPeriod: string }) {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<MyBetRecord | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<BetFormState>(() => createDefaultFormState(targetPeriod))
  const frontOptions = useMemo(() => buildBallRange(35), [])
  const backOptions = useMemo(() => buildBallRange(12), [])
  const digitOptions = useMemo(() => buildBallRange(10, 0), [])

  const betsQuery = useQuery({
    queryKey: ['my-bets', lotteryCode],
    queryFn: async () => apiClient.getMyBets(lotteryCode),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload(lotteryCode, form)
      if (editingRecord) {
        const updatePayload: MyBetRecordUpdatePayload = { ...payload, record_id: editingRecord.id }
        return apiClient.updateMyBet(updatePayload)
      }
      return apiClient.createMyBet(payload)
    },
    onSuccess: async () => {
      setMessage(editingRecord ? '投注已更新。' : '投注已添加。')
      setFormOpen(false)
      setEditingRecord(null)
      await queryClient.invalidateQueries({ queryKey: ['my-bets', lotteryCode] })
    },
    onError: (error) => {
      const detail = error instanceof Error ? error.message : '保存失败'
      setMessage(detail)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (recordId: number) => apiClient.deleteMyBet(recordId, lotteryCode),
    onSuccess: async () => {
      setMessage('投注记录已删除。')
      await queryClient.invalidateQueries({ queryKey: ['my-bets', lotteryCode] })
    },
    onError: (error) => {
      const detail = error instanceof Error ? error.message : '删除失败'
      setMessage(detail)
    },
  })

  useEffect(() => {
    if (!formOpen || editingRecord) return
    setForm((previous) => ({
      ...previous,
      targetPeriod: targetPeriod || previous.targetPeriod,
    }))
  }, [editingRecord, formOpen, targetPeriod])

  const estimate = useMemo(() => estimateFromForm(lotteryCode, form), [form, lotteryCode])
  const canSubmit = Boolean(estimate.betCount) && Boolean(form.targetPeriod.trim())
  const records = betsQuery.data?.records || []
  const summary = betsQuery.data?.summary

  function openCreateModal() {
    setMessage(null)
    setEditingRecord(null)
    setForm(createDefaultFormState(targetPeriod))
    setFormOpen(true)
  }

  function openEditModal(record: MyBetRecord) {
    setMessage(null)
    setEditingRecord(record)
    setForm(buildFormFromRecord(record))
    setFormOpen(true)
  }

  function closeModal() {
    if (saveMutation.isPending) return
    setFormOpen(false)
    setEditingRecord(null)
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      setMessage('请先补全号码与期号。')
      return
    }
    saveMutation.mutate()
  }

  return (
    <div className="page-section my-bets-page">
      <StatusCard
        title="我的投注"
        subtitle="按当前账号和彩种隔离，支持录入、编辑、删除历史投注并自动结算盈亏。"
        actions={
          <button className="primary-button" type="button" onClick={openCreateModal}>
            添加投注
          </button>
        }
      >
        <div className="my-bets-summary-grid">
          <article className="my-bets-summary-card">
            <span>投注笔数</span>
            <strong>{summary?.total_count || 0}</strong>
            <small>{`已结算 ${summary?.settled_count || 0} · 待开奖 ${summary?.pending_count || 0}`}</small>
          </article>
          <article className="my-bets-summary-card">
            <span>总投入</span>
            <strong>{formatCurrency(summary?.total_amount || 0)}</strong>
          </article>
          <article className="my-bets-summary-card">
            <span>总奖金</span>
            <strong>{formatCurrency(summary?.total_prize_amount || 0)}</strong>
          </article>
          <article className="my-bets-summary-card">
            <span>累计盈亏</span>
            <strong className={clsx((summary?.total_net_profit || 0) >= 0 ? 'is-profit' : 'is-loss')}>{formatCurrency(summary?.total_net_profit || 0)}</strong>
          </article>
        </div>

        {message ? <div className="simulation-inline-message">{message}</div> : null}

        {betsQuery.isLoading ? (
          <div className="state-shell">正在加载投注记录...</div>
        ) : betsQuery.error instanceof Error ? (
          <div className="state-shell state-shell--error">读取失败：{betsQuery.error.message}</div>
        ) : records.length ? (
          <div className="my-bets-list">
            {records.map((record) => (
              <article key={record.id} className="my-bets-card">
                <div className="my-bets-card__header">
                  <div>
                    <p className="hero-panel__eyebrow">{`第 ${record.target_period} 期`}</p>
                    <div className="my-bets-card__title-row">
                      <strong>{formatPlayType(lotteryCode, record.play_type)}</strong>
                      {record.settlement_status === 'pending' ? <span className="my-bets-status is-pending">待开奖</span> : <span className="my-bets-status is-settled">已结算</span>}
                    </div>
                    <span className="my-bets-card__meta">{`投注时间：${formatDateTimeLocal(record.created_at)}`}</span>
                  </div>
                  <div className="my-bets-card__actions">
                    <button className="ghost-button ghost-button--compact" type="button" onClick={() => openEditModal(record)}>
                      编辑
                    </button>
                    <button className="ghost-button ghost-button--compact" type="button" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(record.id)}>
                      删除
                    </button>
                  </div>
                </div>

                <div className="my-bets-card__numbers">{renderRecordNumbers(record)}</div>

                <div className="my-bets-card__metrics">
                  <span>{`${record.bet_count} 注 × ${record.multiplier} 倍${record.is_append ? '（追加）' : ''}`}</span>
                  <span>{`投入 ${formatCurrency(record.amount)}`}</span>
                  <span>{`奖金 ${formatCurrency(record.prize_amount)}`}</span>
                  <span className={clsx(record.net_profit >= 0 ? 'is-profit' : 'is-loss')}>{`盈亏 ${formatCurrency(record.net_profit)}`}</span>
                  <span>{record.prize_level ? `${record.prize_level} · 中 ${record.winning_bet_count} 注` : '未中奖'}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="state-shell">当前彩种还没有投注记录，点击“添加投注”开始录入。</div>
        )}
      </StatusCard>

      {formOpen ? (
        <div className="modal-shell" role="presentation" onClick={closeModal}>
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form className="settings-model-form" onSubmit={submitForm}>
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">My Bets</p>
                  <h2>{editingRecord ? '编辑投注' : '添加投注'}</h2>
                </div>
                <button className="ghost-button ghost-button--compact" type="button" onClick={closeModal}>
                  关闭
                </button>
              </div>

              <div className="settings-form-grid">
                <label>
                  目标期号
                  <input
                    value={form.targetPeriod}
                    onChange={(event) => setForm((previous) => ({ ...previous, targetPeriod: event.target.value.replace(/[^\d]/g, '') }))}
                    placeholder="如 2026050"
                    required
                  />
                </label>
                <label>
                  投注倍数
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={form.multiplier}
                    onChange={(event) => setForm((previous) => ({ ...previous, multiplier: Math.min(99, Math.max(1, Number(event.target.value) || 1)) }))}
                  />
                </label>
              </div>

              {lotteryCode === 'dlt' ? (
                <>
                  <section className="simulation-section">
                    <div className="simulation-section__header">
                      <h3>前区号码</h3>
                      <span>至少 5 个</span>
                    </div>
                    <div className="simulation-ball-grid">
                      {frontOptions.map((ball) => (
                        <button
                          key={`my-bet-front-${ball}`}
                          type="button"
                          className={clsx('simulation-ball', 'is-front', form.frontNumbers.includes(ball) && 'is-selected')}
                          onClick={() => setForm((previous) => ({ ...previous, frontNumbers: toggleValue(previous.frontNumbers, ball).sort() }))}
                        >
                          {ball}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="simulation-section">
                    <div className="simulation-section__header">
                      <h3>后区号码</h3>
                      <span>至少 2 个</span>
                    </div>
                    <div className="simulation-ball-grid">
                      {backOptions.map((ball) => (
                        <button
                          key={`my-bet-back-${ball}`}
                          type="button"
                          className={clsx('simulation-ball', 'is-back', form.backNumbers.includes(ball) && 'is-selected')}
                          onClick={() => setForm((previous) => ({ ...previous, backNumbers: toggleValue(previous.backNumbers, ball).sort() }))}
                        >
                          {ball}
                        </button>
                      ))}
                    </div>
                  </section>
                  <label className="toggle-chip">
                    <input type="checkbox" checked={form.isAppend} onChange={(event) => setForm((previous) => ({ ...previous, isAppend: event.target.checked }))} />
                    <span>追加投注（每注多 1 元）</span>
                  </label>
                </>
              ) : (
                <>
                  <section className="simulation-section">
                    <div className="simulation-section__header">
                      <h3>玩法选择</h3>
                    </div>
                    <div className="tab-strip" role="tablist" aria-label="投注玩法">
                      {pl3PlayTypeOptions.map((option) => (
                        <button
                          key={option.value}
                          className={clsx('tab-strip__item', form.playType === option.value && 'is-active')}
                          onClick={() => setForm((previous) => ({ ...previous, playType: option.value }))}
                          type="button"
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </section>
                  {form.playType === 'direct' ? (
                    <>
                      <section className="simulation-section">
                        <div className="simulation-section__header">
                          <h3>百位</h3>
                          <span>至少 1 个</span>
                        </div>
                        <div className="simulation-ball-grid">
                          {digitOptions.map((ball) => (
                            <button
                              key={`my-bet-h-${ball}`}
                              type="button"
                              className={clsx('simulation-ball', 'is-front', form.directHundreds.includes(ball) && 'is-selected')}
                              onClick={() => setForm((previous) => ({ ...previous, directHundreds: toggleValue(previous.directHundreds, ball).sort() }))}
                            >
                              {ball}
                            </button>
                          ))}
                        </div>
                      </section>
                      <section className="simulation-section">
                        <div className="simulation-section__header">
                          <h3>十位</h3>
                          <span>至少 1 个</span>
                        </div>
                        <div className="simulation-ball-grid">
                          {digitOptions.map((ball) => (
                            <button
                              key={`my-bet-t-${ball}`}
                              type="button"
                              className={clsx('simulation-ball', 'is-front', form.directTens.includes(ball) && 'is-selected')}
                              onClick={() => setForm((previous) => ({ ...previous, directTens: toggleValue(previous.directTens, ball).sort() }))}
                            >
                              {ball}
                            </button>
                          ))}
                        </div>
                      </section>
                      <section className="simulation-section">
                        <div className="simulation-section__header">
                          <h3>个位</h3>
                          <span>至少 1 个</span>
                        </div>
                        <div className="simulation-ball-grid">
                          {digitOptions.map((ball) => (
                            <button
                              key={`my-bet-u-${ball}`}
                              type="button"
                              className={clsx('simulation-ball', 'is-front', form.directUnits.includes(ball) && 'is-selected')}
                              onClick={() => setForm((previous) => ({ ...previous, directUnits: toggleValue(previous.directUnits, ball).sort() }))}
                            >
                              {ball}
                            </button>
                          ))}
                        </div>
                      </section>
                    </>
                  ) : (
                    <section className="simulation-section">
                      <div className="simulation-section__header">
                        <h3>{form.playType === 'group3' ? '组选3号码' : '组选6号码'}</h3>
                        <span>{form.playType === 'group3' ? '至少 2 个' : '至少 3 个'}</span>
                      </div>
                      <div className="simulation-ball-grid">
                        {digitOptions.map((ball) => (
                          <button
                            key={`my-bet-group-${ball}`}
                            type="button"
                            className={clsx('simulation-ball', 'is-front', form.groupNumbers.includes(ball) && 'is-selected')}
                            onClick={() => setForm((previous) => ({ ...previous, groupNumbers: toggleValue(previous.groupNumbers, ball).sort() }))}
                          >
                            {ball}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              <div className="simulation-summary-bar my-bets-form-summary">
                <div className="simulation-summary-bar__meta">
                  <strong>{`预计 ${estimate.betCount} 注，共 ${estimate.amount} 元`}</strong>
                  <span>{canSubmit ? '号码已满足最低投注要求。' : '请完成选号后再保存。'}</span>
                </div>
                <div className="simulation-summary-bar__actions">
                  <button className="ghost-button" type="button" onClick={closeModal}>
                    取消
                  </button>
                  <button className="primary-button" type="submit" disabled={!canSubmit || saveMutation.isPending}>
                    {saveMutation.isPending ? '保存中...' : editingRecord ? '保存修改' : '添加投注'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
