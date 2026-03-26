import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { formatDateTimeLocal } from '../../shared/lib/format'
import type { LotteryCode, MyBetLine, MyBetLinePayload, MyBetOCRDraftResponse, MyBetRecord, MyBetRecordPayload, MyBetRecordUpdatePayload } from '../../shared/types/api'

type Pl3PlayType = 'direct' | 'group3' | 'group6' | 'direct_sum' | 'group_sum'
type LinePlayType = 'dlt' | Pl3PlayType

type EditableLine = {
  playType: LinePlayType
  frontNumbersInput: string
  backNumbersInput: string
  directTenThousandsInput: string
  directThousandsInput: string
  directHundredsInput: string
  directTensInput: string
  directUnitsInput: string
  groupNumbersInput: string
  sumValuesInput: string
  multiplier: number
  isAppend: boolean
}

type BetFormState = {
  targetPeriod: string
  sourceType: 'manual' | 'ocr'
  ticketImageUrl: string
  ticketImageFile: File | null
  ticketImagePreviewUrl: string
  ocrText: string
  ocrProvider: string | null
  ocrRecognizedAt: string | null
  ticketPurchasedAt: string
  lines: EditableLine[]
}

type LineQuote = {
  betCount: number
  amount: number
  valid: boolean
}

const pl3PlayTypeOptions: Array<{ value: Pl3PlayType; label: string }> = [
  { value: 'direct', label: '直选' },
  { value: 'group3', label: '组选3' },
  { value: 'group6', label: '组选6' },
  { value: 'direct_sum', label: '直选和值' },
  { value: 'group_sum', label: '组选和值' },
]
const dltFrontPool = Array.from({ length: 35 }, (_, index) => String(index + 1).padStart(2, '0'))
const dltBackPool = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const pl3Pool = Array.from({ length: 10 }, (_, index) => String(index).padStart(2, '0'))
const pl3SumPool = Array.from({ length: 28 }, (_, index) => String(index).padStart(2, '0'))
const PL3_DIRECT_SUM_BET_COUNTS: Record<number, number> = {
  0: 1,
  1: 3,
  2: 6,
  3: 10,
  4: 15,
  5: 21,
  6: 28,
  7: 36,
  8: 45,
  9: 55,
  10: 63,
  11: 69,
  12: 73,
  13: 75,
  14: 75,
  15: 73,
  16: 69,
  17: 63,
  18: 55,
  19: 45,
  20: 36,
  21: 28,
  22: 21,
  23: 15,
  24: 10,
  25: 6,
  26: 3,
  27: 1,
}

function buildPl3GroupSumBetCounts() {
  const counts: Record<number, number> = Object.fromEntries(Array.from({ length: 28 }, (_, index) => [index, 0]))
  for (let first = 0; first <= 9; first += 1) {
    for (let second = first; second <= 9; second += 1) {
      for (let third = second; third <= 9; third += 1) {
        if (first === second && second === third) continue
        counts[first + second + third] += 1
      }
    }
  }
  return counts
}

const PL3_GROUP_SUM_BET_COUNTS = buildPl3GroupSumBetCounts()

function formatCurrency(value: number | undefined) {
  return `${Math.round(value || 0).toLocaleString('zh-CN')} 元`
}

function normalizeDigitsInput(value: string) {
  return value.replace(/[^\d,\s，、;；|/]/g, '')
}

