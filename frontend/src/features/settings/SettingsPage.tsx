import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { useAuth } from '../../shared/auth/AuthProvider'
import { loadSelectedLottery, saveSelectedLottery } from '../../shared/lib/storage'
import { normalizeCurrentPredictions, normalizePredictionsHistory } from '../home/lib/home'
import { formatDateTimeLocal } from '../../shared/lib/format'
import type {
  AuthUser,
  BulkModelActionResult,
  LotteryFetchTask,
  PasswordChangePayload,
  PermissionItem,
  PermissionUpdatePayload,
  PredictionGenerationTask,
  RoleItem,
  RolePayload,
  SettingsPredictionRecordDetail,
  SettingsPredictionRecordSummary,
  SettingsModel,
  SettingsModelPayload,
  LotteryCode,
} from '../../shared/types/api'

type SettingsTab = 'profile' | 'models' | 'users' | 'roles'
type ModelManagementView = 'list' | 'card'
type ModelPredictionMode = 'current' | 'history'
type ModelManagementTab = 'catalog' | 'records'
type PredictionRecordTypeFilter = 'all' | 'current' | 'history'
type ModelSortOption = 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc'
type BulkEditForm = {
  providerEnabled: boolean
  provider: string
  baseUrlEnabled: boolean
  base_url: string
  apiKeyEnabled: boolean
  api_key: string
  tagsEnabled: boolean
  tags: string
  temperatureEnabled: boolean
  temperature: string
  isActiveEnabled: boolean
  is_active: boolean
}

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
  lottery_codes: ['dlt'],
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

const EMPTY_GENERATION_FORM = {
  lotteryCode: 'dlt' as LotteryCode,
  modelCodes: [] as string[],
  displayName: '',
  mode: 'current' as ModelPredictionMode,
  overwrite: false,
  startPeriod: '',
  endPeriod: '',
}

const EMPTY_BULK_EDIT_FORM: BulkEditForm = {
  providerEnabled: false,
  provider: 'openai_compatible',
  baseUrlEnabled: false,
  base_url: '',
  apiKeyEnabled: false,
  api_key: '',
  tagsEnabled: false,
  tags: '',
  temperatureEnabled: false,
  temperature: '',
  isActiveEnabled: false,
  is_active: true,
}

const EMPTY_MODELS: SettingsModel[] = []
const EMPTY_PROVIDERS: Array<{ code: string; name: string }> = []
const EMPTY_RECORDS: SettingsPredictionRecordSummary[] = []
const EMPTY_USERS: AuthUser[] = []
const EMPTY_ROLES: RoleItem[] = []
const EMPTY_PERMISSIONS: PermissionItem[] = []

const MODEL_SORT_META: Record<ModelSortOption, { label: string; hint: string }> = {
  updated_desc: { label: '最近更新', hint: '按更新时间从新到旧排序' },
  updated_asc: { label: '最早更新', hint: '按更新时间从旧到新排序' },
  name_asc: { label: '名称 A-Z', hint: '按名称正序排序' },
  name_desc: { label: '名称 Z-A', hint: '按名称倒序排序' },
}

function SvgIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

function ListIcon() {
  return (
    <SvgIcon>
      <path d="M7 5.5h8.5M7 10h8.5M7 14.5h8.5" />
      <path d="M3.8 5.5h.4M3.8 10h.4M3.8 14.5h.4" />
    </SvgIcon>
  )
}

function GridIcon() {
  return (
    <SvgIcon>
      <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1" />
      <rect x="11" y="3.5" width="5.5" height="5.5" rx="1" />
      <rect x="3.5" y="11" width="5.5" height="5.5" rx="1" />
      <rect x="11" y="11" width="5.5" height="5.5" rx="1" />
    </SvgIcon>
  )
}

function SortIcon() {
  return (
    <SvgIcon>
      <path d="M6 4.5v11" />
      <path d="m3.8 6.8 2.2-2.3 2.2 2.3" />
      <path d="M14 15.5v-11" />
      <path d="m11.8 13.2 2.2 2.3 2.2-2.3" />
    </SvgIcon>
  )
}

function MoreIcon() {
  return (
    <SvgIcon>
      <circle cx="4.5" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="10" r="1.2" fill="currentColor" stroke="none" />
    </SvgIcon>
  )
}

function EditIcon() {
  return (
    <SvgIcon>
      <path d="M4 14.8 3.5 16.5 5.2 16l8.7-8.7-1.2-1.2L4 14.8Z" />
      <path d="m11.9 4.9 1.2-1.2a1.6 1.6 0 0 1 2.3 2.3l-1.2 1.2" />
    </SvgIcon>
  )
}

function ToggleIcon({ active }: { active: boolean }) {
  return (
    <SvgIcon>
      <rect x="2.8" y="6" width="14.4" height="8" rx="4" />
      <circle cx={active ? 13.3 : 6.7} cy="10" r="2.2" fill="currentColor" stroke="none" />
    </SvgIcon>
  )
}

function RestoreIcon() {
  return (
    <SvgIcon>
      <path d="M5.2 8.4A5 5 0 1 1 7 14.8" />
      <path d="M5.2 4.8v3.6h3.6" />
    </SvgIcon>
  )
}

function PlusIcon() {
  return (
    <SvgIcon>
      <path d="M10 4.5v11M4.5 10h11" />
    </SvgIcon>
  )
}

function CatalogIcon() {
  return (
    <SvgIcon>
      <path d="M5 4.5h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <path d="M7 8h6M7 11h4" />
    </SvgIcon>
  )
}

function HistoryIcon() {
  return (
    <SvgIcon>
      <path d="M4.5 10a5.5 5.5 0 1 0 1.7-4" />
      <path d="M4.5 5.2v2.7h2.7" />
      <path d="M10 7.3v3.2l2 1.2" />
    </SvgIcon>
  )
}

