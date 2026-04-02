import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react'
import { loadSelectedLottery, saveSelectedLottery } from '../lib/storage'
import type { LotteryCode } from '../types/api'

type LotterySelectionContextValue = {
  selectedLottery: LotteryCode
  setSelectedLottery: (lotteryCode: LotteryCode) => void
  isGlobalSelection: boolean
}

const LotterySelectionContext = createContext<LotterySelectionContextValue | null>(null)

export function LotterySelectionProvider({ children }: PropsWithChildren) {
  const [selectedLottery, setSelectedLotteryState] = useState<LotteryCode>(() => loadSelectedLottery())

  const setSelectedLottery = useCallback((lotteryCode: LotteryCode) => {
    setSelectedLotteryState(lotteryCode)
    saveSelectedLottery(lotteryCode)
  }, [])

  const contextValue = useMemo(
    () => ({
      selectedLottery,
      setSelectedLottery,
      isGlobalSelection: true,
    }),
    [selectedLottery, setSelectedLottery],
  )

  return <LotterySelectionContext.Provider value={contextValue}>{children}</LotterySelectionContext.Provider>
}

export function useLotterySelection() {
  const contextValue = useContext(LotterySelectionContext)
  const [fallbackLottery, setFallbackLotteryState] = useState<LotteryCode>(() => loadSelectedLottery())

  const setFallbackLottery = useCallback((lotteryCode: LotteryCode) => {
    setFallbackLotteryState(lotteryCode)
    saveSelectedLottery(lotteryCode)
  }, [])

  if (contextValue) return contextValue

  return {
    selectedLottery: fallbackLottery,
    setSelectedLottery: setFallbackLottery,
    isGlobalSelection: false,
  }
}
