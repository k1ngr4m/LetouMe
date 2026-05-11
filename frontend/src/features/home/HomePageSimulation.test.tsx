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

describe('HomePage simulation dashboard', () => {
  it('supports simulation pick, matching, save and delete flows', async () => {
    getSimulationTickets
      .mockResolvedValueOnce({ tickets: [] })
      .mockResolvedValueOnce({
        tickets: [
          {
            id: 11,
            front_numbers: ['01', '02', '03', '04', '05'],
            back_numbers: ['06', '07'],
            bet_count: 1,
            amount: 2,
            created_at: '2026-03-18T00:00:00Z',
          },
        ],
      })
      .mockResolvedValueOnce({ tickets: [] })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 01' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 02' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 03' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 04' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 05' }))
    await userEvent.click(screen.getByRole('button', { name: '后区 06' }))
    await userEvent.click(screen.getByRole('button', { name: '后区 07' }))

    expect(screen.getByText('已选 1 注，共 2 元')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '历史中奖匹配' }))
    expect(await screen.findByText('一等奖')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '仅展示中奖期数' })).not.toBeChecked()
    const winningCard = screen.getByText('第 2026031 期').closest('.simulation-match-card')
    expect(winningCard).not.toBeNull()
    expect(winningCard).toHaveClass('is-winning')

    await userEvent.click(screen.getByRole('button', { name: '保存方案' }))

    await waitFor(() => {
      expect(createSimulationTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'dlt',
          play_type: 'dlt',
          front_numbers: ['01', '02', '03', '04', '05'],
          back_numbers: ['06', '07'],
          direct_hundreds: [],
          direct_tens: [],
          direct_units: [],
          group_numbers: [],
        }),
      )
    })

    expect(await screen.findByText('方案 #11')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(deleteSimulationTicket).toHaveBeenCalledWith(11, 'dlt'))
  })

  it('filters simulation matches to winning periods only', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 01' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 02' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 03' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 04' }))
    await userEvent.click(screen.getByRole('button', { name: '前区 05' }))
    await userEvent.click(screen.getByRole('button', { name: '后区 06' }))
    await userEvent.click(screen.getByRole('button', { name: '后区 07' }))
    await userEvent.click(screen.getByRole('button', { name: '历史中奖匹配' }))

    expect(await screen.findByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.getByText('第 2026030 期')).toBeInTheDocument()
    const winningCard = screen.getByText('第 2026031 期').closest('.simulation-match-card')
    const nonWinningCard = screen.getByText('第 2026030 期').closest('.simulation-match-card')
    expect(winningCard).toHaveClass('is-winning')
    expect(nonWinningCard).not.toHaveClass('is-winning')

    await userEvent.click(screen.getByRole('checkbox', { name: '仅展示中奖期数' }))

    expect(screen.getByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.queryByText('第 2026030 期')).not.toBeInTheDocument()
  })

  it('supports historical matching from saved simulation ticket card', async () => {
    getSimulationTickets.mockResolvedValueOnce({
      tickets: [
        {
          id: 31,
          lottery_code: 'dlt',
          play_type: 'dlt',
          front_numbers: ['01', '02', '03', '04', '05'],
          back_numbers: ['06', '07'],
          bet_count: 1,
          amount: 2,
          created_at: '2026-03-18T00:00:00Z',
        },
      ],
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))

    const savedTicketRow = (await screen.findByText('方案 #31')).closest('.simulation-saved-card')
    expect(savedTicketRow).not.toBeNull()
    expect(within(savedTicketRow as HTMLElement).getByText('2026-03-18 08:00')).toBeInTheDocument()
    expect(within(savedTicketRow as HTMLElement).getByText('复式 · 1 注')).toBeInTheDocument()
    expect(within(savedTicketRow as HTMLElement).getByText('2 元')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '历史匹配' }))

    expect(await screen.findByText('来源 方案 #31')).toBeInTheDocument()
    expect(screen.getByText('将方案 #31与近 30 期开奖数据进行对比，展示命中号码和最高奖级。')).toBeInTheDocument()
    expect(screen.getByText('第 2026031 期')).toBeInTheDocument()
    expect(savedTicketRow).toHaveClass('is-active-match')
  })

  it('shows empty state when winning-only filter hides all simulation matches and resets on reselection', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    await userEvent.click(screen.getByRole('button', { name: '百位 00' }))
    await userEvent.click(screen.getByRole('button', { name: '十位 00' }))
    await userEvent.click(screen.getByRole('button', { name: '个位 00' }))
    await userEvent.click(screen.getByRole('button', { name: '历史中奖匹配' }))

    expect(await screen.findByText('第 2026031 期')).toBeInTheDocument()

    const winningOnlyToggle = screen.getByRole('checkbox', { name: '仅展示中奖期数' })
    await userEvent.click(winningOnlyToggle)
    expect(screen.getByText('当前筛选条件下没有中奖期数。')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '个位 00' }))
    await userEvent.click(screen.getByRole('button', { name: '个位 01' }))
    await userEvent.click(screen.getByRole('button', { name: '历史中奖匹配' }))

    expect(screen.getByRole('checkbox', { name: '仅展示中奖期数' })).not.toBeChecked()
  })

  it('calculates multiple bet count in simulation tab', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    for (const ball of ['01', '02', '03', '04', '05', '06']) {
      await userEvent.click(screen.getByRole('button', { name: `前区 ${ball}` }))
    }
    for (const ball of ['07', '08', '09']) {
      await userEvent.click(screen.getByRole('button', { name: `后区 ${ball}` }))
    }

    expect(screen.getByText('已选 18 注，共 36 元')).toBeInTheDocument()
  })

  it('supports dlt dantuo mode in simulation tab', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    const dltModeSwitch = screen.getByRole('tablist', { name: '大乐透玩法切换' })
    await userEvent.click(within(dltModeSwitch).getByRole('button', { name: '胆拖' }))

    await userEvent.click(screen.getByRole('button', { name: '前胆 01' }))
    for (const ball of ['02', '03', '04', '05', '06']) {
      await userEvent.click(screen.getByRole('button', { name: `前拖 ${ball}` }))
    }
    await userEvent.click(screen.getByRole('button', { name: '后胆 01' }))
    await userEvent.click(screen.getByRole('button', { name: '后拖 07' }))
    await userEvent.click(screen.getByRole('button', { name: '后拖 08' }))

    expect(screen.getByText('已选 10 注，共 20 元')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '保存方案' }))
    await waitFor(() => {
      expect(createSimulationTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'dlt',
          play_type: 'dlt_dantuo',
          front_dan: ['01'],
          front_tuo: ['02', '03', '04', '05', '06'],
          back_dan: ['01'],
          back_tuo: ['07', '08'],
        }),
      )
    })
  })

  it('supports pl3 direct_sum mode in simulation tab', async () => {
    getSimulationTickets
      .mockResolvedValueOnce({ tickets: [] })
      .mockResolvedValueOnce({
        tickets: [
          {
            id: 21,
            lottery_code: 'pl3',
            play_type: 'direct_sum',
            sum_values: ['10', '11'],
            bet_count: 132,
            amount: 264,
            created_at: '2026-03-18T00:00:00Z',
          },
        ],
      })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    const pl3ModeSwitch = screen.getByRole('tablist', { name: '排列3玩法切换' })
    await userEvent.click(within(pl3ModeSwitch).getByRole('button', { name: '直选和值' }))

    expect(screen.getByRole('button', { name: '直选和值 10' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '百位 00' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '直选和值 10' }))
    await userEvent.click(screen.getByRole('button', { name: '直选和值 11' }))

    expect(screen.getByText('已选 132 注，共 264 元')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '保存方案' }))

    await waitFor(() => {
      expect(createSimulationTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'pl3',
          play_type: 'direct_sum',
          sum_values: ['10', '11'],
        }),
      )
    })

    expect(await screen.findByText('方案 #21')).toBeInTheDocument()
    expect(screen.getByText('直选和值 · 132 注')).toBeInTheDocument()
  })

  it('supports pl3 group_sum mode in simulation tab', async () => {
    getSimulationTickets
      .mockResolvedValueOnce({ tickets: [] })
      .mockResolvedValueOnce({
        tickets: [
          {
            id: 22,
            lottery_code: 'pl3',
            play_type: 'group_sum',
            sum_values: ['03'],
            bet_count: 2,
            amount: 4,
            created_at: '2026-03-18T00:00:00Z',
          },
        ],
      })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))
    const pl3ModeSwitch = screen.getByRole('tablist', { name: '排列3玩法切换' })
    await userEvent.click(within(pl3ModeSwitch).getByRole('button', { name: '组选和值' }))

    expect(screen.getByRole('button', { name: '组选和值 03' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '百位 00' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '组选和值 03' }))

    expect(screen.getByText('已选 2 注，共 4 元')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '保存方案' }))

    await waitFor(() => {
      expect(createSimulationTicket).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'pl3',
          play_type: 'group_sum',
          sum_values: ['03'],
        }),
      )
    })

    expect(await screen.findByText('方案 #22')).toBeInTheDocument()
    expect(screen.getByText('组选和值 · 2 注')).toBeInTheDocument()
  })

  it('shows dedicated qxc simulation picker, summary and saved ticket layout', async () => {
    getSimulationTickets.mockResolvedValueOnce({
      tickets: [
        {
          id: 41,
          lottery_code: 'qxc',
          play_type: 'qxc_compound',
          position_selections: [['09'], ['09'], ['06'], ['09'], ['04'], ['00'], ['01', '02']],
          bet_count: 2,
          amount: 4,
          created_at: '2026-03-18T00:00:00Z',
        },
      ],
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '七星彩' }))
    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))

    expect(screen.getByText('七星彩复式选号')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '第七位选号 14' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '随机一注' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空全部' })).toBeDisabled()
    expect(screen.getByText('方案 #41')).toBeInTheDocument()
    expect(screen.getAllByText('第七位').length).toBeGreaterThan(0)
    expect(screen.getByText('复式 · 2 注')).toBeInTheDocument()
  })

  it('supports qxc random pick, per-position clear and global clear', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '七星彩' }))
    await userEvent.click(screen.getByRole('button', { name: '模拟试玩' }))

    await userEvent.click(screen.getByRole('button', { name: '随机一注' }))
    expect(screen.getByText('已选 1 注，共 2 元')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空全部' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: '清空第一位选号' }))
    expect(screen.getByText('已选 0 注，共 0 元')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '第一位选号 00' }))
    await userEvent.click(screen.getByRole('button', { name: '第二位选号 01' }))
    await userEvent.click(screen.getByRole('button', { name: '第三位选号 02' }))
    await userEvent.click(screen.getByRole('button', { name: '第四位选号 03' }))
    await userEvent.click(screen.getByRole('button', { name: '第五位选号 04' }))
    await userEvent.click(screen.getByRole('button', { name: '第六位选号 05' }))
    await userEvent.click(screen.getByRole('button', { name: '第七位选号 14' }))
    expect(screen.getByText('已选 1 注，共 2 元')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '清空全部' }))
    expect(screen.getByText('已选 0 注，共 0 元')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空全部' })).toBeDisabled()
  })
})
