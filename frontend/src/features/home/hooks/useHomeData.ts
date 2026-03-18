import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../../shared/api/client'
import type { LotteryCode } from '../../../shared/types/api'
import { normalizeCurrentPredictions, normalizeDraw, normalizePredictionsHistoryList } from '../lib/home'

export function currentPredictionsQueryOptions(lotteryCode: LotteryCode = 'dlt') {
  return {
    queryKey: ['current-predictions', lotteryCode],
    queryFn: async () => normalizeCurrentPredictions(await apiClient.getCurrentPredictions(lotteryCode)),
  }
}

export function useHomeData(lotteryCode: LotteryCode, predictionLimit: number, lotteryPage: number, lotteryPageSize: number) {
  const currentPredictions = useQuery({
    ...currentPredictionsQueryOptions(lotteryCode),
  })

  const lotteryCharts = useQuery({
    queryKey: ['lottery-history', lotteryCode, 'charts'],
    queryFn: async () => {
      const data = await apiClient.getLotteryHistory({ lottery_code: lotteryCode, limit: 120, offset: 0 })
      return {
        ...data,
        data: data.data.map(normalizeDraw),
      }
    },
  })

  const predictionsHistory = useQuery({
    queryKey: ['predictions-history', lotteryCode, predictionLimit],
    queryFn: async () => normalizePredictionsHistoryList(await apiClient.getPredictionsHistoryList({ lottery_code: lotteryCode, limit: predictionLimit, offset: 0 })),
  })

  const pagedLotteryHistory = useQuery({
    queryKey: ['lottery-history', lotteryCode, 'paged', lotteryPage, lotteryPageSize],
    queryFn: async () => {
      const data = await apiClient.getLotteryHistory({
        lottery_code: lotteryCode,
        limit: lotteryPageSize,
        offset: (lotteryPage - 1) * lotteryPageSize,
      })
      return {
        ...data,
        data: data.data.map(normalizeDraw),
      }
    },
  })

  return {
    currentPredictions,
    lotteryCharts,
    predictionsHistory,
    pagedLotteryHistory,
  }
}
