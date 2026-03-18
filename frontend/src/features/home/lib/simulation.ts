import type { LotteryCode, LotteryDraw, SimulationTicketRecord } from '../../../shared/types/api'
import { padBall } from '../../../shared/lib/format'

export type SimulationPlayType = 'dlt' | 'direct' | 'group3' | 'group6'
export type PrizeLevel =
  | '一等奖'
  | '二等奖'
  | '三等奖'
  | '四等奖'
  | '五等奖'
  | '六等奖'
  | '七等奖'
  | '直选'
  | '组选3'
  | '组选6'
  | '未中奖'

export type SimulationMatchPrize = {
  level: PrizeLevel
  count: number
}

export type SimulationSelection = {
  lotteryCode: LotteryCode
  playType: SimulationPlayType
  frontNumbers: string[]
  backNumbers: string[]
  directHundreds: string[]
  directTens: string[]
  directUnits: string[]
  groupNumbers: string[]
}

export type SimulationMatchRecord = {
  period: string
  date: string
  redHits: string[]
  blueHits: string[]
  digitHits: string[]
  totalWinningBets: number
  topPrizeLevel: PrizeLevel
  prizes: SimulationMatchPrize[]
  actualResult: LotteryDraw
}

export function normalizeSimulationTicket(ticket: SimulationTicketRecord): SimulationTicketRecord {
  return {
    ...ticket,
    lottery_code: ticket.lottery_code || 'dlt',
    play_type: ticket.play_type || 'dlt',
    front_numbers: (ticket.front_numbers || []).map(padBall).sort(),
    back_numbers: (ticket.back_numbers || []).map(padBall).sort(),
    direct_hundreds: (ticket.direct_hundreds || []).map(padBall).sort(),
    direct_tens: (ticket.direct_tens || []).map(padBall).sort(),
    direct_units: (ticket.direct_units || []).map(padBall).sort(),
    group_numbers: (ticket.group_numbers || []).map(padBall).sort(),
    bet_count: Number(ticket.bet_count || 0),
    amount: Number(ticket.amount || 0),
    created_at: ticket.created_at || '',
  }
}

export function buildBallRange(limit: number, start = 1) {
  return Array.from({ length: limit }, (_, index) => padBall(index + start))
}

export function calculateBetCount(selection: SimulationSelection) {
  if (selection.lotteryCode === 'dlt') {
    const frontCount = selection.frontNumbers.length
    const backCount = selection.backNumbers.length
    if (frontCount < 5 || backCount < 2) return 0
    return combination(frontCount, 5) * combination(backCount, 2)
  }
  if (selection.playType === 'direct') {
    if (!selection.directHundreds.length || !selection.directTens.length || !selection.directUnits.length) return 0
    return selection.directHundreds.length * selection.directTens.length * selection.directUnits.length
  }
  if (selection.playType === 'group3') {
    const count = selection.groupNumbers.length
    return count >= 2 ? count * (count - 1) : 0
  }
  if (selection.playType === 'group6') {
    const count = selection.groupNumbers.length
    return count >= 3 ? combination(count, 3) : 0
  }
  return 0
}

export function calculateAmount(selection: SimulationSelection) {
  return calculateBetCount(selection) * 2
}

export function createRandomSelection(lotteryCode: LotteryCode, playType: SimulationPlayType): SimulationSelection {
  if (lotteryCode === 'dlt') {
    return {
      lotteryCode,
      playType: 'dlt',
      frontNumbers: pickRandomBalls(buildBallRange(35), 5),
      backNumbers: pickRandomBalls(buildBallRange(12), 2),
      directHundreds: [],
      directTens: [],
      directUnits: [],
      groupNumbers: [],
    }
  }

  if (playType === 'direct') {
    const digits = buildBallRange(10, 0)
    return {
      lotteryCode,
      playType,
      frontNumbers: [],
      backNumbers: [],
      directHundreds: pickRandomBalls(digits, 1),
      directTens: pickRandomBalls(digits, 1),
      directUnits: pickRandomBalls(digits, 1),
      groupNumbers: [],
    }
  }

  const groupSize = playType === 'group3' ? 2 : 3
  return {
    lotteryCode,
    playType,
    frontNumbers: [],
    backNumbers: [],
    directHundreds: [],
    directTens: [],
    directUnits: [],
    groupNumbers: pickRandomBalls(buildBallRange(10, 0), groupSize),
  }
}

export function buildSimulationMatches(selection: SimulationSelection, draws: LotteryDraw[], limit: 30 | 50) {
  if (selection.lotteryCode === 'dlt') {
    return buildDltMatches(selection, draws, limit)
  }
  return buildPl3Matches(selection, draws, limit)
}

