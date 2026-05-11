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

describe('HomePage history dashboard', () => {
  it('shows history win rates and period cost summary', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()

    expect(within(historySection as HTMLElement).getAllByText('按期中奖率 100%').length).toBeGreaterThan(0)
    expect(within(historySection as HTMLElement).getAllByText('按注中奖率 20%').length).toBeGreaterThan(0)
    expect(within(historySection as HTMLElement).getAllByText('成本 20 元').length).toBeGreaterThan(0)
    expect(within(historySection as HTMLElement).getAllByText('奖金 305 元').length).toBeGreaterThan(0)

    const firstHistoryCard = (await screen.findByText('第 2026031 期')).closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    expect(firstHistoryCard?.parentElement).toHaveClass('history-card-list__records')
    expect(within(firstHistoryCard as HTMLElement).getAllByText('注数').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('成本').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('奖金').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('10 元').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getByText('300 元')).toBeInTheDocument()
  }, 10000)

  it('exports a single history record card png', async () => {
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    await userEvent.click(screen.getByRole('button', { name: '导出开奖回溯：第 2026031 期' }))

    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1))
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('导出成功，已开始下载。')
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/history')

    anchorClickSpy.mockRestore()
  })

  it('shows error toast when export summary fails and auto dismisses it', async () => {
    toPng.mockRejectedValueOnce(new Error('boom'))
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '导出统计' }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('统计导出失败，请稍后重试。'))
    expect(screen.getByRole('status')).toHaveClass('is-error')

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 2500 })
  })

  it('paginates history records and supports page size changes', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()

    expect(within(historySection as HTMLElement).getByText('第 1 / 1 页')).toBeInTheDocument()
    expect(within(historySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    expect(screen.getByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.getByText('第 2026021 期')).toBeInTheDocument()

    await userEvent.selectOptions(within(historySection as HTMLElement).getByRole('combobox'), '10')

    expect(within(historySection as HTMLElement).getByText('第 1 / 2 页')).toBeInTheDocument()
    expect(screen.queryByText('第 2026021 期')).not.toBeInTheDocument()

    await userEvent.click(within(historySection as HTMLElement).getByRole('button', { name: '下一页' }))

    expect(within(historySection as HTMLElement).getByText('第 2 / 2 页')).toBeInTheDocument()
    expect(screen.getByText('第 2026021 期')).toBeInTheDocument()
    expect(screen.queryByText('第 2026031 期')).not.toBeInTheDocument()

    await userEvent.selectOptions(within(historySection as HTMLElement).getByRole('combobox'), '20')

    expect(within(historySection as HTMLElement).getByText('第 1 / 1 页')).toBeInTheDocument()
    expect(screen.getByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.getByText('第 2026021 期')).toBeInTheDocument()
  })

  it('filters history records by selected strategy', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()
    expect(within(historySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    expect(within(historySection as HTMLElement).getByText('第 2026030 期')).toBeInTheDocument()

    await userEvent.click(within(historySection as HTMLElement).getByRole('button', { name: '增强型热号追随者' }))

    await waitFor(() => {
      expect(within(historySection as HTMLElement).getByText('共 11 条记录')).toBeInTheDocument()
    })
    expect(within(historySection as HTMLElement).queryByText('第 2026030 期')).not.toBeInTheDocument()
    expect(within(historySection as HTMLElement).getByText('第 2026031 期')).toBeInTheDocument()

    await userEvent.click(within(historySection as HTMLElement).getByRole('button', { name: '清空方案' }))

    await waitFor(() => {
      expect(within(historySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    })
    expect(within(historySection as HTMLElement).getByText('第 2026030 期')).toBeInTheDocument()
  })

  it('applies history strategy from page 2 with one click', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()

    await userEvent.selectOptions(within(historySection as HTMLElement).getByRole('combobox'), '10')
    await userEvent.click(within(historySection as HTMLElement).getByRole('button', { name: '下一页' }))
    expect(within(historySection as HTMLElement).getByText('第 2 / 2 页')).toBeInTheDocument()
    expect(within(historySection as HTMLElement).getByText('第 2026021 期')).toBeInTheDocument()

    const strategyButton = within(historySection as HTMLElement).getByRole('button', { name: '增强型热号追随者' })
    await userEvent.click(strategyButton)

    await waitFor(() => {
      expect(within(historySection as HTMLElement).getByText('第 1 / 2 页')).toBeInTheDocument()
    })
    expect(strategyButton).toHaveClass('is-active')
    expect(within(historySection as HTMLElement).getByText('第 2026031 期')).toBeInTheDocument()
    expect(within(historySection as HTMLElement).queryByText('第 2026030 期')).not.toBeInTheDocument()
  })

  it('keeps selected history strategy during refetch gap', async () => {
    simulateHistoryFilterLoading.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()

    const strategyButton = within(historySection as HTMLElement).getByRole('button', { name: '增强型热号追随者' })
    await userEvent.click(strategyButton)

    expect(strategyButton).toHaveClass('is-active')
    await waitFor(() => {
      expect(screen.queryByText('正在加载大乐透预测控制台...')).not.toBeInTheDocument()
      expect(within(historySection as HTMLElement).getByText('正在更新方案筛选结果...')).toBeInTheDocument()
      expect(within(historySection as HTMLElement).getByText('共 12 条记录')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(within(historySection as HTMLElement).getByText('共 11 条记录')).toBeInTheDocument()
    })
    expect(strategyButton).toHaveClass('is-active')
    expect(within(historySection as HTMLElement).queryByText('第 2026030 期')).not.toBeInTheDocument()
  })
})
