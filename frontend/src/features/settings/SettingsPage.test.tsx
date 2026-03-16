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
      ],
    })
    apiClientMock.getSettingsProviders.mockResolvedValue({ providers: [] })
    apiClientMock.listUsers.mockResolvedValue({ users: [] })
    apiClientMock.listRoles.mockResolvedValue({ roles: [] })
    apiClientMock.listPermissions.mockResolvedValue({ permissions: [] })

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: '模型管理' }))
    expect(await screen.findByRole('button', { name: '列表视图' })).toHaveClass('is-active')
    expect(screen.getByRole('columnheader', { name: '模型名称' })).toBeInTheDocument()
    expect(screen.getByText('DeepSeek-V3.2')).toBeInTheDocument()
    expect(screen.queryByText('https://api.deepseek.com')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: '卡片视图' }))

    expect(screen.getByRole('button', { name: '卡片视图' })).toHaveClass('is-active')
    expect(screen.getByText('https://api.deepseek.com')).toBeInTheDocument()
  })
})
