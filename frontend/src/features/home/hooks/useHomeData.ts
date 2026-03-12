import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../../shared/api/client'
import { normalizeCurrentPredictions, normalizeDraw, normalizePredictionsHistory } from '../lib/home'

export function currentPredictionsQueryOptions() {
  return {
    queryKey: ['current-predictions'],
    queryFn: async () => normalizeCurrentPredictions(await apiClient.getCurrentPredictions()),
  }
}

export function useHomeData(predictionLimit: number, lotteryPage: number, lotteryPageSize: number) {
  const currentPredictions = useQuery({
    ...currentPredictionsQueryOptions(),
  })

  const lotteryCharts = useQuery({
    queryKey: ['lottery-history', 'charts'],
    queryFn: async () => {
      const data = await apiClient.getLotteryHistory({ limit: 120, offset: 0 })
      return {
        ...data,
        data: data.data.map(normalizeDraw),
      }
    },
  })

  const predictionsHistory = useQuery({
    queryKey: ['predictions-history', predictionLimit],
    queryFn: async () => normalizePredictionsHistory(await apiClient.getPredictionsHistory({ limit: predictionLimit, offset: 0 })),
  })

  const pagedLotteryHistory = useQuery({
    queryKey: ['lottery-history', 'paged', lotteryPage, lotteryPageSize],
    queryFn: async () => {
      const data = await apiClient.getLotteryHistory({
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
