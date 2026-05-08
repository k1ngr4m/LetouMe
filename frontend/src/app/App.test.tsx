import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { DISCLAIMER_TEXT } from '../shared/components/SiteDisclaimer'
import { apiClient } from '../shared/api/client'

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    getMessageUnreadCount: vi.fn(),
    getAssistantModels: vi.fn(),
    getAssistantConversations: vi.fn(),
    getAssistantConversationDetail: vi.fn(),
    deleteAssistantConversation: vi.fn(),
    chatWithAssistant: vi.fn(),
    streamAssistantChat: vi.fn(),
    getCurrentPredictions: vi.fn(),
    getMyBets: vi.fn(),
  },
}))

vi.mock('../shared/api/client', () => ({
  apiClient: apiClientMock,
}))

vi.mock('../features/home/HomePage', () => ({
  HomePage: () => <div>Home Page Mock</div>,
}))

vi.mock('../features/home/HomeModelDetailPage', () => ({
  HomeModelDetailPage: () => <div>Home Model Detail Page Mock</div>,
}))
vi.mock('../features/home/HomeRulesPage', () => ({
  HomeRulesPage: () => <div>Home Rules Page Mock</div>,
}))
vi.mock('../features/messages/MessageCenterPage', () => ({
  MessageCenterPage: () => <div>Message Center Page Mock</div>,
}))

vi.mock('../features/landing/LandingPage', () => ({
  LandingPage: () => <div>Landing Page Mock</div>,
}))

vi.mock('../features/settings/SettingsPage', () => ({
  SettingsPage: () => <div>Settings Page Mock</div>,
}))
vi.mock('../features/auth/LoginPage', () => ({
  LoginPage: () => <div>Login Page Mock</div>,
}))
vi.mock('../features/auth/RegisterPage', () => ({
  RegisterPage: () => <div>Register Page Mock</div>,
}))
vi.mock('../shared/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: 1, username: 'admin', nickname: '管理员', role: 'super_admin', role_name: '超级管理员', is_active: true, permissions: ['basic_profile'] },
    isLoading: false,
    isAuthenticated: true,
    hasPermission: () => true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}))
