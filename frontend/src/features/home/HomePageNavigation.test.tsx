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

describe('HomePage navigation', () => {
  it('updates url when switching dashboard tabs', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/history')
  })

  it('navigates to rules page from tab strip', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '规则' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/rules')
  })
})
