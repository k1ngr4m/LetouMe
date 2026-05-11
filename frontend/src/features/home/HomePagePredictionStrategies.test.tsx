import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  simulateDltModeCoexistCurrentPredictions,
  simulateDltCompoundCurrentPredictions,
  simulateDltDantuoCurrentPredictions,
  toPng,
  renderPage,
} from './HomePage.testUtils'

describe('HomePage prediction strategies and summary', () => {
  it('shows strategy filters for dlt views', async () => {
    renderPage()

    expect(screen.getByText('方案筛选')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))

    expect(screen.getAllByText('方案筛选').length).toBeGreaterThan(0)
  })

  it('shows strategy filters for pl5 views', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列5' }))
    expect(screen.getByText('方案筛选')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    expect(screen.getByText('方案筛选')).toBeInTheDocument()
    expect(screen.queryByText('当前暂无可选方案')).not.toBeInTheDocument()
  })

  it('hides strategy filters in dlt dantuo mode', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))
    expect(screen.queryByText('方案筛选')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    expect(screen.queryByText('方案筛选')).not.toBeInTheDocument()
    expect(screen.queryByText('正在更新方案筛选结果...')).not.toBeInTheDocument()
  })

  it('shows four dlt dantuo summary sections in prediction overview', async () => {
    simulateDltDantuoCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))

    expect(screen.getByText('前区胆统计')).toBeInTheDocument()
    expect(screen.getByText('前区拖统计')).toBeInTheDocument()
    expect(screen.getByText('后区胆统计')).toBeInTheDocument()
    expect(screen.getByText('后区拖统计')).toBeInTheDocument()
    expect(screen.queryByText('前区统计')).not.toBeInTheDocument()
    expect(screen.queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('keeps dlt direct and dantuo current predictions separate by mode switch', async () => {
    simulateDltModeCoexistCurrentPredictions.current = true
    renderPage()

    expect(screen.queryByText('前胆')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))

    expect(screen.getByText('前胆')).toBeInTheDocument()
    expect(screen.getByText('前拖')).toBeInTheDocument()
  })

  it('uses separate dlt scores for direct compound and dantuo modes', async () => {
    simulateDltModeCoexistCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))
    expect(screen.getByRole('cell', { name: '综合分 72分' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '复式' }))
    expect(screen.getByRole('cell', { name: '综合分 54分' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))
    expect(screen.getByRole('cell', { name: '综合分 88分' })).toBeInTheDocument()
  })

  it('shows four fixed compound groups in dlt prediction overview', async () => {
    simulateDltCompoundCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '复式' }))

    expect(screen.getAllByText('复式').length).toBeGreaterThan(0)
    expect(screen.getByText('成本 6注/12元')).toBeInTheDocument()
    expect(screen.getByText('成本 63注/126元')).toBeInTheDocument()
    expect(screen.getAllByText('01').length).toBeGreaterThan(0)
    expect(screen.getAllByText('27').length).toBeGreaterThan(0)
  })

  it('filters dlt history records by compound mode', async () => {
    simulateDltCompoundCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '复式' })[0])

    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()
    const historyRecords = (historySection as HTMLElement).querySelector('.history-card-list__records')
    expect(historyRecords).not.toBeNull()
    expect(within(historyRecords as HTMLElement).getAllByText('模型A').length).toBeGreaterThan(0)
    expect(within(historyRecords as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
  })

  it('applies model list filters to number summary candidates', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    await userEvent.click(screen.getByRole('button', { name: 'openai_compatible' }))

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()

    expect(within(summarySection as HTMLElement).getByRole('button', { name: '模型A' })).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).queryByRole('button', { name: '模型B' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '81-100 分' }))
    expect(within(summarySection as HTMLElement).getByText('当前筛选条件下没有可统计的模型。')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByRole('button', { name: '导出统计' })).toBeDisabled()
  })

  it('exports prediction summary png from summary card', async () => {
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '导出统计' }))
    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1))
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('导出成功，已开始下载。')
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/prediction')

    anchorClickSpy.mockRestore()
  })

  it('keeps summary model chips visible and marks deselected chips inactive', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()

    const summaryScope = within(summarySection as HTMLElement)
    const modelBChip = summaryScope.getByRole('button', { name: '模型B' })
    expect(modelBChip).toHaveClass('is-active')

    await userEvent.click(modelBChip)
    const modelBInactiveChip = summaryScope.getByRole('button', { name: '模型B' })
    expect(modelBInactiveChip).toHaveClass('is-inactive')
    expect(modelBInactiveChip).not.toHaveClass('is-active')

    await userEvent.click(modelBInactiveChip)
    expect(summaryScope.getByRole('button', { name: '模型B' })).toHaveClass('is-active')
  })

  it('applies selected models consistently to model list, summary and history', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()
    const summaryScope = within(summarySection as HTMLElement)

    await userEvent.click(summaryScope.getByRole('button', { name: '模型B' }))

    const modelTable = document.querySelector('.home-model-list-table tbody')
    expect(modelTable).not.toBeNull()
    expect(within(modelTable as HTMLElement).getByText('模型A')).toBeInTheDocument()
    expect(within(modelTable as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
    expect(summaryScope.getByRole('button', { name: '模型B' })).toHaveClass('is-inactive')

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()
    const historyRecords = (historySection as HTMLElement).querySelector('.history-card-list__records')
    expect(historyRecords).not.toBeNull()
    expect(within(historyRecords as HTMLElement).getAllByText('模型A').length).toBeGreaterThan(0)
    expect(within(historyRecords as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
  })

  it('falls back to all models when the last selected model is cleared', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()
    const summaryScope = within(summarySection as HTMLElement)

    await userEvent.click(summaryScope.getByRole('button', { name: '模型B' }))
    await userEvent.click(summaryScope.getByRole('button', { name: '模型A' }))

    expect(summaryScope.getByRole('button', { name: '模型A' })).toHaveClass('is-active')
    expect(summaryScope.getByRole('button', { name: '模型B' })).toHaveClass('is-active')

    const modelTable = document.querySelector('.home-model-list-table tbody')
    expect(modelTable).not.toBeNull()
    expect(within(modelTable as HTMLElement).getByText('模型A')).toBeInTheDocument()
    expect(within(modelTable as HTMLElement).getByText('模型B')).toBeInTheDocument()
  })

  it('resets selected models to all when clearing filters', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    const filterPanel = screen.getByText('名称搜索').closest('.model-filter-panel')
    expect(filterPanel).not.toBeNull()

    await userEvent.click(within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型B' })[0])
    expect(within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型B' })[0]).toHaveClass('is-inactive')

    await userEvent.click(within(filterPanel as HTMLElement).getByRole('button', { name: '清空筛选' }))

    expect(within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型A' })[0]).toHaveClass('is-active')
    expect(within(filterPanel as HTMLElement).getAllByRole('button', { name: '模型B' })[0]).toHaveClass('is-active')
  })

  it('shows five position summary columns for pl5', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列5' }))

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()
    expect(within(summarySection as HTMLElement).getByText('第一位（万位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第二位（千位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第三位（百位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第四位（十位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第五位（个位）统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(summarySection as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('shows seven position summary columns for qxc', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '七星彩' }))

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()
    expect(within(summarySection as HTMLElement).getByText('第一位统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第二位统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第三位统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第四位统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第五位统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第六位统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).getByText('第七位统计')).toBeInTheDocument()
    expect(within(summarySection as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(summarySection as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('shows matched and unmatched models in summary tooltip', async () => {
    renderPage()

    const summarySection = screen.getByRole('heading', { name: '预测统计' }).closest('section')
    expect(summarySection).not.toBeNull()

    const badge = within(summarySection as HTMLElement).getAllByRole('button', { name: '命中 1/2' })[0]
    await userEvent.hover(badge)

    const tooltip = await screen.findByRole('tooltip')
    const modelA = within(tooltip).getByText('模型A')
    const modelB = within(tooltip).getByText('模型B')

    expect(modelA).toHaveClass('is-hit')
    expect(modelB).not.toHaveClass('is-hit')
  })
})
