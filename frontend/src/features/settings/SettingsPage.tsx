import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import { StatusCard } from '../../shared/components/StatusCard'
import { useAuth } from '../../shared/auth/AuthProvider'
import type {
  PasswordChangePayload,
  PermissionItem,
  PermissionUpdatePayload,
  RoleItem,
  RolePayload,
  SettingsModelPayload,
} from '../../shared/types/api'

type SettingsTab = 'profile' | 'models' | 'users' | 'roles'
type ModelManagementView = 'list' | 'card'

const EMPTY_MODEL_FORM: SettingsModelPayload = {
  model_code: '',
  display_name: '',
  provider: 'openai_compatible',
  api_model_name: '',
  version: '',
  tags: [],
  base_url: '',
  api_key: '',
  app_code: '',
  temperature: null,
  is_active: true,
}

const EMPTY_PASSWORD_FORM: PasswordChangePayload & { confirm_password: string } = {
  current_password: '',
  new_password: '',
  confirm_password: '',
}

const EMPTY_ROLE_FORM: RolePayload = {
  role_code: '',
  role_name: '',
  permissions: [],
}

function getRoleProtectionHint(role: RoleItem | null) {
  if (!role) return '自定义角色可按需分配权限；角色编码创建后不可修改。'
  if (role.role_code === 'super_admin') return '超级管理员始终保留全部权限，系统会阻止移除关键授权。'
  if (role.role_code === 'normal_user') return '普通用户默认仅开放基础信息，适合作为注册用户或基础成员角色。'
  if (role.is_system) return '系统角色可编辑名称，但不能删除，请谨慎调整其展示文案。'
  return '删除自定义角色前，请先确认没有用户仍在使用该角色。'
}

