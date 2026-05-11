import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  simulateDltInactiveHistoryModel,
  homeDataArgsCapture,
  toPng,
  renderPage,
} from './HomePage.testUtils'

describe('HomePage chart center', () => {
  it('hides local sidebar navigation outside prediction tab', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))

    expect(screen.queryByRole('button', { name: '模型列表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预测统计' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '预测统计' })).not.toBeInTheDocument()
  })

  it('shows grouped number analysis charts on chart center by default for pl3', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '图表中心' }))

    expect(await screen.findByRole('heading', { name: '百位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '十位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '个位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '和值趋势' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '奇偶结构走势' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '前区热号 Top 12' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '后区热号 Top 12' })).not.toBeInTheDocument()
  })

  it('shows grouped number analysis charts on chart center by default for pl5', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列5' }))
    await userEvent.click(screen.getByRole('button', { name: '图表中心' }))

    expect(await screen.findByRole('heading', { name: '万位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '千位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '百位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '十位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '个位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '和值趋势' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '奇偶结构走势' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '前区热号 Top 12' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '后区热号 Top 12' })).not.toBeInTheDocument()
  })

  it('shows grouped number analysis charts on chart center by default for qxc', async () => {
    window.localStorage.setItem('letoumeSelectedLottery', 'qxc')
    renderPage('/dashboard/charts#number-base')

    expect(await screen.findByRole('heading', { name: '第一位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '第六位热号 Top 10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '第七位热号 Top 15' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '和值趋势' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '奇偶结构走势' })).toBeInTheDocument()
  })

  it('shows base backtest dashboard with filters on backtest base tab', async () => {
    renderPage('/dashboard/charts#backtest-base')

    expect(await screen.findByRole('heading', { name: '命中趋势折线' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '累计盈亏曲线' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '滚动命中率（近 10 期）' })).not.toBeInTheDocument()
    expect(screen.getByText('模型')).toBeInTheDocument()
    expect(screen.getByText('期号')).toBeInTheDocument()
    expect(screen.getByText('方案')).toBeInTheDocument()
    expect(screen.getByText('玩法模式')).toBeInTheDocument()
    expect(screen.getByText('时间维度')).toBeInTheDocument()
    expect(screen.getByText('开始日期')).toBeInTheDocument()
    expect(screen.getByText('结束日期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '近 20 期' })).toHaveClass('is-active')
  })

  it('limits chart center backtest models to active current models', async () => {
    simulateDltInactiveHistoryModel.current = true
    renderPage('/dashboard/charts#backtest-base')

    await screen.findByRole('heading', { name: '命中趋势折线' })
    const modelFilter = screen.getByText('模型').closest('.chart-center-toolbar__section')
    expect(modelFilter).not.toBeNull()
    expect(within(modelFilter as HTMLElement).getByRole('button', { name: '模型A' })).toBeInTheDocument()
    expect(within(modelFilter as HTMLElement).getByRole('button', { name: '模型B' })).toBeInTheDocument()
    expect(within(modelFilter as HTMLElement).queryByRole('button', { name: '停用模型' })).not.toBeInTheDocument()
  })

  it('queries 120 history rows on chart center backtest views', async () => {
    renderPage('/dashboard/charts#backtest-base')

    await screen.findByRole('heading', { name: '命中趋势折线' })
    expect(homeDataArgsCapture.current).toMatchObject({
      historyPage: 1,
      historyPageSize: 120,
    })
  })

  it('keeps paged history query size on history tab', async () => {
    renderPage('/dashboard/history')

    await screen.findByRole('heading', { name: '命中回溯' })
    expect(homeDataArgsCapture.current).toMatchObject({
      historyPage: 1,
      historyPageSize: 20,
    })
  })

  it('shows all revenue analysis charts together', async () => {
    renderPage('/dashboard/charts#backtest-revenue')

    expect(await screen.findByRole('heading', { name: '累计盈亏曲线' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '累计 ROI 曲线' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '模型排名变化图' })).toBeInTheDocument()
  })

  it('shows all stability analysis charts together', async () => {
    renderPage('/dashboard/charts#backtest-stability')
    expect(await screen.findByRole('heading', { name: '滚动命中率（近 10 期）' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '近 10 期' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '最大回撤曲线' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '命中热力图' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '胜负分布图' })).toBeInTheDocument()
  })

  it('hides backtest filters on number analysis views', async () => {
    renderPage('/dashboard/charts#number-base')

    expect(await screen.findByRole('heading', { name: '前区和值趋势' })).toBeInTheDocument()
    expect(screen.getByText('时间维度')).toBeInTheDocument()
    expect(screen.getByText('开始日期')).toBeInTheDocument()
    expect(screen.getByText('结束日期')).toBeInTheDocument()
    expect(screen.queryByText('模型')).not.toBeInTheDocument()
    expect(screen.queryByText('方案')).not.toBeInTheDocument()
  })

  it('shows chart help tooltip next to chart titles', async () => {
    renderPage('/dashboard/charts#number-base')

    const helpButton = await screen.findByRole('button', { name: '前区和值趋势说明' })
    await userEvent.hover(helpButton)

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('展示前区号码和值随期数变化的趋势，用来判断和值是否处于高位、低位或中枢附近震荡。适合观察节奏变化，不适合单独做号码判断。')).toBeInTheDocument()
  })

  it('supports exporting chart card as png and csv on desktop', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chart-export')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    renderPage('/dashboard/charts#number-base')

    const exportButton = await screen.findByRole('button', { name: '导出图表：前区热号 Top 12' })
    await userEvent.click(exportButton)
    await userEvent.click(screen.getByRole('menuitem', { name: '导出 PNG' }))
    await waitFor(() => expect(toPng).toHaveBeenCalledTimes(1))

    await userEvent.click(exportButton)
    await userEvent.click(screen.getByRole('menuitem', { name: '导出 CSV' }))
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledTimes(1))

    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })

  it('hides chart export action on mobile', async () => {
    const matchMediaMock = vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
    const originalMatchMedia = window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    })

    renderPage('/dashboard/charts#number-base')
    await screen.findByRole('heading', { name: '前区热号 Top 12' })

    expect(screen.queryAllByRole('button', { name: /导出图表：/ })).toHaveLength(0)

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    })
  })

  it('disables chart csv export when date range has no chart draws', async () => {
    renderPage('/dashboard/charts#number-base')
    await screen.findByRole('heading', { name: '前区热号 Top 12' })

    await userEvent.type(screen.getByLabelText('开始日期'), '2026-03-11')
    await userEvent.type(screen.getByLabelText('结束日期'), '2026-03-12')

    const exportButton = screen.getByRole('button', { name: '导出图表：前区热号 Top 12' })
    await userEvent.click(exportButton)
    expect(screen.getByRole('menuitem', { name: '导出 CSV' })).toBeDisabled()
  })

  it('applies time filter to backtest charts', async () => {
    renderPage('/dashboard/charts#backtest-base')
    await screen.findByRole('heading', { name: '命中趋势折线' })

    await userEvent.type(screen.getByLabelText('开始日期'), '2026-03-11')
    await userEvent.type(screen.getByLabelText('结束日期'), '2026-03-12')

    const exportButton = screen.getByRole('button', { name: '导出图表：命中趋势折线' })
    await userEvent.click(exportButton)
    expect(screen.getByRole('menuitem', { name: '导出 CSV' })).toBeDisabled()
  })

  it('shows number distribution dashboard charts together', async () => {
    renderPage('/dashboard/charts#number-distribution')

    expect(await screen.findByRole('heading', { name: '前区和值分布' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '奇偶比分布' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '区间占比分布' })).toBeInTheDocument()
    expect(screen.queryByText('模型')).not.toBeInTheDocument()
    expect(screen.queryByText('方案')).not.toBeInTheDocument()
  })

  it('shows qxc number distribution dashboard charts together', async () => {
    window.localStorage.setItem('letoumeSelectedLottery', 'qxc')
    renderPage('/dashboard/charts#number-distribution')

    expect(await screen.findByRole('heading', { name: '和值分布' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '奇偶比分布' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '区间占比分布' })).toBeInTheDocument()
  })

  it('shows number pattern dashboard charts together', async () => {
    renderPage('/dashboard/charts#number-pattern')

    expect(await screen.findByRole('heading', { name: '跨度趋势' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '区间分布' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '012路走势' })).toBeInTheDocument()
    expect(screen.queryByText('模型')).not.toBeInTheDocument()
    expect(screen.queryByText('方案')).not.toBeInTheDocument()
  })

  it('shows qxc number pattern dashboard charts together', async () => {
    window.localStorage.setItem('letoumeSelectedLottery', 'qxc')
    renderPage('/dashboard/charts#number-pattern')

    expect(await screen.findByRole('heading', { name: '跨度趋势' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '区段结构分布' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '012路走势' })).toBeInTheDocument()
  })
})
