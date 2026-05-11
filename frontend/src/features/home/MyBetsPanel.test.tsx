import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../shared/feedback/ToastProvider'
import { MotionProvider } from '../../shared/theme/MotionProvider'
import { MyBetsPanel } from './MyBetsPanel'

const { deleteMyBet, getMyBets } = vi.hoisted(() => ({
  deleteMyBet: vi.fn(),
  getMyBets: vi.fn(),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    createMyBet: vi.fn(),
    deleteMyBet,
    getMyBets,
    recognizeMyBetByImage: vi.fn(),
    updateMyBet: vi.fn(),
  },
}))

const activeQueryClients: QueryClient[] = []

function buildRecord(overrides = {}) {
  return {
    id: 1,
    lottery_code: 'dlt',
    target_period: '2026032',
    play_type: 'dlt',
    front_numbers: ['01', '02', '03', '04', '05'],
    back_numbers: ['06', '07'],
    direct_ten_thousands: [],
    direct_thousands: [],
    direct_hundreds: [],
    direct_tens: [],
    direct_units: [],
    direct_hundreds_dan: [],
    direct_hundreds_tuo: [],
    direct_tens_dan: [],
    direct_tens_tuo: [],
    direct_units_dan: [],
    direct_units_tuo: [],
    group_numbers: [],
    multiplier: 2,
    is_append: false,
    bet_count: 1,
    amount: 4,
    discount_amount: 1,
    net_amount: 3,
    settlement_status: 'settled',
    winning_bet_count: 1,
    prize_level: '九等奖',
    prize_amount: 10,
    net_profit: 7,
    settled_at: null,
    source_type: 'manual',
    ticket_image_url: '',
    ocr_text: '',
    ocr_provider: null,
    ocr_recognized_at: null,
    ticket_purchased_at: null,
    actual_result: {
      period: '2026032',
      date: '2026-03-18',
      red_balls: ['01', '02', '03', '08', '09'],
      blue_balls: ['06', '12'],
    },
    lines: [
      {
        line_no: 1,
        play_type: 'dlt',
        front_numbers: ['01', '02', '03', '04', '05'],
        back_numbers: ['06', '07'],
        direct_ten_thousands: [],
        direct_thousands: [],
        direct_hundreds: [],
        direct_tens: [],
        direct_units: [],
        direct_hundreds_dan: [],
        direct_hundreds_tuo: [],
        direct_tens_dan: [],
        direct_tens_tuo: [],
        direct_units_dan: [],
        direct_units_tuo: [],
        group_numbers: [],
        multiplier: 2,
        is_append: false,
        bet_count: 1,
        amount: 4,
      },
    ],
    created_at: '2026-03-18T00:00:00Z',
    updated_at: '2026-03-18T00:00:00Z',
    ...overrides,
  }
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  activeQueryClients.push(queryClient)
  return render(
    <QueryClientProvider client={queryClient}>
      <MotionProvider>
        <ToastProvider>
          <MyBetsPanel lotteryCode="dlt" targetPeriod="2026032" />
        </ToastProvider>
      </MotionProvider>
    </QueryClientProvider>,
  )
}

describe('MyBetsPanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
    getMyBets.mockReset()
    getMyBets.mockResolvedValue({
      records: [buildRecord()],
      summary: {
        total_count: 1,
        total_amount: 4,
        total_discount_amount: 1,
        total_net_amount: 3,
        total_prize_amount: 10,
        total_net_profit: 7,
        settled_count: 1,
        pending_count: 0,
      },
    })
    deleteMyBet.mockReset()
    deleteMyBet.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    while (activeQueryClients.length > 0) {
      const client = activeQueryClients.pop()
      client?.unmount()
      client?.clear()
    }
  })

  it('switches to table view and opens the detail modal from a row', async () => {
    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })
    expect(await screen.findByText('第 2026032 期')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '列表视图' }))
    const table = document.querySelector('.my-bets-table') as HTMLElement
    expect(table).not.toBeNull()
    expect(within(table).queryByText('来源/状态')).not.toBeInTheDocument()
    expect(within(table).getByText('注数/倍数')).toBeInTheDocument()
    expect(within(table).getByText('1 注 / 2 倍')).toBeInTheDocument()
    expect(within(table).getByText('九等奖 · 中 1 注')).toBeInTheDocument()

    await userEvent.click(within(table).getByText('九等奖 · 中 1 注'))
    const dialog = await screen.findByRole('dialog', { name: /第 2026032 期/ })
    expect(within(dialog).getByText('开奖号码')).toBeInTheDocument()
    expect(within(dialog).getByText('子注单 #1 · 大乐透')).toBeInTheDocument()
    expect(within(dialog).getByText('总奖金')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps table row actions from opening the detail modal', async () => {
    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })
    await screen.findByText('第 2026032 期')

    await userEvent.click(screen.getByRole('button', { name: '列表视图' }))
    await userEvent.click(screen.getByRole('button', { name: '删除：第 2026032 期' }))

    await waitFor(() => expect(deleteMyBet).toHaveBeenCalledWith(1, 'dlt'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('paginates my-bets records and supports page size changes', async () => {
    getMyBets.mockResolvedValueOnce({
      records: Array.from({ length: 25 }, (_, index) =>
        buildRecord({
          id: index + 1,
          target_period: String(2026032 - index),
          prize_level: null,
          winning_bet_count: 0,
        }),
      ),
      summary: {
        total_count: 25,
        total_amount: 100,
        total_discount_amount: 0,
        total_net_amount: 100,
        total_prize_amount: 0,
        total_net_profit: -100,
        settled_count: 25,
        pending_count: 0,
      },
    })

    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })
    expect(await screen.findByText('第 2026032 期')).toBeInTheDocument()
    expect(screen.queryByText('第 2026012 期')).not.toBeInTheDocument()
    expect(screen.getByText('共25条')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '2' }))
    expect(await screen.findByText('第 2026012 期')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('每页条数'), '10')
    expect(await screen.findByText('第 2026012 期')).toBeInTheDocument()
    expect(screen.queryByText('第 2026022 期')).not.toBeInTheDocument()
  })

  it('opens the detail modal from the card detail action', async () => {
    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })
    await userEvent.click(await screen.findByRole('button', { name: '查看详情' }))

    const dialog = await screen.findByRole('dialog', { name: /第 2026032 期/ })
    expect(within(dialog).getByText('子注单明细')).toBeInTheDocument()
  })
})
