import type { LotteryDraw, SimulationTicketRecord } from '../../../shared/types/api'
import { padBall } from '../../../shared/lib/format'

export type PrizeLevel = '一等奖' | '二等奖' | '三等奖' | '四等奖' | '五等奖' | '六等奖' | '七等奖' | '未中奖'

export type SimulationMatchPrize = {
  level: PrizeLevel
  count: number
}

export type SimulationMatchRecord = {
  period: string
  date: string
  redHits: string[]
  blueHits: string[]
  totalWinningBets: number
  topPrizeLevel: PrizeLevel
  prizes: SimulationMatchPrize[]
  actualResult: LotteryDraw
}

export function normalizeSimulationTicket(ticket: SimulationTicketRecord): SimulationTicketRecord {
  return {
    ...ticket,
    front_numbers: (ticket.front_numbers || []).map(padBall).sort(),
    back_numbers: (ticket.back_numbers || []).map(padBall).sort(),
    bet_count: Number(ticket.bet_count || 0),
    amount: Number(ticket.amount || 0),
    created_at: ticket.created_at || '',
  }
}

export function buildBallRange(limit: number) {
  return Array.from({ length: limit }, (_, index) => padBall(index + 1))
}

export function calculateBetCount(frontCount: number, backCount: number) {
  if (frontCount < 5 || backCount < 2) return 0
  return combination(frontCount, 5) * combination(backCount, 2)
}

export function calculateAmount(frontCount: number, backCount: number) {
  return calculateBetCount(frontCount, backCount) * 2
}

export function createRandomSelection() {
  return {
    front: pickRandomBalls(buildBallRange(35), 5),
    back: pickRandomBalls(buildBallRange(12), 2),
  }
}

export function buildSimulationMatches(frontNumbers: string[], backNumbers: string[], draws: LotteryDraw[], limit: 30 | 50) {
  const normalizedFront = frontNumbers.map(padBall).sort()
  const normalizedBack = backNumbers.map(padBall).sort()
  return draws.slice(0, limit).map((draw) => {
    const redHits = normalizedFront.filter((ball) => draw.red_balls.includes(ball))
    const blueHits = normalizedBack.filter((ball) => draw.blue_balls.includes(ball))
    const prizes = calculatePrizeBreakdown(normalizedFront.length, normalizedBack.length, redHits.length, blueHits.length)
    const winningPrizes = prizes.filter((item) => item.count > 0)
    return {
      period: draw.period,
      date: draw.date,
      redHits,
      blueHits,
      totalWinningBets: winningPrizes.reduce((sum, item) => sum + item.count, 0),
      topPrizeLevel: winningPrizes[0]?.level || '未中奖',
      prizes: winningPrizes,
      actualResult: draw,
    } satisfies SimulationMatchRecord
  })
}

export function calculatePrizeBreakdown(frontCount: number, backCount: number, redHitCount: number, blueHitCount: number) {
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
