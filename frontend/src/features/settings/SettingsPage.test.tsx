import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'
import { MotionProvider } from '../../shared/theme/MotionProvider'
import { ToastProvider } from '../../shared/feedback/ToastProvider'

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    getSettingsModels: vi.fn(),
    getSettingsProviders: vi.fn(),
    discoverSettingsProviderModels: vi.fn(),
    listUsers: vi.fn(),
    listRoles: vi.fn(),
    listPermissions: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    createSettingsModel: vi.fn(),
    updateSettingsModel: vi.fn(),
    testSettingsModelConnectivity: vi.fn(),
    toggleSettingsModel: vi.fn(),
    deleteSettingsModel: vi.fn(),
    restoreSettingsModel: vi.fn(),
    bulkUpdateSettingsModels: vi.fn(),
    generateSettingsModelPredictions: vi.fn(),
    bulkGenerateSettingsModelPredictions: vi.fn(),
    generateSettingsWorldCupPredictions: vi.fn(),
    getPredictionGenerationTaskDetail: vi.fn(),
    getWorldCupMatches: vi.fn(),
    fetchSettingsLotteryHistory: vi.fn(),
    bootstrapSettingsLotteryHistory: vi.fn(),
    getLotteryFetchTaskDetail: vi.fn(),
    listMaintenanceRunLogs: vi.fn(),
    listScheduleRunLogs: vi.fn(),
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
    createSettingsProvider: vi.fn(),
    updateSettingsProvider: vi.fn(),
    deleteSettingsProvider: vi.fn(),
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

const DEEPSEEK_PROVIDER_FIXTURE = {
  code: 'deepseek',
  name: 'DeepSeek',
  is_system_preset: true,
  api_format: 'openai_compatible' as const,
  base_url: 'https://api.deepseek.com',
}

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
      <ToastProvider>
        <MotionProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <SettingsPage />
            <LocationDisplay />
          </MemoryRouter>
        </MotionProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

async function selectManagedProvider(name: string | RegExp) {
  const providerSidebar = await screen.findByLabelText('供应商')
  const buttons = await within(providerSidebar).findAllByRole('button', { name })
  const selectButton = buttons.find((button) => !button.getAttribute('aria-label')?.startsWith('删除供应商源')) || buttons[0]
  await userEvent.click(selectButton)
}