function mapRoleActionError(message: string) {
  if (message.includes('系统角色不能删除')) return '系统角色是内置角色，不能删除；如需调整，请修改名称或权限说明。'
  if (message.includes('仍有用户使用该角色')) return '该角色仍有成员在使用，需先为这些用户改绑其他角色后才能删除。'
  if (message.includes('至少保留一个超级管理员')) return '系统至少需要保留一个启用中的超级管理员，请先确认还有其他超级管理员可用。'
  return message
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user, hasPermission, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [modelManagementView, setModelManagementView] = useState<ModelManagementView>('list')
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [profileNickname, setProfileNickname] = useState(user?.nickname || '')
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM)
  const [modelForm, setModelForm] = useState<SettingsModelPayload>(EMPTY_MODEL_FORM)
  const [selectedModelCode, setSelectedModelCode] = useState<string | null>(null)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [modelMode, setModelMode] = useState<'create' | 'edit'>('create')
  const [newUserForm, setNewUserForm] = useState({ username: '', nickname: '', password: '', role: 'normal_user', is_active: true })
  const [resetPasswordMap, setResetPasswordMap] = useState<Record<number, string>>({})
  const [roleForm, setRoleForm] = useState<RolePayload>(EMPTY_ROLE_FORM)
  const [selectedRoleCode, setSelectedRoleCode] = useState<string | null>(null)

  const canManageModels = hasPermission('model_management')
  const canManageUsers = hasPermission('user_management')
  const canManageRoles = hasPermission('role_management')

  const modelsQuery = useQuery({
    queryKey: ['settings-models', includeDeleted],
    queryFn: () => apiClient.getSettingsModels(includeDeleted),
    enabled: canManageModels,
  })
  const providersQuery = useQuery({
    queryKey: ['settings-providers'],
    queryFn: () => apiClient.getSettingsProviders(),
    enabled: canManageModels,
  })
  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.listUsers(),
    enabled: canManageUsers,
  })
  const rolesQuery = useQuery({
    queryKey: ['admin-roles'],
    queryFn: () => apiClient.listRoles(),
    enabled: canManageUsers || canManageRoles,
  })
  const permissionsQuery = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => apiClient.listPermissions(),
    enabled: canManageRoles,
  })

  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: SettingsTab; label: string }> = [{ id: 'profile', label: '基础信息' }]
    if (canManageModels) tabs.push({ id: 'models', label: '模型管理' })
    if (canManageUsers) tabs.push({ id: 'users', label: '用户管理' })
    if (canManageRoles) tabs.push({ id: 'roles', label: '角色管理' })
    return tabs
  }, [canManageModels, canManageRoles, canManageUsers])

  useEffect(() => {
    if (!availableTabs.some((item) => item.id === activeTab)) {
      setActiveTab(availableTabs[0]?.id || 'profile')
    }
  }, [activeTab, availableTabs])

  useEffect(() => {
    setProfileNickname(user?.nickname || '')
  }, [user?.nickname])

  const models = modelsQuery.data?.models || []
  const providers = providersQuery.data?.providers || []
  const users = usersQuery.data?.users || []
  const roles = rolesQuery.data?.roles || []
  const permissions = permissionsQuery.data?.permissions || []
  const selectedRole = roles.find((role) => role.role_code === selectedRoleCode) || null
  const permissionMap = useMemo(
    () => Object.fromEntries(permissions.map((permission) => [permission.permission_code, permission])),
    [permissions],
  )
  const selectedRoleProtectionHint = getRoleProtectionHint(selectedRole)

  const profileMutation = useMutation({
    mutationFn: () => apiClient.updateProfile({ nickname: profileNickname.trim() }),
    onSuccess: (response) => {
      queryClient.setQueryData(['auth', 'me'], response.user)
      setMessage('基础信息已更新。')
      setMessageType('success')
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '保存失败')
      setMessageType('error')
    },
  })

  const passwordMutation = useMutation({
    mutationFn: () => apiClient.changePassword({ current_password: passwordForm.current_password, new_password: passwordForm.new_password }),
    onSuccess: async () => {
      setMessage('密码已修改，请重新登录。')
      setMessageType('success')
      setPasswordForm(EMPTY_PASSWORD_FORM)
      await logout()
      navigate('/login', { replace: true })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '修改密码失败')
      setMessageType('error')
    },
  })

  const saveModelMutation = useMutation({
    mutationFn: (payload: SettingsModelPayload) =>
      modelMode === 'create' ? apiClient.createSettingsModel(payload) : apiClient.updateSettingsModel(selectedModelCode || '', payload),
    onSuccess: () => {
      setMessage(modelMode === 'create' ? '模型已创建。' : '模型已更新。')
      setMessageType('success')
      setModelModalOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['settings-models'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '模型保存失败')
      setMessageType('error')
    },
  })

  const modelActionMutation = useMutation({
    mutationFn: async (action: { type: 'toggle' | 'delete' | 'restore'; modelCode: string; isActive?: boolean }) => {
      if (action.type === 'toggle') return apiClient.toggleSettingsModel(action.modelCode, Boolean(action.isActive))
      if (action.type === 'delete') return apiClient.deleteSettingsModel(action.modelCode)
      return apiClient.restoreSettingsModel(action.modelCode)
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings-models'] }),
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '模型操作失败')
      setMessageType('error')
    },
  })

  const createUserMutation = useMutation({
    mutationFn: () => apiClient.createUser(newUserForm),
    onSuccess: () => {
      setMessage('用户已创建。')
      setMessageType('success')
      setNewUserForm({ username: '', nickname: '', password: '', role: 'normal_user', is_active: true })
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '创建用户失败')
      setMessageType('error')
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: ({ userId, role, isActive }: { userId: number; role: string; isActive: boolean }) =>
      apiClient.updateUser({ user_id: userId, role, is_active: isActive }),
    onSuccess: () => {
      setMessage('用户已更新。')
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-roles'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '更新用户失败')
      setMessageType('error')
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) =>
      apiClient.resetUserPassword({ user_id: userId, password }),
    onSuccess: () => {
      setMessage('密码已重置。')
      setMessageType('success')
      setResetPasswordMap({})
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '重置密码失败')
      setMessageType('error')
    },
  })

  const saveRoleMutation = useMutation({
    mutationFn: (payload: RolePayload) => (selectedRoleCode ? apiClient.updateRole(payload) : apiClient.createRole(payload)),
    onSuccess: () => {
      setMessage(selectedRoleCode ? '角色已更新。' : '角色已创建。')
      setMessageType('success')
      setRoleForm(EMPTY_ROLE_FORM)
      setSelectedRoleCode(null)
      void queryClient.invalidateQueries({ queryKey: ['admin-roles'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? mapRoleActionError(error.message) : '保存角色失败')
      setMessageType('error')
    },
  })

  const updatePermissionMutation = useMutation({
    mutationFn: (payload: PermissionUpdatePayload) => apiClient.updatePermission(payload),
    onSuccess: () => {
      setMessage('权限说明已更新。')
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['role-permissions'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-roles'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '更新权限说明失败')
      setMessageType('error')
    },
  })

  const deleteRoleMutation = useMutation({
    mutationFn: (roleCode: string) => apiClient.deleteRole(roleCode),
    onSuccess: () => {
      setMessage('角色已删除。')
      setMessageType('success')
      setRoleForm(EMPTY_ROLE_FORM)
      setSelectedRoleCode(null)
      void queryClient.invalidateQueries({ queryKey: ['admin-roles'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? mapRoleActionError(error.message) : '删除角色失败')
      setMessageType('error')
    },
  })

  function openCreateModel() {
    setModelMode('create')
    setSelectedModelCode(null)
    setModelForm(EMPTY_MODEL_FORM)
    setModelModalOpen(true)
  }

  async function openEditModel(modelCode: string) {
    const model = await apiClient.getSettingsModel(modelCode)
    setModelMode('edit')
    setSelectedModelCode(modelCode)
    setModelForm({
      model_code: model.model_code,
      display_name: model.display_name,
      provider: model.provider,
      api_model_name: model.api_model_name,
      version: model.version,
      tags: model.tags,
      base_url: model.base_url,
      api_key: model.api_key,
      app_code: model.app_code,
      temperature: model.temperature,
      is_active: model.is_active,
    })
    setModelModalOpen(true)
  }

  function selectRole(role: RoleItem) {
    setSelectedRoleCode(role.role_code)
    setRoleForm({
      role_code: role.role_code,
      role_name: role.role_name,
      permissions: role.permissions,
    })
  }

  function submitModelForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveModelMutation.mutate({
      ...modelForm,
      model_code: modelForm.model_code?.trim(),
      display_name: modelForm.display_name.trim(),
      provider: modelForm.provider.trim(),
      api_model_name: modelForm.api_model_name.trim(),
      version: modelForm.version.trim(),
      base_url: modelForm.base_url.trim(),
      api_key: modelForm.api_key.trim(),
      app_code: modelForm.app_code.trim(),
      tags: modelForm.tags.filter(Boolean),
    })
  }

  function submitRoleForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveRoleMutation.mutate({
      role_code: roleForm.role_code.trim(),
      role_name: roleForm.role_name.trim(),
      permissions: roleForm.permissions,
    })
  }

  function getPermissionLabel(permissionCode: string) {
    return permissionMap[permissionCode]?.permission_name || permissionCode
  }

  return (
    <div className="page-stack">
      <section className="hero-panel hero-panel--settings">
        <div className="hero-panel__copy">
          <p className="hero-panel__eyebrow">Settings Center</p>
          <h2 className="hero-panel__title">设置中心</h2>
          <p className="hero-panel__description">可修改基础信息</p>
          <div className="hero-panel__meta">
            <span>当前角色 {user?.role_name || '-'}</span>
            <span>权限数 {user?.permissions?.length || 0}</span>
            <span>账号 {user?.username || '-'}</span>
          </div>
        </div>
      </section>

      {message ? <div className={clsx('banner-message', messageType === 'error' && 'is-error')}>{message}</div> : null}

      <section className="settings-center-layout">
        <aside className="settings-center-sidebar" aria-label="设置导航">
          {availableTabs.map((tab) => (
            <button
              key={tab.id}
              className={clsx('settings-center-sidebar__link', activeTab === tab.id && 'is-active')}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        <div className="settings-center-content">
          {activeTab === 'profile' ? (
            <div className="page-section">
              <StatusCard title="基础信息" subtitle="修改昵称和密码，登录账号仅用于身份识别。">
                <div className="settings-profile-grid">
                  <div className="settings-side-card">
                    <p className="settings-side-card__title">账号信息</p>
                    <div className="settings-side-card__list">
                      <span>账号：{user?.username || '-'}</span>
                      <span>昵称：{user?.nickname || '-'}</span>
                      <span>角色：{user?.role_name || '-'}</span>
                    </div>
                  </div>
                  <form className="panel-card settings-form-card" onSubmit={(event) => { event.preventDefault(); profileMutation.mutate() }}>
                    <div className="panel-card__header">
                      <h2 className="panel-card__title">修改昵称</h2>
                    </div>
                    <label className="field">
                      <span>昵称</span>
                      <input value={profileNickname} onChange={(event) => setProfileNickname(event.target.value)} required />
                    </label>
                    <button className="primary-button" type="submit" disabled={profileMutation.isPending}>
                      保存基础信息
                    </button>
                  </form>
                  <form
                    className="panel-card settings-form-card"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (passwordForm.new_password !== passwordForm.confirm_password) {
                        setMessage('两次输入的新密码不一致')
                        setMessageType('error')
                        return
                      }
                      passwordMutation.mutate()
                    }}
                  >
                    <div className="panel-card__header">
                      <h2 className="panel-card__title">修改密码</h2>
                    </div>
                    <label className="field">
                      <span>当前密码</span>
                      <input type="password" value={passwordForm.current_password} onChange={(event) => setPasswordForm((previous) => ({ ...previous, current_password: event.target.value }))} required />
                    </label>
                    <label className="field">
                      <span>新密码</span>
                      <input type="password" value={passwordForm.new_password} onChange={(event) => setPasswordForm((previous) => ({ ...previous, new_password: event.target.value }))} required />
                    </label>
                    <label className="field">
                      <span>确认新密码</span>
                      <input type="password" value={passwordForm.confirm_password} onChange={(event) => setPasswordForm((previous) => ({ ...previous, confirm_password: event.target.value }))} required />
                    </label>
                    <button className="primary-button" type="submit" disabled={passwordMutation.isPending}>
                      更新密码
                    </button>
                  </form>
                </div>
              </StatusCard>
            </div>
          ) : null}

          {activeTab === 'models' ? (
            <div className="page-section">
              <StatusCard
                title="模型管理"
                subtitle="管理模型目录、Provider 连接与运行状态。"
                actions={
                  <div className="toolbar-inline">
                    <div className="view-switch" role="tablist" aria-label="模型管理视图切换">
                      <button
                        className={clsx('view-switch__button', modelManagementView === 'list' && 'is-active')}
                        onClick={() => setModelManagementView('list')}
                        type="button"
                      >
                        列表视图
                      </button>
                      <button
                        className={clsx('view-switch__button', modelManagementView === 'card' && 'is-active')}
                        onClick={() => setModelManagementView('card')}
                        type="button"
                      >
                        卡片视图
                      </button>
                    </div>
                    <label className="toggle-chip">
                      <input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} />
                      <span>显示已删除</span>
                    </label>
                    <button className="primary-button" onClick={openCreateModel}>
                      新增模型
                    </button>
                  </div>
                }
              >
                {modelManagementView === 'list' ? (
                  <div className="table-shell settings-model-table-shell">
                    <table className="history-table settings-model-table">
                      <thead>
                        <tr>
                          <th>模型名称</th>
                          <th>Provider</th>
                          <th>接口模型</th>
                          <th>Tag</th>
                          <th>状态</th>
                          <th>更新时间</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {models.map((model) => (
                          <tr key={model.model_code}>
                            <td>
                              <div className="settings-model-table__title">
                                <strong>{model.display_name}</strong>
                                <span>{model.model_code}</span>
                              </div>
                            </td>
                            <td>{model.provider}</td>
                            <td>{model.api_model_name}</td>
                            <td>
                              <div className="settings-model-table__tags">
                                {model.tags.length ? model.tags.map((tag) => <span key={`${model.model_code}-${tag}`} className="tag tag--muted">{tag}</span>) : <span className="tag tag--muted">无标签</span>}
                              </div>
                            </td>
                            <td>
                              <span className={clsx('status-pill', model.is_active ? 'is-active' : 'is-muted')}>
                                {model.is_deleted ? '已删除' : model.is_active ? '启用中' : '已停用'}
                              </span>
                            </td>
                            <td>{model.updated_at || '-'}</td>
                            <td>
                              <div className="settings-model-table__actions">
                                <button className="ghost-button" onClick={() => void openEditModel(model.model_code)}>编辑</button>
                                {!model.is_deleted ? (
                                  <>
                                    <button
                                      className="ghost-button"
                                      onClick={() => modelActionMutation.mutate({ type: 'toggle', modelCode: model.model_code, isActive: !model.is_active })}
                                    >
                                      {model.is_active ? '停用' : '启用'}
                                    </button>
                                    <button className="danger-button" onClick={() => modelActionMutation.mutate({ type: 'delete', modelCode: model.model_code })}>删除</button>
                                  </>
                                ) : (
                                  <button className="ghost-button" onClick={() => modelActionMutation.mutate({ type: 'restore', modelCode: model.model_code })}>恢复</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="settings-grid-react">
                    {models.map((model) => (
                      <article key={model.model_code} className="settings-model-card-react">
                        <div className="settings-model-card-react__header">
                          <div>
                            <p className="settings-model-card-react__provider">{model.provider}</p>
                            <h3>{model.display_name}</h3>
                          </div>
                          <span className={clsx('status-pill', model.is_active ? 'is-active' : 'is-muted')}>
                            {model.is_deleted ? '已删除' : model.is_active ? '启用中' : '已停用'}
                          </span>
                        </div>
                        <p className="settings-model-card-react__meta">{model.api_model_name}</p>
                        <div className="settings-model-card-react__facts">
                          <span>{model.base_url}</span>
                          <span>{model.tags.join(', ') || '无标签'}</span>
                        </div>
                        <div className="toolbar-inline">
                          <button className="ghost-button" onClick={() => void openEditModel(model.model_code)}>编辑</button>
                          {!model.is_deleted ? (
                            <>
                              <button className="ghost-button" onClick={() => modelActionMutation.mutate({ type: 'toggle', modelCode: model.model_code, isActive: !model.is_active })}>
                                {model.is_active ? '停用' : '启用'}
                              </button>
                              <button className="danger-button" onClick={() => modelActionMutation.mutate({ type: 'delete', modelCode: model.model_code })}>删除</button>
                            </>
                          ) : (
                            <button className="ghost-button" onClick={() => modelActionMutation.mutate({ type: 'restore', modelCode: model.model_code })}>恢复</button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </StatusCard>
            </div>
          ) : null}

          {activeTab === 'users' ? (
            <div className="page-section">
              <StatusCard title="用户管理" subtitle="按角色分配权限，普通用户默认仅可修改基础信息。">
                <form
                  className="settings-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    createUserMutation.mutate()
                  }}
                >
                  <label className="field">
                    <span>账号</span>
                    <input value={newUserForm.username} onChange={(event) => setNewUserForm((previous) => ({ ...previous, username: event.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>昵称</span>
                    <input value={newUserForm.nickname} onChange={(event) => setNewUserForm((previous) => ({ ...previous, nickname: event.target.value }))} />
                  </label>
                  <label className="field">
                    <span>密码</span>
                    <input type="password" value={newUserForm.password} onChange={(event) => setNewUserForm((previous) => ({ ...previous, password: event.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>角色</span>
                    <select value={newUserForm.role} onChange={(event) => setNewUserForm((previous) => ({ ...previous, role: event.target.value }))}>
                      {roles.map((role) => (
                        <option key={role.role_code} value={role.role_code}>
                          {role.role_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="toggle-chip">
                    <input type="checkbox" checked={newUserForm.is_active} onChange={(event) => setNewUserForm((previous) => ({ ...previous, is_active: event.target.checked }))} />
                    <span>启用</span>
                  </label>
                  <button className="primary-button" type="submit">创建用户</button>
                </form>

                <div className="settings-grid-react">
                  {users.map((account) => (
                    <article key={account.id} className="settings-model-card-react">
                      <div className="settings-model-card-react__header">
                        <div>
                          <p className="settings-model-card-react__provider">{account.role_name}</p>
                          <h3>{account.nickname}</h3>
                        </div>
                        <span className={clsx('status-pill', account.is_active ? 'is-active' : 'is-muted')}>
                          {account.is_active ? '启用中' : '已停用'}
                        </span>
                      </div>
                      <p className="settings-model-card-react__meta">{account.username}</p>
                      <div className="field">
                        <span>角色</span>
                        <select
                          value={account.role}
                          onChange={(event) => updateUserMutation.mutate({ userId: account.id, role: event.target.value, isActive: account.is_active })}
                        >
                          {roles.map((role) => (
                            <option key={role.role_code} value={role.role_code}>
                              {role.role_name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="toolbar-inline">
                        <button className="ghost-button" onClick={() => updateUserMutation.mutate({ userId: account.id, role: account.role, isActive: !account.is_active })}>
                          {account.is_active ? '禁用' : '启用'}
                        </button>
                        <input
                          className="search-input"
                          placeholder="新密码"
                          value={resetPasswordMap[account.id] || ''}
                          onChange={(event) => setResetPasswordMap((previous) => ({ ...previous, [account.id]: event.target.value }))}
                        />
                        <button className="ghost-button" onClick={() => resetPasswordMutation.mutate({ userId: account.id, password: resetPasswordMap[account.id] || '' })}>
                          重置密码
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </StatusCard>
            </div>
          ) : null}

          {activeTab === 'roles' ? (
            <div className="page-section">
              <StatusCard title="角色管理" subtitle="创建自定义角色、维护权限说明，并通过清晰提示降低误操作风险。">
                <div className="settings-center-roles">
                  <div className="settings-role-guardrail">
                    <h3>保护规则</h3>
                    <div className="settings-role-guardrail__list">
                      <span>超级管理员默认拥有全部权限，系统至少保留 1 个启用中的超级管理员。</span>
                      <span>普通用户默认仅开放基础信息，进入设置中心后只能修改昵称和密码。</span>
                      <span>系统角色不能删除；删除自定义角色前，请先确认没有用户仍在使用该角色。</span>
                    </div>
                  </div>

                  <div className="settings-grid-react">
                    {roles.map((role) => (
                      <article key={role.role_code} className={clsx('settings-model-card-react', selectedRoleCode === role.role_code && 'is-selected')}>
                        <div className="settings-model-card-react__header">
                          <div>
                            <p className="settings-model-card-react__provider">{role.is_system ? '系统角色' : '自定义角色'}</p>
                            <h3>{role.role_name}</h3>
                          </div>
                          <span className="status-pill">{role.member_count} 人</span>
                        </div>
                        <p className="settings-model-card-react__meta">{role.role_code}</p>
                        <div className="settings-model-card-react__facts">
                          <span>{role.permissions.map((permission) => getPermissionLabel(permission)).join(' / ') || '未分配权限'}</span>
                        </div>
                        <p className="settings-role-card__hint">{getRoleProtectionHint(role)}</p>
                        <div className="toolbar-inline">
                          <button className="ghost-button" onClick={() => selectRole(role)}>编辑</button>
                          {!role.is_system ? (
                            <button
                              className="danger-button"
                              onClick={() => {
                                const confirmed = window.confirm(`确认删除角色“${role.role_name}”吗？如果仍有用户使用该角色，删除会失败。`)
                                if (confirmed) deleteRoleMutation.mutate(role.role_code)
                              }}
                            >
                              删除
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>

                  <form className="panel-card settings-form-card" onSubmit={submitRoleForm}>
                    <div className="panel-card__header">
                      <h2 className="panel-card__title">{selectedRole ? '编辑角色' : '新增角色'}</h2>
                    </div>
                    <div className="settings-inline-hint">{selectedRoleProtectionHint}</div>
                    <label className="field">
                      <span>角色编码</span>
                      <input
                        value={roleForm.role_code}
                        onChange={(event) => setRoleForm((previous) => ({ ...previous, role_code: event.target.value }))}
                        required
                        disabled={Boolean(selectedRole)}
                      />
                    </label>
                    <label className="field">
                      <span>角色名称</span>
                      <input value={roleForm.role_name} onChange={(event) => setRoleForm((previous) => ({ ...previous, role_name: event.target.value }))} required />
                    </label>
                    <div className="settings-permission-grid">
                      {permissions.map((permission) => (
                        <label key={permission.permission_code} className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={roleForm.permissions.includes(permission.permission_code)}
                            onChange={(event) =>
                              setRoleForm((previous) => ({
                                ...previous,
                                permissions: event.target.checked
                                  ? [...previous.permissions, permission.permission_code]
                                  : previous.permissions.filter((item) => item !== permission.permission_code),
                              }))
                            }
                            disabled={selectedRole?.role_code === 'super_admin'}
                          />
                          <span>
                            <strong>{permission.permission_name}</strong>
                            <small>{permission.permission_description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="toolbar-inline">
                      <button className="primary-button" type="submit">{selectedRole ? '保存角色' : '创建角色'}</button>
                      {selectedRole ? (
                        <button className="ghost-button" type="button" onClick={() => { setSelectedRoleCode(null); setRoleForm(EMPTY_ROLE_FORM) }}>
                          取消编辑
                        </button>
                      ) : null}
                    </div>
                  </form>

                  <div className="panel-card settings-form-card">
                    <div className="panel-card__header">
                      <h2 className="panel-card__title">权限说明维护</h2>
                    </div>
                    <div className="settings-permission-docs">
                      {permissions.map((permission: PermissionItem) => (
                        <form
                          key={permission.permission_code}
                          className="settings-permission-doc"
                          onSubmit={(event) => {
                            event.preventDefault()
                            const formData = new FormData(event.currentTarget)
                            updatePermissionMutation.mutate({
                              permission_code: permission.permission_code,
                              permission_name: String(formData.get('permission_name') || '').trim(),
                              permission_description: String(formData.get('permission_description') || '').trim(),
                            })
                          }}
                        >
                          <div className="settings-permission-doc__header">
                            <div>
                              <h3>{permission.permission_name}</h3>
                              <p>{permission.permission_code}</p>
                            </div>
                            <button className="ghost-button" type="submit" disabled={updatePermissionMutation.isPending}>
                              保存说明
                            </button>
                          </div>
                          <label className="field">
                            <span>展示名称</span>
                            <input name="permission_name" defaultValue={permission.permission_name} required />
                          </label>
                          <label className="field">
                            <span>说明文案</span>
                            <textarea
                              name="permission_description"
                              defaultValue={permission.permission_description}
                              rows={3}
                              required
                            />
                          </label>
                        </form>
                      ))}
                    </div>
                  </div>
                </div>
              </StatusCard>
            </div>
          ) : null}
        </div>
      </section>

      {modelModalOpen ? (
        <div className="modal-shell" role="presentation" onClick={() => setModelModalOpen(false)}>
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form className="settings-form-grid" onSubmit={submitModelForm}>
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">模型配置</p>
                  <h3>{modelMode === 'create' ? '新增模型' : '编辑模型'}</h3>
                </div>
                <button className="ghost-button" type="button" onClick={() => setModelModalOpen(false)}>关闭</button>
              </div>
              <label className="field">
                <span>模型编码</span>
                <input value={modelForm.model_code || ''} onChange={(event) => setModelForm((previous) => ({ ...previous, model_code: event.target.value }))} required disabled={modelMode === 'edit'} />
              </label>
              <label className="field">
                <span>显示名称</span>
                <input value={modelForm.display_name} onChange={(event) => setModelForm((previous) => ({ ...previous, display_name: event.target.value }))} required />
              </label>
              <label className="field">
                <span>Provider</span>
                <select value={modelForm.provider} onChange={(event) => setModelForm((previous) => ({ ...previous, provider: event.target.value }))}>
                  {providers.map((provider) => (
                    <option key={provider.code} value={provider.code}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>API 模型名</span>
                <input value={modelForm.api_model_name} onChange={(event) => setModelForm((previous) => ({ ...previous, api_model_name: event.target.value }))} required />
              </label>
              <label className="field">
                <span>版本</span>
                <input value={modelForm.version} onChange={(event) => setModelForm((previous) => ({ ...previous, version: event.target.value }))} />
              </label>
              <label className="field">
                <span>Base URL</span>
                <input value={modelForm.base_url} onChange={(event) => setModelForm((previous) => ({ ...previous, base_url: event.target.value }))} />
              </label>
              <label className="field">
                <span>API Key</span>
                <input value={modelForm.api_key} onChange={(event) => setModelForm((previous) => ({ ...previous, api_key: event.target.value }))} />
              </label>
              <label className="field">
                <span>APP Code</span>
                <input value={modelForm.app_code} onChange={(event) => setModelForm((previous) => ({ ...previous, app_code: event.target.value }))} />
              </label>
              <label className="field">
                <span>Temperature</span>
                <input
                  type="number"
                  step="0.1"
                  value={modelForm.temperature ?? ''}
                  onChange={(event) => setModelForm((previous) => ({ ...previous, temperature: event.target.value ? Number(event.target.value) : null }))}
                />
              </label>
              <label className="field">
                <span>标签</span>
                <input
                  value={modelForm.tags.join(',')}
                  onChange={(event) => setModelForm((previous) => ({ ...previous, tags: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) }))}
                />
              </label>
              <label className="toggle-chip">
                <input type="checkbox" checked={modelForm.is_active} onChange={(event) => setModelForm((previous) => ({ ...previous, is_active: event.target.checked }))} />
                <span>启用模型</span>
              </label>
              <div className="form-actions">
                <button className="primary-button" type="submit">{modelMode === 'create' ? '创建模型' : '保存修改'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
