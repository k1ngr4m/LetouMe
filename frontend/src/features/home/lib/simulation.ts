import type { LotteryCode, LotteryDraw, SimulationTicketRecord } from '../../../shared/types/api'
import { padBall } from '../../../shared/lib/format'

export type SimulationPlayType = 'dlt' | 'dlt_dantuo' | 'direct' | 'group3' | 'group6' | 'direct_sum' | 'qxc_compound'
export type PrizeLevel =
  | '一等奖'
  | '二等奖'
  | '三等奖'
  | '四等奖'
  | '五等奖'
  | '六等奖'
  | '七等奖'
  | '八等奖'
  | '九等奖'
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
  frontDan: string[]
  frontTuo: string[]
  backDan: string[]
  backTuo: string[]
  directTenThousands: string[]
  directThousands: string[]
  directHundreds: string[]
  directTens: string[]
  directUnits: string[]
  groupNumbers: string[]
  sumValues: string[]
  positionSelections?: string[][]
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
    front_dan: (ticket.front_dan || []).map(padBall).sort(),
    front_tuo: (ticket.front_tuo || []).map(padBall).sort(),
    back_dan: (ticket.back_dan || []).map(padBall).sort(),
    back_tuo: (ticket.back_tuo || []).map(padBall).sort(),
    direct_ten_thousands: (ticket.direct_ten_thousands || []).map(padBall).sort(),
    direct_thousands: (ticket.direct_thousands || []).map(padBall).sort(),
    direct_hundreds: (ticket.direct_hundreds || []).map(padBall).sort(),
    direct_tens: (ticket.direct_tens || []).map(padBall).sort(),
    direct_units: (ticket.direct_units || []).map(padBall).sort(),
    group_numbers: (ticket.group_numbers || []).map(padBall).sort(),
    sum_values: (ticket.sum_values || []).map(padBall).sort((left, right) => Number(left) - Number(right)),
    position_selections: (ticket.position_selections || []).map((values) => (values || []).map(padBall).sort((left, right) => Number(left) - Number(right))),
    bet_count: Number(ticket.bet_count || 0),
    amount: Number(ticket.amount || 0),
    created_at: ticket.created_at || 0,
  }
}

const PL3_DIRECT_SUM_BET_COUNTS: Record<string, number> = {
  '00': 1, '01': 3, '02': 6, '03': 10, '04': 15, '05': 21, '06': 28, '07': 36, '08': 45, '09': 55,
  '10': 63, '11': 69, '12': 73, '13': 75, '14': 75, '15': 73, '16': 69, '17': 63, '18': 55, '19': 45,
  '20': 36, '21': 28, '22': 21, '23': 15, '24': 10, '25': 6, '26': 3, '27': 1,
}

export const pl3SumOptions = Array.from({ length: 28 }, (_, index) => padBall(index))

export function buildBallRange(limit: number, start = 1) {
  return Array.from({ length: limit }, (_, index) => padBall(index + start))
}

