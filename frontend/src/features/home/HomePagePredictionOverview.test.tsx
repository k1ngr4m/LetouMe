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

describe('HomePage prediction overview', () => {
it('shows standalone summary cards between disclaimer and model list on prediction tab', () => {
    renderPage()

    expect(screen.queryByText('Prediction Command Center')).not.toBeInTheDocument()

    const summary = screen.getByLabelText('当前预测摘要')
    expect(within(summary).getByText('目标期号')).toBeInTheDocument()
    expect(within(summary).getByText('下期开奖日')).toBeInTheDocument()
    expect(within(summary).getByText('预测日期')).toBeInTheDocument()
    expect(within(summary).getByText('开奖状态')).toBeInTheDocument()
    expect(within(summary).getByText('本期奖池')).toBeInTheDocument()
    expect(within(summary).getByText('—')).toBeInTheDocument()

    const modelSectionTitle = screen.getByRole('heading', { name: '模型列表' })
    expect(summary.compareDocumentPosition(modelSectionTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: '专家方案' })).not.toBeInTheDocument()
  })

  it('shows jackpot amount when draw provides jackpot data', () => {
    simulateJackpotPoolData.current = true
    renderPage()

    const summary = screen.getByLabelText('当前预测摘要')
    expect(within(summary).getByText('本期奖池')).toBeInTheDocument()
    expect(within(summary).getByText('1.23 亿元')).toBeInTheDocument()
  })

  it('shows local sidebar navigation on prediction tab', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: '模型列表' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '预测统计' })).toBeInTheDocument()
    expect(screen.queryByText('评分加权')).not.toBeInTheDocument()
  })

  it('filters model list with model provider, tag and score range', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    await userEvent.click(screen.getByRole('button', { name: 'deepseek' }))
    await userEvent.click(screen.getByRole('button', { name: '81-100 分' }))

    expect(screen.getByText('已显示 0 / 2 个模型')).toBeInTheDocument()
    expect(screen.getByText('没有符合当前筛选条件的模型。')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '清空筛选' }))

    await waitFor(() => {
      expect(screen.getByText('已显示 2 / 2 个模型')).toBeInTheDocument()
    })
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('模型B').length).toBeGreaterThan(0)
  })

  it('supports fuzzy-search selection and selected model chips in filter panel', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    const filterPanel = screen.getByText('名称搜索').closest('.model-filter-panel')
    expect(filterPanel).not.toBeNull()
    await userEvent.click(within(filterPanel as HTMLElement).getByRole('button', { name: '清空筛选' }))
    const modelAButtonsAfterClear = within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型A' })
    expect(modelAButtonsAfterClear.length).toBeGreaterThan(0)
    expect(modelAButtonsAfterClear[0]).toHaveClass('is-active')

    await userEvent.type(within(filterPanel as HTMLElement).getByPlaceholderText('按模型名称或ID筛选'), '型a')
    const matchedModelAButton = within(filterPanel as HTMLElement)
      .getAllByRole('button', { name: '模型A' })
      .find((button) => !button.classList.contains('is-inactive'))
    expect(matchedModelAButton).toBeDefined()
    await userEvent.click(matchedModelAButton as HTMLElement)
    const modelAButtonsAfterSelect = within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型A' })
    expect(modelAButtonsAfterSelect.some((button) => button.classList.contains('is-active'))).toBe(true)

    await userEvent.click(within(filterPanel as HTMLElement).getByRole('button', { name: '清空筛选' }))
    const modelAButtonsAfterSecondClear = within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型A' })
    expect(modelAButtonsAfterSecondClear.some((button) => button.classList.contains('is-active'))).toBe(true)
  })

  it('switches model overview across list, card and score views', async () => {
    renderPage()

    expect(screen.getByRole('button', { name: '列表视图' })).toHaveClass('is-active')
    expect(screen.getByRole('columnheader', { name: '模型' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '预测号码' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '评分摘要' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/综合 \d+ · 按注 \d+/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/按期 \d+ · 近期\/长期 \d+\/\d+/).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /查看详情：/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))

    expect(screen.getByRole('button', { name: '卡片视图' })).toHaveClass('is-active')
    expect(screen.getByRole('heading', { name: '模型A' })).toBeInTheDocument()
    expect(screen.getAllByText('本期预测号码').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/综合 \d+/).length).toBeGreaterThan(0)
    expect(screen.queryByText('接口模型')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))

    expect(screen.getByRole('button', { name: '评分视图' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: '收益分排序' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '稳定性排序' })).toBeInTheDocument()
    expect(screen.queryByText('本期预测号码')).not.toBeInTheDocument()
  })

  it('shows per-group cost summary in model list and card views', async () => {
    renderPage()

    expect(screen.getAllByText('成本 1注/2元').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))
    expect(screen.getAllByText('成本 1注/2元').length).toBeGreaterThan(0)
  })
})