function splitNumbers(value: string) {
  const chunks = value
    .split(/[\s,，、;；|/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
  return [...new Set(chunks.map((item) => item.padStart(2, '0')))].sort()
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

function createEmptyLine(lotteryCode: LotteryCode): EditableLine {
  return {
    playType: lotteryCode === 'dlt' ? 'dlt' : 'direct',
    frontNumbersInput: '',
    backNumbersInput: '',
    directTenThousandsInput: '',
    directThousandsInput: '',
    directHundredsInput: '',
    directTensInput: '',
    directUnitsInput: '',
    groupNumbersInput: '',
    sumValuesInput: '',
    multiplier: 1,
    isAppend: false,
  }
}

function createDefaultFormState(targetPeriod: string, lotteryCode: LotteryCode): BetFormState {
  return {
    targetPeriod,
    sourceType: 'manual',
    ticketImageUrl: '',
    ticketImageFile: null,
    ticketImagePreviewUrl: '',
    ocrText: '',
    ocrProvider: null,
    ocrRecognizedAt: null,
    ticketPurchasedAt: '',
    lines: [createEmptyLine(lotteryCode)],
  }
}

function formatBeijingDateTimeInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const formatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '--'
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`
}

function beijingInputToUtcIso(value: string) {
  const text = value.trim()
  if (!text) return null
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!matched) return null
  const [, year, month, day, hour, minute] = matched
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute), 0)
  return new Date(utcMs).toISOString().replace('.000Z', 'Z')
}

function mapLineToEditable(lotteryCode: LotteryCode, line: MyBetLine): EditableLine {
  return {
    playType: (lotteryCode === 'dlt' ? 'dlt' : line.play_type) as LinePlayType,
    frontNumbersInput: (line.front_numbers || []).join(','),
    backNumbersInput: (line.back_numbers || []).join(','),
    directTenThousandsInput: (line.direct_ten_thousands || []).join(','),
    directThousandsInput: (line.direct_thousands || []).join(','),
    directHundredsInput: (line.direct_hundreds || []).join(','),
    directTensInput: (line.direct_tens || []).join(','),
    directUnitsInput: (line.direct_units || []).join(','),
    groupNumbersInput: (line.group_numbers || []).join(','),
    sumValuesInput: (line.sum_values || []).join(','),
    multiplier: line.multiplier || 1,
    isAppend: Boolean(line.is_append),
  }
}

function buildFormFromRecord(record: MyBetRecord): BetFormState {
  const lotteryCode = record.lottery_code
  const lines = (record.lines || []).length
    ? (record.lines || []).map((line) => mapLineToEditable(lotteryCode, line))
    : [createEmptyLine(lotteryCode)]
  return {
    targetPeriod: record.target_period,
    sourceType: record.source_type || 'manual',
    ticketImageUrl: record.ticket_image_url || '',
    ticketImageFile: null,
    ticketImagePreviewUrl: record.ticket_image_url || '',
    ocrText: record.ocr_text || '',
    ocrProvider: record.ocr_provider || null,
    ocrRecognizedAt: record.ocr_recognized_at || null,
    ticketPurchasedAt: formatBeijingDateTimeInput(record.ticket_purchased_at),
    lines,
  }
}

function buildFormFromOCRDraft(lotteryCode: LotteryCode, draft: MyBetOCRDraftResponse, imageFile: File | null, imagePreviewUrl: string): BetFormState {
  return {
    targetPeriod: draft.target_period || '',
    sourceType: 'ocr',
    ticketImageUrl: draft.ticket_image_url || '',
    ticketImageFile: imageFile,
    ticketImagePreviewUrl: imagePreviewUrl || draft.ticket_image_url || '',
    ocrText: draft.ocr_text || '',
    ocrProvider: draft.ocr_provider || 'baidu',
    ocrRecognizedAt: draft.ocr_recognized_at || null,
    ticketPurchasedAt: formatBeijingDateTimeInput(draft.ticket_purchased_at),
    lines: (draft.lines || []).map((line) => mapLineToEditable(lotteryCode, line)),
  }
}

function togglePickFromInput(currentInput: string, value: string, maxCount: number) {
  const current = splitNumbers(currentInput)
  if (current.includes(value)) {
    return current.filter((item) => item !== value).join(',')
  }
  if (current.length >= maxCount) {
    return current.join(',')
  }
  return [...current, value].sort().join(',')
}

function revokeObjectUrlIfNeeded(value: string) {
  if (value.startsWith('blob:')) {
    URL.revokeObjectURL(value)
  }
}

function quoteLine(lotteryCode: LotteryCode, line: EditableLine): LineQuote {
  const multiplier = Math.max(1, Math.min(99, Number(line.multiplier) || 1))
  if (lotteryCode === 'dlt') {
    const front = splitNumbers(line.frontNumbersInput)
    const back = splitNumbers(line.backNumbersInput)
    const betCount = front.length >= 5 && back.length >= 2 ? combination(front.length, 5) * combination(back.length, 2) : 0
    const amount = betCount * 2 * multiplier + (line.isAppend ? betCount * multiplier : 0)
    return { betCount, amount, valid: betCount > 0 }
  }
  if (line.playType === 'direct') {
    if (lotteryCode === 'pl5') {
      const tenThousands = splitNumbers(line.directTenThousandsInput)
      const thousands = splitNumbers(line.directThousandsInput)
      const hundreds = splitNumbers(line.directHundredsInput)
      const tens = splitNumbers(line.directTensInput)
      const units = splitNumbers(line.directUnitsInput)
      const betCount = tenThousands.length && thousands.length && hundreds.length && tens.length && units.length
        ? tenThousands.length * thousands.length * hundreds.length * tens.length * units.length
        : 0
      return { betCount, amount: betCount * 2 * multiplier, valid: betCount > 0 }
    }
    const hundreds = splitNumbers(line.directHundredsInput)
    const tens = splitNumbers(line.directTensInput)
    const units = splitNumbers(line.directUnitsInput)
    const betCount = hundreds.length && tens.length && units.length ? hundreds.length * tens.length * units.length : 0
    return { betCount, amount: betCount * 2 * multiplier, valid: betCount > 0 }
  }
  if (line.playType === 'direct_sum' || line.playType === 'group_sum') {
    const sumValues = splitNumbers(line.sumValuesInput)
    const betCountRule = line.playType === 'direct_sum' ? PL3_DIRECT_SUM_BET_COUNTS : PL3_GROUP_SUM_BET_COUNTS
    const betCount = sumValues.reduce((sum, item) => sum + Number(betCountRule[Number(item)] || 0), 0)
    return { betCount, amount: betCount * 2 * multiplier, valid: betCount > 0 }
  }
  const groups = splitNumbers(line.groupNumbersInput)
  const betCount = line.playType === 'group3' ? (groups.length >= 2 ? groups.length * (groups.length - 1) : 0) : combination(groups.length, 3)
  return { betCount, amount: betCount * 2 * multiplier, valid: betCount > 0 }
}

function buildLinePayload(lotteryCode: LotteryCode, line: EditableLine): MyBetLinePayload {
  const normalizedMultiplier = Math.max(1, Math.min(99, Number(line.multiplier) || 1))
  if (lotteryCode === 'dlt') {
    return {
      play_type: 'dlt',
      front_numbers: splitNumbers(line.frontNumbersInput),
      back_numbers: splitNumbers(line.backNumbersInput),
      multiplier: normalizedMultiplier,
      is_append: line.isAppend,
    }
  }
  if (line.playType === 'direct') {
    if (lotteryCode === 'pl5') {
      return {
        play_type: 'direct',
        direct_ten_thousands: splitNumbers(line.directTenThousandsInput),
        direct_thousands: splitNumbers(line.directThousandsInput),
        direct_hundreds: splitNumbers(line.directHundredsInput),
        direct_tens: splitNumbers(line.directTensInput),
        direct_units: splitNumbers(line.directUnitsInput),
        multiplier: normalizedMultiplier,
        is_append: false,
      }
    }
    return {
      play_type: 'direct',
      direct_hundreds: splitNumbers(line.directHundredsInput),
      direct_tens: splitNumbers(line.directTensInput),
      direct_units: splitNumbers(line.directUnitsInput),
      multiplier: normalizedMultiplier,
      is_append: false,
    }
  }
  if (line.playType === 'direct_sum' || line.playType === 'group_sum') {
    return {
      play_type: line.playType,
      sum_values: splitNumbers(line.sumValuesInput),
      multiplier: normalizedMultiplier,
      is_append: false,
    }
  }
  return {
    play_type: line.playType,
    group_numbers: splitNumbers(line.groupNumbersInput),
    multiplier: normalizedMultiplier,
    is_append: false,
  }
}

function formatPlayType(playType: string) {
  if (playType === 'group3') return '组选3'
  if (playType === 'group6') return '组选6'
  if (playType === 'direct_sum') return '直选和值'
  if (playType === 'group_sum') return '组选和值'
  if (playType === 'direct') return '直选'
  if (playType === 'mixed') return '混合'
  return '大乐透'
}

function renderActualResult(record: MyBetRecord, lotteryCode: LotteryCode) {
  if (!record.actual_result) {
    return <span className="my-bets-card__meta">待开奖，暂无开奖号码</span>
  }
  if (lotteryCode === 'dlt') {
    return (
      <div className="number-row number-row--tight">
        {(record.actual_result.red_balls || []).map((ball) => (
          <NumberBall key={`${record.id}-actual-front-${ball}`} value={ball} color="red" size="sm" />
        ))}
        <span className="number-row__divider" />
        {(record.actual_result.blue_balls || []).map((ball) => (
          <NumberBall key={`${record.id}-actual-back-${ball}`} value={ball} color="blue" size="sm" />
        ))}
      </div>
    )
  }
  const digitLength = lotteryCode === 'pl5' ? 5 : 3
  const digits = (record.actual_result.digits || record.actual_result.red_balls || []).slice(0, digitLength)
  return (
    <div className="number-row number-row--tight">
      {digits.map((ball) => (
        <NumberBall key={`${record.id}-actual-digit-${ball}`} value={ball} color="red" size="sm" />
      ))}
    </div>
  )
}

function renderLineNumbers(recordId: number, line: MyBetLine, lotteryCode: LotteryCode, hasActualResult: boolean) {
  const hitFront = new Set(line.hit_front_numbers || [])
  const hitBack = new Set(line.hit_back_numbers || [])
  const hitTenThousands = new Set(line.hit_direct_ten_thousands || [])
  const hitThousands = new Set(line.hit_direct_thousands || [])
  const hitHundreds = new Set(line.hit_direct_hundreds || [])
  const hitTens = new Set(line.hit_direct_tens || [])
  const hitUnits = new Set(line.hit_direct_units || [])
  const hitGroups = new Set(line.hit_group_numbers || [])
  const hitSums = new Set(line.hit_sum_values || [])
  const resolveTone = (isHit: boolean): 'default' | 'muted' => (hasActualResult && !isHit ? 'muted' : 'default')

  if (lotteryCode === 'dlt') {
    return (
      <div className="number-row number-row--tight">
        {(line.front_numbers || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-front-${ball}`} value={ball} color="red" size="sm" isHit={hitFront.has(ball)} tone={resolveTone(hitFront.has(ball))} />
        ))}
        <span className="number-row__divider" />
        {(line.back_numbers || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-back-${ball}`} value={ball} color="blue" size="sm" isHit={hitBack.has(ball)} tone={resolveTone(hitBack.has(ball))} />
        ))}
      </div>
    )
  }
  if (line.play_type === 'direct') {
    if (lotteryCode === 'pl5') {
      return (
        <div className="number-row number-row--tight">
          {(line.direct_ten_thousands || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-tt-${ball}`} value={ball} color="red" size="sm" isHit={hitTenThousands.has(ball)} tone={resolveTone(hitTenThousands.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.direct_thousands || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-th-${ball}`} value={ball} color="red" size="sm" isHit={hitThousands.has(ball)} tone={resolveTone(hitThousands.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.direct_hundreds || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-h-${ball}`} value={ball} color="red" size="sm" isHit={hitHundreds.has(ball)} tone={resolveTone(hitHundreds.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.direct_tens || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-t-${ball}`} value={ball} color="red" size="sm" isHit={hitTens.has(ball)} tone={resolveTone(hitTens.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.direct_units || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-u-${ball}`} value={ball} color="red" size="sm" isHit={hitUnits.has(ball)} tone={resolveTone(hitUnits.has(ball))} />
          ))}
        </div>
      )
    }
    return (
      <div className="number-row number-row--tight">
        {(line.direct_hundreds || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-h-${ball}`} value={ball} color="red" size="sm" isHit={hitHundreds.has(ball)} tone={resolveTone(hitHundreds.has(ball))} />
        ))}
        <span className="number-row__divider" />
        {(line.direct_tens || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-t-${ball}`} value={ball} color="red" size="sm" isHit={hitTens.has(ball)} tone={resolveTone(hitTens.has(ball))} />
        ))}
        <span className="number-row__divider" />
        {(line.direct_units || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-u-${ball}`} value={ball} color="red" size="sm" isHit={hitUnits.has(ball)} tone={resolveTone(hitUnits.has(ball))} />
        ))}
      </div>
    )
  }
  if (line.play_type === 'direct_sum' || line.play_type === 'group_sum') {
    return (
      <div className="number-row number-row--tight">
        {(line.sum_values || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-sum-${ball}`} value={ball} color="red" size="sm" isHit={hitSums.has(ball)} tone={resolveTone(hitSums.has(ball))} />
        ))}
      </div>
    )
  }
  return (
    <div className="number-row number-row--tight">
      {(line.group_numbers || []).map((ball) => (
        <NumberBall key={`${recordId}-line-${line.line_no}-g-${ball}`} value={ball} color="red" size="sm" isHit={hitGroups.has(ball)} tone={resolveTone(hitGroups.has(ball))} />
      ))}
    </div>
  )
}

