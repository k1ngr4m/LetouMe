import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '../../../shared/api/client'
import type { LotteryCode } from '../../../shared/types/api'
import { normalizeCurrentPredictions, normalizeDraw, normalizePredictionsHistoryList } from '../lib/home'

export function currentPredictionsQueryOptions(lotteryCode: LotteryCode = 'dlt') {
  return {
    queryKey: ['current-predictions', lotteryCode],
    queryFn: async () => normalizeCurrentPredictions(await apiClient.getCurrentPredictions(lotteryCode)),
  }
}

export function useHomeData(
  lotteryCode: LotteryCode,
  historyPage: number,
  historyPageSize: number,
  historyStrategyFilters: string[],
  lotteryPage: number,
  lotteryPageSize: number,
) {
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
    queryKey: ['predictions-history', lotteryCode, historyPage, historyPageSize, [...historyStrategyFilters].sort().join('|')],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      normalizePredictionsHistoryList(
        await apiClient.getPredictionsHistoryList({
          lottery_code: lotteryCode,
          limit: historyPageSize,
          offset: (historyPage - 1) * historyPageSize,
          strategy_filters: historyStrategyFilters,
          strategy_match_mode: 'all',
        }),
      ),
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