function IconButton({
  label,
  onClick,
  icon,
  active = false,
  danger = false,
  disabled = false,
  expanded,
}: {
  label: string
  onClick: (event: MouseEvent<HTMLButtonElement>) => void | Promise<void>
  icon: ReactNode
  active?: boolean
  danger?: boolean
  disabled?: boolean
  expanded?: boolean
}) {
  return (
    <button
      type="button"
      className={clsx('icon-button', active && 'is-active', danger && 'is-danger')}
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-expanded={expanded}
    >
      {icon}
    </button>
  )
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

function mapBulkActionLabel(action: 'enable' | 'disable' | 'delete' | 'restore' | 'edit') {
  if (action === 'enable') return '启用'
  if (action === 'disable') return '停用'
  if (action === 'delete') return '删除'
  if (action === 'restore') return '恢复'
  return '编辑'
}

function getTaskStatusLabel(status: string) {
  if (status === 'queued') return '排队中'
  if (status === 'running') return '执行中'
  if (status === 'succeeded') return '已完成'
  if (status === 'failed') return '失败'
  return status
}

function getGenerationTaskTotal(task: PredictionGenerationTask | null) {
  if (!task) return 0
  return task.progress_summary.selected_count ?? (
    task.progress_summary.processed_count +
    task.progress_summary.skipped_count +
    task.progress_summary.failed_count
  )
}

function getGenerationTaskCompleted(task: PredictionGenerationTask | null) {
  if (!task) return 0
  return task.progress_summary.completed_count ?? (
    task.progress_summary.processed_count +
    task.progress_summary.skipped_count +
    task.progress_summary.failed_count
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user, hasPermission, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile')
  const [modelManagementTab, setModelManagementTab] = useState<ModelManagementTab>('catalog')
  const [modelManagementView, setModelManagementView] = useState<ModelManagementView>('list')
  const [modelSortOption, setModelSortOption] = useState<ModelSortOption>('updated_desc')
  const [message, setMessage] = useState<string | null>(null)
  const [selectedLottery, setSelectedLottery] = useState<LotteryCode>(() => loadSelectedLottery())
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [profileNickname, setProfileNickname] = useState(user?.nickname || '')
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM)
  const [modelForm, setModelForm] = useState<SettingsModelPayload>({ ...EMPTY_MODEL_FORM, lottery_codes: [selectedLottery] })
  const [selectedModelCode, setSelectedModelCode] = useState<string | null>(null)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [modelMode, setModelMode] = useState<'create' | 'edit'>('create')
  const [generationModalOpen, setGenerationModalOpen] = useState(false)
  const [generationForm, setGenerationForm] = useState(EMPTY_GENERATION_FORM)
  const [generationTask, setGenerationTask] = useState<PredictionGenerationTask | null>(null)
  const [selectedModelCodes, setSelectedModelCodes] = useState<string[]>([])
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false)
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>(EMPTY_BULK_EDIT_FORM)
  const [lotteryFetchTask, setLotteryFetchTask] = useState<LotteryFetchTask | null>(null)
  const [selectedPredictionRecord, setSelectedPredictionRecord] = useState<{ recordType: 'current' | 'history'; targetPeriod: string } | null>(null)
  const [predictionRecordPeriodQuery, setPredictionRecordPeriodQuery] = useState('')
  const [predictionRecordTypeFilter, setPredictionRecordTypeFilter] = useState<PredictionRecordTypeFilter>('all')
  const [newUserForm, setNewUserForm] = useState({ username: '', nickname: '', password: '', role: 'normal_user', is_active: true })
  const [resetPasswordMap, setResetPasswordMap] = useState<Record<number, string>>({})
  const [roleForm, setRoleForm] = useState<RolePayload>(EMPTY_ROLE_FORM)
  const [selectedRoleCode, setSelectedRoleCode] = useState<string | null>(null)
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [modelActionMenu, setModelActionMenu] = useState<string | null>(null)

  const canManageModels = hasPermission('model_management')
  const canManageUsers = hasPermission('user_management')
  const canManageRoles = hasPermission('role_management')
  const isSuperAdmin = user?.role === 'super_admin'

  const modelsQuery = useQuery({
    queryKey: ['settings-models', selectedLottery],
    queryFn: () => apiClient.getSettingsModels(false, selectedLottery),
    enabled: canManageModels,
  })
  const providersQuery = useQuery({
    queryKey: ['settings-providers'],
    queryFn: () => apiClient.getSettingsProviders(),
    enabled: canManageModels,
  })
  const predictionRecordsQuery = useQuery({
    queryKey: ['settings-prediction-records', selectedLottery],
    queryFn: () => apiClient.getSettingsPredictionRecords(selectedLottery),
    enabled: canManageModels,
  })
  const predictionRecordDetailQuery = useQuery({
    queryKey: ['settings-prediction-record-detail', selectedLottery, selectedPredictionRecord?.recordType, selectedPredictionRecord?.targetPeriod],
    queryFn: async () => {
      const detail = await apiClient.getSettingsPredictionRecordDetail(
        selectedPredictionRecord?.recordType || 'history',
        selectedPredictionRecord?.targetPeriod || '',
        selectedLottery,
      )
      if (detail.record_type === 'history') {
        return normalizePredictionsHistory({ predictions_history: [detail], total_count: 1 }).predictions_history[0] as SettingsPredictionRecordDetail
      }
      return normalizeCurrentPredictions({
        lottery_code: selectedLottery,
        prediction_date: detail.prediction_date,
        target_period: detail.target_period,
        models: detail.models,
      }) as unknown as SettingsPredictionRecordDetail
    },
    enabled: canManageModels && Boolean(selectedPredictionRecord),
  })
  useEffect(() => {
    saveSelectedLottery(selectedLottery)
  }, [selectedLottery])
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

  useEffect(() => {
    if (!toolbarMenuOpen && !sortMenuOpen && !modelActionMenu) return undefined
    const closeMenus = () => {
      setToolbarMenuOpen(false)
      setSortMenuOpen(false)
      setModelActionMenu(null)
    }
    window.addEventListener('click', closeMenus)
    return () => window.removeEventListener('click', closeMenus)
  }, [modelActionMenu, sortMenuOpen, toolbarMenuOpen])

  useEffect(() => {
    if (!generationTask || !['queued', 'running'].includes(generationTask.status)) return undefined
    const timer = window.setTimeout(async () => {
      try {
        const task = await apiClient.getPredictionGenerationTaskDetail(generationTask.task_id)
        setGenerationTask(task)
        if (task.status === 'succeeded') {
          const summary = task.progress_summary
          if (task.model_code === '__bulk__') {
            setMessage(`批量预测任务完成：成功 ${summary.processed_count}，跳过 ${summary.skipped_count}，失败 ${summary.failed_count}。`)
          } else {
            setMessage(`预测任务完成：成功 ${summary.processed_count}，跳过 ${summary.skipped_count}，失败 ${summary.failed_count}。`)
          }
          setMessageType('success')
          void queryClient.invalidateQueries({ queryKey: ['settings-models'] })
          void queryClient.invalidateQueries({ queryKey: ['settings-prediction-records'] })
        } else if (task.status === 'failed') {
          setMessage(task.error_message || '预测任务执行失败')
          setMessageType('error')
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '读取任务状态失败')
        setMessageType('error')
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [generationTask, queryClient])

  useEffect(() => {
    if (!lotteryFetchTask || !['queued', 'running'].includes(lotteryFetchTask.status)) return undefined
    const timer = window.setTimeout(async () => {
      try {
        const task = await apiClient.getLotteryFetchTaskDetail(lotteryFetchTask.task_id)
        setLotteryFetchTask(task)
        if (task.status === 'succeeded') {
          const summary = task.progress_summary
          setMessage(`${selectedLottery === 'pl3' ? '排列3' : '大乐透'}数据更新完成：抓取 ${summary.fetched_count} 条，写入 ${summary.saved_count} 条。`)
          setMessageType('success')
          void queryClient.invalidateQueries({ queryKey: ['lottery-history', selectedLottery] })
          void queryClient.invalidateQueries({ queryKey: ['current-predictions', selectedLottery] })
          void queryClient.invalidateQueries({ queryKey: ['predictions-history', selectedLottery] })
          void queryClient.invalidateQueries({ queryKey: ['settings-prediction-records', selectedLottery] })
        } else if (task.status === 'failed') {
          setMessage(task.error_message || `${selectedLottery === 'pl3' ? '排列3' : '大乐透'}数据更新失败`)
          setMessageType('error')
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : `读取${selectedLottery === 'pl3' ? '排列3' : '大乐透'}抓取任务状态失败`)
        setMessageType('error')
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [lotteryFetchTask, queryClient, selectedLottery])

  const models = modelsQuery.data?.models ?? EMPTY_MODELS
  const predictionRecords = predictionRecordsQuery.data?.records ?? EMPTY_RECORDS
  const providers = providersQuery.data?.providers ?? EMPTY_PROVIDERS
  const users = usersQuery.data?.users ?? EMPTY_USERS
  const roles = rolesQuery.data?.roles ?? EMPTY_ROLES
  const permissions = permissionsQuery.data?.permissions ?? EMPTY_PERMISSIONS
  const selectedRole = roles.find((role) => role.role_code === selectedRoleCode) || null
  const permissionMap = useMemo(
    () => Object.fromEntries(permissions.map((permission) => [permission.permission_code, permission])),
    [permissions],
  )
  const filteredPredictionRecords = useMemo(
    () =>
      predictionRecords.filter((record) => {
        const matchesType = predictionRecordTypeFilter === 'all' || record.record_type === predictionRecordTypeFilter
        const matchesPeriod =
          !predictionRecordPeriodQuery || record.target_period.includes(predictionRecordPeriodQuery.trim())
        return matchesType && matchesPeriod
      }),
    [predictionRecordPeriodQuery, predictionRecordTypeFilter, predictionRecords],
  )
  const predictionRecordSummary = useMemo(
    () => ({
      total: predictionRecords.length,
      current: predictionRecords.filter((record) => record.record_type === 'current').length,
      history: predictionRecords.filter((record) => record.record_type === 'history').length,
    }),
    [predictionRecords],
  )
  const sortedModels = useMemo(() => {
    const items = [...models]
    items.sort((left, right) => {
      if (modelSortOption === 'updated_desc') {
        return new Date(right.updated_at || 0).getTime() - new Date(left.updated_at || 0).getTime()
      }
      if (modelSortOption === 'updated_asc') {
        return new Date(left.updated_at || 0).getTime() - new Date(right.updated_at || 0).getTime()
      }
      if (modelSortOption === 'name_asc') {
        return left.display_name.localeCompare(right.display_name)
      }
      return right.display_name.localeCompare(left.display_name)
    })
    return items
  }, [modelSortOption, models])
  const selectedVisibleCount = sortedModels.filter((model) => selectedModelCodes.includes(model.model_code)).length
  const allVisibleModelsSelected = sortedModels.length > 0 && selectedVisibleCount === sortedModels.length
  const selectedRoleProtectionHint = getRoleProtectionHint(selectedRole)
  const currentSortMeta = MODEL_SORT_META[modelSortOption]
  const modelNameMap = useMemo(
    () => Object.fromEntries(models.map((model) => [model.model_code, model.display_name])),
    [models],
  )
  const isBulkGenerationTask = generationTask?.model_code === '__bulk__'
  const generationTaskTotal = getGenerationTaskTotal(generationTask)
  const generationTaskCompleted = getGenerationTaskCompleted(generationTask)
  const generationProgressPercent = generationTaskTotal > 0 ? Math.min(100, Math.round((generationTaskCompleted / generationTaskTotal) * 100)) : 0
  const generationFailedDetails = useMemo(
    () =>
      (generationTask?.progress_summary.failed_details ?? []).map((item) => ({
        ...item,
        model_name: item.model_name || modelNameMap[item.model_code] || item.model_code,
      })),
    [generationTask?.progress_summary.failed_details, modelNameMap],
  )

  useEffect(() => {
    setSelectedModelCodes((previous) => {
      const next = previous.filter((code) => sortedModels.some((model) => model.model_code === code))
      return next.length === previous.length && next.every((code, index) => code === previous[index]) ? previous : next
    })
  }, [sortedModels])

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
      void queryClient.invalidateQueries({ queryKey: ['settings-models', selectedLottery] })
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
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings-models', selectedLottery] }),
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '模型操作失败')
      setMessageType('error')
    },
  })

  const generatePredictionMutation = useMutation({
    mutationFn: () =>
      generationForm.modelCodes.length > 1
        ? apiClient.bulkGenerateSettingsModelPredictions({
            lottery_code: generationForm.lotteryCode,
            model_codes: generationForm.modelCodes,
            mode: generationForm.mode,
            overwrite: generationForm.overwrite,
            start_period: generationForm.mode === 'history' ? generationForm.startPeriod.trim() : undefined,
            end_period: generationForm.mode === 'history' ? generationForm.endPeriod.trim() : undefined,
          })
        : apiClient.generateSettingsModelPredictions({
            lottery_code: generationForm.lotteryCode,
            model_code: generationForm.modelCodes[0] || '',
            mode: generationForm.mode,
            overwrite: generationForm.overwrite,
            start_period: generationForm.mode === 'history' ? generationForm.startPeriod.trim() : undefined,
            end_period: generationForm.mode === 'history' ? generationForm.endPeriod.trim() : undefined,
          }),
    onSuccess: (task) => {
      setGenerationTask(task)
      setGenerationModalOpen(true)
      setSelectedModelCodes([])
      setMessage(generationForm.modelCodes.length > 1 ? '批量预测任务已创建，正在后台执行。' : '预测生成任务已创建，正在后台执行。')
      setMessageType('success')
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '创建预测任务失败')
      setMessageType('error')
    },
  })

  const bulkModelActionMutation = useMutation({
    mutationFn: (payload: {
      action: 'enable' | 'disable' | 'delete' | 'restore' | 'edit'
      updates?: Record<string, unknown>
    }) => apiClient.bulkUpdateSettingsModels({ model_codes: selectedModelCodes, action: payload.action, updates: payload.updates }),
    onSuccess: (result: BulkModelActionResult, variables) => {
      setSelectedModelCodes([])
      setBulkEditModalOpen(false)
      setBulkEditForm(EMPTY_BULK_EDIT_FORM)
      setMessage(`批量${mapBulkActionLabel(variables.action)}完成：成功 ${result.processed_count}，跳过 ${result.skipped_count}，失败 ${result.failed_count}。`)
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-models', selectedLottery] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '批量模型操作失败')
      setMessageType('error')
    },
  })

  const fetchLotteryMutation = useMutation({
    mutationFn: () => apiClient.fetchSettingsLotteryHistory(selectedLottery),
    onSuccess: (task) => {
      setLotteryFetchTask(task)
      setMessage(`${selectedLottery === 'pl3' ? '排列3' : '大乐透'}数据更新任务已创建，正在后台执行。`)
      setMessageType('success')
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : `创建${selectedLottery === 'pl3' ? '排列3' : '大乐透'}数据更新任务失败`)
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
    setModelForm({ ...EMPTY_MODEL_FORM, lottery_codes: [selectedLottery] })
    setModelModalOpen(true)
  }

  function openGenerateModel(modelCode: string, displayName: string) {
    setGenerationTask(null)
    setGenerationForm({
      lotteryCode: selectedLottery,
      modelCodes: [modelCode],
      displayName,
      mode: 'current',
      overwrite: false,
      startPeriod: '',
      endPeriod: '',
    })
    setGenerationModalOpen(true)
  }

  function openBulkGenerateModels() {
    setGenerationTask(null)
    setGenerationForm({
      lotteryCode: selectedLottery,
      modelCodes: selectedModelCodes,
      displayName: `已选 ${selectedModelCodes.length} 个模型`,
      mode: 'current',
      overwrite: false,
      startPeriod: '',
      endPeriod: '',
    })
    setGenerationModalOpen(true)
  }

  function reopenGenerationTaskModal() {
    if (!generationTask) return
    setGenerationModalOpen(true)
  }

  function toggleModelSelection(modelCode: string) {
    setSelectedModelCodes((previous) =>
      previous.includes(modelCode) ? previous.filter((item) => item !== modelCode) : [...previous, modelCode],
    )
  }

  function toggleSelectAllModels(checked: boolean) {
    setSelectedModelCodes(checked ? sortedModels.map((model) => model.model_code) : [])
  }

  function openBulkEditModels() {
    setBulkEditForm(EMPTY_BULK_EDIT_FORM)
    setBulkEditModalOpen(true)
  }

  function stopMenuEvent(event: MouseEvent<HTMLElement>) {
    event.stopPropagation()
  }

  function toggleToolbarMenu(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setSortMenuOpen(false)
    setModelActionMenu(null)
    setToolbarMenuOpen((previous) => !previous)
  }

  function toggleSortMenu(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setToolbarMenuOpen(false)
    setModelActionMenu(null)
    setSortMenuOpen((previous) => !previous)
  }

  function toggleModelMenu(menuId: string, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setToolbarMenuOpen(false)
    setSortMenuOpen(false)
    setModelActionMenu((previous) => (previous === menuId ? null : menuId))
  }

  function selectSortOption(option: ModelSortOption) {
    setModelSortOption(option)
    setSortMenuOpen(false)
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
      lottery_codes: model.lottery_codes,
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

  function submitGenerationForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!generationForm.modelCodes.length) {
      setMessage('请至少选择一个模型')
      setMessageType('error')
      return
    }
    if (generationForm.mode === 'history') {
      if (!generationForm.startPeriod.trim() || !generationForm.endPeriod.trim()) {
        setMessage('历史重算必须填写开始期号和结束期号')
        setMessageType('error')
        return
      }
      if (Number(generationForm.startPeriod) > Number(generationForm.endPeriod)) {
        setMessage('开始期号不能大于结束期号')
        setMessageType('error')
        return
      }
    }
    generatePredictionMutation.mutate()
  }

  function submitBulkEditForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const updates: Record<string, unknown> = {}
    if (bulkEditForm.providerEnabled) updates.provider = bulkEditForm.provider.trim()
    if (bulkEditForm.baseUrlEnabled) updates.base_url = bulkEditForm.base_url.trim()
    if (bulkEditForm.apiKeyEnabled) updates.api_key = bulkEditForm.api_key.trim()
    if (bulkEditForm.tagsEnabled) updates.tags = bulkEditForm.tags.split(',').map((item) => item.trim()).filter(Boolean)
    if (bulkEditForm.temperatureEnabled) updates.temperature = bulkEditForm.temperature ? Number(bulkEditForm.temperature) : null
    if (bulkEditForm.isActiveEnabled) updates.is_active = bulkEditForm.is_active
    bulkModelActionMutation.mutate({ action: 'edit', updates })
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
          <p className="hero-panel__description">可修改基础信息，并按彩种维护模型、抓取与预测记录。</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['dlt', 'pl3'] as LotteryCode[]).map((code) => (
              <button
                key={code}
                type="button"
                className={clsx('chip-button', selectedLottery === code && 'is-active')}
                onClick={() => setSelectedLottery(code)}
              >
                {code === 'pl3' ? '排列3' : '大乐透'}
              </button>
            ))}
          </div>
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
                  <section className="settings-profile-hero">
                    <div className="settings-profile-hero__main">
                      <p className="settings-profile-hero__eyebrow">账号概览</p>
                      <h2>{user?.nickname || user?.username || '未命名用户'}</h2>
                      <p className="settings-profile-hero__description">当前账号用于登录和身份识别，昵称会展示在系统内的个人信息区域。</p>
                    </div>
                    <div className="settings-profile-hero__badges">
                      <span className="status-pill">{user?.role_name || '未分配角色'}</span>
                      <span className={clsx('status-pill', user?.is_active ? 'is-active' : 'is-muted')}>
                        {user?.is_active ? '状态正常' : '已停用'}
                      </span>
                    </div>
                    <div className="settings-profile-summary">
                      <article className="settings-profile-summary__item">
                        <span>账号</span>
                        <strong>{user?.username || '-'}</strong>
                      </article>
                      <article className="settings-profile-summary__item">
                        <span>昵称</span>
                        <strong>{user?.nickname || '-'}</strong>
                      </article>
                      <article className="settings-profile-summary__item">
                        <span>角色</span>
                        <strong>{user?.role_name || '-'}</strong>
                      </article>
                      <article className="settings-profile-summary__item">
                        <span>权限数</span>
                        <strong>{user?.permissions?.length || 0}</strong>
                      </article>
                    </div>
                  </section>
                  <form className="panel-card settings-form-card settings-profile-form-card" onSubmit={(event) => { event.preventDefault(); profileMutation.mutate() }}>
                    <div className="panel-card__header">
                      <div>
                        <h2 className="panel-card__title">修改昵称</h2>
                        <p className="settings-profile-form-card__hint">更新系统内展示名称，不影响登录账号。</p>
                      </div>
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
                    className="panel-card settings-form-card settings-profile-form-card settings-profile-form-card--security"
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
                      <div>
                        <h2 className="panel-card__title">修改密码</h2>
                        <p className="settings-profile-form-card__hint">为确保账号安全，修改密码后需要重新登录。</p>
                      </div>
                    </div>
                    <div className="settings-inline-hint settings-profile-security-note">
                      建议使用更长且不重复的密码，并定期更新账号凭证。
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
                  <div className="toolbar-inline settings-model-toolbar">
                    <div className="view-switch settings-model-tabs" role="tablist" aria-label="模型管理标签切换">
                      <button
                        className={clsx('view-switch__button settings-model-tabs__button', modelManagementTab === 'catalog' && 'is-active')}
                        onClick={() => setModelManagementTab('catalog')}
                        type="button"
                      >
                        <CatalogIcon />
                        <span>模型列表</span>
                      </button>
                      <button
                        className={clsx('view-switch__button settings-model-tabs__button', modelManagementTab === 'records' && 'is-active')}
                        onClick={() => setModelManagementTab('records')}
                        type="button"
                      >
                        <HistoryIcon />
                        <span>预测记录</span>
                      </button>
                    </div>
                    {modelManagementTab === 'catalog' ? (
                      <div className="settings-model-toolbar__actions">
                        <div className="view-switch settings-model-toolbar__view-switch" role="tablist" aria-label="模型管理视图切换">
                          <IconButton
                            label="列表视图"
                            icon={<ListIcon />}
                            active={modelManagementView === 'list'}
                            onClick={() => setModelManagementView('list')}
                          />
                          <IconButton
                            label="卡片视图"
                            icon={<GridIcon />}
                            active={modelManagementView === 'card'}
                            onClick={() => setModelManagementView('card')}
                          />
                        </div>
                        {generationTask && !generationModalOpen ? (
                          <button
                            className="ghost-button settings-model-toolbar__resume-task"
                            type="button"
                            onClick={reopenGenerationTaskModal}
                          >
                            <span>查看进度</span>
                            <span className="settings-model-toolbar__resume-task-status">{getTaskStatusLabel(generationTask.status)}</span>
                          </button>
                        ) : null}
                        <button className="primary-button settings-model-toolbar__create settings-model-toolbar__create--compact" onClick={openCreateModel} aria-label="新增模型">
                          <PlusIcon />
                          <span>新增</span>
                        </button>
                        {modelManagementView === 'list' && selectedModelCodes.length > 0 ? (
                          <>
                            <span className="status-pill">已选 {selectedVisibleCount}</span>
                            <div className="action-menu" onClick={stopMenuEvent}>
                              <button
                                className="ghost-button settings-menu-trigger"
                                type="button"
                                onClick={toggleToolbarMenu}
                                aria-expanded={toolbarMenuOpen}
                              >
                                <MoreIcon />
                                <span>批量操作</span>
                              </button>
                              {toolbarMenuOpen ? (
                                <div className="action-menu__panel settings-action-menu__panel">
                                  <button className="action-menu__item" type="button" onClick={openBulkEditModels}>批量编辑</button>
                                  <button className="action-menu__item" type="button" onClick={openBulkGenerateModels}>批量生成预测</button>
                                  <button className="action-menu__item" type="button" onClick={() => bulkModelActionMutation.mutate({ action: 'enable' })}>批量启用</button>
                                  <button className="action-menu__item" type="button" onClick={() => bulkModelActionMutation.mutate({ action: 'disable' })}>批量停用</button>
                                  <button className="action-menu__item" type="button" onClick={() => bulkModelActionMutation.mutate({ action: 'restore' })}>批量恢复</button>
                                  <button className="action-menu__item action-menu__item--danger" type="button" onClick={() => bulkModelActionMutation.mutate({ action: 'delete' })}>批量删除</button>
                                </div>
                              ) : null}
                            </div>
                          </>
                        ) : null}
                        <div className="action-menu" onClick={stopMenuEvent}>
                          <button
                            className={clsx('icon-button settings-sort-trigger', sortMenuOpen && 'is-active')}
                            type="button"
                            onClick={toggleSortMenu}
                            aria-expanded={sortMenuOpen}
                            aria-label={`排序：${currentSortMeta.label}`}
                            title={currentSortMeta.hint}
                          >
                            <SortIcon />
                          </button>
                          {sortMenuOpen ? (
                            <div className="action-menu__panel settings-action-menu__panel settings-sort-menu">
                              {(Object.entries(MODEL_SORT_META) as Array<[ModelSortOption, { label: string; hint: string }]>).map(([option, meta]) => (
                                <button
                                  key={option}
                                  className={clsx('action-menu__item', option === modelSortOption && 'is-active')}
                                  type="button"
                                  onClick={() => selectSortOption(option)}
                                >
                                  <span>{meta.label}</span>
                                  <small>{meta.hint}</small>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                }
              >
                {modelManagementTab === 'catalog' ? (
                  modelManagementView === 'list' ? (
                  <div className="table-shell settings-model-table-shell">
                    <table className="history-table settings-model-table">
                      <thead>
                        <tr>
                          <th className="settings-model-table__select-head">
                            <input
                              type="checkbox"
                              aria-label="全选模型"
                              checked={allVisibleModelsSelected}
                              onChange={(event) => toggleSelectAllModels(event.target.checked)}
                            />
                          </th>
                          <th>模型名称</th>
                          <th className="settings-model-table__compact-head">Provider</th>
                          <th className="settings-model-table__compact-head">接口模型</th>
                          <th className="settings-model-table__compact-head">Tag</th>
                          <th>状态</th>
                          <th>更新时间</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedModels.map((model) => (
                          <tr key={model.model_code}>
                            <td className="settings-model-table__select-cell">
                              <input
                                type="checkbox"
                                aria-label={`选择模型 ${model.display_name}`}
                                checked={selectedModelCodes.includes(model.model_code)}
                                onChange={() => toggleModelSelection(model.model_code)}
                              />
                            </td>
                            <td>
                              <div className="settings-model-table__title">
                                <strong>{model.display_name}</strong>
                                <span>{model.model_code}</span>
                              </div>
                            </td>
                            <td>
                              <span className="settings-model-table__chip">{model.provider}</span>
                            </td>
                            <td>
                              <div className="settings-model-table__api">
                                <strong>{model.api_model_name}</strong>
                              </div>
                            </td>
                            <td>
                              <div className="settings-model-table__tags">
                                {model.tags.length ? (
                                  model.tags.map((tag) => (
                                    <span key={`${model.model_code}-${tag}`} className="tag tag--muted settings-model-table__tag-compact">
                                      {tag}
                                    </span>
                                  ))
                                ) : (
                                  <span className="tag tag--muted settings-model-table__tag-compact is-empty">无标签</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <span className={clsx('status-pill settings-model-table__status', model.is_active ? 'is-active' : 'is-muted')}>
                                {model.is_deleted ? '已删除' : model.is_active ? '启用中' : '已停用'}
                              </span>
                            </td>
                            <td>
                              <time className="settings-model-table__time" dateTime={model.updated_at}>
                                {formatDateTimeLocal(model.updated_at)}
                              </time>
                            </td>
                            <td>
                              <div className="settings-model-table__actions">
                                <IconButton
                                  label={`编辑模型 ${model.display_name}`}
                                  icon={<EditIcon />}
                                  onClick={() => void openEditModel(model.model_code)}
                                />
                                {!model.is_deleted ? (
                                  <>
                                    <IconButton
                                      label={`${model.is_active ? '停用' : '启用'}模型 ${model.display_name}`}
                                      icon={<ToggleIcon active={model.is_active} />}
                                      onClick={() => modelActionMutation.mutate({ type: 'toggle', modelCode: model.model_code, isActive: !model.is_active })}
                                    />
                                    <div className="action-menu" onClick={stopMenuEvent}>
                                      <IconButton
                                        label={`更多操作：${model.display_name}`}
                                        icon={<MoreIcon />}
                                        onClick={(event) => toggleModelMenu(`list:${model.model_code}`, event)}
                                        expanded={modelActionMenu === `list:${model.model_code}`}
                                      />
                                      {modelActionMenu === `list:${model.model_code}` ? (
                                        <div className="action-menu__panel settings-action-menu__panel">
                                          <button className="action-menu__item" type="button" onClick={() => openGenerateModel(model.model_code, model.display_name)}>
                                            生成预测数据
                                          </button>
                                          <button className="action-menu__item action-menu__item--danger" type="button" onClick={() => modelActionMutation.mutate({ type: 'delete', modelCode: model.model_code })}>
                                            删除模型
                                          </button>
                                        </div>
                                      ) : null}
                                    </div>
                                  </>
                                ) : (
                                  <div className="action-menu" onClick={stopMenuEvent}>
                                    <IconButton
                                      label={`恢复模型 ${model.display_name}`}
                                      icon={<RestoreIcon />}
                                      onClick={() => modelActionMutation.mutate({ type: 'restore', modelCode: model.model_code })}
                                    />
                                  </div>
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
                    {sortedModels.map((model) => (
                      <article key={model.model_code} className="settings-model-card-react">
                        <div className="settings-model-card-react__header">
                          <div>
                            <p className="settings-model-card-react__provider">{model.provider}</p>
                            <h3>{model.display_name}</h3>
                          </div>
                          <div className="settings-model-card-react__header-actions">
                            <span className={clsx('status-pill', model.is_active ? 'is-active' : 'is-muted')}>
                              {model.is_deleted ? '已删除' : model.is_active ? '启用中' : '已停用'}
                            </span>
                            <div className="settings-model-card-react__action-strip">
                              <IconButton
                                label={`编辑模型 ${model.display_name}`}
                                icon={<EditIcon />}
                                onClick={() => void openEditModel(model.model_code)}
                              />
                              {!model.is_deleted ? (
                                <>
                                  <IconButton
                                    label={`${model.is_active ? '停用' : '启用'}模型 ${model.display_name}`}
                                    icon={<ToggleIcon active={model.is_active} />}
                                    onClick={() => modelActionMutation.mutate({ type: 'toggle', modelCode: model.model_code, isActive: !model.is_active })}
                                  />
                                  <div className="action-menu" onClick={stopMenuEvent}>
                                    <IconButton
                                      label={`更多操作：${model.display_name}`}
                                      icon={<MoreIcon />}
                                      onClick={(event) => toggleModelMenu(`card:${model.model_code}`, event)}
                                      expanded={modelActionMenu === `card:${model.model_code}`}
                                    />
                                    {modelActionMenu === `card:${model.model_code}` ? (
                                      <div className="action-menu__panel settings-action-menu__panel">
                                        <button className="action-menu__item" type="button" onClick={() => openGenerateModel(model.model_code, model.display_name)}>
                                          生成预测数据
                                        </button>
                                        <button className="action-menu__item action-menu__item--danger" type="button" onClick={() => modelActionMutation.mutate({ type: 'delete', modelCode: model.model_code })}>
                                          删除模型
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </>
                              ) : (
                                <IconButton
                                  label={`恢复模型 ${model.display_name}`}
                                  icon={<RestoreIcon />}
                                  onClick={() => modelActionMutation.mutate({ type: 'restore', modelCode: model.model_code })}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="settings-model-card-react__meta">{model.api_model_name}</p>
                        <div className="settings-model-card-react__facts">
                          <span>{model.base_url}</span>
                          <span>{model.tags.join(', ') || '无标签'}</span>
                          <span>{formatDateTimeLocal(model.updated_at)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                  )
                ) : (
                  <>
                    <section className="settings-profile-hero settings-records-hero">
                      <div className="settings-profile-hero__main">
                        <p className="settings-profile-hero__eyebrow">记录概览</p>
                        <h2>预测记录</h2>
                        <p className="settings-profile-hero__description">按期号快速检索当前期与历史预测记录，并查看每期的模型覆盖情况与开奖结果。</p>
                      </div>
                      <div className="settings-profile-summary">
                        <article className="settings-profile-summary__item">
                          <span>全部记录</span>
                          <strong>{predictionRecordSummary.total}</strong>
                        </article>
                        <article className="settings-profile-summary__item">
                          <span>当前期</span>
                          <strong>{predictionRecordSummary.current}</strong>
                        </article>
                        <article className="settings-profile-summary__item">
                          <span>历史</span>
                          <strong>{predictionRecordSummary.history}</strong>
                        </article>
                        <article className="settings-profile-summary__item">
                          <span>筛选结果</span>
                          <strong>{filteredPredictionRecords.length}</strong>
                        </article>
                      </div>
                      <div className="history-toolbar settings-records-hero__toolbar">
                        <div className="filter-chip-group">
                          {[
                            { value: 'all', label: '全部' },
                            { value: 'current', label: '当前期' },
                            { value: 'history', label: '历史' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              className={clsx('filter-chip', predictionRecordTypeFilter === option.value && 'is-active')}
                              onClick={() => setPredictionRecordTypeFilter(option.value as PredictionRecordTypeFilter)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <input
                          className="search-input"
                          value={predictionRecordPeriodQuery}
                          onChange={(event) => setPredictionRecordPeriodQuery(event.target.value.replace(/[^\d]/g, ''))}
                          placeholder="输入期号过滤"
                        />
                      </div>
                    </section>
                    {filteredPredictionRecords.length ? (
                      <div className="table-shell settings-model-table-shell">
                        <table className="history-table settings-model-table">
                          <thead>
                            <tr>
                              <th>记录类型</th>
                              <th>期号</th>
                              <th>预测日期</th>
                              <th>开奖结果</th>
                              <th>模型数</th>
                              <th>状态</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredPredictionRecords.map((record) => (
                              <tr key={`${record.record_type}-${record.target_period}`}>
                                <td>{record.record_type === 'current' ? '当前期' : '历史'}</td>
                                <td>{record.target_period}</td>
                                <td>{record.prediction_date || '-'}</td>
                                <td>
                                  {record.actual_result ? (
                                    <div className="settings-model-table__tags">
                                      {record.actual_result.red_balls.map((ball) => <NumberBall key={`${record.target_period}-red-${ball}`} value={ball} color="red" size="sm" />)}
                                      {record.actual_result.blue_balls.map((ball) => <NumberBall key={`${record.target_period}-blue-${ball}`} value={ball} color="blue" size="sm" />)}
                                    </div>
                                  ) : (
                                    <span>待开奖</span>
                                  )}
                                </td>
                                <td>{record.model_count}</td>
                                <td>{record.status_label}</td>
                                <td>
                                  <button
                                    className="ghost-button"
                                    onClick={() => setSelectedPredictionRecord({ recordType: record.record_type, targetPeriod: record.target_period })}
                                  >
                                    查看详情
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="state-shell">没有符合当前筛选条件的预测记录。</div>
                    )}
                  </>
                )}
              </StatusCard>
              {isSuperAdmin ? (
                <StatusCard title="数据维护" subtitle={`手动抓取${selectedLottery === 'pl3' ? '排列3' : '大乐透'}开奖历史数据并更新到数据库。`}>
                  <section className="settings-profile-hero settings-maintenance-hero">
                    <div className="settings-profile-hero__main">
                      <p className="settings-profile-hero__eyebrow">数据维护</p>
                      <h2>{selectedLottery === 'pl3' ? '排列3历史同步' : '大乐透历史同步'}</h2>
                      <p className="settings-profile-hero__description">手动抓取开奖历史并写入数据库，用于更新首页统计、预测记录和后续模型分析。</p>
                    </div>
                    <div className="settings-profile-hero__badges">
                      <span className="status-pill">
                        {lotteryFetchTask ? `任务状态：${getTaskStatusLabel(lotteryFetchTask.status)}` : '尚未执行'}
                      </span>
                    </div>
                    <div className="settings-profile-summary">
                      <article className="settings-profile-summary__item">
                        <span>抓取条数</span>
                        <strong>{lotteryFetchTask?.progress_summary.fetched_count ?? 0}</strong>
                      </article>
                      <article className="settings-profile-summary__item">
                        <span>写入条数</span>
                        <strong>{lotteryFetchTask?.progress_summary.saved_count ?? 0}</strong>
                      </article>
                      <article className="settings-profile-summary__item">
                        <span>最新期号</span>
                        <strong>{lotteryFetchTask?.progress_summary.latest_period || '-'}</strong>
                      </article>
                      <article className="settings-profile-summary__item">
                        <span>创建时间</span>
                        <strong>{lotteryFetchTask ? formatDateTimeLocal(lotteryFetchTask.created_at) : '-'}</strong>
                      </article>
                    </div>
                    <div className="settings-maintenance-hero__actions">
                      <button className="primary-button" onClick={() => fetchLotteryMutation.mutate()} disabled={fetchLotteryMutation.isPending || Boolean(lotteryFetchTask && ['queued', 'running'].includes(lotteryFetchTask.status))}>
                        {fetchLotteryMutation.isPending || (lotteryFetchTask && ['queued', 'running'].includes(lotteryFetchTask.status))
                          ? `正在获取${selectedLottery === 'pl3' ? '排列3' : '大乐透'}数据...`
                          : `获取${selectedLottery === 'pl3' ? '排列3' : '大乐透'}数据`}
                      </button>
                    </div>
                  </section>
                </StatusCard>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'users' ? (
            <div className="page-section">
              <StatusCard title="用户管理" subtitle="按角色分配权限，普通用户默认仅可修改基础信息。">
                <form
                  className="panel-card settings-form-card settings-user-create-card"
                  onSubmit={(event) => {
                    event.preventDefault()
                    createUserMutation.mutate()
                  }}
                >
                  <div className="panel-card__header">
                    <div>
                      <h2 className="panel-card__title">新增用户</h2>
                      <p className="settings-profile-form-card__hint">快速创建账号并分配默认角色，后续仍可在下方卡片中调整。</p>
                    </div>
                    <label className="toggle-chip settings-user-create-card__toggle">
                      <input type="checkbox" checked={newUserForm.is_active} onChange={(event) => setNewUserForm((previous) => ({ ...previous, is_active: event.target.checked }))} />
                      <span>启用</span>
                    </label>
                  </div>
                  <div className="settings-inline-form settings-inline-form--users">
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
                    <button className="primary-button settings-user-create-card__submit" type="submit">创建用户</button>
                  </div>
                </form>

                <div className="settings-grid-react">
                  {users.map((account) => (
                    <article key={account.id} className="settings-model-card-react settings-entity-card">
                      <div className="settings-model-card-react__header">
                        <div>
                          <p className="settings-model-card-react__provider">{account.role_name}</p>
                          <h3>{account.nickname || account.username}</h3>
                        </div>
                        <span className={clsx('status-pill', account.is_active ? 'is-active' : 'is-muted')}>
                          {account.is_active ? '启用中' : '已停用'}
                        </span>
                      </div>
                      <p className="settings-model-card-react__meta">{account.username}</p>
                      <div className="settings-model-card-react__facts">
                        <span>ID #{account.id}</span>
                        <span>{account.permissions.length} 项权限</span>
                      </div>
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
                      <div className="settings-entity-card__footer">
                        <button className="ghost-button" onClick={() => updateUserMutation.mutate({ userId: account.id, role: account.role, isActive: !account.is_active })}>
                          {account.is_active ? '禁用' : '启用'}
                        </button>
                        <div className="settings-entity-card__inline-form">
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
                  <div className="settings-profile-hero settings-role-guardrail settings-role-guardrail--hero">
                    <div className="settings-profile-hero__main">
                      <p className="settings-profile-hero__eyebrow">保护规则</p>
                      <h2>角色与权限边界</h2>
                      <p className="settings-profile-hero__description">通过更清晰的角色说明和风险提示，降低误删、误授权和关键角色失控的概率。</p>
                    </div>
                    <div className="settings-role-guardrail__list">
                      <span>超级管理员默认拥有全部权限，系统至少保留 1 个启用中的超级管理员。</span>
                      <span>普通用户默认仅开放基础信息，进入设置中心后只能修改昵称和密码。</span>
                      <span>系统角色不能删除；删除自定义角色前，请先确认没有用户仍在使用该角色。</span>
                    </div>
                  </div>

                  <div className="settings-grid-react">
                    {roles.map((role) => (
                      <article key={role.role_code} className={clsx('settings-model-card-react settings-entity-card', selectedRoleCode === role.role_code && 'is-selected')}>
                        <div className="settings-model-card-react__header">
                          <div>
                            <p className="settings-model-card-react__provider">{role.is_system ? '系统角色' : '自定义角色'}</p>
                            <h3>{role.role_name}</h3>
                          </div>
                          <span className="status-pill">{role.member_count} 人</span>
                        </div>
                        <p className="settings-model-card-react__meta">{role.role_code}</p>
                        <div className="settings-model-card-react__facts">
                          <span>{role.permissions.length} 项权限</span>
                          <span>{role.permissions.map((permission) => getPermissionLabel(permission)).join(' / ') || '未分配权限'}</span>
                        </div>
                        <p className="settings-role-card__hint">{getRoleProtectionHint(role)}</p>
                        <div className="settings-entity-card__footer">
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

                  <form className="panel-card settings-form-card settings-profile-form-card" onSubmit={submitRoleForm}>
                    <div className="panel-card__header">
                      <div>
                        <h2 className="panel-card__title">{selectedRole ? '编辑角色' : '新增角色'}</h2>
                        <p className="settings-profile-form-card__hint">维护角色编码、展示名称与可用权限，系统角色默认不可删除。</p>
                      </div>
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

                  <div className="panel-card settings-form-card settings-profile-form-card">
                    <div className="panel-card__header">
                      <div>
                        <h2 className="panel-card__title">权限说明维护</h2>
                        <p className="settings-profile-form-card__hint">统一维护权限展示名称与说明文案，方便后台成员理解边界。</p>
                      </div>
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

      {bulkEditModalOpen ? (
        <div className="modal-shell" role="presentation" onClick={() => setBulkEditModalOpen(false)}>
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form className="settings-form-grid" onSubmit={submitBulkEditForm}>
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">批量编辑</p>
                  <h3>已选 {selectedModelCodes.length} 个模型</h3>
                </div>
                <button className="ghost-button" type="button" onClick={() => setBulkEditModalOpen(false)}>关闭</button>
              </div>
              <label className="field">
                <span>
                  <input type="checkbox" checked={bulkEditForm.providerEnabled} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, providerEnabled: event.target.checked }))} /> Provider
                </span>
                <select value={bulkEditForm.provider} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, provider: event.target.value }))} disabled={!bulkEditForm.providerEnabled}>
                  {providers.map((provider) => (
                    <option key={provider.code} value={provider.code}>{provider.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>
                  <input type="checkbox" checked={bulkEditForm.baseUrlEnabled} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, baseUrlEnabled: event.target.checked }))} /> Base URL
                </span>
                <input value={bulkEditForm.base_url} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, base_url: event.target.value }))} disabled={!bulkEditForm.baseUrlEnabled} />
              </label>
              <label className="field">
                <span>
                  <input type="checkbox" checked={bulkEditForm.apiKeyEnabled} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, apiKeyEnabled: event.target.checked }))} /> API Key
                </span>
                <input value={bulkEditForm.api_key} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, api_key: event.target.value }))} disabled={!bulkEditForm.apiKeyEnabled} />
              </label>
              <label className="field">
                <span>
                  <input type="checkbox" checked={bulkEditForm.tagsEnabled} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, tagsEnabled: event.target.checked }))} /> 标签
                </span>
                <input value={bulkEditForm.tags} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, tags: event.target.value }))} disabled={!bulkEditForm.tagsEnabled} />
              </label>
              <label className="field">
                <span>
                  <input type="checkbox" checked={bulkEditForm.temperatureEnabled} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, temperatureEnabled: event.target.checked }))} /> Temperature
                </span>
                <input type="number" step="0.1" value={bulkEditForm.temperature} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, temperature: event.target.value }))} disabled={!bulkEditForm.temperatureEnabled} />
              </label>
              <label className="field">
                <span>
                  <input type="checkbox" checked={bulkEditForm.isActiveEnabled} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, isActiveEnabled: event.target.checked }))} /> 启用状态
                </span>
                <select value={bulkEditForm.is_active ? 'true' : 'false'} onChange={(event) => setBulkEditForm((previous) => ({ ...previous, is_active: event.target.value === 'true' }))} disabled={!bulkEditForm.isActiveEnabled}>
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
              </label>
              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={bulkModelActionMutation.isPending}>保存批量修改</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {generationModalOpen ? (
        <div className="modal-shell" role="presentation" onClick={() => setGenerationModalOpen(false)}>
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form className="settings-form-grid" onSubmit={submitGenerationForm}>
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">预测生成</p>
                  <h3>{generationForm.displayName || generationForm.modelCodes.join(', ')}</h3>
                  <p className="settings-inline-hint">
                    当前生成彩种：{generationForm.lotteryCode === 'pl3' ? '排列3' : '大乐透'}
                  </p>
                </div>
                <button className="ghost-button" type="button" onClick={() => setGenerationModalOpen(false)}>关闭</button>
              </div>
              <label className="field">
                <span>生成模式</span>
                <select
                  value={generationForm.mode}
                  onChange={(event) => setGenerationForm((previous) => ({ ...previous, mode: event.target.value as ModelPredictionMode }))}
                >
                  <option value="current">当前期生成</option>
                  <option value="history">历史重算</option>
                </select>
              </label>
              <label className="field">
                <span>结果策略</span>
                <select
                  value={generationForm.overwrite ? 'overwrite' : 'skip'}
                  onChange={(event) => setGenerationForm((previous) => ({ ...previous, overwrite: event.target.value === 'overwrite' }))}
                >
                  <option value="skip">已有结果时跳过</option>
                  <option value="overwrite">已有结果时覆盖</option>
                </select>
              </label>
              {generationForm.mode === 'history' ? (
                <>
                  <label className="field">
                    <span>开始期号</span>
                    <input value={generationForm.startPeriod} onChange={(event) => setGenerationForm((previous) => ({ ...previous, startPeriod: event.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>结束期号</span>
                    <input value={generationForm.endPeriod} onChange={(event) => setGenerationForm((previous) => ({ ...previous, endPeriod: event.target.value }))} required />
                  </label>
                </>
              ) : null}
              {generationTask ? (
                <section className="generation-task-panel" aria-live="polite">
                  <div className="generation-task-panel__header">
                    <div>
                      <p className="modal-card__eyebrow">任务状态</p>
                      <h4>{isBulkGenerationTask ? '批量生成任务' : '单模型生成任务'}</h4>
                    </div>
                    <span className={clsx('status-pill', generationTask.status === 'succeeded' && 'is-active', generationTask.status === 'failed' && 'is-deleted')}>
                      {getTaskStatusLabel(generationTask.status)}
                    </span>
                  </div>
                  {isBulkGenerationTask ? (
                    <>
                      <div className="generation-task-panel__progress-meta">
                        <strong>{generationProgressPercent}%</strong>
                        <span>{generationTaskCompleted} / {generationTaskTotal || generationForm.modelCodes.length} 个模型</span>
                      </div>
                      <div
                        className="generation-task-panel__progress-bar"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={generationTaskTotal || generationForm.modelCodes.length || 0}
                        aria-valuenow={generationTaskCompleted}
                      >
                        <span style={{ width: `${generationProgressPercent}%` }} />
                      </div>
                      <div className="generation-task-panel__stats">
                        <article>
                          <strong>{generationTaskTotal || generationForm.modelCodes.length}</strong>
                          <span>总模型数</span>
                        </article>
                        <article>
                          <strong>{generationTask.progress_summary.processed_count}</strong>
                          <span>成功</span>
                        </article>
                        <article>
                          <strong>{generationTask.progress_summary.skipped_count}</strong>
                          <span>跳过</span>
                        </article>
                        <article>
                          <strong>{generationTask.progress_summary.failed_count}</strong>
                          <span>失败</span>
                        </article>
                      </div>
                      {generationFailedDetails.length ? (
                        <div className="generation-task-panel__failures">
                          <div className="generation-task-panel__failures-title">
                            <strong>失败模型</strong>
                            <span>{generationFailedDetails.length} 个</span>
                          </div>
                          <div className="generation-task-panel__failure-list">
                            {generationFailedDetails.map((item) => (
                              <article key={`${item.model_code}-${item.reason}`} className="generation-task-panel__failure-item">
                                <div>
                                  <strong>{item.model_name}</strong>
                                  <span>{item.model_code}</span>
                                </div>
                                <p>{item.reason}</p>
                              </article>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="generation-task-panel__stats">
                      <article>
                        <strong>{generationTask.progress_summary.processed_count}</strong>
                        <span>成功</span>
                      </article>
                      <article>
                        <strong>{generationTask.progress_summary.skipped_count}</strong>
                        <span>跳过</span>
                      </article>
                      <article>
                        <strong>{generationTask.progress_summary.failed_count}</strong>
                        <span>失败</span>
                      </article>
                    </div>
                  )}
                  {generationTask.error_message ? <div className="state-shell state-shell--error">任务失败：{generationTask.error_message}</div> : null}
                </section>
              ) : null}
              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={generatePredictionMutation.isPending}>创建任务</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {selectedPredictionRecord ? (
        <div className="modal-shell" role="presentation" onClick={() => setSelectedPredictionRecord(null)}>
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="settings-form-grid">
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">预测记录详情</p>
                  <h3>第 {selectedPredictionRecord.targetPeriod} 期</h3>
                </div>
                <button className="ghost-button" type="button" onClick={() => setSelectedPredictionRecord(null)}>关闭</button>
              </div>
              {predictionRecordDetailQuery.isLoading ? <div className="state-shell">正在加载预测详情...</div> : null}
              {predictionRecordDetailQuery.error instanceof Error ? <div className="state-shell state-shell--error">详情加载失败：{predictionRecordDetailQuery.error.message}</div> : null}
              {predictionRecordDetailQuery.data ? (
                <>
                  <div className="settings-model-card-react__facts">
                    <span>记录类型：{predictionRecordDetailQuery.data.record_type === 'current' ? '当前期' : '历史'}</span>
                    <span>预测日期：{predictionRecordDetailQuery.data.prediction_date || '-'}</span>
                    <span>状态：{predictionRecordDetailQuery.data.record_type === 'current' ? '待开奖' : '已归档'}</span>
                  </div>
                  {predictionRecordDetailQuery.data.actual_result ? (
                    <div className="number-row">
                      {((predictionRecordDetailQuery.data.actual_result.lottery_code || 'dlt') === 'pl3'
                        ? ((predictionRecordDetailQuery.data.actual_result.digits?.length
                            ? predictionRecordDetailQuery.data.actual_result.digits
                            : predictionRecordDetailQuery.data.actual_result.red_balls) || [])
                        : predictionRecordDetailQuery.data.actual_result.red_balls
                      ).map((ball) => (
                        <NumberBall key={`detail-red-${ball}`} value={ball} color="red" />
                      ))}
                      {(predictionRecordDetailQuery.data.actual_result.lottery_code || 'dlt') === 'dlt' ? <span className="number-row__divider" /> : null}
                      {(predictionRecordDetailQuery.data.actual_result.lottery_code || 'dlt') === 'dlt'
                        ? predictionRecordDetailQuery.data.actual_result.blue_balls.map((ball) => (
                            <NumberBall key={`detail-blue-${ball}`} value={ball} color="blue" />
                          ))
                        : null}
                    </div>
                  ) : null}
                  <div className="history-record-card__detail-list">
                    {predictionRecordDetailQuery.data.models.map((model) => (
                      <section key={`${predictionRecordDetailQuery.data?.target_period}-${model.model_id}`} className="history-record-card__detail-model">
                        <div className="history-record-card__detail-header">
                          <div>
                            <strong>{model.model_name}</strong>
                            <p>{model.model_provider}</p>
                          </div>
                          <span>最佳命中 {model.best_hit_count || 0}</span>
                        </div>
                        <div className="settings-model-table__tags">
                          {model.predictions.map((group) => (
                            <span key={`${model.model_id}-${group.group_id}`} className="tag tag--muted">
                              第{group.group_id}组{' '}
                              {(group.play_type || (group.digits || []).length)
                                ? `${group.play_type === 'group3' ? '组选3' : group.play_type === 'group6' ? '组选6' : '直选'} ${(group.digits?.length ? group.digits : group.red_balls).join(' ')}`
                                : `${group.red_balls.join(' ')} | ${group.blue_balls.join(' ')}`}
                            </span>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