vi.mock('../shared/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function renderApp(initialEntries: string[]) {
  const client = new QueryClient()
  function LocationDisplay() {
    const location = useLocation()
    return <div data-testid="location-display">{location.pathname}</div>
  }

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App routing', () => {
  beforeEach(() => {
    vi.mocked(apiClient.getMessageUnreadCount).mockResolvedValue({ unread_count: 0 })
    vi.mocked(apiClient.getAssistantModels).mockResolvedValue({
      models: [{
        model_code: 'assistant-model',
        display_name: '助手模型',
        provider: 'openai',
        api_model_name: 'gpt-test',
        lottery_codes: ['dlt'],
      }],
    })
    vi.mocked(apiClient.getAssistantConversations).mockResolvedValue({ conversations: [], total_count: 0 })
    vi.mocked(apiClient.chatWithAssistant).mockResolvedValue({
      conversation_id: 'asst-test',
      answer: 'ok',
      context_summary: '',
      model_code: 'assistant-model',
      messages: [],
    })
    vi.mocked(apiClient.streamAssistantChat).mockImplementation(async (_payload, handlers) => {
      handlers?.onMeta?.({ conversation_id: 'asst-test', context_summary: '', model_code: 'assistant-model' })
      handlers?.onDelta?.('ok')
      handlers?.onDone?.({
        conversation_id: 'asst-test',
        answer: 'ok',
        context_summary: '',
        model_code: 'assistant-model',
        messages: [],
      })
    })
    vi.mocked(apiClient.getCurrentPredictions).mockResolvedValue({
      lottery_code: 'dlt',
      prediction_date: '',
      target_period: '26001',
      models: [],
    })
    vi.mocked(apiClient.getMyBets).mockResolvedValue({
      records: [],
      summary: {
        total_count: 0,
        total_amount: 0,
        total_discount_amount: 0,
        total_net_amount: 0,
        total_prize_amount: 0,
        total_net_profit: 0,
        settled_count: 0,
        pending_count: 0,
      },
    })
  })

  it('renders landing route', async () => {
    renderApp(['/'])
    expect(await screen.findByText('Landing Page Mock')).toBeInTheDocument()
  })

  it('redirects dashboard route to prediction route', async () => {
    renderApp(['/dashboard'])
    expect(await screen.findByText('Home Page Mock')).toBeInTheDocument()
    expect(await screen.findByText(DISCLAIMER_TEXT)).toBeInTheDocument()
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/prediction')
  })

  it('renders dashboard model detail route', async () => {
    renderApp(['/dashboard/models/model-a'])
    expect(await screen.findByText('Home Model Detail Page Mock')).toBeInTheDocument()
  })

  it('renders dashboard rules route', async () => {
    renderApp(['/dashboard/rules'])
    expect(await screen.findByText('Home Rules Page Mock')).toBeInTheDocument()
  })

  it('renders message center route', async () => {
    renderApp(['/dashboard/messages'])
    expect(await screen.findByText('Message Center Page Mock')).toBeInTheDocument()
  })

  it('opens the context assistant drawer from the topbar', async () => {
    renderApp(['/dashboard/prediction'])
    await userEvent.click(await screen.findByRole('button', { name: 'AI 助手' }))
    const drawer = screen.getByRole('complementary', { name: 'AI 助手' })
    expect(drawer).toHaveClass('is-open')
    expect(screen.getByText('内容由 AI 生成，仅供参考，请仔细甄别。')).toBeInTheDocument()
    expect(within(drawer).getAllByText('AI 助手').length).toBeGreaterThan(0)
    expect(within(drawer).getByText('大乐透')).toBeInTheDocument()
    expect(within(drawer).queryByText('预测总览')).not.toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: '历史对话' })).toBeInTheDocument()
    expect(within(drawer).getByRole('region', { name: '历史对话' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: '随机来一注' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: '分析我的投注' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: '本期风险点' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: '解释当前预测' })).not.toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: '给我保守方案' })).not.toBeInTheDocument()
  })

  it('sends current-period my bets context when analyzing my bets', async () => {
    vi.mocked(apiClient.getMyBets).mockResolvedValue({
      records: [
        {
          id: 1,
          lottery_code: 'dlt',
          target_period: '26001',
          play_type: 'dlt',
          front_numbers: ['01', '02', '03', '04', '05'],
          back_numbers: ['01', '02'],
          front_dan: [],
          front_tuo: [],
          back_dan: [],
          back_tuo: [],
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
          discount_amount: 0,
          net_amount: 4,
          settlement_status: 'pending',
          winning_bet_count: 0,
          prize_level: null,
          prize_amount: 0,
          net_profit: 0,
          settled_at: null,
          source_type: 'manual',
          ticket_image_url: '',
          ocr_text: '',
          ocr_provider: null,
          ocr_recognized_at: null,
          actual_result: null,
          lines: [{
            line_no: 1,
            play_type: 'dlt',
            front_numbers: ['01', '02', '03', '04', '05'],
            back_numbers: ['01', '02'],
            front_dan: [],
            front_tuo: [],
            back_dan: [],
            back_tuo: [],
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
          }],
          created_at: 0,
          updated_at: 0,
        },
        {
          id: 2,
          lottery_code: 'dlt',
          target_period: '26000',
          play_type: 'dlt',
          front_numbers: ['06', '07', '08', '09', '10'],
          back_numbers: ['03', '04'],
          front_dan: [],
          front_tuo: [],
          back_dan: [],
          back_tuo: [],
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
          multiplier: 1,
          is_append: false,
          bet_count: 1,
          amount: 2,
          discount_amount: 0,
          net_amount: 2,
          settlement_status: 'pending',
          winning_bet_count: 0,
          prize_level: null,
          prize_amount: 0,
          net_profit: 0,
          settled_at: null,
          source_type: 'manual',
          ticket_image_url: '',
          ocr_text: '',
          ocr_provider: null,
          ocr_recognized_at: null,
          actual_result: null,
          lines: [],
          created_at: 0,
          updated_at: 0,
        },
      ],
      summary: {
        total_count: 2,
        total_amount: 6,
        total_discount_amount: 0,
        total_net_amount: 6,
        total_prize_amount: 0,
        total_net_profit: 0,
        settled_count: 0,
        pending_count: 2,
      },
    })
    renderApp(['/dashboard/prediction'])
    await userEvent.click(await screen.findByRole('button', { name: 'AI 助手' }))
    await userEvent.click(await screen.findByRole('button', { name: '分析我的投注' }))

    expect(apiClient.getCurrentPredictions).toHaveBeenCalledWith('dlt')
    expect(apiClient.getMyBets).toHaveBeenCalledWith('dlt')
    expect(apiClient.streamAssistantChat).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('本期该彩种的投注数据'),
      context: expect.objectContaining({
        target_period: '26001',
        my_bets: expect.objectContaining({
          lottery_code: 'dlt',
          target_period: '26001',
          record_count: 1,
          total_bet_count: 1,
          total_amount: 4,
          records: [expect.objectContaining({ id: 1 })],
        }),
      }),
    }), expect.any(Object))
  })

  it('does not show thinking placeholder during streamed replies', async () => {
    let resolveStream: (() => void) | undefined
    vi.mocked(apiClient.streamAssistantChat).mockImplementation(async (_payload, handlers) => {
      handlers?.onMeta?.({ conversation_id: 'asst-test', context_summary: '', model_code: 'assistant-model' })
      await new Promise<void>((resolve) => {
        resolveStream = resolve
      })
      handlers?.onDelta?.('ok')
      handlers?.onDone?.({
        conversation_id: 'asst-test',
        answer: 'ok',
        context_summary: '',
        model_code: 'assistant-model',
        messages: [{ id: 10, role: 'assistant', content: 'ok', model_code: 'assistant-model', status: 'success', created_at: 1 }],
      })
    })

    renderApp(['/dashboard/prediction'])
    await userEvent.click(await screen.findByRole('button', { name: 'AI 助手' }))
    await userEvent.type(screen.getByPlaceholderText('问我任何关于当前页面的问题'), 'hello')
    await userEvent.click(screen.getByRole('button', { name: '发送问题' }))

    expect(screen.queryByText('正在思考...')).not.toBeInTheDocument()
    resolveStream?.()
    expect(await screen.findByText('ok')).toBeInTheDocument()
  })

  it('sends empty current-period my bets context when there are no matching records', async () => {
    renderApp(['/dashboard/prediction'])
    await userEvent.click(await screen.findByRole('button', { name: 'AI 助手' }))
    await userEvent.click(await screen.findByRole('button', { name: '分析我的投注' }))

    expect(apiClient.streamAssistantChat).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        my_bets: expect.objectContaining({
          record_count: 0,
          records: [],
        }),
      }),
    }), expect.any(Object))
  })

  it('places the assistant button to the right of the user menu', async () => {
    renderApp(['/dashboard/prediction'])
    await screen.findByText('Home Page Mock')
    const topbarActions = screen.getByLabelText('快捷入口')
    const userMenuButton = within(topbarActions).getByRole('button', { name: '用户菜单' })
    const assistantButton = within(topbarActions).getByRole('button', { name: 'AI 助手' })
    expect(userMenuButton.compareDocumentPosition(assistantButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('redirects settings route to profile route', async () => {
    renderApp(['/settings'])
    expect(await screen.findByText('Settings Page Mock')).toBeInTheDocument()
    expect(await screen.findByText(DISCLAIMER_TEXT)).toBeInTheDocument()
    expect(screen.getByTestId('location-display')).toHaveTextContent('/settings/profile')
  })

  it('renders login route', async () => {
    renderApp(['/login'])
    expect(await screen.findByText('Login Page Mock')).toBeInTheDocument()
  })

  it('renders register route', async () => {
    renderApp(['/register'])
    expect(await screen.findByText('Register Page Mock')).toBeInTheDocument()
  })
})
