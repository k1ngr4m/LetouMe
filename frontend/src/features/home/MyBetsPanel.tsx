import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, ChevronDown, ChevronUp, ChevronsUpDown, Coins, Gift, ImageIcon, PencilLine, Plus, ReceiptText, ScanLine, Sparkles, Ticket, Trash2, Trophy, Wallet } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { useToast } from '../../shared/feedback/ToastProvider'
import { formatDateTimeLocal } from '../../shared/lib/format'
import { useMotion } from '../../shared/theme/MotionProvider'
import { IMGLOC_CONTENT_BLOCKED_MESSAGE, isImglocContentBlockedError } from './lib/myBetUploadFallback'
import type { LotteryCode, MyBetLine, MyBetLinePayload, MyBetOCRDraftResponse, MyBetRecord, MyBetRecordPayload, MyBetRecordUpdatePayload } from '../../shared/types/api'

type Pl3PlayType = 'direct' | 'group3' | 'group6' | 'direct_sum' | 'group_sum'
type DltPlayType = 'dlt' | 'dlt_dantuo'
type LinePlayType = DltPlayType | Pl3PlayType

type EditableLine = {
  playType: LinePlayType
  frontNumbersInput: string
  backNumbersInput: string
  frontDanInput: string
  frontTuoInput: string
  backDanInput: string
  backTuoInput: string
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
  discountAmountInput: string
  ticketImageUrl: string
  ticketImageFile: File | null
  ticketImagePreviewUrl: string
  ocrText: string
  ocrProvider: string | null
  ocrRecognizedAt: number | null
  ticketPurchasedAt: string
  lines: EditableLine[]
}

type MyBetsViewMode = 'list' | 'form'

