import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExpertsSettingsPage } from './ExpertsSettingsPage'

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: {
    getSettingsExperts: vi.fn(),
    getSettingsModels: vi.fn(),
    createSettingsExpert: vi.fn(),
    updateSettingsExpert: vi.fn(),
    toggleSettingsExpert: vi.fn(),
    deleteSettingsExpert: vi.fn(),
    startSettingsExpertPredictionRun: vi.fn(),
    getSettingsExpertPredictionTask: vi.fn(),
  },
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: apiClientMock,
}))

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  render(
    <QueryClientProvider client={client}>
      <ExpertsSettingsPage />
    </QueryClientProvider>,
  )
}

describe('ExpertsSettingsPage generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClientMock.getSettingsExperts.mockResolvedValue({
      experts: [
        {
          id: 1,
          expert_code: 'wei-rong-jie',
          display_name: '魏荣杰',
          bio: '',
          model_code: 'deepseek-v3.2',
          lottery_code: 'dlt',
          history_window_count: 50,
          is_active: true,
          is_deleted: false,
          config: {
            dlt_front_weights: {},
            dlt_back_weights: {},
            strategy_preferences: {},
            pl3_reserved_weights: {},
          },
          updated_at: 1770000000,
          created_at: 1770000000,
        },
      ],
    })
    apiClientMock.getSettingsModels.mockResolvedValue({
      models: [
        {
          model_code: 'deepseek-v3.2',
          display_name: 'DeepSeek V3.2',
          is_active: true,
          is_deleted: false,
          lottery_codes: ['dlt'],
        },
      ],
    })
    apiClientMock.updateSettingsExpert.mockResolvedValue({
      expert_code: 'wei-rong-jie',
      display_name: '魏荣杰',
      model_code: 'deepseek-v3.2',
      lottery_code: 'dlt',
      is_active: true,
      config: {},
    })
    apiClientMock.startSettingsExpertPredictionRun.mockResolvedValue({
      task_id: 'expert-task-1',
      status: 'queued',
      lottery_code: 'dlt',
      mode: 'history',
      expert_code: 'wei-rong-jie',
      created_at: 1770000000,
      started_at: null,
      finished_at: null,
      progress_summary: {
        lottery_code: 'dlt',
        mode: 'history',
        expert_code: 'wei-rong-jie',
        parallelism: 3,
        processed_count: 0,
        skipped_count: 0,
        failed_count: 0,
        task_total_count: 10,
        task_completed_count: 0,
      },
      error_message: null,
    })
    apiClientMock.getSettingsExpertPredictionTask.mockResolvedValue({
      task_id: 'expert-task-1',
      status: 'succeeded',
      lottery_code: 'dlt',
      mode: 'history',
      expert_code: 'wei-rong-jie',
      created_at: 1770000000,
      started_at: 1770000001,
      finished_at: 1770000002,
      progress_summary: {
        lottery_code: 'dlt',
        mode: 'history',
        expert_code: 'wei-rong-jie',
        parallelism: 3,
        processed_count: 10,
        skipped_count: 0,
        failed_count: 0,
        task_total_count: 10,
        task_completed_count: 10,
      },
      error_message: null,
    })
  })

  it('opens the single-expert generation modal and submits selected parameters', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('魏荣杰')
    expect(screen.getByText('2026-02-02 10:40')).toBeInTheDocument()
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '生成预测' }))

    expect(screen.getByRole('heading', { name: '魏荣杰' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('大乐透')).toBeDisabled()

    await user.selectOptions(screen.getByLabelText('生成模式'), 'history')
    await user.selectOptions(screen.getByLabelText('结果策略'), 'overwrite')
    await user.selectOptions(screen.getByLabelText('历史范围'), '10')
    await user.selectOptions(screen.getByLabelText('Prompt历史期数'), '50')
    await user.clear(screen.getByLabelText('并发线程数'))
    await user.type(screen.getByLabelText('并发线程数'), '3')
    await user.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() => expect(apiClientMock.startSettingsExpertPredictionRun).toHaveBeenCalled())
    expect(apiClientMock.startSettingsExpertPredictionRun).toHaveBeenCalledWith({
      lottery_code: 'dlt',
      expert_code: 'wei-rong-jie',
      mode: 'history',
      overwrite: true,
      parallelism: 3,
      prompt_history_period_count: 50,
      recent_period_count: 10,
    })
    expect(await screen.findByText('专家历史生成任务')).toBeInTheDocument()
  })

  it('edits expanded expert weights and submits the new config keys', async () => {
    const user = userEvent.setup()
    renderPage()

    await screen.findByText('魏荣杰')
    await user.click(screen.getByRole('button', { name: '编辑' }))

    expect(screen.getByRole('heading', { name: '编辑专家' })).toBeInTheDocument()
    expect(screen.getByText('基础比例 / 分布类')).toBeInTheDocument()
    expect(screen.getByText('和值 / 均值 / 跨度类')).toBeInTheDocument()
    expect(screen.getByLabelText('五区比权重')).toHaveValue(8)
    expect(screen.getByLabelText('012路比权重')).toHaveValue(6)

    await user.click(screen.getByRole('tab', { name: /策略倾向/ }))
    expect(screen.getByText('遗漏相关')).toBeInTheDocument()
    expect(screen.getByText('回补信号')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(apiClientMock.updateSettingsExpert).toHaveBeenCalled())
    expect(apiClientMock.updateSettingsExpert).toHaveBeenCalledWith(
      'wei-rong-jie',
      expect.objectContaining({
        config: expect.objectContaining({
          dlt_front_weights: expect.objectContaining({
            five_zone_ratio: 8,
            mod3_ratio: 6,
            frequency_probability: 2,
          }),
          dlt_back_weights: expect.objectContaining({
            three_zone_ratio: 10,
            odd_even_shape: 7,
          }),
          strategy_preferences: expect.objectContaining({
            avg_omit: 8,
            rebound_probability: 4,
            inertia_continuation: 3,
          }),
        }),
      }),
    )
  })
})
