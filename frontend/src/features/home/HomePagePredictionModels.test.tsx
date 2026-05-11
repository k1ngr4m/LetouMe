import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  toPng,
  renderPage,
} from './HomePage.testUtils'

describe('HomePage prediction model views', () => {
  it('removes standalone overall score and api model columns from list view', () => {
    renderPage()

    expect(screen.queryByRole('columnheader', { name: '综合分' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '接口模型' })).not.toBeInTheDocument()
  })

  it('sorts score view by selected score dimension', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))

    const rowsBefore = screen.getAllByRole('row').slice(1)
    expect(within(rowsBefore[0]).getByText('模型A')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '下限分排序' }))

    const rowsAfterFirstSort = screen.getAllByRole('row').slice(1)
    expect(within(rowsAfterFirstSort[0]).getByText('模型A')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '下限分排序' }))

    const rowsAfterSecondSort = screen.getAllByRole('row').slice(1)
    expect(within(rowsAfterSecondSort[0]).getByText('模型B')).toBeInTheDocument()
  })

  it('shows score definition tooltip in score view without affecting sorting', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))

    const profitInfoButton = screen.getByRole('button', { name: '收益分定义' })
    await userEvent.hover(profitInfoButton)

    const tooltip = await screen.findByRole('tooltip')
    expect(within(tooltip).getByText('收益分')).toBeInTheDocument()
    expect(within(tooltip).getByText('反映模型历史奖金回报和盈利能力的评分。')).toBeInTheDocument()

    const rowsAfterHover = screen.getAllByRole('row').slice(1)
    expect(within(rowsAfterHover[0]).getByText('模型A')).toBeInTheDocument()
  })

  it('navigates to model detail page when clicking list row data', async () => {
    renderPage()

    const modelARow = screen.getByRole('button', { name: '查看详情：模型A' }).closest('tr')
    expect(modelARow).not.toBeNull()
    await userEvent.click(within(modelARow as HTMLElement).getByText('openai_compatible'))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/models/model-a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates to model detail page when clicking card data', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))
    await userEvent.click(screen.getByText('openai_compatible'))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/models/model-a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates to model detail page when clicking score row data', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))
    const modelARow = screen.getByText('openai_compatible').closest('tr')
    expect(modelARow).not.toBeNull()
    await userEvent.click(within(modelARow as HTMLElement).getByText('openai_compatible'))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/models/model-a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exports model detail png from list and card views', async () => {
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '更多操作：模型A' }))
    await userEvent.click(screen.getByRole('button', { name: '导出详情' }))
    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1))
    expect(anchorClickSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('导出成功，已开始下载。')
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/prediction')

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))
    await userEvent.click(screen.getByRole('button', { name: '导出详情：模型A' }))
    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status')).toHaveTextContent('导出成功，已开始下载。')

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument(), { timeout: 2500 })

    await userEvent.click(screen.getByRole('button', { name: '评分视图' }))
    expect(screen.queryByRole('button', { name: /导出详情：/ })).not.toBeInTheDocument()

    anchorClickSpy.mockRestore()
  })
})
