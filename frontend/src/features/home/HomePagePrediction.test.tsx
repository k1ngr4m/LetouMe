import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  createMyBet,
  createSimulationTicket,
  deleteMyBet,
  deleteSimulationTicket,
  getMyBets,
  getPredictionsHistoryDetail,
  getSimulationTickets,
  quoteSimulationTicket,
  recognizeMyBetByImage,
  updateMyBet,
  uploadMyBetOCRImage,
  simulateDltModeCoexistCurrentPredictions,
  simulateDltCompoundCurrentPredictions,
  simulateDltDantuoCurrentPredictions,
  simulateDltInactiveHistoryModel,
  simulatePl3SumCurrentPredictions,
  simulatePl3SumHistoryMislabel,
  simulateJackpotPoolData,
  simulateHistoryFilterLoading,
  homeDataArgsCapture,
  toPng,
  renderPage,
} from './HomePage.testUtils'

describe('HomePage prediction smoke', () => {
  it('renders prediction overview summary', () => {
    renderPage()
    expect(screen.getByLabelText('当前预测摘要')).toBeInTheDocument()
  })
})