type LineQuote = {
  betCount: number
  amount: number
  valid: boolean
  reason?: string
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

function hasIntersection(left: string[], right: string[]) {
  const leftSet = new Set(left)
  return right.some((item) => leftSet.has(item))
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
    frontDanInput: '',
    frontTuoInput: '',
    backDanInput: '',
    backTuoInput: '',
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
    discountAmountInput: '0',
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

function formatBeijingDateTimeInput(value?: number | null) {
  if (!value) return ''
  const date = new Date(value * 1000)
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

function beijingInputToTimestamp(value: string) {
  const text = value.trim()
  if (!text) return null
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!matched) return null
  const [, year, month, day, hour, minute] = matched
  const utcMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 8, Number(minute), 0)
  return Math.floor(utcMs / 1000)
}

function mapLineToEditable(lotteryCode: LotteryCode, line: MyBetLine): EditableLine {
  return {
    playType: (lotteryCode === 'dlt' ? (line.play_type === 'dlt_dantuo' ? 'dlt_dantuo' : 'dlt') : line.play_type) as LinePlayType,
    frontNumbersInput: (line.front_numbers || []).join(','),
    backNumbersInput: (line.back_numbers || []).join(','),
    frontDanInput: (line.front_dan || []).join(','),
    frontTuoInput: (line.front_tuo || []).join(','),
    backDanInput: (line.back_dan || []).join(','),
    backTuoInput: (line.back_tuo || []).join(','),
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
    discountAmountInput: String(Math.max(0, Number(record.discount_amount) || 0)),
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
    discountAmountInput: '0',
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

function buildFormSnapshot(form: BetFormState) {
  return JSON.stringify({
    ...form,
    ticketImageFile: form.ticketImageFile
      ? {
          name: form.ticketImageFile.name,
          size: form.ticketImageFile.size,
          type: form.ticketImageFile.type,
          lastModified: form.ticketImageFile.lastModified,
        }
      : null,
  })
}

function quoteLine(lotteryCode: LotteryCode, line: EditableLine): LineQuote {
  const multiplier = Math.max(1, Math.min(99, Number(line.multiplier) || 1))
  if (lotteryCode === 'dlt') {
    if (line.playType === 'dlt_dantuo') {
      const frontDan = splitNumbers(line.frontDanInput)
      const frontTuo = splitNumbers(line.frontTuoInput)
      const backDan = splitNumbers(line.backDanInput)
      const backTuo = splitNumbers(line.backTuoInput)
      const frontPickCount = 5 - frontDan.length
      const backPickCount = 2 - backDan.length
      if (frontDan.length < 1 || frontDan.length > 4) {
        return { betCount: 0, amount: 0, valid: false, reason: '前区胆码数量应为 1-4 个。' }
      }
      if (frontTuo.length < 2) {
        return { betCount: 0, amount: 0, valid: false, reason: '前区拖码至少选择 2 个号码。' }
      }
      if (hasIntersection(frontDan, frontTuo)) {
        return { betCount: 0, amount: 0, valid: false, reason: '前区胆码与拖码不可重复。' }
      }
      if (new Set([...frontDan, ...frontTuo]).size < 6) {
        return { betCount: 0, amount: 0, valid: false, reason: '前区胆码与拖码合计至少 6 个号码。' }
      }
      if (backDan.length > 1) {
        return { betCount: 0, amount: 0, valid: false, reason: '后区胆码最多 1 个。' }
      }
      if (backTuo.length < 2) {
        return { betCount: 0, amount: 0, valid: false, reason: '后区拖码至少选择 2 个号码。' }
      }
      if (hasIntersection(backDan, backTuo)) {
        return { betCount: 0, amount: 0, valid: false, reason: '后区胆码与拖码不可重复。' }
      }
      if (new Set([...backDan, ...backTuo]).size < 3) {
        return { betCount: 0, amount: 0, valid: false, reason: '后区胆码与拖码合计至少 3 个号码。' }
      }
      if (frontTuo.length < frontPickCount || backTuo.length < backPickCount) {
        return { betCount: 0, amount: 0, valid: false, reason: '拖码数量不足以组成有效注单。' }
      }
      const betCount = combination(frontTuo.length, frontPickCount) * combination(backTuo.length, backPickCount)
      const amount = betCount * 2 * multiplier + (line.isAppend ? betCount * multiplier : 0)
      return { betCount, amount, valid: betCount > 0, reason: betCount > 0 ? undefined : '胆拖号码无效，请检查输入。' }
    }
    const front = splitNumbers(line.frontNumbersInput)
    const back = splitNumbers(line.backNumbersInput)
    if (front.length < 5) {
      return { betCount: 0, amount: 0, valid: false, reason: '前区至少选择 5 个号码。' }
    }
    if (back.length < 2) {
      return { betCount: 0, amount: 0, valid: false, reason: '后区至少选择 2 个号码。' }
    }
    const betCount = combination(front.length, 5) * combination(back.length, 2)
    const amount = betCount * 2 * multiplier + (line.isAppend ? betCount * multiplier : 0)
    return { betCount, amount, valid: betCount > 0, reason: betCount > 0 ? undefined : '大乐透号码无效，请检查输入。' }
  }
  if (line.playType === 'direct') {
    if (lotteryCode === 'pl5') {
      const tenThousands = splitNumbers(line.directTenThousandsInput)
      const thousands = splitNumbers(line.directThousandsInput)
      const hundreds = splitNumbers(line.directHundredsInput)
      const tens = splitNumbers(line.directTensInput)
      const units = splitNumbers(line.directUnitsInput)
      if (!tenThousands.length || !thousands.length || !hundreds.length || !tens.length || !units.length) {
        return { betCount: 0, amount: 0, valid: false, reason: '万、千、百、十、个位都需至少选择 1 个号码。' }
      }
      const betCount = tenThousands.length && thousands.length && hundreds.length && tens.length && units.length
        ? tenThousands.length * thousands.length * hundreds.length * tens.length * units.length
        : 0
      return { betCount, amount: betCount * 2 * multiplier, valid: betCount > 0, reason: betCount > 0 ? undefined : '直选号码无效，请检查输入。' }
    }
    const hundreds = splitNumbers(line.directHundredsInput)
    const tens = splitNumbers(line.directTensInput)
    const units = splitNumbers(line.directUnitsInput)
    if (!hundreds.length || !tens.length || !units.length) {
      return { betCount: 0, amount: 0, valid: false, reason: '百、十、个位都需至少选择 1 个号码。' }
    }
    const betCount = hundreds.length && tens.length && units.length ? hundreds.length * tens.length * units.length : 0
    return { betCount, amount: betCount * 2 * multiplier, valid: betCount > 0, reason: betCount > 0 ? undefined : '直选号码无效，请检查输入。' }
  }
  if (line.playType === 'direct_sum' || line.playType === 'group_sum') {
    const sumValues = splitNumbers(line.sumValuesInput)
    if (!sumValues.length) {
      return { betCount: 0, amount: 0, valid: false, reason: '和值至少选择 1 个号码。' }
    }
    const betCountRule = line.playType === 'direct_sum' ? PL3_DIRECT_SUM_BET_COUNTS : PL3_GROUP_SUM_BET_COUNTS
    const betCount = sumValues.reduce((sum, item) => sum + Number(betCountRule[Number(item)] || 0), 0)
    return { betCount, amount: betCount * 2 * multiplier, valid: betCount > 0, reason: betCount > 0 ? undefined : '和值号码无效，请检查输入。' }
  }
  const groups = splitNumbers(line.groupNumbersInput)
  if ((line.playType === 'group3' && groups.length < 2) || (line.playType === 'group6' && groups.length < 3)) {
    return { betCount: 0, amount: 0, valid: false, reason: line.playType === 'group3' ? '组选3至少选择 2 个号码。' : '组选6至少选择 3 个号码。' }
  }
  const betCount = line.playType === 'group3' ? (groups.length >= 2 ? groups.length * (groups.length - 1) : 0) : combination(groups.length, 3)
  return { betCount, amount: betCount * 2 * multiplier, valid: betCount > 0, reason: betCount > 0 ? undefined : '组选号码无效，请检查输入。' }
}

function parseDiscountAmount(value: string): number {
  const normalized = String(value || '').trim()
  if (!normalized) return 0
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

function buildLinePayload(lotteryCode: LotteryCode, line: EditableLine): MyBetLinePayload {
  const normalizedMultiplier = Math.max(1, Math.min(99, Number(line.multiplier) || 1))
  if (lotteryCode === 'dlt') {
    if (line.playType === 'dlt_dantuo') {
      return {
        play_type: 'dlt_dantuo',
        front_dan: splitNumbers(line.frontDanInput),
        front_tuo: splitNumbers(line.frontTuoInput),
        back_dan: splitNumbers(line.backDanInput),
        back_tuo: splitNumbers(line.backTuoInput),
        multiplier: normalizedMultiplier,
        is_append: line.isAppend,
      }
    }
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
  if (playType === 'dlt_dantuo') return '胆拖'
  if (playType === 'group3') return '组选3'
  if (playType === 'group6') return '组选6'
  if (playType === 'direct_sum') return '直选和值'
  if (playType === 'group_sum') return '组选和值'
  if (playType === 'direct') return '直选'
  if (playType === 'mixed') return '混合'
  return '大乐透'
}

function resolveQxcDigitColor(index: number, total: number): 'qxc-front' | 'qxc-back' {
  return index === total - 1 ? 'qxc-back' : 'qxc-front'
}

function resolveDigitColorForLottery(lotteryCode: LotteryCode): 'red' | 'pl3pl5' {
  return lotteryCode === 'pl3' || lotteryCode === 'pl5' ? 'pl3pl5' : 'red'
}

function resolveDltBallColor(zone: 'front' | 'back'): 'dlt-front' | 'dlt-back' {
  return zone === 'front' ? 'dlt-front' : 'dlt-back'
}

function renderActualResult(record: MyBetRecord, lotteryCode: LotteryCode) {
  if (!record.actual_result) {
    return <span className="my-bets-card__meta">待开奖，暂无开奖号码</span>
  }
  if (lotteryCode === 'dlt') {
    return (
      <div className="number-row number-row--tight">
        {(record.actual_result.red_balls || []).map((ball) => (
          <NumberBall key={`${record.id}-actual-front-${ball}`} value={ball} color={resolveDltBallColor('front')} size="sm" />
        ))}
        <span className="number-row__divider" />
        {(record.actual_result.blue_balls || []).map((ball) => (
          <NumberBall key={`${record.id}-actual-back-${ball}`} value={ball} color={resolveDltBallColor('back')} size="sm" />
        ))}
      </div>
    )
  }
  const digitLength = lotteryCode === 'qxc' ? 7 : lotteryCode === 'pl5' ? 5 : 3
  const digits = (record.actual_result.digits || record.actual_result.red_balls || []).slice(0, digitLength)
  return (
    <div className="number-row number-row--tight">
      {digits.map((ball, index) => (
        <NumberBall
          key={`${record.id}-actual-digit-${index}-${ball}`}
          value={ball}
          color={lotteryCode === 'qxc' ? resolveQxcDigitColor(index, digits.length) : resolveDigitColorForLottery(lotteryCode)}
          size="sm"
        />
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
  const digitColor = resolveDigitColorForLottery(lotteryCode)

  if (lotteryCode === 'dlt') {
    if (line.play_type === 'dlt_dantuo') {
      return (
        <div className="number-row number-row--tight">
          {(line.front_dan || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-front-dan-${ball}`} value={ball} color={resolveDltBallColor('front')} size="sm" isHit={hitFront.has(ball)} tone={resolveTone(hitFront.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.front_tuo || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-front-tuo-${ball}`} value={ball} color={resolveDltBallColor('front')} size="sm" isHit={hitFront.has(ball)} tone={resolveTone(hitFront.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.back_dan || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-back-dan-${ball}`} value={ball} color={resolveDltBallColor('back')} size="sm" isHit={hitBack.has(ball)} tone={resolveTone(hitBack.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.back_tuo || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-back-tuo-${ball}`} value={ball} color={resolveDltBallColor('back')} size="sm" isHit={hitBack.has(ball)} tone={resolveTone(hitBack.has(ball))} />
          ))}
        </div>
      )
    }
    return (
      <div className="number-row number-row--tight">
        {(line.front_numbers || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-front-${ball}`} value={ball} color={resolveDltBallColor('front')} size="sm" isHit={hitFront.has(ball)} tone={resolveTone(hitFront.has(ball))} />
        ))}
        <span className="number-row__divider" />
        {(line.back_numbers || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-back-${ball}`} value={ball} color={resolveDltBallColor('back')} size="sm" isHit={hitBack.has(ball)} tone={resolveTone(hitBack.has(ball))} />
        ))}
      </div>
    )
  }
  if (lotteryCode === 'qxc' && (line.position_selections || []).length === 7) {
    const positionSelections = (line.position_selections || []).slice(0, 7)
    const hitPositionSelections = (line.hit_position_selections || []).slice(0, 7)
    return (
      <div className="number-row number-row--tight">
        {positionSelections.map((values, positionIndex) => (
          <span key={`${recordId}-line-${line.line_no}-position-${positionIndex}`} className="number-row__segment">
            {positionIndex > 0 ? <span className="number-row__divider" /> : null}
            {(values || []).map((ball) => {
              const isHit = Boolean((hitPositionSelections[positionIndex] || []).includes(ball))
              return (
                <NumberBall
                  key={`${recordId}-line-${line.line_no}-position-${positionIndex}-${ball}`}
                  value={ball}
                  color={resolveQxcDigitColor(positionIndex, positionSelections.length)}
                  size="sm"
                  isHit={isHit}
                  tone={resolveTone(isHit)}
                />
              )
            })}
          </span>
        ))}
      </div>
    )
  }
  if (line.play_type === 'direct') {
    if (lotteryCode === 'pl5') {
      return (
        <div className="number-row number-row--tight">
          {(line.direct_ten_thousands || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-tt-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitTenThousands.has(ball)} tone={resolveTone(hitTenThousands.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.direct_thousands || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-th-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitThousands.has(ball)} tone={resolveTone(hitThousands.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.direct_hundreds || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-h-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitHundreds.has(ball)} tone={resolveTone(hitHundreds.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.direct_tens || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-t-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitTens.has(ball)} tone={resolveTone(hitTens.has(ball))} />
          ))}
          <span className="number-row__divider" />
          {(line.direct_units || []).map((ball) => (
            <NumberBall key={`${recordId}-line-${line.line_no}-u-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitUnits.has(ball)} tone={resolveTone(hitUnits.has(ball))} />
          ))}
        </div>
      )
    }
    return (
      <div className="number-row number-row--tight">
        {(line.direct_hundreds || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-h-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitHundreds.has(ball)} tone={resolveTone(hitHundreds.has(ball))} />
        ))}
        <span className="number-row__divider" />
        {(line.direct_tens || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-t-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitTens.has(ball)} tone={resolveTone(hitTens.has(ball))} />
        ))}
        <span className="number-row__divider" />
        {(line.direct_units || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-u-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitUnits.has(ball)} tone={resolveTone(hitUnits.has(ball))} />
        ))}
      </div>
    )
  }
  if (line.play_type === 'direct_sum' || line.play_type === 'group_sum') {
    return (
      <div className="number-row number-row--tight">
        {(line.sum_values || []).map((ball) => (
          <NumberBall key={`${recordId}-line-${line.line_no}-sum-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitSums.has(ball)} tone={resolveTone(hitSums.has(ball))} />
        ))}
      </div>
    )
  }
  return (
    <div className="number-row number-row--tight">
      {(line.group_numbers || []).map((ball) => (
        <NumberBall key={`${recordId}-line-${line.line_no}-g-${ball}`} value={ball} color={digitColor} size="sm" isHit={hitGroups.has(ball)} tone={resolveTone(hitGroups.has(ball))} />
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
  color: 'red' | 'blue' | 'pl3pl5' | 'dlt-front' | 'dlt-back'
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

export function MyBetsPanel({
  lotteryCode,
  targetPeriod,
  onDirtyStateChange,
  focusRecordId,
  focusToken,
  onFocusHandled,
}: {
  lotteryCode: LotteryCode
  targetPeriod: string
  onDirtyStateChange?: (isDirty: boolean) => void
  focusRecordId?: number
  focusToken?: string
  onFocusHandled?: () => void
}) {
  const { motionLevel } = useMotion()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const editImageInputRef = useRef<HTMLInputElement | null>(null)
  const [viewMode, setViewMode] = useState<MyBetsViewMode>('list')
  const [editingRecord, setEditingRecord] = useState<MyBetRecord | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<'success' | 'error'>('success')
  const [expandedRecordMap, setExpandedRecordMap] = useState<Record<number, boolean>>({})
  const [highlightedRecordId, setHighlightedRecordId] = useState<number | null>(null)
  const [form, setForm] = useState<BetFormState>(() => createDefaultFormState(targetPeriod, lotteryCode))
  const [initialFormSnapshot, setInitialFormSnapshot] = useState(() =>
    buildFormSnapshot(createDefaultFormState(targetPeriod, lotteryCode)),
  )
  const recordRefMap = useRef<Record<number, HTMLElement | null>>({})
  const highlightTimeoutRef = useRef<number | null>(null)
  const consumedFocusTokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!message) return
    showToast(message, messageTone)
    setMessage(null)
  }, [message, messageTone, showToast])

  useEffect(() => {
    return () => {
      revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [form.ticketImagePreviewUrl])

  const betsQuery = useQuery({
    queryKey: ['my-bets', lotteryCode],
    queryFn: async () => apiClient.getMyBets(lotteryCode),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      let ticketImageUrl = form.ticketImageUrl
      let imageUploadWarning: string | null = null
      if (form.sourceType === 'ocr' && form.ticketImageFile) {
        try {
          const uploadResult = await apiClient.uploadMyBetOCRImage(lotteryCode, form.ticketImageFile)
          ticketImageUrl = uploadResult.ticket_image_url || ''
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (!isImglocContentBlockedError(message)) {
            throw error
          }
          ticketImageUrl = ''
          imageUploadWarning = IMGLOC_CONTENT_BLOCKED_MESSAGE
        }
      }
      const payload: MyBetRecordPayload = {
        lottery_code: lotteryCode,
        target_period: form.targetPeriod.trim(),
        discount_amount: parseDiscountAmount(form.discountAmountInput),
        source_type: form.sourceType,
        ticket_image_url: ticketImageUrl,
        ocr_text: form.ocrText,
        ocr_provider: form.ocrProvider,
        ocr_recognized_at: form.ocrRecognizedAt,
        ticket_purchased_at: beijingInputToTimestamp(form.ticketPurchasedAt),
        lines: form.lines.map((line) => buildLinePayload(lotteryCode, line)),
      }
      if (editingRecord) {
        const updatePayload: MyBetRecordUpdatePayload = { ...payload, record_id: editingRecord.id }
        const response = await apiClient.updateMyBet(updatePayload)
        return { response, imageUploadWarning }
      }
      const response = await apiClient.createMyBet(payload)
      return { response, imageUploadWarning }
    },
    onSuccess: async (result) => {
      const successMessage = editingRecord ? '投注已更新。' : '投注已添加。'
      setMessageTone('success')
      setMessage(result.imageUploadWarning ? `${successMessage}${result.imageUploadWarning}` : successMessage)
      revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
      setViewMode('list')
      setEditingRecord(null)
      const nextForm = createDefaultFormState(targetPeriod, lotteryCode)
      setForm(nextForm)
      setInitialFormSnapshot(buildFormSnapshot(nextForm))
      await queryClient.invalidateQueries({ queryKey: ['my-bets', lotteryCode] })
    },
    onError: (error) => {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : '保存失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (recordId: number) => apiClient.deleteMyBet(recordId, lotteryCode),
    onSuccess: async () => {
      setMessageTone('success')
      setMessage('投注记录已删除。')
      await queryClient.invalidateQueries({ queryKey: ['my-bets', lotteryCode] })
    },
    onError: (error) => {
      setMessageTone('error')
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
      setMessageTone('success')
      setMessage(draft.warnings.length ? draft.warnings.join('；') : 'OCR识别完成，请确认后保存。')
      setForm((previous) => buildFormFromOCRDraft(lotteryCode, draft, previous.ticketImageFile, previous.ticketImagePreviewUrl))
    },
    onError: (error) => {
      setMessageTone('error')
      setMessage(error instanceof Error ? error.message : 'OCR识别失败')
    },
  })

  const lineQuotes = useMemo(() => form.lines.map((line) => quoteLine(lotteryCode, line)), [form.lines, lotteryCode])
  const totalBetCount = lineQuotes.reduce((sum, item) => sum + item.betCount, 0)
  const totalAmount = lineQuotes.reduce((sum, item) => sum + item.amount, 0)
  const currentFormSnapshot = useMemo(() => buildFormSnapshot(form), [form])
  const isFormDirty = viewMode === 'form' && currentFormSnapshot !== initialFormSnapshot
  const discountAmount = parseDiscountAmount(form.discountAmountInput)
  const netTotalAmount = Math.max(0, totalAmount - discountAmount)
  const discountValidationError = discountAmount > totalAmount ? '优惠金额不能超过预计下注金额。' : null
  const hasValidTargetPeriod = /^\d+$/.test(form.targetPeriod.trim())
  const invalidLineIndex = lineQuotes.findIndex((item) => !item.valid)
  const invalidLineQuote = invalidLineIndex >= 0 ? lineQuotes[invalidLineIndex] : null
  const submitHint = !hasValidTargetPeriod
    ? '请填写有效期号。'
    : discountValidationError
      ? discountValidationError
    : invalidLineQuote
      ? `子注单 #${invalidLineIndex + 1}：${invalidLineQuote.reason || '请补全号码。'}`
      : '可提交保存。'
  const canSubmit = hasValidTargetPeriod && lineQuotes.length > 0 && invalidLineIndex < 0 && !discountValidationError

  const records = betsQuery.data?.records || []
  const summary = betsQuery.data?.summary
  const hasRecords = records.length > 0
  const allRecordsExpanded = hasRecords && records.every((record) => Boolean(expandedRecordMap[record.id]))
  const animationsEnabled = motionLevel !== 'minimal'
  const motionScale = motionLevel === 'enhanced' ? 1.25 : 1
  const summaryEnterY = 10 * motionScale
  const cardEnterY = 12 * motionScale
  const lineEnterY = 6 * motionScale
  const summaryCards = useMemo(
    () => [
      {
        key: 'total-count',
        label: '投注笔数',
        value: summary?.total_count || 0,
        meta: `已结算 ${summary?.settled_count || 0} · 待开奖 ${summary?.pending_count || 0}`,
        icon: ReceiptText,
      },
      { key: 'total-amount', label: '总投入', value: formatCurrency(summary?.total_amount || 0), icon: Wallet },
      { key: 'discount', label: '总优惠', value: formatCurrency(summary?.total_discount_amount || 0), icon: Gift },
      { key: 'net-amount', label: '净投入', value: formatCurrency(summary?.total_net_amount || 0), icon: Coins, cardClassName: 'is-emphasis' },
      { key: 'prize', label: '总奖金', value: formatCurrency(summary?.total_prize_amount || 0), icon: Trophy },
      {
        key: 'profit',
        label: '累计盈亏',
        value: formatCurrency(summary?.total_net_profit || 0),
        valueClassName: clsx((summary?.total_net_profit || 0) >= 0 ? 'is-profit' : 'is-loss'),
        icon: Ticket,
        cardClassName: 'is-emphasis',
      },
    ],
    [summary],
  )
  const shouldWarnUnsaved = isFormDirty && !saveMutation.isPending && !ocrMutation.isPending

  useEffect(() => {
    onDirtyStateChange?.(shouldWarnUnsaved)
  }, [onDirtyStateChange, shouldWarnUnsaved])

  useEffect(() => {
    return () => onDirtyStateChange?.(false)
  }, [onDirtyStateChange])

  useEffect(() => {
    if (!shouldWarnUnsaved) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [shouldWarnUnsaved])

  useEffect(() => {
    setExpandedRecordMap((previous) => {
      const next: Record<number, boolean> = {}
      for (const record of records) {
        next[record.id] = Boolean(previous[record.id])
      }
      const previousIds = Object.keys(previous)
      const nextIds = Object.keys(next)
      if (previousIds.length !== nextIds.length) return next
      if (nextIds.some((id) => previous[Number(id)] !== next[Number(id)])) return next
      return previous
    })
  }, [records])

  useEffect(() => {
    if (viewMode !== 'list') return
    const targetRecordId = Number(focusRecordId || 0)
    const token = String(focusToken || '')
    if (!targetRecordId || !token) return
    if (consumedFocusTokenRef.current === token) return
    if (betsQuery.isLoading && !records.length) return

    const targetExists = records.some((item) => item.id === targetRecordId)
    if (!targetExists) {
      consumedFocusTokenRef.current = token
      onFocusHandled?.()
      return
    }

    consumedFocusTokenRef.current = token
    setExpandedRecordMap((previous) => ({ ...previous, [targetRecordId]: true }))
    const frameId = window.requestAnimationFrame(() => {
      const targetNode = recordRefMap.current[targetRecordId]
      if (targetNode) {
        targetNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      setHighlightedRecordId(targetRecordId)
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current)
      }
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedRecordId((current) => (current === targetRecordId ? null : current))
        highlightTimeoutRef.current = null
      }, 2400)
    })
    onFocusHandled?.()
    return () => window.cancelAnimationFrame(frameId)
  }, [betsQuery.isLoading, focusRecordId, focusToken, onFocusHandled, records, viewMode])

  function openCreateForm(sourceType: 'manual' | 'ocr' = 'manual', focusImageInput = false) {
    setMessage(null)
    setEditingRecord(null)
    revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
    const nextForm = { ...createDefaultFormState(targetPeriod, lotteryCode), sourceType }
    setForm(nextForm)
    setInitialFormSnapshot(buildFormSnapshot(nextForm))
    setViewMode('form')
    if (focusImageInput) {
      requestAnimationFrame(() => {
        editImageInputRef.current?.focus()
      })
    }
  }

  function openEditForm(record: MyBetRecord) {
    setMessage(null)
    setEditingRecord(record)
    revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
    const nextForm = buildFormFromRecord(record)
    setForm(nextForm)
    setInitialFormSnapshot(buildFormSnapshot(nextForm))
    setViewMode('form')
  }

  function backToListView() {
    if (saveMutation.isPending) return
    if (shouldWarnUnsaved && !window.confirm('有未保存内容，确定返回列表吗？')) return
    revokeObjectUrlIfNeeded(form.ticketImagePreviewUrl)
    const nextForm = createDefaultFormState(targetPeriod, lotteryCode)
    setForm(nextForm)
    setInitialFormSnapshot(buildFormSnapshot(nextForm))
    setViewMode('list')
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
      setMessageTone('error')
      setMessage(submitHint)
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

  function toggleRecordExpanded(recordId: number) {
    setExpandedRecordMap((previous) => ({ ...previous, [recordId]: !previous[recordId] }))
  }

  function toggleAllRecordsExpanded() {
    const nextExpanded = !allRecordsExpanded
    const next: Record<number, boolean> = {}
    for (const record of records) {
      next[record.id] = nextExpanded
    }
    setExpandedRecordMap(next)
  }

  return (
    <div className="page-section my-bets-page">
      <StatusCard
        title="我的投注"
        actions={
          <div className="toolbar-inline my-bets-page__toolbar">
            {viewMode === 'list' && hasRecords ? (
              <button
                className={clsx('icon-button my-bets-page__toolbar-button', allRecordsExpanded && 'is-active')}
                type="button"
                onClick={toggleAllRecordsExpanded}
                aria-label={allRecordsExpanded ? '全部收起' : '全部展开'}
                title={allRecordsExpanded ? '全部收起' : '全部展开'}
              >
                <ChevronsUpDown size={16} aria-hidden="true" />
              </button>
            ) : null}
            {viewMode === 'list' ? (
              <button
                className="icon-button my-bets-page__toolbar-button my-bets-page__toolbar-button--primary"
                type="button"
                onClick={() => openCreateForm()}
                aria-label="添加投注"
                title="添加投注"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            ) : (
              <button
                className="ghost-button ghost-button--compact my-bets-page__toolbar-back"
                type="button"
                onClick={backToListView}
              >
                返回列表
              </button>
            )}
          </div>
        }
      >
        {viewMode === 'list' ? (
          <>
            <div className="my-bets-summary-grid">
          {summaryCards.map((item, index) => {
            const Icon = item.icon
            return (
              <motion.article
                key={item.key}
                className={clsx('my-bets-summary-card', item.cardClassName)}
                initial={animationsEnabled ? { opacity: 0, y: summaryEnterY } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: animationsEnabled ? 0.2 * motionScale : 0, delay: animationsEnabled ? index * 0.03 : 0 }}
              >
                <span className="my-bets-summary-card__label">{item.label}</span>
                <span className="my-bets-summary-card__icon" aria-hidden="true">
                  <Icon size={16} />
                </span>
                <strong className={item.valueClassName}>{item.value}</strong>
                {item.meta ? <small>{item.meta}</small> : null}
              </motion.article>
            )
          })}
            </div>

            {message ? <div className="simulation-inline-message">{message}</div> : null}

            {betsQuery.isLoading ? (
              <div className="state-shell">正在加载投注记录...</div>
            ) : betsQuery.error instanceof Error ? (
              <div className="state-shell state-shell--error">读取失败：{betsQuery.error.message}</div>
            ) : records.length ? (
              <div className="my-bets-list">
                {records.map((record, index) => {
                  const isExpanded = Boolean(expandedRecordMap[record.id])
                  return (
                  <motion.article
                    layout={animationsEnabled}
                    key={record.id}
                    className={clsx('my-bets-card', highlightedRecordId === record.id && 'is-focus-highlight')}
                    ref={(node) => {
                      recordRefMap.current[record.id] = node
                    }}
                    initial={animationsEnabled ? { opacity: 0, y: cardEnterY } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: animationsEnabled ? 0.22 * motionScale : 0, delay: animationsEnabled ? Math.min(index * 0.025, 0.22) : 0 }}
                  >
                <div className="my-bets-card__header">
                  <div>
                    <p className="hero-panel__eyebrow">{`第 ${record.target_period} 期`}</p>
                    <div className="my-bets-card__title-row">
                      <strong>{formatPlayType(record.play_type)}</strong>
                      {record.source_type === 'ocr' ? <span className="my-bets-status">OCR</span> : null}
                      {record.settlement_status === 'pending' ? <span className="my-bets-status is-pending">待开奖</span> : <span className="my-bets-status is-settled">已结算</span>}
                    </div>
                    <span className="my-bets-card__meta my-bets-card__meta--with-icon">
                      <CalendarClock size={14} aria-hidden="true" />
                      {`投注时间：${formatDateTimeLocal(record.ticket_purchased_at || record.created_at)}`}
                    </span>
                    {isExpanded ? (
                      <div className="my-bets-card__draw">
                        <span className="my-bets-card__meta">开奖号码：</span>
                        {renderActualResult(record, lotteryCode)}
                      </div>
                    ) : null}
                  </div>
                  <div className="my-bets-card__actions">
                    <button className="ghost-button ghost-button--compact" type="button" onClick={() => toggleRecordExpanded(record.id)}>
                      {isExpanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                      {isExpanded ? '收起详情' : '展开详情'}
                    </button>
                    <button className="ghost-button ghost-button--compact" type="button" onClick={() => openEditForm(record)}>
                      <PencilLine size={14} aria-hidden="true" />
                      编辑
                    </button>
                    <button className="ghost-button ghost-button--compact" type="button" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(record.id)}>
                      <Trash2 size={14} aria-hidden="true" />
                      删除
                    </button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {isExpanded && (record.lines || []).length ? (
                    <motion.div
                      className="my-bets-card__line-list"
                      initial={animationsEnabled ? { opacity: 0, y: lineEnterY } : false}
                      animate={{ opacity: 1, y: 0 }}
                      exit={animationsEnabled ? { opacity: 0, y: lineEnterY } : undefined}
                      transition={{ duration: animationsEnabled ? 0.18 * motionScale : 0 }}
                    >
                      {(record.lines || []).map((line) => (
                        <div key={`${record.id}-line-${line.line_no}`} className="my-bets-line-card">
                          <span className="my-bets-line-card__label">{`子注单 #${line.line_no} · ${formatPlayType(line.play_type)}`}</span>
                          {renderLineNumbers(record.id, line, lotteryCode, Boolean(record.actual_result))}
                          <span className="my-bets-card__meta">{`${line.bet_count} 注 × ${line.multiplier} 倍${line.is_append ? '（追加）' : ''} · ${formatCurrency(line.amount)}`}</span>
                        </div>
                      ))}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <div className="my-bets-card__metrics">
                  <span>{`总投入 ${formatCurrency(record.amount)}`}</span>
                  <span>{`优惠 ${formatCurrency(record.discount_amount || 0)}`}</span>
                  <span>{`净投入 ${formatCurrency(record.net_amount || Math.max(0, record.amount - (record.discount_amount || 0)))}`}</span>
                  <span>{`总奖金 ${formatCurrency(record.prize_amount)}`}</span>
                  <span className={clsx(record.net_profit >= 0 ? 'is-profit' : 'is-loss')}>{`盈亏 ${formatCurrency(record.net_profit)}`}</span>
                  <span>{record.prize_level ? `${record.prize_level} · 中 ${record.winning_bet_count} 注` : '未中奖'}</span>
                </div>
                {record.ticket_image_url ? (
                  <a className="my-bets-card__meta my-bets-card__meta--with-icon" href={record.ticket_image_url} target="_blank" rel="noreferrer">
                    <ImageIcon size={14} aria-hidden="true" />
                    查看票据图片
                  </a>
                ) : null}
                  </motion.article>
                )})}
              </div>
            ) : (
              <div className="state-shell">当前彩种还没有投注记录，点击“添加投注”开始录入。</div>
            )}
          </>
        ) : (
          null
        )}
      </StatusCard>

      {viewMode === 'form' ? (
        <section className="my-bets-form-view" data-testid="my-bets-form-view">
          <div className="my-bets-form-view__card">
            <form className="settings-model-form my-bets-modal my-bets-modal__form my-bets-form-view__form" onSubmit={submitForm}>
              <div className="modal-card__header my-bets-modal__header">
                <div>
                  <p className="modal-card__eyebrow">My Bets</p>
                  <h2>{editingRecord ? '编辑投注' : '添加投注'}</h2>
                </div>
                <button className="ghost-button ghost-button--compact" type="button" onClick={backToListView}>
                  返回列表
                </button>
              </div>

              <section className="my-bets-modal__section my-bets-modal__section--base">
                <div className="settings-form-grid my-bets-modal__grid">
                  <label className="my-bets-modal__field">
                    目标期号
                    <input value={form.targetPeriod} onChange={(event) => setForm((previous) => ({ ...previous, targetPeriod: event.target.value.replace(/[^\d]/g, '') }))} required />
                  </label>
                  <label className="my-bets-modal__field">
                    来源方式
                    <input value={form.sourceType === 'ocr' ? 'OCR识别' : '手动录入'} disabled />
                  </label>
                  <label className="my-bets-modal__field">
                    购票时间（北京时间）
                    <input
                      type="datetime-local"
                      step={60}
                      value={form.ticketPurchasedAt}
                      onChange={(event) => setForm((previous) => ({ ...previous, ticketPurchasedAt: event.target.value }))}
                    />
                  </label>
                  <label className="my-bets-modal__field">
                    优惠金额（元）
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={form.discountAmountInput}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, discountAmountInput: event.target.value.replace(/[^\d]/g, '') || '0' }))
                      }
                    />
                  </label>
                </div>
              </section>

              <section className="my-bets-modal__section my-bets-modal__section--image">
                <div className="my-bets-image-uploader">
                  <div className="my-bets-image-uploader__header">
                    <strong>
                      <ImageIcon size={15} aria-hidden="true" />
                      票据图片
                    </strong>
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
                      <ScanLine size={16} aria-hidden="true" />
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

              <div className="my-bets-editor-list my-bets-modal__editor-list">
                {form.lines.map((line, index) => {
                  const quote = lineQuotes[index] || { betCount: 0, amount: 0, valid: false }
                  return (
                    <section key={`edit-line-${index}`} className="simulation-section my-bets-modal__line-section">
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
                          <label>
                            玩法
                            <select value={line.playType} onChange={(event) => updateLine(index, (current) => ({ ...current, playType: event.target.value as LinePlayType }))}>
                              <option value="dlt">普通复式</option>
                              <option value="dlt_dantuo">胆拖</option>
                            </select>
                          </label>
                          {line.playType === 'dlt_dantuo' ? (
                            <>
                              <BallPicker
                                label="前区胆码点击选号"
                                numbers={dltFrontPool}
                                selectedInput={line.frontDanInput}
                                onToggle={(value) =>
                                  updateLine(index, (current) => ({ ...current, frontDanInput: togglePickFromInput(current.frontDanInput, value, dltFrontPool.length) }))
                                }
                                color="dlt-front"
                              />
                              <BallPicker
                                label="前区拖码点击选号"
                                numbers={dltFrontPool}
                                selectedInput={line.frontTuoInput}
                                onToggle={(value) =>
                                  updateLine(index, (current) => ({ ...current, frontTuoInput: togglePickFromInput(current.frontTuoInput, value, dltFrontPool.length) }))
                                }
                                color="dlt-front"
                              />
                              <BallPicker
                                label="后区胆码点击选号"
                                numbers={dltBackPool}
                                selectedInput={line.backDanInput}
                                onToggle={(value) =>
                                  updateLine(index, (current) => ({ ...current, backDanInput: togglePickFromInput(current.backDanInput, value, dltBackPool.length) }))
                                }
                                color="dlt-back"
                              />
                              <BallPicker
                                label="后区拖码点击选号"
                                numbers={dltBackPool}
                                selectedInput={line.backTuoInput}
                                onToggle={(value) =>
                                  updateLine(index, (current) => ({ ...current, backTuoInput: togglePickFromInput(current.backTuoInput, value, dltBackPool.length) }))
                                }
                                color="dlt-back"
                              />
                              <div className="settings-form-grid my-bets-modal__grid">
                                <label>
                                  前区胆码（逗号分隔）
                                  <input
                                    value={line.frontDanInput}
                                    onChange={(event) => updateLine(index, (current) => ({ ...current, frontDanInput: normalizeDigitsInput(event.target.value) }))}
                                    placeholder="如 01,02"
                                  />
                                </label>
                                <label>
                                  前区拖码（逗号分隔）
                                  <input
                                    value={line.frontTuoInput}
                                    onChange={(event) => updateLine(index, (current) => ({ ...current, frontTuoInput: normalizeDigitsInput(event.target.value) }))}
                                    placeholder="如 03,04,05,06"
                                  />
                                </label>
                                <label>
                                  后区胆码（逗号分隔）
                                  <input
                                    value={line.backDanInput}
                                    onChange={(event) => updateLine(index, (current) => ({ ...current, backDanInput: normalizeDigitsInput(event.target.value) }))}
                                    placeholder="如 01"
                                  />
                                </label>
                                <label>
                                  后区拖码（逗号分隔）
                                  <input
                                    value={line.backTuoInput}
                                    onChange={(event) => updateLine(index, (current) => ({ ...current, backTuoInput: normalizeDigitsInput(event.target.value) }))}
                                    placeholder="如 02,03"
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
                          ) : (
                            <>
                              <BallPicker
                                label="前区点击选号"
                                numbers={dltFrontPool}
                                selectedInput={line.frontNumbersInput}
                                onToggle={(value) =>
                                  updateLine(index, (current) => ({ ...current, frontNumbersInput: togglePickFromInput(current.frontNumbersInput, value, dltFrontPool.length) }))
                                }
                                color="dlt-front"
                              />
                              <BallPicker
                                label="后区点击选号"
                                numbers={dltBackPool}
                                selectedInput={line.backNumbersInput}
                                onToggle={(value) =>
                                  updateLine(index, (current) => ({ ...current, backNumbersInput: togglePickFromInput(current.backNumbersInput, value, dltBackPool.length) }))
                                }
                                color="dlt-back"
                              />
                              <div className="settings-form-grid my-bets-modal__grid">
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
                          )}
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
                            color="pl3pl5"
                          />
                          <BallPicker
                            label="千位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directThousandsInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directThousandsInput: togglePickFromInput(current.directThousandsInput, value, pl3Pool.length) }))}
                            color="pl3pl5"
                          />
                          <BallPicker
                            label="百位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directHundredsInput}
                            onToggle={(value) =>
                              updateLine(index, (current) => ({ ...current, directHundredsInput: togglePickFromInput(current.directHundredsInput, value, pl3Pool.length) }))
                            }
                            color="pl3pl5"
                          />
                          <BallPicker
                            label="十位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directTensInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directTensInput: togglePickFromInput(current.directTensInput, value, pl3Pool.length) }))}
                            color="pl3pl5"
                          />
                          <BallPicker
                            label="个位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directUnitsInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directUnitsInput: togglePickFromInput(current.directUnitsInput, value, pl3Pool.length) }))}
                            color="pl3pl5"
                          />
                          <div className="settings-form-grid my-bets-modal__grid">
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
                            color="pl3pl5"
                          />
                          <BallPicker
                            label="十位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directTensInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directTensInput: togglePickFromInput(current.directTensInput, value, pl3Pool.length) }))}
                            color="pl3pl5"
                          />
                          <BallPicker
                            label="个位点击选号"
                            numbers={pl3Pool}
                            selectedInput={line.directUnitsInput}
                            onToggle={(value) => updateLine(index, (current) => ({ ...current, directUnitsInput: togglePickFromInput(current.directUnitsInput, value, pl3Pool.length) }))}
                            color="pl3pl5"
                          />
                          <div className="settings-form-grid my-bets-modal__grid">
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
                            color="pl3pl5"
                          />
                          <div className="settings-form-grid my-bets-modal__grid">
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
                            color="pl3pl5"
                          />
                          <div className="settings-form-grid my-bets-modal__grid">
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

              <div className="simulation-summary-bar my-bets-form-summary my-bets-modal__footer">
                <div className="simulation-summary-bar__meta">
                  <strong>{`共 ${form.lines.length} 条子注单 · 预计 ${totalBetCount} 注 / ${totalAmount} 元（实付 ${netTotalAmount} 元）`}</strong>
                  <span>{submitHint}</span>
                </div>
                <div className="simulation-summary-bar__actions">
                  <button className="ghost-button" type="button" onClick={addLine}>
                    <Plus size={16} aria-hidden="true" />
                    添加子注单
                  </button>
                  <button className="primary-button" type="submit" disabled={!canSubmit || saveMutation.isPending}>
                    <Sparkles size={16} aria-hidden="true" />
                    {saveMutation.isPending ? '保存中...' : editingRecord ? '保存修改' : '添加投注'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  )
}
