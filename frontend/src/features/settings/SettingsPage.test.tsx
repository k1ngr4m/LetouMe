import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    bulkUpdateSettingsModels: vi.fn(),
    generateSettingsModelPredictions: vi.fn(),
    bulkGenerateSettingsModelPredictions: vi.fn(),
    getPredictionGenerationTaskDetail: vi.fn(),
    fetchSettingsLotteryHistory: vi.fn(),
    getLotteryFetchTaskDetail: vi.fn(),
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
    listScheduleTasks: vi.fn(),
    createScheduleTask: vi.fn(),
    updateScheduleTask: vi.fn(),
    toggleScheduleTask: vi.fn(),
    deleteScheduleTask: vi.fn(),
    runScheduleTaskNow: vi.fn(),
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
      permissions: ['basic_profile', 'model_management', 'schedule_management', 'user_management', 'role_management'],
    },
    hasPermission: (permission: string) => ['basic_profile', 'model_management', 'schedule_management', 'user_management', 'role_management'].includes(permission),
    logout: vi.fn(),
  }),
}))

function renderPage(initialEntry = '/settings/profile') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  function LocationDisplay() {
    const location = useLocation()
    return <div data-testid="location-display">{location.pathname}</div>
  }

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <SettingsPage />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SettingsPage model management view switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClientMock.listScheduleTasks.mockResolvedValue({ tasks: [] })
  })

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
          lottery_codes: ['dlt', 'pl3'],
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
          lottery_codes: ['dlt'],
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

    expect(screen.queryByRole('button', { name: '大乐透' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    expect(screen.getByTestId('location-display')).toHaveTextContent('/settings/models')
    expect(screen.queryByRole('button', { name: '预测记录' })).not.toBeInTheDocument()
    expect(screen.queryByText(/已选 \d+/)).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '列表视图' })).toHaveClass('is-active')
    expect(screen.getByRole('columnheader', { name: '模型名称' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '彩种' })).toBeInTheDocument()
    expect(screen.getByText('DeepSeek-V3.2')).toBeInTheDocument()
    expect(screen.getByText('排列3')).toBeInTheDocument()
    expect(screen.queryByText('https://api.deepseek.com')).not.toBeInTheDocument()
    const titleCells = screen.getAllByRole('row').slice(1).map((row) => row.textContent || '')
    expect(titleCells[0]).toContain('Claude-4.6')
    expect(screen.queryByText('2026-03-16T15:39:25Z')).not.toBeInTheDocument()
    expect(screen.getAllByText((content) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(content)).length).toBeGreaterThan(1)

    await userEvent.click(screen.getByRole('button', { name: '排序：最近更新' }))
    await userEvent.click(screen.getByRole('button', { name: /名称 Z-A/ }))
    const nameDescRows = screen.getAllByRole('row').slice(1).map((row) => row.textContent || '')
    expect(nameDescRows[0]).toContain('DeepSeek-V3.2')

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))

    expect(screen.getByRole('button', { name: '卡片视图' })).toHaveClass('is-active')
    expect(screen.getByText('https://api.deepseek.com')).toBeInTheDocument()
  })

  it('renders profile route by default', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })

    renderPage()

    await screen.findByRole('button', { name: '基础信息' })
    expect(screen.getByTestId('location-display')).toHaveTextContent('/settings/profile')
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
    await userEvent.click(screen.getByRole('button', { name: '更多操作：DeepSeek-V3.2' }))
    await userEvent.click(screen.getByRole('button', { name: '生成预测数据' }))

    expect(screen.getByRole('heading', { name: 'DeepSeek-V3.2' })).toBeInTheDocument()
    expect(screen.getByLabelText('生成模式')).toHaveValue('current')

    await userEvent.selectOptions(screen.getByLabelText('生成模式'), 'history')
    expect(screen.getByLabelText('开始期号')).toBeInTheDocument()
    expect(screen.getByLabelText('结束期号')).toBeInTheDocument()
  })

  it('submits generate task with manually selected lottery code', async () => {
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
          lottery_codes: ['dlt', 'pl3'],
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
    await userEvent.click(screen.getByRole('button', { name: '更多操作：DeepSeek-V3.2' }))
    await userEvent.click(screen.getByRole('button', { name: '生成预测数据' }))
    await userEvent.selectOptions(screen.getByLabelText('生成彩种'), 'pl3')
    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() =>
      expect(apiClientMock.generateSettingsModelPredictions).toHaveBeenCalledWith({
        lottery_code: 'pl3',
        model_code: 'deepseek-v3.2',
        mode: 'current',
        overwrite: false,
        parallelism: 3,
        start_period: undefined,
        end_period: undefined,
      }),
    )
  })

  it('submits single-model generate task with custom parallelism', async () => {
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
          lottery_codes: ['dlt', 'pl3'],
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
      mode: 'history',
      model_code: 'deepseek-v3.2',
      created_at: '2026-03-16T12:00:00Z',
      started_at: null,
      finished_at: null,
      progress_summary: {
        mode: 'history',
        model_code: 'deepseek-v3.2',
        parallelism: 5,
        processed_count: 0,
        skipped_count: 0,
        failed_count: 0,
        failed_periods: [],
      },
      error_message: null,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    await userEvent.click(screen.getByRole('button', { name: '更多操作：DeepSeek-V3.2' }))
    await userEvent.click(screen.getByRole('button', { name: '生成预测数据' }))
    await userEvent.selectOptions(screen.getByLabelText('生成模式'), 'history')
    await userEvent.clear(screen.getByLabelText('并发线程数'))
    await userEvent.type(screen.getByLabelText('并发线程数'), '5')
    await userEvent.type(screen.getByLabelText('开始期号'), '26050')
    await userEvent.type(screen.getByLabelText('结束期号'), '26052')
    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))
    expect(await screen.findByRole('heading', { name: '单模型生成任务' })).toBeInTheDocument()
    expect(screen.getAllByText('并发线程数').length).toBeGreaterThan(1)
    expect(screen.getByText('5')).toBeInTheDocument()

    await waitFor(() =>
      expect(apiClientMock.generateSettingsModelPredictions).toHaveBeenCalledWith({
        lottery_code: 'dlt',
        model_code: 'deepseek-v3.2',
        mode: 'history',
        overwrite: false,
        parallelism: 5,
        start_period: '26050',
        end_period: '26052',
      }),
    )
  })

  it('shows lottery maintenance card and starts fetch task for super admin', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.fetchSettingsLotteryHistory.mockResolvedValue({
      task_id: 'lottery-task-1',
      status: 'queued',
      created_at: '2026-03-16T12:00:00Z',
      started_at: null,
      finished_at: null,
      progress_summary: {
        fetched_count: 0,
        saved_count: 0,
        latest_period: null,
        duration_ms: 0,
      },
      error_message: null,
    })
    apiClientMock.getLotteryFetchTaskDetail.mockResolvedValue({
      task_id: 'lottery-task-1',
      status: 'succeeded',
      created_at: '2026-03-16T12:00:00Z',
      started_at: '2026-03-16T12:00:01Z',
      finished_at: '2026-03-16T12:00:03Z',
      progress_summary: {
        fetched_count: 120,
        saved_count: 120,
        latest_period: '2026033',
        duration_ms: 2034,
      },
      error_message: null,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    expect(screen.getByRole('heading', { name: '数据维护' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '获取大乐透数据' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '获取排列3数据' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '获取大乐透数据' }))

    expect(apiClientMock.fetchSettingsLotteryHistory).toHaveBeenCalledWith('dlt')
    await waitFor(() => expect(apiClientMock.getLotteryFetchTaskDetail).toHaveBeenCalledWith('lottery-task-1'), { timeout: 2500 })
    expect(await screen.findByText('2026033')).toBeInTheDocument()
  })

  it('supports selecting all models and bulk actions in list view', async () => {
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
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [{ code: 'deepseek', name: 'DeepSeek' }] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.bulkUpdateSettingsModels.mockResolvedValue({
      selected_count: 2,
      processed_count: 2,
      skipped_count: 0,
      failed_count: 0,
      processed_models: ['deepseek-v3.2', 'claude-sonnet-4.6'],
      skipped_models: [],
      failed_models: [],
    })
    apiClientMock.bulkGenerateSettingsModelPredictions.mockResolvedValue({
      task_id: 'bulk-task-1',
      status: 'queued',
      mode: 'current',
      model_code: '__bulk__',
      created_at: '2026-03-16T12:00:00Z',
      started_at: null,
      finished_at: null,
      progress_summary: {
        mode: 'current',
        model_code: '__bulk__',
        processed_count: 0,
        skipped_count: 0,
        failed_count: 0,
        failed_periods: [],
      },
      error_message: null,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '全选模型' }))
    expect(screen.getByText('已选 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '批量操作' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '批量操作' }))
    await userEvent.click(screen.getByRole('button', { name: '批量编辑' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /Provider/ }))
    await userEvent.click(screen.getByRole('button', { name: '保存批量修改' }))
    await waitFor(() => expect(apiClientMock.bulkUpdateSettingsModels).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('checkbox', { name: '全选模型' }))
    await userEvent.click(screen.getByRole('button', { name: '批量操作' }))
    await userEvent.click(screen.getByRole('button', { name: '批量生成预测' }))
    expect(screen.getByRole('heading', { name: '已选 2 个模型' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() => expect(apiClientMock.bulkGenerateSettingsModelPredictions).toHaveBeenCalled())
  })

  it('auto-removes incompatible models after generation lottery changes in bulk modal', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'dlt-only',
          display_name: 'DltOnly',
          provider: 'deepseek',
          api_model_name: 'deepseek-chat',
          version: '1',
          tags: [],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'dlt',
          lottery_codes: ['dlt'],
          temperature: null,
          is_active: true,
          is_deleted: false,
          updated_at: '2026-03-16 12:00:00',
        },
        {
          model_code: 'pl3-only',
          display_name: 'Pl3Only',
          provider: 'deepseek',
          api_model_name: 'deepseek-chat',
          version: '1',
          tags: [],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'pl3',
          lottery_codes: ['pl3'],
          temperature: null,
          is_active: true,
          is_deleted: false,
          updated_at: '2026-03-16 12:00:01',
        },
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.bulkGenerateSettingsModelPredictions.mockResolvedValue({
      task_id: 'bulk-task-2',
      status: 'queued',
      mode: 'current',
      model_code: '__bulk__',
      created_at: '2026-03-16T12:00:00Z',
      started_at: null,
      finished_at: null,
      progress_summary: {
        mode: 'current',
        model_code: '__bulk__',
        processed_count: 0,
        skipped_count: 0,
        failed_count: 0,
        failed_periods: [],
      },
      error_message: null,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '全选模型' }))
    await userEvent.click(screen.getByRole('button', { name: '批量操作' }))
    await userEvent.click(screen.getByRole('button', { name: '批量生成预测' }))

    expect(screen.getByText('已移除 1 个不支持大乐透的模型。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '已选 1 个模型' })).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('生成彩种'), 'pl3')
    expect(screen.getByText('已移除 1 个不支持排列3的模型。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '已选 1 个模型' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() =>
      expect(apiClientMock.generateSettingsModelPredictions).toHaveBeenCalledWith({
        lottery_code: 'pl3',
        model_code: 'pl3-only',
        mode: 'current',
        overwrite: false,
        parallelism: 3,
        start_period: undefined,
        end_period: undefined,
      }),
    )
  })

  it('shows schedule tab and renders schedule tasks', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.listScheduleTasks.mockResolvedValue({
      tasks: [
        {
          task_code: 'sched-fetch-dlt',
          task_name: '大乐透抓取',
          task_type: 'lottery_fetch',
          lottery_code: 'dlt',
          model_codes: [],
          generation_mode: 'current',
          overwrite_existing: false,
          schedule_mode: 'preset',
          preset_type: 'daily',
          time_of_day: '09:30',
          weekdays: [],
          cron_expression: null,
          is_active: true,
          next_run_at: '2026-03-19T01:30:00Z',
          last_run_at: '2026-03-18T00:40:00Z',
          last_run_status: 'failed',
          last_error_message: '抓取接口返回 502',
          last_task_id: 'task-fetch-1',
          rule_summary: '每日 09:30',
          created_at: '2026-03-18T01:00:00Z',
          updated_at: '2026-03-18T01:00:00Z',
        },
      ],
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '定时任务' }))
    expect(screen.queryByLabelText('任务名称')).not.toBeInTheDocument()
    expect(await screen.findByText('大乐透抓取')).toBeInTheDocument()
    expect(screen.getAllByText('开奖抓取').length).toBeGreaterThan(0)
    expect(screen.getByText('每日 09:30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /查看详情：大乐透抓取/ }))
    expect(screen.getByText('抓取接口返回 502')).toBeInTheDocument()
    expect(screen.getByText('task-fetch-1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /收起详情：大乐透抓取/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /编辑任务：大乐透抓取/ }))
    expect(await screen.findByRole('heading', { name: '编辑任务' })).toBeInTheDocument()
    expect(screen.getByLabelText('任务名称')).toHaveValue('大乐透抓取')

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: /删除任务：大乐透抓取/ }))
    expect(confirmSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('creates a prediction schedule task', async () => {
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
          lottery_codes: ['dlt'],
          updated_at: '2026-03-16 12:00:00',
        },
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.createScheduleTask.mockResolvedValue({
      task_code: 'sched-predict-dlt',
      task_name: '大乐透预测',
      task_type: 'prediction_generate',
      lottery_code: 'dlt',
      model_codes: ['deepseek-v3.2'],
      generation_mode: 'current',
      overwrite_existing: false,
      schedule_mode: 'preset',
      preset_type: 'daily',
      time_of_day: '10:00',
      weekdays: [],
      cron_expression: null,
      is_active: true,
      next_run_at: '2026-03-19T02:00:00Z',
      last_run_at: null,
      last_run_status: null,
      last_error_message: null,
      last_task_id: null,
      rule_summary: '每日 10:00',
      created_at: '2026-03-18T02:00:00Z',
      updated_at: '2026-03-18T02:00:00Z',
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '定时任务' }))
    await userEvent.click(screen.getByRole('button', { name: '新增任务' }))
    expect(await screen.findByRole('heading', { name: '新增任务' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('任务名称'), '大乐透预测')
    await userEvent.selectOptions(screen.getByLabelText('任务类型'), 'prediction_generate')
    await userEvent.click(screen.getByRole('checkbox', { name: 'DeepSeek-V3.2' }))
    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() =>
      expect(apiClientMock.createScheduleTask).toHaveBeenCalledWith(
        expect.objectContaining({
          task_name: '大乐透预测',
          task_type: 'prediction_generate',
          model_codes: ['deepseek-v3.2'],
          schedule_mode: 'preset',
          time_of_day: '09:00',
        }),
      ),
    )
  })
})