function BallPicker({
  label,
  numbers,
  selectedInput,
  onToggle,
  color,
}: {
  label: string
  numbers: string[]
  selectedInput: string
  onToggle: (value: string) => void
  color: 'red' | 'blue'
}) {
  const selected = new Set(splitNumbers(selectedInput))
  return (
    <div className="my-bets-picker">
      <span className="my-bets-picker__label">{label}</span>
      <div className="my-bets-picker__grid">
        {numbers.map((value) => (
          <button
            key={`${label}-${value}`}
            type="button"
            className={clsx('my-bets-picker__ball', `is-${color}`, selected.has(value) && 'is-selected')}
            onClick={() => onToggle(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  )
}

export function MyBetsPanel({ lotteryCode, targetPeriod }: { lotteryCode: LotteryCode; targetPeriod: string }) {
  const queryClient = useQueryClient()
  const editImageInputRef = useRef<HTMLInputElement | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<MyBetRecord | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [form, setForm] = useState<BetFormState>(() => createDefaultFormState(targetPeriod, lotteryCode))

  useEffect(() => {
    return () => {
      revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
    }
  }, [form.ticketImagePreviewUrl])

  const betsQuery = useQuery({
    queryKey: ['my-bets', lotteryCode],
    queryFn: async () => apiClient.getMyBets(lotteryCode),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      let ticketImageUrl = form.ticketImageUrl
      if (form.sourceType === 'ocr' && form.ticketImageFile) {
        const uploadResult = await apiClient.uploadMyBetOCRImage(lotteryCode, form.ticketImageFile)
        ticketImageUrl = uploadResult.ticket_image_url || ''
      }
      const payload: MyBetRecordPayload = {
        lottery_code: lotteryCode,
        target_period: form.targetPeriod.trim(),
        source_type: form.sourceType,
        ticket_image_url: ticketImageUrl,
        ocr_text: form.ocrText,
        ocr_provider: form.ocrProvider,
        ocr_recognized_at: form.ocrRecognizedAt,
        ticket_purchased_at: beijingInputToUtcIso(form.ticketPurchasedAt),
        lines: form.lines.map((line) => buildLinePayload(lotteryCode, line)),
      }
      if (editingRecord) {
        const updatePayload: MyBetRecordUpdatePayload = { ...payload, record_id: editingRecord.id }
        return apiClient.updateMyBet(updatePayload)
      }
      return apiClient.createMyBet(payload)
    },
    onSuccess: async () => {
      setMessage(editingRecord ? '投注已更新。' : '投注已添加。')
      revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
      setFormOpen(false)
      setEditingRecord(null)
      setForm(createDefaultFormState(targetPeriod, lotteryCode))
      await queryClient.invalidateQueries({ queryKey: ['my-bets', lotteryCode] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '保存失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (recordId: number) => apiClient.deleteMyBet(recordId, lotteryCode),
    onSuccess: async () => {
      setMessage('投注记录已删除。')
      await queryClient.invalidateQueries({ queryKey: ['my-bets', lotteryCode] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '删除失败')
    },
  })

  const ocrMutation = useMutation({
    mutationFn: async () => {
      if (!form.ticketImageFile || !form.ticketImagePreviewUrl) {
        throw new Error('请先上传并缓存票据图片')
      }
      return apiClient.recognizeMyBetByImage(lotteryCode, form.ticketImageFile)
    },
    onSuccess: (draft) => {
      setEditingRecord(null)
      setMessage(draft.warnings.length ? draft.warnings.join('；') : 'OCR识别完成，请确认后保存。')
      setForm((previous) => buildFormFromOCRDraft(lotteryCode, draft, previous.ticketImageFile, previous.ticketImagePreviewUrl))
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'OCR识别失败')
    },
  })

  const lineQuotes = useMemo(() => form.lines.map((line) => quoteLine(lotteryCode, line)), [form.lines, lotteryCode])
  const totalBetCount = lineQuotes.reduce((sum, item) => sum + item.betCount, 0)
  const totalAmount = lineQuotes.reduce((sum, item) => sum + item.amount, 0)
  const canSubmit = /^\d+$/.test(form.targetPeriod.trim()) && lineQuotes.length > 0 && lineQuotes.every((item) => item.valid)

  const records = betsQuery.data?.records || []
  const summary = betsQuery.data?.summary

  function openCreateModal(sourceType: 'manual' | 'ocr' = 'manual', focusImageInput = false) {
    setMessage(null)
    setEditingRecord(null)
    revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
    setForm({ ...createDefaultFormState(targetPeriod, lotteryCode), sourceType })
    setFormOpen(true)
    if (focusImageInput) {
      requestAnimationFrame(() => {
        editImageInputRef.current?.focus()
      })
    }
  }

  function openEditModal(record: MyBetRecord) {
    setMessage(null)
    setEditingRecord(record)
    revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
    setForm(buildFormFromRecord(record))
    setFormOpen(true)
  }

  function closeFormModal() {
    if (saveMutation.isPending) return
    revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
    setFormOpen(false)
    setEditingRecord(null)
  }

  function updateLine(index: number, updater: (line: EditableLine) => EditableLine) {
    setForm((previous) => ({
      ...previous,
      lines: previous.lines.map((line, lineIndex) => (lineIndex === index ? updater(line) : line)),
    }))
  }

  function addLine() {
    setForm((previous) => ({
      ...previous,
      lines: [...previous.lines, createEmptyLine(lotteryCode)],
    }))
  }

  function removeLine(index: number) {
    setForm((previous) => ({
      ...previous,
      lines: previous.lines.length <= 1 ? previous.lines : previous.lines.filter((_, lineIndex) => lineIndex !== index),
    }))
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      setMessage('请补全期号和每条子注单的号码。')
      return
    }
    saveMutation.mutate()
  }

  function handleEditImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null
    setForm((previous) => {
      revokeObjectUrlIfNeeded(previous.ticketImagePreviewUrl)
      return {
        ...previous,
        ticketImageFile: file,
        ticketImageUrl: '',
        ticketImagePreviewUrl: file ? URL.createObjectURL(file) : '',
      }
    })
  }

  function clearEditImage() {
    setForm((previous) => {
      revokeObjectUrlIfNeeded(previous.ticketImagePreviewUrl)
      return { ...previous, ticketImageFile: null, ticketImageUrl: '', ticketImagePreviewUrl: '' }
    })
    if (editImageInputRef.current) {
      editImageInputRef.current.value = ''
    }
  }

  return (
    <div className="page-section my-bets-page">
      <StatusCard
        title="我的投注"
        subtitle="按当前账号和彩种隔离，支持手动录入、OCR识别、多注编辑和盈亏自动结算。"
        actions={
          <div className="toolbar-inline">
            <button className="primary-button" type="button" onClick={() => openCreateModal()}>
              添加投注
            </button>
          </div>
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
                      <strong>{formatPlayType(record.play_type)}</strong>
                      {record.source_type === 'ocr' ? <span className="my-bets-status">OCR</span> : null}
                      {record.settlement_status === 'pending' ? <span className="my-bets-status is-pending">待开奖</span> : <span className="my-bets-status is-settled">已结算</span>}
                    </div>
                    <span className="my-bets-card__meta">{`投注时间：${formatDateTimeLocal(record.ticket_purchased_at || record.created_at)}`}</span>
                    <div className="my-bets-card__draw">
                      <span className="my-bets-card__meta">开奖号码：</span>
                      {renderActualResult(record, lotteryCode)}
                    </div>
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

                {(record.lines || []).length ? (
                  <div className="my-bets-card__line-list">
                    {(record.lines || []).map((line) => (
                      <div key={`${record.id}-line-${line.line_no}`} className="my-bets-line-card">
                        <span className="my-bets-line-card__label">{`子注单 #${line.line_no} · ${formatPlayType(line.play_type)}`}</span>
                        {renderLineNumbers(record.id, line, lotteryCode, Boolean(record.actual_result))}
                        <span className="my-bets-card__meta">{`${line.bet_count} 注 × ${line.multiplier} 倍${line.is_append ? '（追加）' : ''} · ${formatCurrency(line.amount)}`}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="my-bets-card__metrics">
                  <span>{`总投入 ${formatCurrency(record.amount)}`}</span>
                  <span>{`总奖金 ${formatCurrency(record.prize_amount)}`}</span>
                  <span className={clsx(record.net_profit >= 0 ? 'is-profit' : 'is-loss')}>{`盈亏 ${formatCurrency(record.net_profit)}`}</span>
                  <span>{record.prize_level ? `${record.prize_level} · 中 ${record.winning_bet_count} 注` : '未中奖'}</span>
                </div>
                {record.ticket_image_url ? (
                  <a className="my-bets-card__meta" href={record.ticket_image_url} target="_blank" rel="noreferrer">
                    查看票据图片
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="state-shell">当前彩种还没有投注记录，点击“添加投注”开始录入。</div>
        )}
      </StatusCard>

      {formOpen ? (
        <div className="modal-shell" role="presentation" onClick={closeFormModal}>
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form className="settings-model-form my-bets-modal" onSubmit={submitForm}>
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">My Bets</p>
                  <h2>{editingRecord ? '编辑投注' : '添加投注'}</h2>
                </div>
                <button className="ghost-button ghost-button--compact" type="button" onClick={closeFormModal}>
                  关闭
                </button>
              </div>

              <section className="my-bets-modal__section">
                <div className="settings-form-grid">
                  <label>
                    目标期号
                    <input value={form.targetPeriod} onChange={(event) => setForm((previous) => ({ ...previous, targetPeriod: event.target.value.replace(/[^\d]/g, '') }))} required />
                  </label>
                  <label>
                    来源方式
                    <input value={form.sourceType === 'ocr' ? 'OCR识别' : '手动录入'} disabled />
                  </label>
                  <label>
                    购票时间（北京时间）
                    <input
                      type="datetime-local"
                      step={60}
                      value={form.ticketPurchasedAt}
                      onChange={(event) => setForm((previous) => ({ ...previous, ticketPurchasedAt: event.target.value }))}
                    />
                  </label>
                </div>
              </section>

              <section className="my-bets-modal__section">
                <div className="my-bets-image-uploader">
                  <div className="my-bets-image-uploader__header">
                    <strong>票据图片</strong>
                    <span>图片先缓存本地，点击“开始OCR识别”后填充表单，保存投注时再上传图床。</span>
                  </div>
                  <div className="my-bets-image-uploader__actions">
                    <input ref={editImageInputRef} type="file" accept="image/*" onChange={handleEditImageChange} />
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!form.ticketImageFile || !form.ticketImagePreviewUrl || ocrMutation.isPending}
                      onClick={() => ocrMutation.mutate()}
                    >
                      {ocrMutation.isPending ? '识别中...' : '开始OCR识别'}
                    </button>
                    <button className="ghost-button ghost-button--compact" type="button" onClick={clearEditImage} disabled={!form.ticketImagePreviewUrl && !form.ticketImageUrl}>
                      删除图片
                    </button>
                    {form.ticketImageUrl && !form.ticketImageFile ? (
                      <a className="ghost-button ghost-button--compact" href={form.ticketImageUrl} target="_blank" rel="noreferrer">
                        查看原图
                      </a>
                    ) : null}
                  </div>
                  {form.ticketImagePreviewUrl ? (
                    <div className="my-bets-image-preview">
                      <img src={form.ticketImagePreviewUrl} alt="票据预览" />
                    </div>
                  ) : (
                    <div className="my-bets-image-uploader__placeholder">未选择图片</div>
                  )}
                </div>
              </section>

              <div className="my-bets-editor-list">
                {form.lines.map((line, index) => {
                  const quote = lineQuotes[index] || { betCount: 0, amount: 0, valid: false }
                  return (
                    <section key={`edit-line-${index}`} className="simulation-section">
                      <div className="simulation-section__header">
                        <div>
                          <h3>{`子注单 #${index + 1}`}</h3>
                          <span>{`预计 ${quote.betCount} 注 / ${quote.amount} 元`}</span>
                        </div>
                        <button className="ghost-button ghost-button--compact" type="button" onClick={() => removeLine(index)} disabled={form.lines.length <= 1}>
                          删除子注单
                        </button>
                      </div>

                      {lotteryCode === 'pl3' ? (
                        <label>
                          玩法
                          <select value={line.playType} onChange={(event) => updateLine(index, (current) => ({ ...current, playType: event.target.value as LinePlayType }))}>
                            {pl3PlayTypeOptions.map((item) => (
                              <option key={item.value} value={item.value}>
                                {item.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      {lotteryCode === 'dlt' ? (
                        <>
                          <BallPicker
                            label="前区点击选号"
                            numbers={dltFrontPool}
                            selectedInput={line.frontNumbersInput}
                            onToggle={(value) =>
                              updateLine(index, (current) => ({ ...current, frontNumbersInput: togglePickFromInput(current.frontNumbersInput, value, dltFrontPool.length) }))
                            }
                            color="red"
                          />
                          <BallPicker
                            label="后区点击选号"
                            numbers={dltBackPool}
                            selectedInput={line.backNumbersInput}
                            onToggle={(value) =>
                              updateLine(index, (current) => ({ ...current, backNumbersInput: togglePickFromInput(current.backNumbersInput, value, dltBackPool.length) }))
                            }
                            color="blue"
                          />
                          <div className="settings-form-grid">
                            <label>
                              前区号码（逗号分隔）
                              <input
                                value={line.frontNumbersInput}
                                onChange={(event) => updateLine(index, (current) => ({ ...current, frontNumbersInput: normalizeDigitsInput(event.target.value) }))}
                                placeholder="如 01,02,03,04,05"
                              />
                            </label>
                            <label>
                              后区号码（逗号分隔）
                              <input
                                value={line.backNumbersInput}
                                onChange={(event) => updateLine(index, (current) => ({ ...current, backNumbersInput: normalizeDigitsInput(event.target.value) }))}
                                placeholder="如 06,07"
                              />
                            </label>
                            <label>
                              倍数
                              <input
                                type="number"
                                min={1}
                                max={99}
                                value={line.multiplier}
                                onChange={(event) => updateLine(index, (current) => ({ ...current, multiplier: Math.max(1, Math.min(99, Number(event.target.value) || 1)) }))}
                              />
                            </label>
                            <label className="toggle-chip">
                              <input type="checkbox" checked={line.isAppend} onChange={(event) => updateLine(index, (current) => ({ ...current, isAppend: event.target.checked }))} />
                              <span>追加投注</span>
                            </label>
                          </div>
                        </>
                      ) : lotteryCode === 'pl5' ? (
                        <>
                          <BallPicker
                            label="万位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directTenThousandsInput}
                            onToggle={(value) =>
                              updateLine(index, (current) => ({ ...current, directTenThousandsInput: togglePickFromInput(current.directTenThousandsInput, value, pl3Pool.length) }))
                            }
                            color="red"
                          />
                          <BallPicker
                            label="千位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directThousandsInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directThousandsInput: togglePickFromInput(current.directThousandsInput, value, pl3Pool.length) }))}
                            color="red"
                          />
                          <BallPicker
                            label="百位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directHundredsInput}
                            onToggle={(value) =>
                              updateLine(index, (current) => ({ ...current, directHundredsInput: togglePickFromInput(current.directHundredsInput, value, pl3Pool.length) }))
                            }
                            color="red"
                          />
                          <BallPicker
                            label="十位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directTensInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directTensInput: togglePickFromInput(current.directTensInput, value, pl3Pool.length) }))}
                            color="red"
                          />
                          <BallPicker
                            label="个位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directUnitsInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directUnitsInput: togglePickFromInput(current.directUnitsInput, value, pl3Pool.length) }))}
                            color="red"
                          />
                          <div className="settings-form-grid">
                            <label>
                              万位号码（逗号分隔）
                              <input value={line.directTenThousandsInput} onChange={(event) => updateLine(index, (current) => ({ ...current, directTenThousandsInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 00,01" />
                            </label>
                            <label>
                              千位号码（逗号分隔）
                              <input value={line.directThousandsInput} onChange={(event) => updateLine(index, (current) => ({ ...current, directThousandsInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 02,03" />
                            </label>
                            <label>
                              百位号码（逗号分隔）
                              <input value={line.directHundredsInput} onChange={(event) => updateLine(index, (current) => ({ ...current, directHundredsInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 04,05" />
                            </label>
                            <label>
                              十位号码（逗号分隔）
                              <input value={line.directTensInput} onChange={(event) => updateLine(index, (current) => ({ ...current, directTensInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 06,07" />
                            </label>
                            <label>
                              个位号码（逗号分隔）
                              <input value={line.directUnitsInput} onChange={(event) => updateLine(index, (current) => ({ ...current, directUnitsInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 08,09" />
                            </label>
                            <label>
                              倍数
                              <input type="number" min={1} max={99} value={line.multiplier} onChange={(event) => updateLine(index, (current) => ({ ...current, multiplier: Math.max(1, Math.min(99, Number(event.target.value) || 1)) }))} />
                            </label>
                          </div>
                        </>
                      ) : line.playType === 'direct' ? (
                        <>
                          <BallPicker
                            label="百位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directHundredsInput}
                            onToggle={(value) =>
                              updateLine(index, (current) => ({ ...current, directHundredsInput: togglePickFromInput(current.directHundredsInput, value, pl3Pool.length) }))
                            }
                            color="red"
                          />
                          <BallPicker
                            label="十位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directTensInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directTensInput: togglePickFromInput(current.directTensInput, value, pl3Pool.length) }))}
                            color="red"
                          />
                          <BallPicker
                            label="个位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directUnitsInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directUnitsInput: togglePickFromInput(current.directUnitsInput, value, pl3Pool.length) }))}
                            color="red"
                          />
                          <div className="settings-form-grid">
                            <label>
                              百位号码（逗号分隔）
                              <input value={line.directHundredsInput} onChange={(event) => updateLine(index, (current) => ({ ...current, directHundredsInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 00,01" />
                            </label>
                            <label>
                              十位号码（逗号分隔）
                              <input value={line.directTensInput} onChange={(event) => updateLine(index, (current) => ({ ...current, directTensInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 02,03" />
                            </label>
                            <label>
                              个位号码（逗号分隔）
                              <input value={line.directUnitsInput} onChange={(event) => updateLine(index, (current) => ({ ...current, directUnitsInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 04,05" />
                            </label>
                            <label>
                              倍数
                              <input type="number" min={1} max={99} value={line.multiplier} onChange={(event) => updateLine(index, (current) => ({ ...current, multiplier: Math.max(1, Math.min(99, Number(event.target.value) || 1)) }))} />
                            </label>
                          </div>
                        </>
                      ) : line.playType === 'direct_sum' || line.playType === 'group_sum' ? (
                        <>
                          <BallPicker
                            label="和值点击选号"
                            numbers={pl3SumPool}
                            selectedInput={line.sumValuesInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, sumValuesInput: togglePickFromInput(current.sumValuesInput, value, pl3SumPool.length) }))}
                            color="red"
                          />
                          <div className="settings-form-grid">
                            <label>
                              和值号码（逗号分隔）
                              <input value={line.sumValuesInput} onChange={(event) => updateLine(index, (current) => ({ ...current, sumValuesInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 10,11,12" />
                            </label>
                            <label>
                              倍数
                              <input type="number" min={1} max={99} value={line.multiplier} onChange={(event) => updateLine(index, (current) => ({ ...current, multiplier: Math.max(1, Math.min(99, Number(event.target.value) || 1)) }))} />
                            </label>
                          </div>
                        </>
                      ) : (
                        <>
                          <BallPicker
                            label="组选点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.groupNumbersInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, groupNumbersInput: togglePickFromInput(current.groupNumbersInput, value, pl3Pool.length) }))}
                            color="red"
                          />
                          <div className="settings-form-grid">
                            <label>
                              组选号码（逗号分隔）
                              <input value={line.groupNumbersInput} onChange={(event) => updateLine(index, (current) => ({ ...current, groupNumbersInput: normalizeDigitsInput(event.target.value) }))} placeholder="如 01,08,09" />
                            </label>
                            <label>
                              倍数
                              <input type="number" min={1} max={99} value={line.multiplier} onChange={(event) => updateLine(index, (current) => ({ ...current, multiplier: Math.max(1, Math.min(99, Number(event.target.value) || 1)) }))} />
                            </label>
                          </div>
                        </>
                      )}
                    </section>
                  )
                })}
              </div>

              <div className="simulation-summary-bar my-bets-form-summary">
                <div className="simulation-summary-bar__meta">
                  <strong>{`共 ${form.lines.length} 条子注单 · 预计 ${totalBetCount} 注 / ${totalAmount} 元`}</strong>
                  <span>{canSubmit ? '可提交保存。' : '请补全期号与子注单号码。'}</span>
                </div>
                <div className="simulation-summary-bar__actions">
                  <button className="ghost-button" type="button" onClick={addLine}>
                    添加子注单
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