export function calculateBetCount(selection: SimulationSelection) {
  if (selection.lotteryCode === 'dlt') {
    if (selection.playType === 'dlt_dantuo') {
      const frontDanCount = selection.frontDan.length
      const frontTuoCount = selection.frontTuo.length
      const backDanCount = selection.backDan.length
      const backTuoCount = selection.backTuo.length
      if (frontDanCount < 1 || frontDanCount > 4 || frontTuoCount < 2) return 0
      if (backDanCount > 1 || backTuoCount < 2) return 0
      if (hasIntersection(selection.frontDan, selection.frontTuo) || hasIntersection(selection.backDan, selection.backTuo)) return 0
      if (new Set([...selection.frontDan, ...selection.frontTuo]).size < 6) return 0
      if (new Set([...selection.backDan, ...selection.backTuo]).size < 3) return 0
      const frontPickCount = 5 - frontDanCount
      const backPickCount = 2 - backDanCount
      if (frontTuoCount < frontPickCount || backTuoCount < backPickCount) return 0
      return combination(frontTuoCount, frontPickCount) * combination(backTuoCount, backPickCount)
    }
    const frontCount = selection.frontNumbers.length
    const backCount = selection.backNumbers.length
    if (frontCount < 5 || backCount < 2) return 0
    return combination(frontCount, 5) * combination(backCount, 2)
  }
  if (selection.lotteryCode === 'pl5') {
    if (
      !selection.directTenThousands.length ||
      !selection.directThousands.length ||
      !selection.directHundreds.length ||
      !selection.directTens.length ||
      !selection.directUnits.length
    ) return 0
    return (
      selection.directTenThousands.length *
      selection.directThousands.length *
      selection.directHundreds.length *
      selection.directTens.length *
      selection.directUnits.length
    )
  }
  if (selection.lotteryCode === 'qxc') {
    if (!(selection.positionSelections || []).length || (selection.positionSelections || []).length !== 7) return 0
    return (selection.positionSelections || []).reduce((product, values) => (values.length ? product * values.length : 0), 1)
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
  if (selection.playType === 'direct_sum') {
    return selection.sumValues.reduce((sum, value) => sum + Number(PL3_DIRECT_SUM_BET_COUNTS[padBall(value)] || 0), 0)
  }
  return 0
}

export function calculateAmount(selection: SimulationSelection) {
  return calculateBetCount(selection) * 2
}

export function createRandomSelection(lotteryCode: LotteryCode, playType: SimulationPlayType): SimulationSelection {
  if (lotteryCode === 'dlt') {
    if (playType === 'dlt_dantuo') {
      const frontPool = buildBallRange(35)
      const backPool = buildBallRange(12)
      const frontDanCount = 2
      const backDanCount = 1
      const frontDan = pickRandomBalls(frontPool, frontDanCount)
      const frontTuo = pickRandomBalls(frontPool.filter((item) => !frontDan.includes(item)), 4)
      const backDan = pickRandomBalls(backPool, backDanCount)
      const backTuo = pickRandomBalls(backPool.filter((item) => !backDan.includes(item)), 2)
      return {
        lotteryCode,
        playType,
        frontNumbers: [],
        backNumbers: [],
        frontDan,
        frontTuo,
        backDan,
        backTuo,
        directTenThousands: [],
        directThousands: [],
        directHundreds: [],
        directTens: [],
        directUnits: [],
        groupNumbers: [],
        sumValues: [],
        positionSelections: [],
      }
    }
    return {
      lotteryCode,
      playType: 'dlt',
      frontNumbers: pickRandomBalls(buildBallRange(35), 5),
      backNumbers: pickRandomBalls(buildBallRange(12), 2),
      frontDan: [],
      frontTuo: [],
      backDan: [],
      backTuo: [],
      directTenThousands: [],
      directThousands: [],
      directHundreds: [],
      directTens: [],
      directUnits: [],
      groupNumbers: [],
      sumValues: [],
      positionSelections: [],
    }
  }

  if (playType === 'direct') {
    const digits = buildBallRange(10, 0)
    if (lotteryCode === 'pl5') {
      return {
        lotteryCode,
      playType: 'direct',
      frontNumbers: [],
      backNumbers: [],
      frontDan: [],
      frontTuo: [],
      backDan: [],
      backTuo: [],
      directTenThousands: pickRandomBalls(digits, 1),
        directThousands: pickRandomBalls(digits, 1),
        directHundreds: pickRandomBalls(digits, 1),
        directTens: pickRandomBalls(digits, 1),
        directUnits: pickRandomBalls(digits, 1),
        groupNumbers: [],
        sumValues: [],
        positionSelections: [],
      }
    }
    if (lotteryCode === 'qxc') {
      return {
        lotteryCode,
        playType,
        frontNumbers: [],
        backNumbers: [],
        frontDan: [],
        frontTuo: [],
        backDan: [],
        backTuo: [],
        directTenThousands: [],
        directThousands: [],
        directHundreds: [],
        directTens: [],
        directUnits: [],
        groupNumbers: [],
        sumValues: [],
        positionSelections: [
          pickRandomBalls(digits, 1),
          pickRandomBalls(digits, 1),
          pickRandomBalls(digits, 1),
          pickRandomBalls(digits, 1),
          pickRandomBalls(digits, 1),
          pickRandomBalls(digits, 1),
          pickRandomBalls(buildBallRange(15, 0), 1),
        ],
      }
    }
    return {
      lotteryCode,
      playType,
      frontNumbers: [],
      backNumbers: [],
      frontDan: [],
      frontTuo: [],
      backDan: [],
      backTuo: [],
      directTenThousands: [],
      directThousands: [],
      directHundreds: pickRandomBalls(digits, 1),
      directTens: pickRandomBalls(digits, 1),
      directUnits: pickRandomBalls(digits, 1),
      groupNumbers: [],
      sumValues: [],
      positionSelections: [],
    }
  }

  if (playType === 'direct_sum') {
    return {
      lotteryCode,
      playType,
      frontNumbers: [],
      backNumbers: [],
      frontDan: [],
      frontTuo: [],
      backDan: [],
      backTuo: [],
      directTenThousands: [],
      directThousands: [],
      directHundreds: [],
      directTens: [],
      directUnits: [],
      groupNumbers: [],
      sumValues: pickRandomBalls(pl3SumOptions, 1),
      positionSelections: [],
    }
  }

  const groupSize = playType === 'group3' ? 2 : 3
  return {
    lotteryCode,
    playType,
    frontNumbers: [],
    backNumbers: [],
    frontDan: [],
    frontTuo: [],
    backDan: [],
    backTuo: [],
    directTenThousands: [],
    directThousands: [],
    directHundreds: [],
    directTens: [],
    directUnits: [],
    groupNumbers: pickRandomBalls(buildBallRange(10, 0), groupSize),
    sumValues: [],
    positionSelections: [],
  }
}

export function buildSimulationMatches(selection: SimulationSelection, draws: LotteryDraw[], limit: 30 | 50) {
  if (selection.lotteryCode === 'dlt') {
    return buildDltMatches(selection, draws, limit)
  }
  return buildDigitMatches(selection, draws, limit)
}

function buildDltMatches(selection: SimulationSelection, draws: LotteryDraw[], limit: 30 | 50): SimulationMatchRecord[] {
  if (selection.playType === 'dlt_dantuo') {
    const frontDan = selection.frontDan.map(padBall).sort()
    const frontTuo = selection.frontTuo.map(padBall).sort()
    const backDan = selection.backDan.map(padBall).sort()
    const backTuo = selection.backTuo.map(padBall).sort()
    const fullFront = sortedUnion(frontDan, frontTuo)
    const fullBack = sortedUnion(backDan, backTuo)
    const frontPickCount = 5 - frontDan.length
    const backPickCount = 2 - backDan.length
    return draws.slice(0, limit).map((draw) => {
      const redHits = fullFront.filter((ball) => draw.red_balls.includes(ball))
      const blueHits = fullBack.filter((ball) => draw.blue_balls.includes(ball))
      const prizeMap = new Map<PrizeLevel, number>()
      if (frontPickCount >= 0 && backPickCount >= 0 && frontTuo.length >= frontPickCount && backTuo.length >= backPickCount) {
        for (const frontPick of combinationsFrom(frontTuo, frontPickCount)) {
          const pickedFront = [...frontDan, ...frontPick]
          const redHitCount = pickedFront.filter((ball) => draw.red_balls.includes(ball)).length
          for (const backPick of combinationsFrom(backTuo, backPickCount)) {
            const pickedBack = [...backDan, ...backPick]
            const blueHitCount = pickedBack.filter((ball) => draw.blue_balls.includes(ball)).length
            const prize = resolveDltPrizeLevel(redHitCount, blueHitCount, draw.period)
            if (!prize) continue
            prizeMap.set(prize, (prizeMap.get(prize) || 0) + 1)
          }
        }
      }
      const winningPrizes = dltPrizeLevelOrder(draw.period)
        .filter((level) => (prizeMap.get(level) || 0) > 0)
        .map((level) => ({ level, count: prizeMap.get(level) || 0 }))
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
  const normalizedFront = selection.frontNumbers.map(padBall).sort()
  const normalizedBack = selection.backNumbers.map(padBall).sort()
  return draws
    .slice(0, limit)
    .map((draw) => {
      const redHits = normalizedFront.filter((ball) => draw.red_balls.includes(ball))
      const blueHits = normalizedBack.filter((ball) => draw.blue_balls.includes(ball))
      const prizes = calculateDltPrizeBreakdown(
        normalizedFront.length,
        normalizedBack.length,
        redHits.length,
        blueHits.length,
        draw.period,
      )
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

function buildDigitMatches(selection: SimulationSelection, draws: LotteryDraw[], limit: 30 | 50): SimulationMatchRecord[] {
  return draws
    .slice(0, limit)
    .map((draw) => {
      const expectedLength = selection.lotteryCode === 'qxc' ? 7 : selection.lotteryCode === 'pl5' ? 5 : 3
      const actualDigits = resolveDigits(draw, expectedLength)
      const directDigits = (
        selection.lotteryCode === 'qxc'
          ? (selection.positionSelections || [])
          : selection.lotteryCode === 'pl5'
          ? [selection.directTenThousands, selection.directThousands, selection.directHundreds, selection.directTens, selection.directUnits]
          : [selection.directHundreds, selection.directTens, selection.directUnits]
      ).map((values) => values.map(padBall))
      const digitHits = selection.playType === 'direct'
        ? actualDigits.filter((digit, index) => directDigits[index]?.includes(digit))
        : []
      const winningPrizes = selection.lotteryCode === 'pl5'
        ? calculatePl5PrizeBreakdown(selection, actualDigits)
        : selection.lotteryCode === 'qxc'
          ? calculateQxcPrizeBreakdown(selection, actualDigits)
        : calculatePl3PrizeBreakdown(selection, actualDigits)

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

function calculateDltPrizeBreakdown(frontCount: number, backCount: number, redHitCount: number, blueHitCount: number, period: string) {
  const conditions: Array<{ redHits: number; blueHits: number; level: PrizeLevel }> = isDltNewRulePeriod(period)
    ? [
        { redHits: 5, blueHits: 2, level: '一等奖' },
        { redHits: 5, blueHits: 1, level: '二等奖' },
        { redHits: 5, blueHits: 0, level: '三等奖' },
        { redHits: 4, blueHits: 2, level: '三等奖' },
        { redHits: 4, blueHits: 1, level: '四等奖' },
        { redHits: 4, blueHits: 0, level: '五等奖' },
        { redHits: 3, blueHits: 2, level: '五等奖' },
        { redHits: 3, blueHits: 1, level: '六等奖' },
        { redHits: 2, blueHits: 2, level: '六等奖' },
        { redHits: 3, blueHits: 0, level: '七等奖' },
        { redHits: 2, blueHits: 1, level: '七等奖' },
        { redHits: 1, blueHits: 2, level: '七等奖' },
        { redHits: 0, blueHits: 2, level: '七等奖' },
      ]
    : [
        { redHits: 5, blueHits: 2, level: '一等奖' },
        { redHits: 5, blueHits: 1, level: '二等奖' },
        { redHits: 5, blueHits: 0, level: '三等奖' },
        { redHits: 4, blueHits: 2, level: '四等奖' },
        { redHits: 4, blueHits: 1, level: '五等奖' },
        { redHits: 3, blueHits: 2, level: '六等奖' },
        { redHits: 4, blueHits: 0, level: '七等奖' },
        { redHits: 3, blueHits: 1, level: '八等奖' },
        { redHits: 2, blueHits: 2, level: '八等奖' },
        { redHits: 3, blueHits: 0, level: '九等奖' },
        { redHits: 2, blueHits: 1, level: '九等奖' },
        { redHits: 1, blueHits: 2, level: '九等奖' },
        { redHits: 0, blueHits: 2, level: '九等奖' },
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

function isDltNewRulePeriod(period: string): boolean {
  const digits = (period || '').replace(/\D/g, '')
  if (!digits) return false
  const normalized = Number((digits.length >= 5 ? digits.slice(-5) : digits) || '0')
  return normalized >= 26014
}

function dltPrizeLevelOrder(period: string): PrizeLevel[] {
  return isDltNewRulePeriod(period)
    ? ['一等奖', '二等奖', '三等奖', '四等奖', '五等奖', '六等奖', '七等奖']
    : ['一等奖', '二等奖', '三等奖', '四等奖', '五等奖', '六等奖', '七等奖', '八等奖', '九等奖']
}

function resolveDltPrizeLevel(redHits: number, blueHits: number, period: string): PrizeLevel | null {
  if (isDltNewRulePeriod(period)) {
    if (redHits === 5 && blueHits === 2) return '一等奖'
    if (redHits === 5 && blueHits === 1) return '二等奖'
    if ((redHits === 5 && blueHits === 0) || (redHits === 4 && blueHits === 2)) return '三等奖'
    if (redHits === 4 && blueHits === 1) return '四等奖'
    if ((redHits === 4 && blueHits === 0) || (redHits === 3 && blueHits === 2)) return '五等奖'
    if ((redHits === 3 && blueHits === 1) || (redHits === 2 && blueHits === 2)) return '六等奖'
    if ((redHits === 3 && blueHits === 0) || (redHits === 2 && blueHits === 1) || (redHits === 1 && blueHits === 2) || (redHits === 0 && blueHits === 2)) return '七等奖'
    return null
  }
  if (redHits === 5 && blueHits === 2) return '一等奖'
  if (redHits === 5 && blueHits === 1) return '二等奖'
  if (redHits === 5 && blueHits === 0) return '三等奖'
  if (redHits === 4 && blueHits === 2) return '四等奖'
  if (redHits === 4 && blueHits === 1) return '五等奖'
  if (redHits === 3 && blueHits === 2) return '六等奖'
  if (redHits === 4 && blueHits === 0) return '七等奖'
  if ((redHits === 3 && blueHits === 1) || (redHits === 2 && blueHits === 2)) return '八等奖'
  if ((redHits === 3 && blueHits === 0) || (redHits === 2 && blueHits === 1) || (redHits === 1 && blueHits === 2) || (redHits === 0 && blueHits === 2)) return '九等奖'
  return null
}

function calculatePl3PrizeBreakdown(selection: SimulationSelection, actualDigits: string[]): SimulationMatchPrize[] {
  if (selection.playType === 'direct') {
    const matched =
      selection.directHundreds.includes(actualDigits[0]) &&
      selection.directTens.includes(actualDigits[1]) &&
      selection.directUnits.includes(actualDigits[2])
    return matched ? [{ level: '直选', count: 1 }] : []
  }

  if (selection.playType === 'direct_sum') {
    const actualSum = actualDigits.reduce((sum, digit) => sum + Number(digit), 0)
    const normalizedSum = padBall(actualSum)
    return selection.sumValues.includes(normalizedSum) ? [{ level: '直选', count: 1 }] : []
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

function calculatePl5PrizeBreakdown(selection: SimulationSelection, actualDigits: string[]): SimulationMatchPrize[] {
  const matched =
    selection.directTenThousands.includes(actualDigits[0]) &&
    selection.directThousands.includes(actualDigits[1]) &&
    selection.directHundreds.includes(actualDigits[2]) &&
    selection.directTens.includes(actualDigits[3]) &&
    selection.directUnits.includes(actualDigits[4])
  return matched ? [{ level: '直选', count: 1 }] : []
}

function calculateQxcPrizeBreakdown(selection: SimulationSelection, actualDigits: string[]): SimulationMatchPrize[] {
  const positions = (selection.positionSelections || []).map((values) => values.map(padBall))
  if (positions.length !== 7 || actualDigits.length !== 7) return []
  const matchFlags = positions.map((values, index) => values.includes(actualDigits[index]))
  const frontHits = matchFlags.slice(0, 6).filter(Boolean).length
  const totalHits = matchFlags.filter(Boolean).length
  const lastHit = Boolean(matchFlags[6])
  if (totalHits === 7) return [{ level: '一等奖', count: 1 }]
  if (frontHits === 6) return [{ level: '二等奖', count: Math.max(1, positions[6].length - (lastHit ? 1 : 0)) }]
  if (frontHits === 5 && lastHit) return [{ level: '三等奖', count: 1 }]
  if (totalHits === 5) return [{ level: '四等奖', count: 1 }]
  if (totalHits === 4) return [{ level: '五等奖', count: 1 }]
  if (totalHits === 3 || (frontHits === 1 && lastHit) || (!frontHits && lastHit)) return [{ level: '六等奖', count: 1 }]
  return []
}

function resolveDigits(draw: LotteryDraw, expectedLength: number): string[] {
  if (draw.digits?.length) {
    return draw.digits.map(padBall).slice(0, expectedLength)
  }
  const redFallback = (draw.red_balls || []).map(padBall).slice(0, expectedLength)
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

function hasIntersection(left: string[], right: string[]) {
  const leftSet = new Set(left)
  return right.some((item) => leftSet.has(item))
}

function sortedUnion(left: string[], right: string[]) {
  return Array.from(new Set([...left, ...right])).sort()
}

function combinationsFrom(values: string[], choose: number): string[][] {
  if (choose < 0 || choose > values.length) return []
  if (choose === 0) return [[]]
  if (choose === values.length) return [values.slice()]
  const result: string[][] = []
  const path: string[] = []
  const dfs = (start: number) => {
    if (path.length === choose) {
      result.push(path.slice())
      return
    }
    for (let index = start; index < values.length; index += 1) {
      path.push(values[index])
      dfs(index + 1)
      path.pop()
    }
  }
  dfs(0)
  return result
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