function buildDltMatches(selection: SimulationSelection, draws: LotteryDraw[], limit: 30 | 50): SimulationMatchRecord[] {
  const normalizedFront = selection.frontNumbers.map(padBall).sort()
  const normalizedBack = selection.backNumbers.map(padBall).sort()
  return draws
    .slice(0, limit)
    .map((draw) => {
      const redHits = normalizedFront.filter((ball) => draw.red_balls.includes(ball))
      const blueHits = normalizedBack.filter((ball) => draw.blue_balls.includes(ball))
      const prizes = calculateDltPrizeBreakdown(normalizedFront.length, normalizedBack.length, redHits.length, blueHits.length)
      const winningPrizes = prizes.filter((item) => item.count > 0)
      return {
        period: draw.period,
        date: draw.date,
        redHits,
        blueHits,
        digitHits: [],
        totalWinningBets: winningPrizes.reduce((sum, item) => sum + item.count, 0),
        topPrizeLevel: winningPrizes[0]?.level || '未中奖',
        prizes: winningPrizes,
        actualResult: draw,
      }
    })
}

function buildPl3Matches(selection: SimulationSelection, draws: LotteryDraw[], limit: 30 | 50): SimulationMatchRecord[] {
  return draws
    .slice(0, limit)
    .map((draw) => {
      const actualDigits = resolvePl3Digits(draw)
      const directDigits = [selection.directHundreds, selection.directTens, selection.directUnits].map((values) => values.map(padBall))
      const digitHits = selection.playType === 'direct'
        ? actualDigits.filter((digit, index) => directDigits[index]?.includes(digit))
        : []
      const winningPrizes = calculatePl3PrizeBreakdown(selection, actualDigits)

      return {
        period: draw.period,
        date: draw.date,
        redHits: [],
        blueHits: [],
        digitHits,
        totalWinningBets: winningPrizes.reduce((sum, item) => sum + item.count, 0),
        topPrizeLevel: winningPrizes[0]?.level || '未中奖',
        prizes: winningPrizes,
        actualResult: {
          ...draw,
          digits: actualDigits,
          red_balls: draw.red_balls?.length ? draw.red_balls : actualDigits,
          blue_balls: draw.blue_balls || [],
        },
      }
    })
}

function calculateDltPrizeBreakdown(frontCount: number, backCount: number, redHitCount: number, blueHitCount: number) {
  const conditions: Array<{ redHits: number; blueHits: number; level: PrizeLevel }> = [
    { redHits: 5, blueHits: 2, level: '一等奖' },
    { redHits: 5, blueHits: 1, level: '二等奖' },
    { redHits: 5, blueHits: 0, level: '三等奖' },
    { redHits: 4, blueHits: 2, level: '四等奖' },
    { redHits: 4, blueHits: 1, level: '五等奖' },
    { redHits: 3, blueHits: 2, level: '五等奖' },
    { redHits: 4, blueHits: 0, level: '六等奖' },
    { redHits: 3, blueHits: 1, level: '六等奖' },
    { redHits: 2, blueHits: 2, level: '六等奖' },
    { redHits: 3, blueHits: 0, level: '七等奖' },
    { redHits: 2, blueHits: 1, level: '七等奖' },
    { redHits: 1, blueHits: 2, level: '七等奖' },
    { redHits: 0, blueHits: 2, level: '七等奖' },
  ]
  const prizeMap = new Map<PrizeLevel, number>()
  const missFront = frontCount - redHitCount
  const missBack = backCount - blueHitCount

  for (const condition of conditions) {
    const count =
      combination(redHitCount, condition.redHits) *
      combination(missFront, 5 - condition.redHits) *
      combination(blueHitCount, condition.blueHits) *
      combination(missBack, 2 - condition.blueHits)
    if (!count) continue
    prizeMap.set(condition.level, (prizeMap.get(condition.level) || 0) + count)
  }

  return Array.from(prizeMap.entries()).map(([level, count]) => ({ level, count }))
}

function calculatePl3PrizeBreakdown(selection: SimulationSelection, actualDigits: string[]): SimulationMatchPrize[] {
  if (selection.playType === 'direct') {
    const matched =
      selection.directHundreds.includes(actualDigits[0]) &&
      selection.directTens.includes(actualDigits[1]) &&
      selection.directUnits.includes(actualDigits[2])
    return matched ? [{ level: '直选', count: 1 }] : []
  }

  const actualSet = new Set(actualDigits)
  const uniqueCount = actualSet.size
  const selectedSet = new Set(selection.groupNumbers)
  const covered = Array.from(actualSet).every((digit) => selectedSet.has(digit))
  if (!covered) return []

  if (selection.playType === 'group3' && uniqueCount === 2) {
    return [{ level: '组选3', count: 1 }]
  }
  if (selection.playType === 'group6' && uniqueCount === 3) {
    return [{ level: '组选6', count: 1 }]
  }
  return []
}

function resolvePl3Digits(draw: LotteryDraw): string[] {
  if (draw.digits?.length) {
    return draw.digits.map(padBall).slice(0, 3)
  }
  const redFallback = (draw.red_balls || []).map(padBall).slice(0, 3)
  return redFallback
}

function pickRandomBalls(pool: string[], size: number) {
  const remaining = [...pool]
  const result: string[] = []
  while (result.length < size && remaining.length) {
    const index = Math.floor(Math.random() * remaining.length)
    result.push(remaining.splice(index, 1)[0])
  }
  return result.sort()
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
