import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  createMyBet,
  deleteMyBet,
  getMyBets,
  recognizeMyBetByImage,
  updateMyBet,
  uploadMyBetOCRImage,
  renderPage,
} from './HomePage.testUtils'

describe('HomePage my-bets dashboard', () => {
  it('navigates to my-bets tab from dashboard strip', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '我的投注' }))
    expect(await screen.findByText('我的投注')).toBeInTheDocument()
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/my-bets')
  })

  it('supports create and delete on my-bets tab', async () => {
    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })
    await waitFor(() => expect(screen.getByText('第 2026032 期')).toBeInTheDocument(), { timeout: 10000 })

    await userEvent.click(screen.getByRole('button', { name: '删除：第 2026032 期' }))
    await waitFor(() => expect(deleteMyBet).toHaveBeenCalledWith(1, 'dlt'))

    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.clear(within(formView).getByLabelText('前区号码（逗号分隔）'))
    await userEvent.type(within(formView).getByLabelText('前区号码（逗号分隔）', { exact: true }), '01,02,03,04,05')
    await userEvent.clear(within(formView).getByLabelText('后区号码（逗号分隔）'))
    await userEvent.type(within(formView).getByLabelText('后区号码（逗号分隔）', { exact: true }), '06,07')
    await userEvent.click(within(formView).getByRole('button', { name: '添加投注' }))

    await waitFor(() =>
      expect(createMyBet).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'dlt',
          target_period: '2026032',
          lines: [
            expect.objectContaining({
              play_type: 'dlt',
              front_numbers: ['01', '02', '03', '04', '05'],
              back_numbers: ['06', '07'],
            }),
          ],
        }),
      ),
    )
  })

  it('saves OCR my-bets without uploading the local ticket image to image hosting', async () => {
    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })

    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')
    const imageInput = formView.querySelector("input[type='file']") as HTMLInputElement
    const ticketImage = new File(['ticket-image'], 'ticket.jpg', { type: 'image/jpeg' })

    await userEvent.upload(imageInput, ticketImage)
    await userEvent.click(within(formView).getByRole('button', { name: '开始OCR识别' }))
    await waitFor(() => expect(recognizeMyBetByImage).toHaveBeenCalledWith('dlt', ticketImage))

    await userEvent.click(within(formView).getByRole('button', { name: '添加投注' }))

    await waitFor(() =>
      expect(createMyBet).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'dlt',
          source_type: 'ocr',
          ticket_image_url: '',
          ocr_text: 'mock ocr text',
        }),
      ),
    )
    expect(uploadMyBetOCRImage).not.toHaveBeenCalled()
  })

  it('keeps my-bets details collapsed by default and supports expand controls', async () => {
    getMyBets.mockResolvedValueOnce({
      records: [
        {
          id: 1,
          lottery_code: 'dlt',
          target_period: '2026032',
          play_type: 'dlt',
          front_numbers: ['01', '02', '03', '04', '05'],
          back_numbers: ['06', '07'],
          lines: [
            {
              line_no: 1,
              play_type: 'dlt',
              front_numbers: ['01', '02', '03', '04', '05'],
              back_numbers: ['06', '07'],
              multiplier: 1,
              is_append: false,
              bet_count: 1,
              amount: 2,
            },
          ],
          amount: 2,
          prize_amount: 0,
          net_profit: -2,
          winning_bet_count: 0,
          settlement_status: 'pending',
          created_at: '2026-03-18T00:00:00Z',
          updated_at: '2026-03-18T00:00:00Z',
        },
        {
          id: 2,
          lottery_code: 'dlt',
          target_period: '2026031',
          play_type: 'dlt',
          front_numbers: ['08', '09', '10', '11', '12'],
          back_numbers: ['01', '02'],
          lines: [
            {
              line_no: 1,
              play_type: 'dlt',
              front_numbers: ['08', '09', '10', '11', '12'],
              back_numbers: ['01', '02'],
              multiplier: 1,
              is_append: false,
              bet_count: 1,
              amount: 2,
            },
          ],
          amount: 2,
          prize_amount: 0,
          net_profit: -2,
          winning_bet_count: 0,
          settlement_status: 'pending',
          created_at: '2026-03-17T00:00:00Z',
          updated_at: '2026-03-17T00:00:00Z',
        },
      ],
      summary: {
        total_count: 2,
        total_amount: 4,
        total_prize_amount: 0,
        total_net_profit: -4,
        settled_count: 0,
        pending_count: 2,
      },
    })

    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })
    await screen.findByText('第 2026032 期')
    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))

    expect(screen.queryByText('开奖号码：')).not.toBeInTheDocument()
    expect(screen.queryByText('子注单 #1 · 大乐透')).not.toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: '展开详情' })[0])
    expect(await screen.findByText('开奖号码：')).toBeInTheDocument()
    expect(await screen.findByText('子注单 #1 · 大乐透')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '全部展开' }))
    expect(screen.getAllByRole('button', { name: '收起详情' })).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: '全部收起' }))
    expect(screen.getAllByRole('button', { name: '展开详情' })).toHaveLength(2)
  })

  it('supports dlt dantuo create on my-bets tab', async () => {
    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })

    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.selectOptions(within(formView).getByLabelText('玩法'), 'dlt_dantuo')
    await userEvent.type(within(formView).getByLabelText('前区胆码（逗号分隔）'), '01')
    await userEvent.type(within(formView).getByLabelText('前区拖码（逗号分隔）'), '02,03,04,05,06')
    await userEvent.type(within(formView).getByLabelText('后区胆码（逗号分隔）'), '01')
    await userEvent.type(within(formView).getByLabelText('后区拖码（逗号分隔）'), '07,08')
    await userEvent.click(within(formView).getByRole('button', { name: '添加投注' }))

    await waitFor(() =>
      expect(createMyBet).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'dlt',
          lines: [
            expect.objectContaining({
              play_type: 'dlt_dantuo',
              front_dan: ['01'],
              front_tuo: ['02', '03', '04', '05', '06'],
              back_dan: ['01'],
              back_tuo: ['07', '08'],
            }),
          ],
        }),
      ),
    )
  })

  it('supports qxc create on my-bets tab', async () => {
    window.localStorage.setItem('letoumeSelectedLottery', 'qxc')
    getMyBets.mockResolvedValueOnce({
      records: [],
      summary: {
        total_count: 0,
        total_amount: 0,
        total_prize_amount: 0,
        total_net_profit: 0,
        settled_count: 0,
        pending_count: 0,
      },
    })
    createMyBet.mockResolvedValueOnce({
      record: {
        id: 3,
        lottery_code: 'qxc',
        target_period: '2026032',
        play_type: 'qxc_compound',
        position_selections: [['00', '01'], ['02'], ['03'], ['04'], ['05'], ['06'], ['07', '14']],
        lines: [
          {
            line_no: 1,
            play_type: 'qxc_compound',
            position_selections: [['00', '01'], ['02'], ['03'], ['04'], ['05'], ['06'], ['07', '14']],
            multiplier: 1,
            is_append: false,
            bet_count: 4,
            amount: 8,
          },
        ],
        amount: 8,
        prize_amount: 0,
        net_profit: -8,
        winning_bet_count: 0,
        settlement_status: 'pending',
        created_at: '2026-03-18T00:00:00Z',
        updated_at: '2026-03-18T00:00:00Z',
      },
    })

    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })
    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')

    await userEvent.type(within(formView).getByLabelText('第一位号码（逗号分隔）'), '00,01')
    await userEvent.type(within(formView).getByLabelText('第二位号码（逗号分隔）'), '02')
    await userEvent.type(within(formView).getByLabelText('第三位号码（逗号分隔）'), '03')
    await userEvent.type(within(formView).getByLabelText('第四位号码（逗号分隔）'), '04')
    await userEvent.type(within(formView).getByLabelText('第五位号码（逗号分隔）'), '05')
    await userEvent.type(within(formView).getByLabelText('第六位号码（逗号分隔）'), '06')
    await userEvent.type(within(formView).getByLabelText('第七位号码（逗号分隔）'), '07,14')

    expect(within(formView).getByText('共 1 条子注单 · 预计 4 注 / 8 元（实付 8 元）')).toBeInTheDocument()

    await userEvent.click(within(formView).getByRole('button', { name: '添加投注' }))

    await waitFor(() =>
      expect(createMyBet).toHaveBeenCalledWith(
        expect.objectContaining({
          lottery_code: 'qxc',
          target_period: '2026032',
          lines: [
            expect.objectContaining({
              play_type: 'qxc_compound',
              position_selections: [['00', '01'], ['02'], ['03'], ['04'], ['05'], ['06'], ['07', '14']],
            }),
          ],
        }),
      ),
    )
  })

  it('supports qxc edit on my-bets tab', async () => {
    window.localStorage.setItem('letoumeSelectedLottery', 'qxc')
    getMyBets.mockResolvedValueOnce({
      records: [
        {
          id: 9,
          lottery_code: 'qxc',
          target_period: '2026032',
          play_type: 'qxc_compound',
          position_selections: [['00', '01'], ['02'], ['03'], ['04'], ['05'], ['06'], ['07']],
          lines: [
            {
              line_no: 1,
              play_type: 'qxc_compound',
              position_selections: [['00', '01'], ['02'], ['03'], ['04'], ['05'], ['06'], ['07']],
              multiplier: 1,
              is_append: false,
              bet_count: 2,
              amount: 4,
            },
          ],
          amount: 4,
          prize_amount: 0,
          net_profit: -4,
          winning_bet_count: 0,
          settlement_status: 'pending',
          created_at: '2026-03-18T00:00:00Z',
          updated_at: '2026-03-18T00:00:00Z',
        },
      ],
      summary: {
        total_count: 1,
        total_amount: 4,
        total_prize_amount: 0,
        total_net_profit: -4,
        settled_count: 0,
        pending_count: 1,
      },
    })
    updateMyBet.mockResolvedValueOnce({
      record: {
        id: 9,
        lottery_code: 'qxc',
        target_period: '2026032',
        play_type: 'qxc_compound',
        position_selections: [['00', '01'], ['02'], ['03'], ['04'], ['05'], ['06'], ['07', '14']],
        lines: [
          {
            line_no: 1,
            play_type: 'qxc_compound',
            position_selections: [['00', '01'], ['02'], ['03'], ['04'], ['05'], ['06'], ['07', '14']],
            multiplier: 1,
            is_append: false,
            bet_count: 4,
            amount: 8,
          },
        ],
        amount: 8,
        prize_amount: 0,
        net_profit: -8,
        winning_bet_count: 0,
        settlement_status: 'pending',
        created_at: '2026-03-18T00:00:00Z',
        updated_at: '2026-03-18T00:00:00Z',
      },
    })

    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })
    await screen.findByText('七星彩复式')

    await userEvent.click(screen.getByRole('button', { name: '编辑：第 2026032 期' }))
    const formView = await screen.findByTestId('my-bets-form-view')

    expect(within(formView).getByLabelText('第一位号码（逗号分隔）')).toHaveValue('00,01')
    expect(within(formView).getByLabelText('第七位号码（逗号分隔）')).toHaveValue('07')

    await userEvent.type(within(formView).getByLabelText('第七位号码（逗号分隔）'), ',14')
    await userEvent.click(within(formView).getByRole('button', { name: '保存修改' }))

    await waitFor(() =>
      expect(updateMyBet).toHaveBeenCalledWith(
        expect.objectContaining({
          record_id: 9,
          lottery_code: 'qxc',
          lines: [
            expect.objectContaining({
              play_type: 'qxc_compound',
              position_selections: [['00', '01'], ['02'], ['03'], ['04'], ['05'], ['06'], ['07', '14']],
            }),
          ],
        }),
      ),
    )
  })

  it('shows qxc validation reason when a position is empty or out of range', async () => {
    window.localStorage.setItem('letoumeSelectedLottery', 'qxc')
    getMyBets.mockResolvedValueOnce({
      records: [],
      summary: {
        total_count: 0,
        total_amount: 0,
        total_prize_amount: 0,
        total_net_profit: 0,
        settled_count: 0,
        pending_count: 0,
      },
    })

    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })
    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')

    await userEvent.type(within(formView).getByLabelText('第一位号码（逗号分隔）'), '00')
    await userEvent.type(within(formView).getByLabelText('第二位号码（逗号分隔）'), '10')

    expect(within(formView).getByText('子注单 #1：第二位号码范围需为 00-09。')).toBeInTheDocument()
    expect(within(formView).getByRole('button', { name: '添加投注' })).toBeDisabled()

    await userEvent.clear(within(formView).getByLabelText('第二位号码（逗号分隔）'))
    await userEvent.type(within(formView).getByLabelText('第二位号码（逗号分隔）'), '02')

    expect(within(formView).getByText('子注单 #1：第三位至少选择 1 个号码。')).toBeInTheDocument()
  })

  it('shows explicit dlt dantuo validation reason when back dan exceeds limit', async () => {
    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })

    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.selectOptions(within(formView).getByLabelText('玩法'), 'dlt_dantuo')
    await userEvent.type(within(formView).getByLabelText('前区胆码（逗号分隔）'), '01')
    await userEvent.type(within(formView).getByLabelText('前区拖码（逗号分隔）'), '02,03,04,05,06')
    await userEvent.type(within(formView).getByLabelText('后区胆码（逗号分隔）'), '01,02')
    await userEvent.type(within(formView).getByLabelText('后区拖码（逗号分隔）'), '07,08')

    expect(within(formView).getByText('子注单 #1：后区胆码最多 1 个。')).toBeInTheDocument()
    const submitButton = within(formView).getByRole('button', { name: '添加投注' })
    expect(submitButton).toBeDisabled()
    expect(createMyBet).not.toHaveBeenCalled()

    await userEvent.clear(within(formView).getByLabelText('后区胆码（逗号分隔）'))
    await userEvent.type(within(formView).getByLabelText('后区胆码（逗号分隔）'), '01')

    await waitFor(() => expect(within(formView).getByText('可提交保存。')).toBeInTheDocument())
    expect(submitButton).toBeEnabled()
  })

  it('confirms before returning to list when my-bets form has unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })

    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.type(within(formView).getByLabelText('前区号码（逗号分隔）'), '01,02,03,04,05')

    await userEvent.click(within(formView).getByRole('button', { name: '返回列表' }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(screen.getByTestId('my-bets-form-view')).toBeInTheDocument()

    await userEvent.click(within(formView).getByRole('button', { name: '返回列表' }))
    await waitFor(() => expect(screen.queryByTestId('my-bets-form-view')).not.toBeInTheDocument())

    confirmSpy.mockRestore()
  })

  it('prompts before switching tab when my-bets form has unsaved changes', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)

    renderPage('/dashboard/my-bets')
    await screen.findByRole('heading', { name: '我的投注' })
    await userEvent.click(screen.getByRole('button', { name: '添加投注' }))
    const formView = await screen.findByTestId('my-bets-form-view')
    await userEvent.type(within(formView).getByLabelText('前区号码（逗号分隔）'), '01,02,03,04,05')

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/my-bets')

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    await waitFor(() => expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/history'))

    confirmSpy.mockRestore()
  })
})
