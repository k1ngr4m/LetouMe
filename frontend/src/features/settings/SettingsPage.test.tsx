import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    getSettingsModels: vi.fn(),
    getSettingsProviders: vi.fn(),
    listUsers: vi.fn(),
    listRoles: vi.fn(),
    listPermissions: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    createSettingsModel: vi.fn(),
    updateSettingsModel: vi.fn(),
    toggleSettingsModel: vi.fn(),
    deleteSettingsModel: vi.fn(),
    restoreSettingsModel: vi.fn(),
    generateSettingsModelPredictions: vi.fn(),
    getPredictionGenerationTaskDetail: vi.fn(),
    getSettingsPredictionRecords: vi.fn(),
    getSettingsPredictionRecordDetail: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    resetUserPassword: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    updatePermission: vi.fn(),
    deleteRole: vi.fn(),
    getSettingsModel: vi.fn(),
  },
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: apiClientMock,
}))

vi.mock('../../shared/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'admin',
      nickname: '管理员',
      role: 'super_admin',
      role_name: '超级管理员',
      is_active: true,
      permissions: ['basic_profile', 'model_management', 'user_management', 'role_management'],
    },
    hasPermission: (permission: string) => ['basic_profile', 'model_management', 'user_management', 'role_management'].includes(permission),
    logout: vi.fn(),
  }),
}))

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SettingsPage model management view switch', () => {
  it('defaults to list view and can switch to card view', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'deepseek-v3.2',
          display_name: 'DeepSeek-V3.2',
          provider: 'deepseek',
          api_model_name: 'deepseek-chat',
          version: '1',
          tags: ['reasoning'],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'dlt',
          temperature: null,
          is_active: true,
          is_deleted: false,
          updated_at: '2026-03-16 12:00:00',
        },
        {
          model_code: 'claude-sonnet-4.6',
          display_name: 'Claude-4.6',
          provider: 'anthropic',
          api_model_name: 'claude-sonnet-4-6',
          version: '1',
          tags: ['reasoning'],
          base_url: 'https://example.test',
          api_key: '',
          app_code: 'dlt',
          temperature: null,
          is_active: true,
          is_deleted: false,
          updated_at: '2026-03-16T15:39:25Z',
        },
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.generateSettingsModelPredictions.mockResolvedValue({
      task_id: 'task-1',
      status: 'queued',
      mode: 'current',
      model_code: 'deepseek-v3.2',
      created_at: '2026-03-16T12:00:00Z',
      started_at: null,
      finished_at: null,
      progress_summary: {
        mode: 'current',
        model_code: 'deepseek-v3.2',
        processed_count: 0,
        skipped_count: 0,
        failed_count: 0,
        failed_periods: [],
      },
      error_message: null,
    })
    apiClientMock.getPredictionGenerationTaskDetail.mockResolvedValue({
      task_id: 'task-1',
      status: 'succeeded',
      mode: 'current',
      model_code: 'deepseek-v3.2',
      created_at: '2026-03-16T12:00:00Z',
      started_at: '2026-03-16T12:00:01Z',
      finished_at: '2026-03-16T12:00:02Z',
      progress_summary: {
        mode: 'current',
        model_code: 'deepseek-v3.2',
        processed_count: 1,
        skipped_count: 0,
        failed_count: 0,
        failed_periods: [],
      },
      error_message: null,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    expect(await screen.findByRole('button', { name: '列表视图' })).toHaveClass('is-active')
    expect(screen.getByRole('columnheader', { name: '模型名称' })).toBeInTheDocument()
    expect(screen.getByText('DeepSeek-V3.2')).toBeInTheDocument()
    expect(screen.queryByText('https://api.deepseek.com')).not.toBeInTheDocument()
    const titleCells = screen.getAllByRole('row').slice(1).map((row) => row.textContent || '')
    expect(titleCells[0]).toContain('Claude-4.6')
    expect(screen.queryByText('2026-03-16T15:39:25Z')).not.toBeInTheDocument()
    expect(screen.getAllByText((content) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(content)).length).toBeGreaterThan(1)

    await userEvent.selectOptions(screen.getByDisplayValue('更新时间 ↓'), 'name_desc')
    const nameDescRows = screen.getAllByRole('row').slice(1).map((row) => row.textContent || '')
    expect(nameDescRows[0]).toContain('DeepSeek-V3.2')

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))

    expect(screen.getByRole('button', { name: '卡片视图' })).toHaveClass('is-active')
    expect(screen.getByText('https://api.deepseek.com')).toBeInTheDocument()
  })

  it('opens generate prediction modal from list view', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'deepseek-v3.2',
          display_name: 'DeepSeek-V3.2',
          provider: 'deepseek',
          api_model_name: 'deepseek-chat',
          version: '1',
          tags: ['reasoning'],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'dlt',
          temperature: null,
          is_active: true,
          is_deleted: false,
          updated_at: '2026-03-16 12:00:00',
        },
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.generateSettingsModelPredictions.mockResolvedValue({
      task_id: 'task-1',
      status: 'queued',
      mode: 'current',
      model_code: 'deepseek-v3.2',
      created_at: '2026-03-16T12:00:00Z',
      started_at: null,
      finished_at: null,
      progress_summary: {
        mode: 'current',
        model_code: 'deepseek-v3.2',
        processed_count: 0,
        skipped_count: 0,
        failed_count: 0,
        failed_periods: [],
      },
      error_message: null,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    await userEvent.click(screen.getByRole('button', { name: '生成预测数据' }))

    expect(screen.getByRole('heading', { name: 'DeepSeek-V3.2' })).toBeInTheDocument()
    expect(screen.getByLabelText('生成模式')).toHaveValue('current')

    await userEvent.selectOptions(screen.getByLabelText('生成模式'), 'history')
    expect(screen.getByLabelText('开始期号')).toBeInTheDocument()
    expect(screen.getByLabelText('结束期号')).toBeInTheDocument()
  })

  it('shows mixed prediction records and opens detail modal', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({
      records: [
        {
          record_type: 'current',
          target_period: '2026033',
          prediction_date: '2026-03-16',
          actual_result: null,
          model_count: 2,
          status_label: '待开奖',
        },
        {
          record_type: 'history',
          target_period: '2026032',
          prediction_date: '2026-03-14',
          actual_result: { period: '2026032', date: '2026-03-15', red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['06', '07'] },
          model_count: 3,
          status_label: '已归档',
        },
      ],
    })
    apiClientMock.getSettingsPredictionRecordDetail.mockResolvedValue({
      record_type: 'history',
      target_period: '2026032',
      prediction_date: '2026-03-14',
      actual_result: { period: '2026032', date: '2026-03-15', red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['06', '07'] },
      models: [
        {
          model_id: 'deepseek-v3.2',
          model_name: 'DeepSeek-V3.2',
          model_provider: 'deepseek',
          predictions: [
            { group_id: 1, red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['06', '07'] },
          ],
          best_hit_count: 3,
        },
      ],
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    await userEvent.click(screen.getByRole('button', { name: '预测记录' }))

    expect(await screen.findByRole('columnheader', { name: '记录类型' })).toBeInTheDocument()
    expect(screen.getAllByText('当前期').length).toBeGreaterThan(0)
    expect(screen.getAllByText('历史').length).toBeGreaterThan(0)

    await userEvent.click(screen.getAllByRole('button', { name: '查看详情' })[1])

    expect(await screen.findByRole('heading', { name: '第 2026032 期' })).toBeInTheDocument()
    expect(await screen.findByText('DeepSeek-V3.2')).toBeInTheDocument()
  })

  it('filters prediction records by type and period', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({
      records: [
        {
          record_type: 'current',
          target_period: '2026033',
          prediction_date: '2026-03-16',
          actual_result: null,
          model_count: 2,
          status_label: '待开奖',
        },
        {
          record_type: 'history',
          target_period: '2026032',
          prediction_date: '2026-03-14',
          actual_result: { period: '2026032', date: '2026-03-15', red_balls: ['01', '02', '03', '04', '05'], blue_balls: ['06', '07'] },
          model_count: 3,
          status_label: '已归档',
        },
      ],
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    await userEvent.click(screen.getByRole('button', { name: '预测记录' }))

    expect(screen.getAllByText('当前期').length).toBeGreaterThan(0)
    expect(screen.getAllByText('历史').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: '历史' }))
    expect(screen.getAllByText('当前期').length).toBe(1)
    expect(screen.getAllByText('历史').length).toBeGreaterThan(1)

    await userEvent.type(screen.getByPlaceholderText('输入期号过滤'), '2026031')
    expect(screen.getByText('没有符合当前筛选条件的预测记录。')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('输入期号过滤')
    await userEvent.clear(input)
    await userEvent.type(input, '2026032')
    expect(screen.getAllByText('历史').length).toBeGreaterThan(1)
    expect(screen.getAllByText('当前期').length).toBe(1)

    await userEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(screen.getAllByText('历史').length).toBeGreaterThan(1)
  })
})
