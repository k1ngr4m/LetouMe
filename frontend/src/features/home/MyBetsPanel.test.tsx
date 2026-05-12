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

  it('defaults to table view and opens the detail modal from a row', async () => {
    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })
    expect(await screen.findByText('第 2026032 期')).toBeInTheDocument()
    expect(document.querySelector('.my-bets-summary-grid')).not.toBeInTheDocument()

    const table = document.querySelector('.my-bets-table') as HTMLElement
    expect(table).not.toBeNull()
    const recordScroll = screen.getByTestId('my-bets-record-scroll')
    expect(recordScroll.contains(table)).toBe(true)
    const pagination = document.querySelector('.my-bets-pagination') as HTMLElement
    expect(pagination).not.toBeNull()
    expect(recordScroll.contains(pagination)).toBe(false)
    expect(screen.queryByLabelText('来源')).not.toBeInTheDocument()
    expect(within(table).getByText('注数/倍数')).toBeInTheDocument()
    expect(within(table).getByText('1 注 / 2 倍')).toBeInTheDocument()
    expect(within(table).getByText('九等奖 · 中 1 注')).toBeInTheDocument()

    await userEvent.click(within(table).getByText('九等奖 · 中 1 注'))
    const dialog = await screen.findByRole('dialog', { name: /第 2026032 期/ })
    expect(within(dialog).getByText('开奖号码')).toBeInTheDocument()
    expect(within(dialog).getByText('创建时间')).toBeInTheDocument()
    expect(within(dialog).getByText('更新时间')).toBeInTheDocument()
    expect(within(dialog).queryByText('结算时间')).not.toBeInTheDocument()
    expect(within(dialog).getByText('子注单 #1 · 大乐透')).toBeInTheDocument()
    expect(within(dialog).getByText('总奖金')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('toggles summary cards from the toolbar', async () => {
    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })
    await screen.findByText('第 2026032 期')

    expect(document.querySelector('.my-bets-summary-grid')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '显示汇总' }))
    await screen.findByText('投注笔数')
    const summaryGrid = document.querySelector('.my-bets-summary-grid')
    expect(summaryGrid).toBeInTheDocument()
    expect(within(summaryGrid as HTMLElement).getByText('投注笔数')).toBeInTheDocument()
    expect(within(summaryGrid as HTMLElement).getByText('总投入')).toBeInTheDocument()
    expect(within(summaryGrid as HTMLElement).getByText('累计盈亏')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '隐藏汇总' }))
    expect(document.querySelector('.my-bets-summary-grid')).not.toBeInTheDocument()
  })

  it('keeps table row actions from opening the detail modal', async () => {
    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })
    await screen.findByText('第 2026032 期')

    await userEvent.click(screen.getByRole('button', { name: '删除：第 2026032 期' }))

    await waitFor(() => expect(deleteMyBet).toHaveBeenCalledWith(1, 'dlt'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('paginates my-bets records and supports page size changes', async () => {
    getMyBets.mockImplementation(async ({ limit = 20, offset = 0 }) => ({
      records: Array.from({ length: Math.min(limit, Math.max(25 - offset, 0)) }, (_, index) =>
        buildRecord({
          id: offset + index + 1,
          target_period: String(2026032 - offset - index),
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
    }))

    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })
    await waitFor(() => expect(getMyBets).toHaveBeenCalledWith(expect.objectContaining({ lottery_code: 'dlt', limit: 20, offset: 0 })))
    expect(await screen.findByText('第 2026032 期')).toBeInTheDocument()
    expect(screen.queryByText('第 2026012 期')).not.toBeInTheDocument()
    expect(screen.getByText('共25条')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '2' }))
    await waitFor(() => expect(getMyBets).toHaveBeenCalledWith(expect.objectContaining({ lottery_code: 'dlt', limit: 20, offset: 20 })))
    expect(await screen.findByText('第 2026012 期')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('每页条数'), '10')
    await waitFor(() => expect(getMyBets).toHaveBeenCalledWith(expect.objectContaining({ lottery_code: 'dlt', limit: 10, offset: 20 })))
    expect(await screen.findByText('第 2026012 期')).toBeInTheDocument()
    expect(screen.queryByText('第 2026022 期')).not.toBeInTheDocument()
  })

  it('sends my-bets filters with the paginated request', async () => {
    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })

    expect(screen.getByRole('button', { name: '期号条件符：包含' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '玩法条件符：等于' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '状态条件符：等于' })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('筛选期号'), '2603')
    await userEvent.click(screen.getByRole('button', { name: '期号条件符：包含' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: '等于' }))
    await userEvent.selectOptions(screen.getByLabelText('筛选玩法'), 'dlt_dantuo')
    await userEvent.selectOptions(screen.getByLabelText('筛选状态'), 'settled')
    await userEvent.type(screen.getByLabelText('筛选开始日期'), '2026-04-01')
    await userEvent.type(screen.getByLabelText('筛选结束日期'), '2026-04-30')

    await waitFor(() =>
      expect(getMyBets).toHaveBeenLastCalledWith({
        lottery_code: 'dlt',
        limit: 20,
        offset: 0,
        period_query: '2603',
        period_query_operator: 'eq',
        play_type_filter: 'dlt_dantuo',
        play_type_filter_operator: 'eq',
        settlement_status_filter: 'settled',
        settlement_status_filter_operator: 'eq',
        date_start: '2026-04-01',
        date_start_operator: 'gte',
        date_end: '2026-04-30',
        date_end_operator: 'lte',
      }),
    )
  })

  it('hides the field input when the operator is empty', async () => {
    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })

    await userEvent.click(screen.getByRole('button', { name: '期号条件符：包含' }))
    await userEvent.click(screen.getByRole('menuitemradio', { name: '为空' }))

    expect(screen.queryByLabelText('筛选期号')).not.toBeInTheDocument()
  })

  it('opens the detail modal from the card detail action', async () => {
    renderPanel()
    await screen.findByRole('heading', { name: '我的投注' })
    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))
    await userEvent.click(await screen.findByRole('button', { name: '查看详情' }))

    const dialog = await screen.findByRole('dialog', { name: /第 2026032 期/ })
    expect(within(dialog).getByText('子注单明细')).toBeInTheDocument()
  })
})