describe('SettingsPage model management view switch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClientMock.listScheduleTasks.mockResolvedValue({ tasks: [] })
    apiClientMock.listScheduleRunLogs.mockResolvedValue({ logs: [], total_count: 0 })
    apiClientMock.listMaintenanceRunLogs.mockResolvedValue({ logs: [], total_count: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders provider-first model management and switches managed providers', async () => {
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
          provider: 'deepseek',
          api_model_name: 'deepseek-reasoner',
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
    apiClientMock.getSettingsProviders.mockResolvedValue({
      providers: [
        { code: 'deepseek', name: 'DeepSeek', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://api.deepseek.com' },
        { code: 'aihubmix', name: 'AIHubMix', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://aihubmix.com/v1' },
      ],
    })
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
    expect(await screen.findByText('提供商源')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '全部模型' })).toBeInTheDocument()
    await selectManagedProvider(/DSDeepSeek/)
    expect(screen.getByRole('heading', { name: 'DeepSeek' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /AIHubMix/ }).length).toBeGreaterThan(0)
    expect(screen.getByText('DeepSeek-V3.2')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('大乐透 / 排列3'))).toBeInTheDocument()
    expect(screen.getByText('Claude-4.6')).toBeInTheDocument()
    expect(screen.getAllByText('https://api.deepseek.com').length).toBeGreaterThan(0)
    expect(screen.queryByText('2026-03-16T15:39:25Z')).not.toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: /AIHubMix/ })[0])
    expect(screen.getByRole('heading', { name: 'AIHubMix' })).toBeInTheDocument()
    expect(screen.queryByText('DeepSeek-V3.2')).not.toBeInTheDocument()
  })

  it('shows an empty provider source state when no source has been added', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })

    renderPage('/settings/models')

    expect(await screen.findByText('暂无提供商源')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '全部模型' })).toBeInTheDocument()
    expect(screen.getByText('暂无已配置的模型。')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '新增' }))
    expect(screen.getByRole('menuitem', { name: /DeepSeek/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /AIHubMix/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /XiaoMi Token Plan/ })).toBeInTheDocument()
  })

  it('supports filtering models by enabled status', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'enabled-model',
          display_name: 'EnabledModel',
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
          model_code: 'inactive-model',
          display_name: 'InactiveModel',
          provider: 'deepseek',
          api_model_name: 'deepseek-reasoner',
          version: '1',
          tags: [],
          base_url: 'https://example.test',
          api_key: '',
          app_code: 'dlt',
          lottery_codes: ['dlt'],
          temperature: null,
          is_active: false,
          is_deleted: false,
          updated_at: '2026-03-16 12:01:00',
        },
        {
          model_code: 'deleted-model',
          display_name: 'DeletedModel',
          provider: 'deepseek',
          api_model_name: 'deepseek-v4-flash',
          version: '1',
          tags: [],
          base_url: 'https://example.test',
          api_key: '',
          app_code: 'dlt',
          lottery_codes: ['dlt'],
          temperature: null,
          is_active: false,
          is_deleted: true,
          updated_at: '2026-03-16 12:02:00',
        },
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    expect(screen.getByRole('heading', { name: '全部模型' })).toBeInTheDocument()
    expect(screen.getByText('EnabledModel')).toBeInTheDocument()
    expect(screen.queryByText('InactiveModel')).not.toBeInTheDocument()
    expect(screen.queryByText('DeletedModel')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '未启用' }))
    expect(screen.queryByText('EnabledModel')).not.toBeInTheDocument()
    expect(screen.getByText('InactiveModel')).toBeInTheDocument()
    expect(screen.queryByText('DeletedModel')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '全部' }))
    expect(screen.getByText('EnabledModel')).toBeInTheDocument()
    expect(screen.getByText('InactiveModel')).toBeInTheDocument()
    expect(screen.queryByText('DeletedModel')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '启用' }))
    expect(screen.getByText('EnabledModel')).toBeInTheDocument()
    expect(screen.queryByText('InactiveModel')).not.toBeInTheDocument()
    expect(screen.queryByText('DeletedModel')).not.toBeInTheDocument()
  })

  it('renders the all provider aggregate page and excludes inactive models from bulk generation', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'deepseek-active',
          display_name: 'DeepSeek Active',
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
          model_code: 'aihubmix-active',
          display_name: 'AIHubMix Active',
          provider: 'aihubmix',
          api_model_name: 'gpt-5-mini',
          version: '1',
          tags: [],
          base_url: 'https://aihubmix.com/v1',
          api_key: '',
          app_code: 'dlt',
          lottery_codes: ['dlt'],
          temperature: null,
          is_active: true,
          is_deleted: false,
          updated_at: '2026-03-16 12:01:00',
        },
        {
          model_code: 'inactive-model',
          display_name: 'Inactive Aggregate Model',
          provider: 'deepseek',
          api_model_name: 'deepseek-reasoner',
          version: '1',
          tags: [],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'dlt',
          lottery_codes: ['dlt'],
          temperature: null,
          is_active: false,
          is_deleted: false,
          updated_at: '2026-03-16 12:02:00',
        },
        {
          model_code: 'deleted-model',
          display_name: 'Deleted Aggregate Model',
          provider: 'deepseek',
          api_model_name: 'deleted',
          version: '1',
          tags: [],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'dlt',
          lottery_codes: ['dlt'],
          temperature: null,
          is_active: false,
          is_deleted: true,
          updated_at: '2026-03-16 12:03:00',
        },
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({
      providers: [
        DEEPSEEK_PROVIDER_FIXTURE,
        { code: 'aihubmix', name: 'AIHubMix', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://aihubmix.com/v1' },
      ],
    })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.bulkGenerateSettingsModelPredictions.mockResolvedValue({
      task_id: 'bulk-task-1',
      status: 'queued',
      mode: 'current',
      model_code: 'bulk',
      created_at: '2026-03-16T12:00:00Z',
      started_at: null,
      finished_at: null,
      progress_summary: {
        mode: 'current',
        model_code: 'bulk',
        selected_count: 2,
        processed_count: 0,
        skipped_count: 0,
        failed_count: 0,
        failed_periods: [],
      },
      error_message: null,
    })

    renderPage('/settings/models')

    expect(await screen.findByRole('heading', { name: '全部模型' })).toBeInTheDocument()
    expect(await screen.findByText('DeepSeek Active')).toBeInTheDocument()
    expect(screen.getByText('已配置 3 个 · 启用 2 个 · 停用 1 个')).toBeInTheDocument()
    expect(screen.queryByText('API Key')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '获取模型列表' })).not.toBeInTheDocument()
    expect(screen.getByText('AIHubMix Active')).toBeInTheDocument()
    expect(screen.queryByText('Inactive Aggregate Model')).not.toBeInTheDocument()
    expect(screen.queryByText('Deleted Aggregate Model')).not.toBeInTheDocument()
    expect(screen.getAllByText('DeepSeek').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AIHubMix').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: '生成预测数据：Inactive Aggregate Model' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('全选模型'))
    await userEvent.click(screen.getByRole('button', { name: '批量生成预测' }))
    expect(screen.queryByText('已自动跳过 1 个停用模型。')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() => expect(apiClientMock.bulkGenerateSettingsModelPredictions).toHaveBeenCalled())
    const bulkPayload = apiClientMock.bulkGenerateSettingsModelPredictions.mock.calls[0][0]
    expect(bulkPayload.model_codes).toHaveLength(2)
    expect(bulkPayload.model_codes).toEqual(expect.arrayContaining(['aihubmix-active', 'deepseek-active']))
    expect(bulkPayload.model_codes).not.toContain('inactive-model')
  })

  it('asks for confirmation before deleting a model', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'deepseek-v4-flash',
          display_name: 'DeepSeek V4 Flash',
          provider: 'deepseek',
          api_model_name: 'deepseek-v4-flash',
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
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.deleteSettingsModel.mockResolvedValue({ model_code: 'deepseek-v4-flash', is_deleted: true })

    renderPage('/settings/models')

    await screen.findByText('DeepSeek V4 Flash')
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    await userEvent.click(screen.getByRole('button', { name: '删除模型 DeepSeek V4 Flash' }))
    expect(confirmSpy).toHaveBeenCalledWith('确认删除模型“DeepSeek V4 Flash”吗？删除后模型会被停用，可在已删除状态下恢复。')
    expect(apiClientMock.deleteSettingsModel).not.toHaveBeenCalled()

    confirmSpy.mockReturnValueOnce(true)
    await userEvent.click(screen.getByRole('button', { name: '删除模型 DeepSeek V4 Flash' }))
    await waitFor(() => expect(apiClientMock.deleteSettingsModel).toHaveBeenCalledWith('deepseek-v4-flash'))
    confirmSpy.mockRestore()
  })

  it('adds provider source drafts from the sidebar menu and saves them', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({
      providers: [
        { code: 'deepseek', name: 'DeepSeek', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://api.deepseek.com' },
        { code: 'deepseek_1', name: 'deepseek_1', is_system_preset: false, api_format: 'openai_compatible', base_url: 'https://api.deepseek.com' },
        { code: 'aihubmix', name: 'AIHubMix', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://aihubmix.com/v1' },
        { code: 'openrouter', name: 'OpenRouter', is_system_preset: false, api_format: 'openai_compatible', base_url: 'https://openrouter.ai/api/v1' },
      ],
    })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.createSettingsProvider.mockResolvedValue({
      code: 'deepseek_2',
      name: 'deepseek_2',
      is_system_preset: false,
      api_format: 'openai_compatible',
      base_url: 'https://api.deepseek.com',
      extra_options: {},
      model_configs: [],
    })

    renderPage('/settings/models')

    expect(await screen.findByText('deepseek_1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /OpenRouter/ })).not.toBeInTheDocument()
    await selectManagedProvider(/deepseek_1/)
    expect(screen.getByRole('button', { name: '获取模型列表' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '保存并获取模型' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '新增' }))
    expect(screen.getByRole('menuitem', { name: /DeepSeek/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /AIHubMix/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /XiaoMi Token Plan/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: /DeepSeek/ }))

    expect(await screen.findByRole('heading', { name: 'deepseek_2' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('deepseek_2')).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://api.deepseek.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存并获取模型' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '获取模型列表' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '删除供应商源 deepseek_2' }))
    expect(apiClientMock.deleteSettingsProvider).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'deepseek_2' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '新增' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /DeepSeek/ }))
    await userEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() =>
      expect(apiClientMock.createSettingsProvider).toHaveBeenCalledWith(expect.objectContaining({
        code: 'deepseek_2',
        name: 'deepseek_2',
        base_url: 'https://api.deepseek.com',
        api_format: 'openai_compatible',
      })),
    )
    expect(apiClientMock.updateSettingsProvider).not.toHaveBeenCalled()
  })

  it('creates an AIHubMix draft before fetching models and confirms saved provider deletion', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({
      providers: [
        { code: 'deepseek', name: 'DeepSeek', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://api.deepseek.com' },
        { code: 'aihubmix', name: 'AIHubMix', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://aihubmix.com/v1' },
        { code: 'aihubmix_1', name: 'aihubmix_1', is_system_preset: false, api_format: 'openai_compatible', base_url: 'https://aihubmix.com/v1' },
      ],
    })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.createSettingsProvider.mockResolvedValue({
      code: 'aihubmix_2',
      name: 'aihubmix_2',
      is_system_preset: false,
      api_format: 'openai_compatible',
      base_url: 'https://aihubmix.com/v1',
      extra_options: {},
      model_configs: [],
    })
    apiClientMock.discoverSettingsProviderModels.mockResolvedValue({
      models: [{ model_id: 'gpt-5-mini', display_name: 'gpt-5-mini' }],
    })
    apiClientMock.deleteSettingsProvider.mockResolvedValue({ success: true })

    renderPage('/settings/models')

    expect(await screen.findByText('aihubmix_1')).toBeInTheDocument()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    await userEvent.click(screen.getByRole('button', { name: '删除供应商源 aihubmix_1' }))
    expect(confirmSpy).toHaveBeenCalled()
    expect(apiClientMock.deleteSettingsProvider).not.toHaveBeenCalled()

    confirmSpy.mockReturnValueOnce(true)
    await userEvent.click(screen.getByRole('button', { name: '删除供应商源 aihubmix_1' }))
    await waitFor(() => expect(apiClientMock.deleteSettingsProvider).toHaveBeenCalledWith('aihubmix_1'))

    await userEvent.click(screen.getByRole('button', { name: '新增' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /AIHubMix/ }))
    expect(await screen.findByRole('heading', { name: 'aihubmix_2' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('aihubmix_2')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '保存并获取模型' })).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: '保存并获取模型' }))
    await waitFor(() => expect(apiClientMock.createSettingsProvider).toHaveBeenCalledWith(expect.objectContaining({ code: 'aihubmix_2' })))
    await waitFor(() =>
      expect(apiClientMock.discoverSettingsProviderModels).toHaveBeenCalledWith({
        provider: 'aihubmix_2',
        base_url: 'https://aihubmix.com/v1',
        api_key: '',
      }),
    )
    confirmSpy.mockRestore()
  })

  it('edits provider custom headers through the reusable key-value dialog', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({
      providers: [
        {
          code: 'deepseek',
          name: 'DeepSeek',
          is_system_preset: true,
          api_format: 'openai_compatible',
          base_url: 'https://api.deepseek.com',
          extra_options: { timeout: 30, custom_headers: { 'X-Trace': 'old' } },
        },
      ],
    })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.updateSettingsProvider.mockResolvedValue({
      code: 'deepseek',
      name: 'DeepSeek',
      is_system_preset: true,
      api_format: 'openai_compatible',
      base_url: 'https://api.deepseek.com',
      extra_options: {},
      model_configs: [],
    })

    renderPage('/settings/models')

    await selectManagedProvider(/DSDeepSeek/)
    expect(await screen.findByText('X-Trace')).toBeInTheDocument()
    const headerField = screen.getByText('自定义请求头').closest('.provider-config-field') as HTMLElement
    await userEvent.click(within(headerField).getByRole('button', { name: '修改' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '修改键值对' })).toBeInTheDocument()
    await userEvent.clear(within(dialog).getByDisplayValue('old'))
    await userEvent.type(within(dialog).getByPlaceholderText('请输入请求头值'), 'trace-1')
    await userEvent.click(within(dialog).getByRole('button', { name: '新增请求头' }))
    const keyInputs = within(dialog).getAllByPlaceholderText('X-Request-ID')
    const valueInputs = within(dialog).getAllByPlaceholderText('请输入请求头值')
    await userEvent.type(keyInputs[1], 'X-App')
    await userEvent.type(valueInputs[1], 'letoume')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    await userEvent.click(screen.getByRole('button', { name: '保存配置' }))

    await waitFor(() =>
      expect(apiClientMock.updateSettingsProvider).toHaveBeenCalledWith(
        'deepseek',
        expect.objectContaining({
          extra_options: expect.objectContaining({
            custom_headers: { 'X-Trace': 'trace-1', 'X-App': 'letoume' },
          }),
        }),
      ),
    )
  })

  it('validates provider custom header keys inside the dialog', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({
      providers: [
        { code: 'deepseek', name: 'DeepSeek', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://api.deepseek.com', extra_options: {} },
      ],
    })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })

    renderPage('/settings/models')

    await selectManagedProvider(/DSDeepSeek/)
    const headerField = screen.getByText('自定义请求头').closest('.provider-config-field') as HTMLElement
    await userEvent.click(within(headerField).getByRole('button', { name: '修改' }))

    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '新增请求头' }))
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(within(dialog).getByText('请求头名称不能为空')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByPlaceholderText('X-Request-ID'), 'X-App')
    await userEvent.type(within(dialog).getByPlaceholderText('请输入请求头值'), 'one')
    await userEvent.click(within(dialog).getByRole('button', { name: '新增请求头' }))
    const keyInputs = within(dialog).getAllByPlaceholderText('X-Request-ID')
    const valueInputs = within(dialog).getAllByPlaceholderText('请输入请求头值')
    await userEvent.type(keyInputs[1], 'X-App')
    await userEvent.type(valueInputs[1], 'two')
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(within(dialog).getByText('请求头名称重复：X-App')).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: '修改键值对' })).toBeInTheDocument()
  })

  it('renders profile route by default', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })

    renderPage()

    await screen.findByRole('button', { name: '个人资料' })
    expect(screen.getByTestId('location-display')).toHaveTextContent('/settings/profile')
  })

  it('renders profile information architecture sections', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })

    renderPage('/settings/profile')

    await screen.findByRole('heading', { name: '个人资料' })
    expect(screen.getByRole('heading', { name: '姓名' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '动效分级' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: '全站动效分级' })).toBeInTheDocument()
    expect(screen.queryByLabelText('昵称')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '编辑姓名' }))
    expect(screen.getByLabelText('昵称')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument()
    expect(screen.getByText('头像上传功能已下线，保留历史头像展示。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '更换' })).not.toBeInTheDocument()
  })

  it('renders account management sections and can expand password form', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })

    renderPage('/settings/account')

    await screen.findByRole('heading', { name: '账户管理' })
    expect(screen.getByRole('heading', { name: '登录密码' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '邮箱验证' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '修改密码' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '修改密码' }))
    expect(screen.getByLabelText('当前密码')).toBeInTheDocument()
    expect(screen.getByLabelText('确认新密码')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出登录' })).toBeInTheDocument()
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
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
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
    await userEvent.click(screen.getByRole('button', { name: '生成预测数据：DeepSeek-V3.2' }))

    expect(screen.getByRole('heading', { name: 'DeepSeek-V3.2' })).toBeInTheDocument()
    expect(screen.getByLabelText('生成模式')).toHaveValue('current')

    await userEvent.selectOptions(screen.getByLabelText('生成模式'), 'history')
    expect(screen.getByLabelText('历史范围')).toHaveValue('custom')
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
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
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
    await userEvent.click(screen.getByRole('button', { name: '生成预测数据：DeepSeek-V3.2' }))
    await userEvent.selectOptions(screen.getByLabelText('生成彩种'), 'pl3')
    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() =>
      expect(apiClientMock.generateSettingsModelPredictions).toHaveBeenCalledWith({
        lottery_code: 'pl3',
        model_code: 'deepseek-v3.2',
        mode: 'current',
        prediction_play_mode: 'direct',
        overwrite: false,
        parallelism: 3,
        prompt_history_period_count: 50,
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
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
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
    await userEvent.click(screen.getByRole('button', { name: '生成预测数据：DeepSeek-V3.2' }))
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
        prediction_play_mode: 'direct',
        overwrite: false,
        parallelism: 5,
        start_period: '26050',
        end_period: '26052',
        prompt_history_period_count: 50,
      }),
    )
  })

  it('uses match date instead of generation mode for worldcup prediction tasks', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-15T12:00:00+08:00'))
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'worldcup-deepseek',
          display_name: 'WorldCup DeepSeek',
          provider: 'deepseek',
          api_model_name: 'deepseek-chat',
          version: '1',
          tags: ['worldcup'],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'worldcup',
          lottery_codes: ['dlt', 'worldcup'],
          temperature: null,
          is_active: true,
          is_deleted: false,
          updated_at: '2026-03-16 12:00:00',
        },
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.getWorldCupMatches.mockResolvedValue({
      matches: [
        {
          match_id: 'worldcup-match-1',
          home_team: '西班牙',
          away_team: '佛得角',
          kickoff_at: Date.UTC(2026, 5, 16, 4, 0, 0) / 1000,
          stage: '世界杯',
          status: 'scheduled',
          latest_odds: {},
          recommendation_count: 0,
        },
        {
          match_id: 'worldcup-match-2',
          home_team: '葡萄牙',
          away_team: '摩洛哥',
          kickoff_at: Date.UTC(2026, 5, 16, 12, 0, 0) / 1000,
          stage: '世界杯',
          status: 'live',
          latest_odds: {},
          recommendation_count: 0,
        },
        {
          match_id: 'worldcup-match-3',
          home_team: '法国',
          away_team: '日本',
          kickoff_at: Date.UTC(2026, 5, 17, 4, 0, 0) / 1000,
          stage: '世界杯',
          status: 'scheduled',
          latest_odds: {},
          recommendation_count: 0,
        },
        {
          match_id: 'worldcup-match-finished',
          home_team: '德国',
          away_team: '美国',
          kickoff_at: Date.UTC(2026, 5, 18, 4, 0, 0) / 1000,
          stage: '世界杯',
          status: 'finished',
          latest_odds: {},
          recommendation_count: 0,
        },
      ],
      total_count: 4,
    })
    apiClientMock.generateSettingsWorldCupPredictions.mockResolvedValue({
      task_id: 'worldcup-task-1',
      lottery_code: 'worldcup',
      status: 'queued',
      mode: 'current',
      model_code: 'worldcup-deepseek',
      created_at: Date.UTC(2026, 5, 15) / 1000,
      started_at: null,
      finished_at: null,
      progress_summary: {
        mode: 'current',
        model_code: 'worldcup-deepseek',
        match_date: '2026-06-17',
        match_ids: ['worldcup-match-3'],
        processed_count: 0,
        skipped_count: 0,
        failed_count: 0,
        failed_periods: [],
      },
      error_message: null,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    await userEvent.click(screen.getByRole('button', { name: '生成预测数据：WorldCup DeepSeek' }))
    await userEvent.selectOptions(screen.getByLabelText('生成彩种'), 'worldcup')

    const matchDateSelect = await screen.findByLabelText('比赛日期')
    expect(screen.queryByLabelText('生成模式')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Prompt历史期数')).not.toBeInTheDocument()
    expect(await screen.findByRole('option', { name: '2026-06-16（2场）' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '2026-06-18（1场）' })).not.toBeInTheDocument()
    expect(matchDateSelect).toHaveValue('2026-06-16')
    expect(await screen.findByLabelText('西班牙 vs 佛得角')).toBeChecked()
    expect(screen.getByLabelText('葡萄牙 vs 摩洛哥')).toBeChecked()

    await userEvent.selectOptions(matchDateSelect, '2026-06-17')
    expect(await screen.findByLabelText('法国 vs 日本')).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() =>
      expect(apiClientMock.generateSettingsWorldCupPredictions).toHaveBeenCalledWith({
        model_code: 'worldcup-deepseek',
        play_type: 'all',
        overwrite: false,
        match_date: '2026-06-17',
        match_ids: ['worldcup-match-3'],
      }),
    )
  })

  it('submits history generate task with recent-period preset and disables manual range inputs', async () => {
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
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.generateSettingsModelPredictions.mockResolvedValue({
      task_id: 'task-2',
      status: 'queued',
      mode: 'history',
      model_code: 'deepseek-v3.2',
      created_at: '2026-03-16T12:00:00Z',
      started_at: null,
      finished_at: null,
      progress_summary: {
        mode: 'history',
        model_code: 'deepseek-v3.2',
        parallelism: 3,
        processed_count: 0,
        skipped_count: 0,
        failed_count: 0,
        failed_periods: [],
      },
      error_message: null,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    await userEvent.click(screen.getByRole('button', { name: '生成预测数据：DeepSeek-V3.2' }))
    await userEvent.selectOptions(screen.getByLabelText('生成模式'), 'history')
    await userEvent.selectOptions(screen.getByLabelText('历史范围'), '10')

    expect(screen.getByLabelText('开始期号')).toBeDisabled()
    expect(screen.getByLabelText('结束期号')).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() =>
      expect(apiClientMock.generateSettingsModelPredictions).toHaveBeenCalledWith({
        lottery_code: 'dlt',
        model_code: 'deepseek-v3.2',
        mode: 'history',
        prediction_play_mode: 'direct',
        overwrite: false,
        parallelism: 3,
        recent_period_count: 10,
        prompt_history_period_count: 50,
      }),
    )
  })

  it('shows maintenance list and starts fetch task for super admin', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
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

    await userEvent.click(await screen.findByRole('button', { name: '数据维护' }))
    expect(screen.getByRole('heading', { name: '数据维护' })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader', { name: '彩种' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: '立即执行' }).length).toBeGreaterThan(0)

    await userEvent.click(screen.getAllByRole('button', { name: '立即执行' })[0])

    expect(apiClientMock.fetchSettingsLotteryHistory).toHaveBeenCalledWith('dlt', 30)
    await waitFor(() => expect(apiClientMock.getLotteryFetchTaskDetail).toHaveBeenCalledWith('lottery-task-1'), { timeout: 2500 })
    expect(await screen.findByText('2026033')).toBeInTheDocument()
  })

  it('starts full lottery bootstrap task from maintenance page', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.bootstrapSettingsLotteryHistory.mockResolvedValue({
      task_id: 'bootstrap-task-1',
      lottery_code: 'all',
      status: 'queued',
      created_at: '2026-03-16T12:00:00Z',
      started_at: null,
      finished_at: null,
      progress_summary: {
        lottery_codes: ['dlt', 'pl3', 'pl5', 'qxc'],
        total_lotteries: 4,
        current_lottery: null,
        current_lottery_index: 0,
        phase: 'queued',
        base_fetched: 0,
        base_saved: 0,
        detail_processed: 0,
        detail_failed: 0,
        fetched_count: 0,
        saved_count: 0,
        latest_period: null,
        current_period: null,
        duration_ms: 0,
      },
      error_message: null,
    })
    apiClientMock.getLotteryFetchTaskDetail.mockResolvedValue({
      task_id: 'bootstrap-task-1',
      lottery_code: 'all',
      status: 'succeeded',
      created_at: '2026-03-16T12:00:00Z',
      started_at: '2026-03-16T12:00:01Z',
      finished_at: '2026-03-16T12:00:03Z',
      progress_summary: {
        lottery_codes: ['dlt', 'pl3', 'pl5', 'qxc'],
        total_lotteries: 4,
        current_lottery: null,
        current_lottery_index: 4,
        phase: 'done',
        base_fetched: 400,
        base_saved: 400,
        detail_processed: 120,
        detail_failed: 1,
        fetched_count: 400,
        saved_count: 400,
        latest_period: '26001',
        current_period: null,
        duration_ms: 2034,
      },
      error_message: null,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '数据维护' }))
    await userEvent.click(screen.getByRole('button', { name: '初始化近100期' }))

    expect(apiClientMock.bootstrapSettingsLotteryHistory).toHaveBeenCalledWith({
      lottery_codes: ['dlt', 'pl3', 'pl5', 'qxc'],
      chunk_size: 100,
      detail_mode: 'main',
      resume: true,
    })
    await waitFor(() => expect(apiClientMock.getLotteryFetchTaskDetail).toHaveBeenCalledWith('bootstrap-task-1'), { timeout: 2500 })
    expect(await screen.findByText('120')).toBeInTheDocument()
  })

  it('shows prediction generation logs in maintenance table', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.listMaintenanceRunLogs.mockResolvedValue({
      logs: [
        {
          id: 99,
          task_id: 'pred-task-1',
          lottery_code: 'dlt',
          trigger_type: 'manual',
          task_type: 'prediction_generate',
          mode: 'history',
          model_code: '__bulk__',
          status: 'succeeded',
          started_at: '2026-03-24T01:00:00Z',
          finished_at: '2026-03-24T01:00:08Z',
          fetched_count: 0,
          saved_count: 0,
          processed_count: 2,
          skipped_count: 1,
          failed_count: 0,
          latest_period: null,
          duration_ms: 8000,
          error_message: null,
          created_at: '2026-03-24T01:00:00Z',
          updated_at: '2026-03-24T01:00:08Z',
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '数据维护' }))
    expect(screen.getByRole('columnheader', { name: '开始时间' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '结束时间' })).toBeInTheDocument()
    expect(screen.getByText('预测生成')).toBeInTheDocument()
    expect(screen.getByText('2 / 1 / 0')).toBeInTheDocument()
    expect(screen.getByText('历史重算 · 批量模型')).toBeInTheDocument()
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
          provider: 'deepseek',
          api_model_name: 'deepseek-reasoner',
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
    expect(screen.queryByRole('button', { name: '批量编辑' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '批量停用' }))
    await waitFor(() => expect(apiClientMock.bulkUpdateSettingsModels).toHaveBeenCalled())

    await userEvent.click(screen.getByRole('checkbox', { name: '全选模型' }))
    await userEvent.click(screen.getByRole('button', { name: '批量生成预测' }))
    expect(screen.getByRole('heading', { name: '已选 2 个模型' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))
    await waitFor(() => expect(apiClientMock.bulkGenerateSettingsModelPredictions).toHaveBeenCalled())
  })

  it('hides basic and auth sections in model modal while keeping custom request params', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({
      providers: [
        { code: 'custom-provider', name: 'My Provider', is_system_preset: false, api_format: 'openai_compatible', base_url: '' },
        { code: 'deepseek', name: 'DeepSeek', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://api.deepseek.com' },
        { code: 'aihubmix', name: 'AIHubMix', is_system_preset: true, api_format: 'anthropic', base_url: 'https://aihubmix.com/v1' },
      ],
    })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })

    renderPage('/settings/models')

    await selectManagedProvider(/DSDeepSeek/)
    await screen.findByRole('button', { name: '自定义模型' })
    await userEvent.click(screen.getByRole('button', { name: '自定义模型' }))

    expect(screen.queryByText('基础信息')).not.toBeInTheDocument()
    expect(screen.queryByText('连接与鉴权')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Temperature')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '测试连通性' })).toBeInTheDocument()
    expect(screen.getByText('自定义请求体参数')).toBeInTheDocument()
    expect(screen.getByText('temperature')).toBeInTheDocument()

    const paramSummary = screen.getByText('自定义请求体参数').closest('.model-config-modal__param-summary') as HTMLElement
    await userEvent.click(within(paramSummary).getByRole('button', { name: '修改' }))
    expect(screen.getByRole('heading', { name: '修改键值对' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('temperature')).toBeInTheDocument()
  })

  it('passes custom request body params in model connectivity test', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({
      providers: [
        { code: 'deepseek', name: 'DeepSeek', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://api.deepseek.com' },
      ],
    })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.testSettingsModelConnectivity.mockResolvedValue({ ok: true, message: 'ok', duration_ms: 120 })

    renderPage('/settings/models')

    await selectManagedProvider(/DSDeepSeek/)
    await screen.findByRole('button', { name: '自定义模型' })
    await userEvent.click(screen.getByRole('button', { name: '自定义模型' }))
    const paramSummary = screen.getByText('自定义请求体参数').closest('.model-config-modal__param-summary') as HTMLElement
    await userEvent.click(within(paramSummary).getByRole('button', { name: '修改' }))
    await userEvent.clear(screen.getByDisplayValue('0.3'))
    await userEvent.type(screen.getByPlaceholderText('请输入值'), '0.9')
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await userEvent.click(screen.getByRole('button', { name: '测试连通性' }))

    await waitFor(() =>
      expect(apiClientMock.testSettingsModelConnectivity).toHaveBeenCalledWith(
        expect.objectContaining({
          extra_options: expect.objectContaining({
            custom_body_params: expect.objectContaining({ temperature: 0.9 }),
          }),
        }),
      ),
    )
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
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
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
        prediction_play_mode: 'direct',
        overwrite: false,
        parallelism: 3,
        prompt_history_period_count: 50,
      }),
    )
  })

  it('shows schedule tab and renders schedule tasks', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
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
          prediction_play_mode: 'direct',
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
    await userEvent.click(screen.getByRole('button', { name: /更多操作：大乐透抓取/ }))
    await userEvent.click(screen.getByRole('button', { name: '编辑任务' }))
    expect(await screen.findByRole('heading', { name: '编辑任务' })).toBeInTheDocument()
    expect(screen.getByLabelText('任务名称')).toHaveValue('大乐透抓取')

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: /更多操作：大乐透抓取/ }))
    await userEvent.click(screen.getByRole('button', { name: '删除任务' }))
    expect(confirmSpy).toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('supports schedule calendar view with day detail panel', async () => {
    const nowTs = Math.floor(Date.now() / 1000)
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.listScheduleRunLogs.mockResolvedValue({
      logs: [
        {
          id: 11,
          task_id: 'task-11',
          schedule_task_code: 'sched-qxc-fetch',
          lottery_code: 'qxc',
          trigger_type: 'schedule',
          task_type: 'lottery_fetch',
          status: 'failed',
          started_at: nowTs - 200,
          finished_at: nowTs - 180,
          fetched_count: 0,
          saved_count: 0,
          duration_ms: 1300,
          error_message: '503',
          created_at: nowTs - 210,
          updated_at: nowTs - 180,
        },
        {
          id: 12,
          task_id: 'task-12',
          schedule_task_code: 'sched-qxc-fetch',
          lottery_code: 'qxc',
          trigger_type: 'manual',
          task_type: 'lottery_fetch',
          status: 'succeeded',
          started_at: nowTs - 80,
          finished_at: nowTs - 60,
          fetched_count: 30,
          saved_count: 10,
          duration_ms: 1200,
          error_message: null,
          created_at: nowTs - 90,
          updated_at: nowTs - 60,
        },
      ],
      total_count: 2,
    })
    apiClientMock.listScheduleTasks.mockResolvedValue({
      tasks: [
        {
          task_code: 'sched-qxc-fetch',
          task_name: '七星彩抓取',
          task_type: 'lottery_fetch',
          lottery_code: 'qxc',
          model_codes: [],
          generation_mode: 'current',
          prediction_play_mode: 'direct',
          overwrite_existing: false,
          schedule_mode: 'preset',
          preset_type: 'daily',
          time_of_day: '21:25',
          weekdays: [],
          cron_expression: null,
          is_active: true,
          next_run_at: '2026-03-19T13:25:00Z',
          last_run_at: null,
          last_run_status: null,
          last_error_message: null,
          last_task_id: null,
          rule_summary: '每日 21:25',
          created_at: '2026-03-18T01:00:00Z',
          updated_at: '2026-03-18T01:00:00Z',
        },
      ],
    })

    renderPage('/settings/schedules')

    await screen.findByText('七星彩抓取')
    await userEvent.click(screen.getByRole('button', { name: '日历视图' }))

    expect(screen.getByRole('button', { name: '日历视图' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: /上个月/ })).toBeInTheDocument()
    expect(screen.getByText('北京时间 · 共 1 个触发任务')).toBeInTheDocument()
    expect(screen.getAllByText('七星彩抓取').length).toBeGreaterThan(0)
    expect(screen.getAllByText('21:25').length).toBeGreaterThan(0)
    expect(screen.getByText('定时')).toBeInTheDocument()
    expect(screen.getByText('手动')).toBeInTheDocument()
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
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
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
      prediction_play_mode: 'direct',
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
          prediction_play_mode: 'direct',
          time_of_day: '09:00',
        }),
      ),
    )
  })

  it('shows prediction play mode in schedule list and detail for pl3 tasks', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.listScheduleTasks.mockResolvedValue({
      tasks: [
        {
          task_code: 'sched-predict-pl3-sum',
          task_name: '排列3和值预测',
          task_type: 'prediction_generate',
          lottery_code: 'pl3',
          model_codes: ['pl3-model-a'],
          generation_mode: 'current',
          prediction_play_mode: 'direct_sum',
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
          rule_summary: '每日 10:00 · 和值',
          created_at: '2026-03-18T02:00:00Z',
          updated_at: '2026-03-18T02:00:00Z',
        },
      ],
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '定时任务' }))
    expect(await screen.findByText('排列3和值预测')).toBeInTheDocument()
    expect(screen.getByText('每日 · 和值')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /查看详情：排列3和值预测/ }))
    expect(await screen.findByText('预测玩法')).toBeInTheDocument()
    expect(screen.getAllByText('和值').length).toBeGreaterThan(0)
  })

  it('hides inactive models when editing schedule tasks', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'pl3-model-a',
          display_name: 'PL3 模型 A',
          provider: 'deepseek',
          api_model_name: 'deepseek-chat',
          version: '1',
          tags: ['reasoning'],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'pl3',
          temperature: null,
          is_active: true,
          is_deleted: false,
          lottery_codes: ['pl3'],
          updated_at: '2026-03-16 12:00:00',
        },
        {
          model_code: 'pl3-model-disabled',
          display_name: 'PL3 停用模型',
          provider: 'deepseek',
          api_model_name: 'deepseek-reasoner',
          version: '1',
          tags: ['reasoning'],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'pl3',
          temperature: null,
          is_active: false,
          is_deleted: false,
          lottery_codes: ['pl3'],
          updated_at: '2026-03-16 12:00:00',
        },
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.listScheduleTasks.mockResolvedValue({
      tasks: [
        {
          task_code: 'sched-predict-pl3-direct',
          task_name: '排列3直选预测',
          task_type: 'prediction_generate',
          lottery_code: 'pl3',
          model_codes: ['pl3-model-a'],
          generation_mode: 'current',
          prediction_play_mode: 'direct',
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
          rule_summary: '每日 10:00 · 直选',
          created_at: '2026-03-18T02:00:00Z',
          updated_at: '2026-03-18T02:00:00Z',
        },
      ],
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '定时任务' }))
    await userEvent.click(screen.getByRole('button', { name: /更多操作：排列3直选预测/ }))
    await userEvent.click(screen.getByRole('button', { name: '编辑任务' }))
    expect(await screen.findByRole('heading', { name: '编辑任务' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'PL3 模型 A' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'PL3 停用模型' })).not.toBeInTheDocument()
  })

  it('supports selecting pl3 prediction play mode for schedule tasks', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'pl3-model-a',
          display_name: 'PL3 模型 A',
          provider: 'deepseek',
          api_model_name: 'deepseek-chat',
          version: '1',
          tags: ['reasoning'],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'pl3',
          temperature: null,
          is_active: true,
          is_deleted: false,
          lottery_codes: ['pl3'],
          updated_at: '2026-03-16 12:00:00',
        },
        {
          model_code: 'pl3-model-disabled',
          display_name: 'PL3 停用模型',
          provider: 'deepseek',
          api_model_name: 'deepseek-reasoner',
          version: '1',
          tags: ['reasoning'],
          base_url: 'https://api.deepseek.com',
          api_key: '',
          app_code: 'pl3',
          temperature: null,
          is_active: false,
          is_deleted: false,
          lottery_codes: ['pl3'],
          updated_at: '2026-03-16 12:00:00',
        },
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [DEEPSEEK_PROVIDER_FIXTURE] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.createScheduleTask.mockResolvedValue({
      task_code: 'sched-predict-pl3-sum',
      task_name: '排列3和值预测',
      task_type: 'prediction_generate',
      lottery_code: 'pl3',
      model_codes: ['pl3-model-a'],
      generation_mode: 'current',
      prediction_play_mode: 'direct_sum',
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
      rule_summary: '每日 10:00 · 和值',
      created_at: '2026-03-18T02:00:00Z',
      updated_at: '2026-03-18T02:00:00Z',
    })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '定时任务' }))
    await userEvent.click(screen.getByRole('button', { name: '新增任务' }))
    await userEvent.type(screen.getByLabelText('任务名称'), '排列3和值预测')
    await userEvent.selectOptions(screen.getByLabelText('任务类型'), 'prediction_generate')
    await userEvent.selectOptions(screen.getByLabelText('彩种'), 'pl3')
    expect(screen.queryByRole('checkbox', { name: 'PL3 停用模型' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('预测玩法'), 'direct_sum')
    await userEvent.click(screen.getByRole('checkbox', { name: 'PL3 模型 A' }))
    await userEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() =>
      expect(apiClientMock.createScheduleTask).toHaveBeenCalledWith(
        expect.objectContaining({
          task_name: '排列3和值预测',
          lottery_code: 'pl3',
          prediction_play_mode: 'direct_sum',
          model_codes: ['pl3-model-a'],
        }),
      ),
    )
  })

  it('adds XiaoMi Token Plan provider source with default models', async () => {
    apiClientMock.getSettingsModels.mockResolvedValue({ models: [] })
    apiClientMock.getSettingsProviders.mockResolvedValue({
      providers: [
        { code: 'deepseek', name: 'DeepSeek', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://api.deepseek.com' },
        { code: 'aihubmix', name: 'AIHubMix', is_system_preset: true, api_format: 'openai_compatible', base_url: 'https://aihubmix.com/v1' },
      ],
    })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })
    apiClientMock.getSettingsPredictionRecords.mockResolvedValue({ records: [] })
    apiClientMock.createSettingsProvider.mockResolvedValue({
      code: 'xiaomi_token_plan_1',
      name: 'xiaomi_token_plan_1',
      is_system_preset: false,
      api_format: 'openai_compatible',
      base_url: 'https://token-plan-cn.xiaomimimo.com/v1',
      extra_options: {},
      model_configs: [],
    })

    renderPage('/settings/models')

    expect(await screen.findByRole('heading', { name: '全部模型' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '新增' }))
    await userEvent.click(screen.getByRole('menuitem', { name: /XiaoMi Token Plan/ }))

    expect(await screen.findByRole('heading', { name: 'xiaomi_token_plan_1' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('https://token-plan-cn.xiaomimimo.com/v1')).toBeInTheDocument()
    expect(screen.getByText('MiMo-V2.5-Pro')).toBeInTheDocument()
    expect(screen.getByText('MiMo-V2.5')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '保存配置' }))
    await waitFor(() =>
      expect(apiClientMock.createSettingsProvider).toHaveBeenCalledWith(expect.objectContaining({
        code: 'xiaomi_token_plan_1',
        name: 'xiaomi_token_plan_1',
        base_url: 'https://token-plan-cn.xiaomimimo.com/v1',
        api_format: 'openai_compatible',
        model_configs: [
          { model_id: 'mimo-v2.5-pro', display_name: 'MiMo-V2.5-Pro' },
          { model_id: 'mimo-v2.5', display_name: 'MiMo-V2.5' },
        ],
      })),
    )
  })
})
