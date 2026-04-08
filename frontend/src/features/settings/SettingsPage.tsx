import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useLocation, useNavigate } from 'react-router-dom'
import Cropper, { type Area } from 'react-easy-crop'
import { apiClient } from '../../shared/api/client'
import { StatusCard } from '../../shared/components/StatusCard'
import { UserAvatar } from '../../shared/components/UserAvatar'
import { useAuth } from '../../shared/auth/AuthProvider'
import { useToast } from '../../shared/feedback/ToastProvider'
import { formatDateTimeBeijing, formatDateTimeLocal } from '../../shared/lib/format'
import { useMotion } from '../../shared/theme/MotionProvider'
import {
  loadSettingsLotteryFetchLimits,
  loadSettingsTableColumnWidths,
  saveSettingsLotteryFetchLimits,
  saveSettingsTableColumnWidths,
} from '../../shared/lib/storage'
import type {
  AuthUser,
  BulkModelActionResult,
  MaintenanceRunLog,
  LotteryFetchTask,
  PasswordChangePayload,
  PermissionItem,
  PermissionUpdatePayload,
  PredictionGenerationTask,
  RoleItem,
  RolePayload,
  ScheduleTask,
  ScheduleTaskPayload,
  ScheduleTaskType,
  ScheduleMode,
  SchedulePresetType,
  SettingsModel,
  SettingsModelPayload,
  SettingsProviderDiscoveredModel,
  SettingsProvider,
  SettingsProviderPayload,
  LotteryCode,
} from '../../shared/types/api'
import {
  buildMonthLabel,
  buildScheduleCalendarMonth,
  resolveTodayInBeijing,
  shiftCalendarMonth,
} from './lib/scheduleCalendar'

type SettingsTab = 'profile' | 'account' | 'models' | 'maintenance' | 'schedules' | 'users' | 'roles'
type ModelManagementView = 'list' | 'card'
type ModelPredictionMode = 'current' | 'history'
type ModelPredictionPlayMode = 'direct' | 'direct_sum' | 'compound' | 'dantuo'
type GenerationHistoryRangeMode = 'custom' | 'recent'
type GenerationRecentPeriodCount = '1' | '5' | '10' | '20'
type ModelSortOption = 'updated_desc' | 'updated_asc' | 'name_asc' | 'name_desc'
type ModelStatusFilter = 'all' | 'active' | 'inactive'
type ScheduleTaskFilter = 'all' | 'lottery_fetch' | 'prediction_generate'
type ScheduleListView = 'list' | 'calendar'
type MaintenanceLogFilter = 'all' | LotteryCode
type BulkEditForm = {
  providerEnabled: boolean
  provider: string
  baseUrlEnabled: boolean
  base_url: string
  apiKeyEnabled: boolean
  api_key: string
  isActiveEnabled: boolean
  is_active: boolean
}
type ScheduleForm = ScheduleTaskPayload

const SETTINGS_TAB_PATHS: Record<SettingsTab, string> = {
  profile: '/settings/profile',
  account: '/settings/account',
  models: '/settings/models',
  maintenance: '/settings/maintenance',
  schedules: '/settings/schedules',
  users: '/settings/users',
  roles: '/settings/roles',
}

function getSettingsTabFromPath(pathname: string): SettingsTab {
  const matchedTab = (Object.entries(SETTINGS_TAB_PATHS) as Array<[SettingsTab, string]>).find(([, path]) => path === pathname)
  return matchedTab?.[0] || 'profile'
}

const EMPTY_MODEL_FORM: SettingsModelPayload = {
  model_code: '',
  display_name: '',
  provider: '',
  provider_model_id: null,
  provider_model_name: '',
  api_format: 'openai_compatible',
  api_model_name: '',
  base_url: '',
  api_key: '',
  app_code: '',
  temperature: 0.3,
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
  predictionPlayMode: 'direct' as ModelPredictionPlayMode,
  historyRangeMode: 'custom' as GenerationHistoryRangeMode,
  recentPeriodCount: '5' as GenerationRecentPeriodCount,
  overwrite: false,
  parallelism: '3',
  startPeriod: '',
  endPeriod: '',
}

const EMPTY_PROVIDER_FORM: SettingsProviderPayload = {
  code: '',
  name: '',
  api_format: 'openai_compatible',
  remark: '',
  website_url: '',
  api_key: '',
  base_url: '',
  extra_options: {},
  model_configs: [],
}

const LMSTUDIO_PROVIDER_CODE = 'lmstudio'
const LMSTUDIO_DEFAULT_BASE_URL = 'http://127.0.0.1:1234/v1'

const EMPTY_BULK_EDIT_FORM: BulkEditForm = {
  providerEnabled: false,
  provider: '',
  baseUrlEnabled: false,
  base_url: '',
  apiKeyEnabled: false,
  api_key: '',
  isActiveEnabled: false,
  is_active: true,
}
const EMPTY_SCHEDULE_FORM: ScheduleForm = {
  task_name: '',
  task_type: 'lottery_fetch',
  lottery_code: 'dlt',
  fetch_limit: 30,
  model_codes: [],
  generation_mode: 'current',
  prediction_play_mode: 'direct',
  overwrite_existing: false,
  schedule_mode: 'preset',
  preset_type: 'daily',
  time_of_day: '09:00',
  weekdays: [],
  cron_expression: '',
  is_active: true,
}
const DEFAULT_SETTINGS_LOTTERY: LotteryCode = 'dlt'

const EMPTY_MODELS: SettingsModel[] = []
const EMPTY_PROVIDERS: SettingsProvider[] = []
const EMPTY_USERS: AuthUser[] = []
const EMPTY_ROLES: RoleItem[] = []
const EMPTY_PERMISSIONS: PermissionItem[] = []
const WEEKDAY_OPTIONS = [
  { value: 0, label: '周一' },
  { value: 1, label: '周二' },
  { value: 2, label: '周三' },
  { value: 3, label: '周四' },
  { value: 4, label: '周五' },
  { value: 5, label: '周六' },
  { value: 6, label: '周日' },
]
const CALENDAR_WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const MODEL_SORT_META: Record<ModelSortOption, { label: string; hint: string }> = {
  updated_desc: { label: '最近更新', hint: '按更新时间从新到旧排序' },
  updated_asc: { label: '最早更新', hint: '按更新时间从旧到新排序' },
  name_asc: { label: '名称 A-Z', hint: '按名称正序排序' },
  name_desc: { label: '名称 Z-A', hint: '按名称倒序排序' },
}
const MODEL_STATUS_FILTER_META: Array<{ value: ModelStatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '启用' },
  { value: 'inactive', label: '未启用' },
]
const GENERATION_RECENT_PERIOD_OPTIONS: Array<{ value: GenerationRecentPeriodCount; label: string }> = [
  { value: '1', label: '近1期' },
  { value: '5', label: '近5期' },
  { value: '10', label: '近10期' },
  { value: '20', label: '近20期' },
]
const LOTTERY_FETCH_LIMIT_PRESET_OPTIONS = [10, 30, 50, 100, 200, 500] as const
const LOTTERY_FETCH_LIMIT_DEFAULT = 30

type ScheduleColumnKey = 'name' | 'type' | 'lottery' | 'models' | 'rule' | 'next_run' | 'status' | 'enabled' | 'actions'
type MaintenanceColumnKey = 'lottery' | 'status' | 'fetched' | 'saved' | 'period' | 'created' | 'actions'
type MotionPreferenceOption = 'system' | 'minimal' | 'normal' | 'enhanced'

const SCHEDULE_COLUMN_DEFAULT_WIDTHS: Record<ScheduleColumnKey, number> = {
  name: 260,
  type: 108,
  lottery: 96,
  models: 188,
  rule: 240,
  next_run: 196,
  status: 146,
  enabled: 136,
  actions: 104,
}

const MOTION_PREFERENCE_OPTIONS: Array<{ value: MotionPreferenceOption; label: string; description: string }> = [
  { value: 'system', label: '跟随系统', description: '自动读取系统“减少动态效果”设置。' },
  { value: 'minimal', label: '极简', description: '尽量关闭动画，优先减少干扰。' },
  { value: 'normal', label: '标准', description: '保持当前推荐的动效节奏。' },
  { value: 'enhanced', label: '增强', description: '动效更明显，反馈更强。' },
]

const MAINTENANCE_COLUMN_DEFAULT_WIDTHS: Record<MaintenanceColumnKey, number> = {
  lottery: 110,
  status: 142,
  fetched: 118,
  saved: 118,
  period: 126,
  created: 176,
  actions: 132,
}

function normalizeFetchLimit(value: unknown, fallback: number = LOTTERY_FETCH_LIMIT_DEFAULT) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  const rounded = Math.round(numeric)
  return Math.max(1, Math.min(500, rounded))
}

function parseFetchLimitInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return null
  const rounded = Math.round(parsed)
  if (rounded < 1 || rounded > 500) return null
  return rounded
}

function formatBeijingDateKey(value?: number | null) {
  if (!value) return null
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date(value * 1000))
}

const PROFILE_AVATAR_MAX_SIZE_BYTES = 4 * 1024 * 1024 + 512 * 1024
const PROFILE_AVATAR_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png'])
const PROFILE_AVATAR_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png']

function getProfileAvatarValidationError(file: File) {
  if (file.size > PROFILE_AVATAR_MAX_SIZE_BYTES) {
    return '头像图片大小不能超过 4.5MB'
  }
  const normalizedName = file.name.toLowerCase()
  const hasValidExtension = PROFILE_AVATAR_ALLOWED_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
  const normalizedType = (file.type || '').toLowerCase()
  if (!hasValidExtension || (normalizedType && !PROFILE_AVATAR_ALLOWED_TYPES.has(normalizedType))) {
    return '头像仅支持 JPG、PNG 格式'
  }
  return null
}

async function createCroppedAvatarFile(source: File, pixelCrop: Area) {
  const imageUrl = URL.createObjectURL(source)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('头像图片解析失败'))
    img.src = imageUrl
  }).finally(() => URL.revokeObjectURL(imageUrl))

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(pixelCrop.width))
  canvas.height = Math.max(1, Math.round(pixelCrop.height))
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('头像裁剪失败，请稍后重试')
  }
  context.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  const outputType = source.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (!value) {
          reject(new Error('头像裁剪失败，请稍后重试'))
          return
        }
        resolve(value)
      },
      outputType,
      outputType === 'image/jpeg' ? 0.92 : undefined,
    )
  })
  const extension = outputType === 'image/png' ? 'png' : 'jpg'
  return new File([blob], `avatar-${Date.now()}.${extension}`, { type: outputType })
}

const SCHEDULE_COLUMN_MIN_WIDTHS: Record<ScheduleColumnKey, number> = {
  name: 220,
  type: 96,
  lottery: 88,
  models: 150,
  rule: 210,
  next_run: 168,
  status: 126,
  enabled: 126,
  actions: 96,
}

function normalizeScheduleColumnWidths(widths: Partial<Record<ScheduleColumnKey, number>>) {
  const nextWidths: Record<ScheduleColumnKey, number> = {
    ...SCHEDULE_COLUMN_DEFAULT_WIDTHS,
    ...widths,
  }
  nextWidths.actions = Math.max(
    SCHEDULE_COLUMN_MIN_WIDTHS.actions,
    Math.min(Math.round(nextWidths.actions || SCHEDULE_COLUMN_DEFAULT_WIDTHS.actions), 124),
  )
  return nextWidths
}

const MAINTENANCE_COLUMN_MIN_WIDTHS: Record<MaintenanceColumnKey, number> = {
  lottery: 96,
  status: 126,
  fetched: 104,
  saved: 104,
  period: 110,
  created: 150,
  actions: 118,
}

function getLotteryLabel(lotteryCode: LotteryCode) {
  return lotteryCode === 'dlt' ? '大乐透' : lotteryCode === 'pl3' ? '排列3' : lotteryCode === 'pl5' ? '排列5' : '七星彩'
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

function CalendarIcon() {
  return (
    <SvgIcon>
      <rect x="3.5" y="4.5" width="13" height="12" rx="2" />
      <path d="M6.7 3v3.3M13.3 3v3.3M3.5 8h13" />
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

function EyeIcon({ open }: { open: boolean }) {
  return (
    <SvgIcon>
      <path d="M2.8 10s2.6-4.4 7.2-4.4 7.2 4.4 7.2 4.4-2.6 4.4-7.2 4.4S2.8 10 2.8 10Z" />
      {open ? <circle cx="10" cy="10" r="2.1" fill="currentColor" stroke="none" /> : <circle cx="10" cy="10" r="2.1" />}
    </SvgIcon>
  )
}

function AccountLinkIcon() {
  return (
    <SvgIcon>
      <path d="M7 8.2h-1a3 3 0 1 0 0 6h1" />
      <path d="M13 8.2h1a3 3 0 0 1 0 6h-1" />
      <path d="M7.8 11.2h4.4" />
    </SvgIcon>
  )
}

function KeySettingIcon() {
  return (
    <SvgIcon>
      <circle cx="7.2" cy="10.2" r="2.4" />
      <path d="M9.3 10.2h6.2" />
      <path d="M13.2 10.2v1.8" />
      <path d="M15.5 10.2v1.3" />
    </SvgIcon>
  )
}

function MailSettingIcon() {
  return (
    <SvgIcon>
      <rect x="2.8" y="4.8" width="14.4" height="10.4" rx="1.6" />
      <path d="m3.4 6 6.6 4.8L16.6 6" />
    </SvgIcon>
  )
}

function ShieldSettingIcon() {
  return (
    <SvgIcon>
      <path d="M10 3.8 15.4 6v4.3c0 2.7-2 4.8-5.4 5.9-3.4-1.1-5.4-3.2-5.4-5.9V6z" />
    </SvgIcon>
  )
}

function LogoutSettingIcon() {
  return (
    <SvgIcon>
      <path d="M8.2 4.8H4.6a1.1 1.1 0 0 0-1.1 1.1v8.2a1.1 1.1 0 0 0 1.1 1.1h3.6" />
      <path d="M10 10h6.4" />
      <path d="m13.8 7.4 2.8 2.6-2.8 2.6" />
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

function ColumnResizeHandle({
  label,
  onMouseDown,
}: {
  label: string
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className="column-resize-handle"
      aria-label={label}
      title={label}
      onMouseDown={onMouseDown}
      onClick={(event) => event.preventDefault()}
    >
      <span aria-hidden="true" />
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

type ScheduleBadgeTone = 'success' | 'error' | 'running' | 'queued' | 'idle' | 'enabled' | 'disabled'

function ScheduleStatusIcon({ tone }: { tone: ScheduleBadgeTone }) {
  if (tone === 'success' || tone === 'enabled') {
    return (
      <SvgIcon>
        <path d="m5.1 10.2 2.3 2.3 5.1-5.1" />
      </SvgIcon>
    )
  }
  if (tone === 'error') {
    return (
      <SvgIcon>
        <path d="m6.2 6.2 7.6 7.6M13.8 6.2l-7.6 7.6" />
      </SvgIcon>
    )
  }
  if (tone === 'running') {
    return (
      <SvgIcon>
        <circle cx="10" cy="10" r="4.1" />
        <path d="M10 6.4v3.4l2.5 1.6" />
      </SvgIcon>
    )
  }
  if (tone === 'queued') {
    return (
      <SvgIcon>
        <circle cx="10" cy="10" r="4.1" />
        <path d="M10 7.2v2.6h2.2" />
      </SvgIcon>
    )
  }
  if (tone === 'disabled') {
    return (
      <SvgIcon>
        <path d="M4.5 10h11" />
      </SvgIcon>
    )
  }
  return (
    <SvgIcon>
      <circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none" />
    </SvgIcon>
  )
}

function getScheduleRunStatusMeta(status: string | null | undefined): { label: string; tone: ScheduleBadgeTone } {
  if (status === 'succeeded') return { label: getTaskStatusLabel(status), tone: 'success' }
  if (status === 'failed') return { label: getTaskStatusLabel(status), tone: 'error' }
  if (status === 'running') return { label: getTaskStatusLabel(status), tone: 'running' }
  if (status === 'queued') return { label: getTaskStatusLabel(status), tone: 'queued' }
  return { label: '未执行', tone: 'idle' }
}

function getScheduleEnabledMeta(isActive: boolean): { label: string; tone: ScheduleBadgeTone } {
  return isActive ? { label: '启用中', tone: 'enabled' } : { label: '已停用', tone: 'disabled' }
}

function getMaintenanceTriggerLabel(triggerType: string) {
  return triggerType === 'schedule' ? '定时任务' : '手动执行'
}

function getScheduleRunTriggerLabel(triggerType: string | null | undefined) {
  return triggerType === 'schedule' ? '定时' : '手动'
}

function getMaintenanceTaskType(log: MaintenanceRunLog): 'lottery_fetch' | 'prediction_generate' {
  if (log.task_type === 'prediction_generate') return 'prediction_generate'
  if (log.task_type === 'lottery_fetch') return 'lottery_fetch'
  if (log.mode || log.model_code) return 'prediction_generate'
  if ((log.processed_count || 0) > 0 || (log.skipped_count || 0) > 0 || (log.failed_count || 0) > 0) return 'prediction_generate'
  return 'lottery_fetch'
}

function getMaintenanceTaskTypeLabel(taskType: 'lottery_fetch' | 'prediction_generate') {
  return taskType === 'prediction_generate' ? '预测生成' : '开奖抓取'
}

function getScheduleTaskTypeLabel(taskType: ScheduleTaskType) {
  return taskType === 'lottery_fetch' ? '开奖抓取' : '预测生成'
}

function getScheduleModeLabel(scheduleMode: ScheduleMode, presetType?: SchedulePresetType | null) {
  if (scheduleMode === 'cron') return 'Cron'
  return presetType === 'weekly' ? '每周' : '每日'
}

function normalizePredictionPlayModeForLottery(lotteryCode: LotteryCode, predictionPlayMode: ModelPredictionPlayMode): ModelPredictionPlayMode {
  if (lotteryCode === 'pl3') {
    return predictionPlayMode === 'direct_sum' ? 'direct_sum' : 'direct'
  }
  if (lotteryCode === 'qxc') {
    return predictionPlayMode === 'compound' ? 'compound' : 'direct'
  }
  if (lotteryCode === 'dlt') {
    if (predictionPlayMode === 'dantuo') return 'dantuo'
    if (predictionPlayMode === 'compound') return 'compound'
    return 'direct'
  }
  return 'direct'
}

function getPredictionPlayModeLabel(predictionPlayMode: ModelPredictionPlayMode, lotteryCode: LotteryCode) {
  const normalizedMode = normalizePredictionPlayModeForLottery(lotteryCode, predictionPlayMode)
  if (lotteryCode === 'pl3') {
    return normalizedMode === 'direct_sum' ? '和值' : '直选'
  }
  if (lotteryCode === 'dlt') {
    if (normalizedMode === 'dantuo') return '胆拖'
    if (normalizedMode === 'compound') return '复式'
    return '普通'
  }
  if (lotteryCode === 'qxc') {
    return normalizedMode === 'compound' ? '复式' : '直选'
  }
  return '直选'
}

function getSchedulePredictionPlayModeLabel(task: Pick<ScheduleTask, 'task_type' | 'lottery_code' | 'prediction_play_mode'>) {
  if (task.task_type !== 'prediction_generate') return null
  return getPredictionPlayModeLabel(task.prediction_play_mode, task.lottery_code)
}

function getScheduleModelProviderLabel(model: SettingsModel, providers: SettingsProvider[]) {
  const provider = providers.find((item) => item.code === model.provider)
  return provider?.name || model.provider || '未配置 Provider'
}

function getGenerationModeLabel(mode: string | null | undefined) {
  return mode === 'history' ? '历史重算' : '当前期'
}

function getGenerationTaskTotal(task: PredictionGenerationTask | null) {
  if (!task) return 0
  if (typeof task.progress_summary.task_total_count === 'number') return task.progress_summary.task_total_count
  return task.progress_summary.selected_count ?? (
    task.progress_summary.processed_count +
    task.progress_summary.skipped_count +
    task.progress_summary.failed_count
  )
}

function getGenerationTaskCompleted(task: PredictionGenerationTask | null) {
  if (!task) return 0
  if (typeof task.progress_summary.task_completed_count === 'number') return task.progress_summary.task_completed_count
  return task.progress_summary.completed_count ?? (
    task.progress_summary.processed_count +
    task.progress_summary.skipped_count +
    task.progress_summary.failed_count
  )
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, hasPermission, logout } = useAuth()
  const { showToast } = useToast()
  const { motionPreference, setMotionPreference } = useMotion()
  const activeTab = getSettingsTabFromPath(location.pathname)
  const [modelManagementView, setModelManagementView] = useState<ModelManagementView>('list')
  const [modelSortOption, setModelSortOption] = useState<ModelSortOption>('updated_desc')
  const [modelStatusFilter, setModelStatusFilter] = useState<ModelStatusFilter>('all')
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [profileNickname, setProfileNickname] = useState(user?.nickname || '')
  const [isProfileNameEditing, setIsProfileNameEditing] = useState(false)
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM)
  const [isPasswordEditorOpen, setIsPasswordEditorOpen] = useState(false)
  const [modelForm, setModelForm] = useState<SettingsModelPayload>({ ...EMPTY_MODEL_FORM, lottery_codes: [DEFAULT_SETTINGS_LOTTERY] })
  const [modelConnectivityResult, setModelConnectivityResult] = useState<{ status: 'success' | 'error'; message: string; durationMs?: number } | null>(null)
  const [lmStudioDiscoveredModels, setLmStudioDiscoveredModels] = useState<SettingsProviderDiscoveredModel[]>([])
  const [selectedModelCode, setSelectedModelCode] = useState<string | null>(null)
  const [modelModalOpen, setModelModalOpen] = useState(false)
  const [modelMode, setModelMode] = useState<'create' | 'edit'>('create')
  const [providerModalOpen, setProviderModalOpen] = useState(false)
  const [providerMode, setProviderMode] = useState<'create' | 'edit'>('create')
  const [selectedProviderCode, setSelectedProviderCode] = useState<string | null>(null)
  const [providerForm, setProviderForm] = useState<SettingsProviderPayload>(EMPTY_PROVIDER_FORM)
  const [generationModalOpen, setGenerationModalOpen] = useState(false)
  const [generationForm, setGenerationForm] = useState(EMPTY_GENERATION_FORM)
  const [generationSourceModelCodes, setGenerationSourceModelCodes] = useState<string[]>([])
  const [generationFilterNotice, setGenerationFilterNotice] = useState<string | null>(null)
  const [generationTask, setGenerationTask] = useState<PredictionGenerationTask | null>(null)
  const [selectedModelCodes, setSelectedModelCodes] = useState<string[]>([])
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false)
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>(EMPTY_BULK_EDIT_FORM)
  const [lotteryFetchTasks, setLotteryFetchTasks] = useState<Record<LotteryCode, LotteryFetchTask | null>>({ dlt: null, pl3: null, pl5: null, qxc: null })
  const [lotteryFetchLimitInputs, setLotteryFetchLimitInputs] = useState<Record<LotteryCode, string>>(() => {
    const persisted = loadSettingsLotteryFetchLimits()
    return {
      dlt: String(normalizeFetchLimit(persisted.dlt)),
      pl3: String(normalizeFetchLimit(persisted.pl3)),
      pl5: String(normalizeFetchLimit(persisted.pl5)),
      qxc: String(normalizeFetchLimit(persisted.qxc)),
    }
  })
  const [maintenanceLogFilter, setMaintenanceLogFilter] = useState<MaintenanceLogFilter>('all')
  const [maintenanceLogOffset, setMaintenanceLogOffset] = useState(0)
  const [scheduleColumnWidths, setScheduleColumnWidths] = useState<Record<ScheduleColumnKey, number>>(() => (
    normalizeScheduleColumnWidths(loadSettingsTableColumnWidths('settings:schedules') as Partial<Record<ScheduleColumnKey, number>>)
  ))
  const [maintenanceColumnWidths, setMaintenanceColumnWidths] = useState<Record<MaintenanceColumnKey, number>>(() => ({
    ...MAINTENANCE_COLUMN_DEFAULT_WIDTHS,
    ...(loadSettingsTableColumnWidths('settings:maintenance') as Partial<Record<MaintenanceColumnKey, number>>),
  }))
  const [scheduleTaskFilter, setScheduleTaskFilter] = useState<ScheduleTaskFilter>('all')
  const [scheduleListView, setScheduleListView] = useState<ScheduleListView>('list')
  const beijingToday = useMemo(() => resolveTodayInBeijing(), [])
  const [scheduleCalendarMonth, setScheduleCalendarMonth] = useState<{ year: number; month: number }>(() => ({
    year: beijingToday.year,
    month: beijingToday.month,
  }))
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = useState<string>(beijingToday.dateKey)
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({ ...EMPTY_SCHEDULE_FORM, lottery_code: DEFAULT_SETTINGS_LOTTERY })
  const [selectedScheduleTaskCode, setSelectedScheduleTaskCode] = useState<string | null>(null)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [expandedScheduleTaskCode, setExpandedScheduleTaskCode] = useState<string | null>(null)
  const [newUserForm, setNewUserForm] = useState({ username: '', nickname: '', password: '', role: 'normal_user', is_active: true })
  const [resetPasswordMap, setResetPasswordMap] = useState<Record<number, string>>({})
  const [roleForm, setRoleForm] = useState<RolePayload>(EMPTY_ROLE_FORM)
  const [selectedRoleCode, setSelectedRoleCode] = useState<string | null>(null)
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [modelActionMenu, setModelActionMenu] = useState<string | null>(null)
  const [scheduleActionMenu, setScheduleActionMenu] = useState<string | null>(null)
  const [avatarCropModalOpen, setAvatarCropModalOpen] = useState(false)
  const [profileAvatarSourceFile, setProfileAvatarSourceFile] = useState<File | null>(null)
  const [profileAvatarSourceUrl, setProfileAvatarSourceUrl] = useState('')
  const [profileAvatarCrop, setProfileAvatarCrop] = useState({ x: 0, y: 0 })
  const [profileAvatarZoom, setProfileAvatarZoom] = useState(1)
  const [profileAvatarCroppedAreaPixels, setProfileAvatarCroppedAreaPixels] = useState<Area | null>(null)
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null)

  const canManageModels = hasPermission('model_management')
  const canManageSchedules = hasPermission('schedule_management')
  const canManageUsers = hasPermission('user_management')
  const canManageRoles = hasPermission('role_management')
  const isSuperAdmin = user?.role === 'super_admin'

  const modelsQuery = useQuery({
    queryKey: ['settings-models'],
    queryFn: () => apiClient.getSettingsModels(false),
    enabled: canManageModels || canManageSchedules,
  })
  const providersQuery = useQuery({
    queryKey: ['settings-providers'],
    queryFn: () => apiClient.getSettingsProviders(),
    enabled: canManageModels,
  })
  const scheduleTasksQuery = useQuery({
    queryKey: ['settings-schedules'],
    queryFn: () => apiClient.listScheduleTasks(),
    enabled: canManageSchedules,
  })
  const maintenanceLogsQuery = useQuery({
    queryKey: ['settings-maintenance-logs', maintenanceLogFilter, maintenanceLogOffset],
    queryFn: () => apiClient.listMaintenanceRunLogs({
      lottery_code: maintenanceLogFilter === 'all' ? undefined : maintenanceLogFilter,
      limit: 20,
      offset: maintenanceLogOffset,
    }),
    enabled: isSuperAdmin,
  })
  const scheduleLogQueryStartDate = useMemo(
    () => `${scheduleCalendarMonth.year.toString().padStart(4, '0')}-${scheduleCalendarMonth.month.toString().padStart(2, '0')}-01`,
    [scheduleCalendarMonth.month, scheduleCalendarMonth.year],
  )
  const scheduleLogQueryEndDate = useMemo(() => {
    const endDate = new Date(Date.UTC(scheduleCalendarMonth.year, scheduleCalendarMonth.month, 0))
    return `${endDate.getUTCFullYear().toString().padStart(4, '0')}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`
  }, [scheduleCalendarMonth.month, scheduleCalendarMonth.year])
  const scheduleTaskCodesForLogs = useMemo(
    () =>
      (scheduleTasksQuery.data?.tasks ?? [])
        .filter((task) => scheduleTaskFilter === 'all' || task.task_type === scheduleTaskFilter)
        .map((task) => task.task_code),
    [scheduleTaskFilter, scheduleTasksQuery.data?.tasks],
  )
  const scheduleRunLogsQuery = useQuery({
    queryKey: ['settings-schedules-logs', scheduleLogQueryStartDate, scheduleLogQueryEndDate, scheduleTaskCodesForLogs.join('|')],
    queryFn: () => apiClient.listScheduleRunLogs({
      start_date: scheduleLogQueryStartDate,
      end_date: scheduleLogQueryEndDate,
      task_codes: scheduleTaskCodesForLogs,
      limit: 5000,
    }),
    enabled: canManageSchedules && scheduleTaskCodesForLogs.length > 0,
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
    const tabs: Array<{ id: SettingsTab; label: string }> = [
      { id: 'profile', label: '个人资料' },
      { id: 'account', label: '账户管理' },
    ]
    if (canManageModels) tabs.push({ id: 'models', label: '模型管理' })
    if (isSuperAdmin) tabs.push({ id: 'maintenance', label: '数据维护' })
    if (canManageSchedules) tabs.push({ id: 'schedules', label: '定时任务' })
    if (canManageUsers) tabs.push({ id: 'users', label: '用户管理' })
    if (canManageRoles) tabs.push({ id: 'roles', label: '角色管理' })
    return tabs
  }, [canManageModels, canManageRoles, canManageSchedules, canManageUsers, isSuperAdmin])

  const displayEmail = useMemo(() => {
    const candidate = [user?.email, user?.username].find((item) => typeof item === 'string' && item.includes('@'))
    return candidate || '暂未设置邮箱'
  }, [user?.email, user?.username])

  const displayCreatedAt = user?.created_at ? formatDateTimeBeijing(user.created_at) : '-'

  useEffect(() => {
    if (!availableTabs.some((item) => item.id === activeTab)) {
      navigate(SETTINGS_TAB_PATHS[availableTabs[0]?.id || 'profile'], { replace: true })
    }
  }, [activeTab, availableTabs, navigate])

  useEffect(() => {
    setProfileNickname(user?.nickname || '')
    setIsProfileNameEditing(false)
  }, [user?.nickname])

  useEffect(() => {
    if (!message) return
    showToast(message, messageType)
    setMessage(null)
  }, [message, messageType, showToast])

  useEffect(
    () => () => {
      if (profileAvatarSourceUrl) {
        URL.revokeObjectURL(profileAvatarSourceUrl)
      }
    },
    [profileAvatarSourceUrl],
  )

  useEffect(() => {
    setMaintenanceLogOffset(0)
  }, [maintenanceLogFilter])

  useEffect(() => {
    const providerList = providersQuery.data?.providers ?? EMPTY_PROVIDERS
    if (!providerList.length) return
    setModelForm((previous) => {
      if (previous.provider) return previous
      const deepseekProvider = providerList.find((provider) => provider.code === 'deepseek')
      const lmStudioProvider = providerList.find((provider) => provider.code === LMSTUDIO_PROVIDER_CODE)
      const aiMixHubProvider = providerList.find((provider) => provider.code === 'aimixhub')
      const customProvider = providerList.find((provider) => !provider.is_system_preset && provider.code !== 'deepseek' && provider.code !== 'aimixhub' && provider.code !== LMSTUDIO_PROVIDER_CODE)
      const firstProvider = customProvider || lmStudioProvider || deepseekProvider || aiMixHubProvider || providerList[0]
      return {
        ...previous,
        provider: firstProvider.code,
        api_format: firstProvider.api_format,
        base_url: firstProvider.code === LMSTUDIO_PROVIDER_CODE ? (firstProvider.base_url || LMSTUDIO_DEFAULT_BASE_URL) : (firstProvider.base_url || ''),
      }
    })
    setBulkEditForm((previous) => (previous.provider ? previous : { ...previous, provider: providerList[0].code }))
  }, [providersQuery.data?.providers])

  useEffect(() => {
    saveSettingsTableColumnWidths('settings:schedules', scheduleColumnWidths)
  }, [scheduleColumnWidths])

  useEffect(() => {
    saveSettingsTableColumnWidths('settings:maintenance', maintenanceColumnWidths)
  }, [maintenanceColumnWidths])

  useEffect(() => {
    saveSettingsLotteryFetchLimits({
      dlt: normalizeFetchLimit(lotteryFetchLimitInputs.dlt),
      pl3: normalizeFetchLimit(lotteryFetchLimitInputs.pl3),
      pl5: normalizeFetchLimit(lotteryFetchLimitInputs.pl5),
      qxc: normalizeFetchLimit(lotteryFetchLimitInputs.qxc),
    })
  }, [lotteryFetchLimitInputs])

  useEffect(() => {
    if (!toolbarMenuOpen && !sortMenuOpen && !modelActionMenu && !scheduleActionMenu) return undefined
    const closeMenus = () => {
      setToolbarMenuOpen(false)
      setSortMenuOpen(false)
      setModelActionMenu(null)
      setScheduleActionMenu(null)
    }
    window.addEventListener('click', closeMenus)
    return () => window.removeEventListener('click', closeMenus)
  }, [modelActionMenu, scheduleActionMenu, sortMenuOpen, toolbarMenuOpen])

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
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        } else if (task.status === 'failed') {
          setMessage(task.error_message || '预测任务执行失败')
          setMessageType('error')
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '读取任务状态失败')
        setMessageType('error')
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [generationTask, queryClient])

  useEffect(() => {
    const task = lotteryFetchTasks.dlt
    if (!task || !['queued', 'running'].includes(task.status)) return undefined
    const timer = window.setTimeout(async () => {
      try {
        const nextTask = await apiClient.getLotteryFetchTaskDetail(task.task_id)
        setLotteryFetchTasks((previous) => ({ ...previous, dlt: nextTask }))
        if (nextTask.status === 'succeeded') {
          const summary = nextTask.progress_summary
          setMessage(`大乐透数据更新完成：抓取 ${summary.fetched_count} 条，写入 ${summary.saved_count} 条。`)
          setMessageType('success')
          void queryClient.invalidateQueries({ queryKey: ['lottery-history', 'dlt'] })
          void queryClient.invalidateQueries({ queryKey: ['current-predictions', 'dlt'] })
          void queryClient.invalidateQueries({ queryKey: ['predictions-history', 'dlt'] })
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        } else if (nextTask.status === 'failed') {
          setMessage(nextTask.error_message || '大乐透数据更新失败')
          setMessageType('error')
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '读取大乐透抓取任务状态失败')
        setMessageType('error')
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [lotteryFetchTasks.dlt, queryClient])

  useEffect(() => {
    const task = lotteryFetchTasks.pl3
    if (!task || !['queued', 'running'].includes(task.status)) return undefined
    const timer = window.setTimeout(async () => {
      try {
        const nextTask = await apiClient.getLotteryFetchTaskDetail(task.task_id)
        setLotteryFetchTasks((previous) => ({ ...previous, pl3: nextTask }))
        if (nextTask.status === 'succeeded') {
          const summary = nextTask.progress_summary
          setMessage(`排列3数据更新完成：抓取 ${summary.fetched_count} 条，写入 ${summary.saved_count} 条。`)
          setMessageType('success')
          void queryClient.invalidateQueries({ queryKey: ['lottery-history', 'pl3'] })
          void queryClient.invalidateQueries({ queryKey: ['current-predictions', 'pl3'] })
          void queryClient.invalidateQueries({ queryKey: ['predictions-history', 'pl3'] })
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        } else if (nextTask.status === 'failed') {
          setMessage(nextTask.error_message || '排列3数据更新失败')
          setMessageType('error')
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '读取排列3抓取任务状态失败')
        setMessageType('error')
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [lotteryFetchTasks.pl3, queryClient])

  useEffect(() => {
    const task = lotteryFetchTasks.pl5
    if (!task || !['queued', 'running'].includes(task.status)) return undefined
    const timer = window.setTimeout(async () => {
      try {
        const nextTask = await apiClient.getLotteryFetchTaskDetail(task.task_id)
        setLotteryFetchTasks((previous) => ({ ...previous, pl5: nextTask }))
        if (nextTask.status === 'succeeded') {
          const summary = nextTask.progress_summary
          setMessage(`排列5数据更新完成：抓取 ${summary.fetched_count} 条，写入 ${summary.saved_count} 条。`)
          setMessageType('success')
          void queryClient.invalidateQueries({ queryKey: ['lottery-history', 'pl5'] })
          void queryClient.invalidateQueries({ queryKey: ['current-predictions', 'pl5'] })
          void queryClient.invalidateQueries({ queryKey: ['predictions-history', 'pl5'] })
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        } else if (nextTask.status === 'failed') {
          setMessage(nextTask.error_message || '排列5数据更新失败')
          setMessageType('error')
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '读取排列5抓取任务状态失败')
        setMessageType('error')
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [lotteryFetchTasks.pl5, queryClient])

  useEffect(() => {
    const task = lotteryFetchTasks.qxc
    if (!task || !['queued', 'running'].includes(task.status)) return undefined
    const timer = window.setTimeout(async () => {
      try {
        const nextTask = await apiClient.getLotteryFetchTaskDetail(task.task_id)
        setLotteryFetchTasks((previous) => ({ ...previous, qxc: nextTask }))
        if (nextTask.status === 'succeeded') {
          const summary = nextTask.progress_summary
          setMessage(`七星彩数据更新完成：抓取 ${summary.fetched_count} 条，写入 ${summary.saved_count} 条。`)
          setMessageType('success')
          void queryClient.invalidateQueries({ queryKey: ['lottery-history', 'qxc'] })
          void queryClient.invalidateQueries({ queryKey: ['current-predictions', 'qxc'] })
          void queryClient.invalidateQueries({ queryKey: ['predictions-history', 'qxc'] })
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        } else if (nextTask.status === 'failed') {
          setMessage(nextTask.error_message || '七星彩数据更新失败')
          setMessageType('error')
          void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : '读取七星彩抓取任务状态失败')
        setMessageType('error')
      }
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [lotteryFetchTasks.qxc, queryClient])

  const models = modelsQuery.data?.models ?? EMPTY_MODELS
  const providers = providersQuery.data?.providers ?? EMPTY_PROVIDERS
  const createModeProviders = useMemo(() => {
    const deepseekProvider = providers.find((provider) => provider.code === 'deepseek')
    const lmStudioProvider = providers.find((provider) => provider.code === LMSTUDIO_PROVIDER_CODE)
    const aiMixHubProvider = providers.find((provider) => provider.code === 'aimixhub')
    const customProvider = providers.find((provider) => !provider.is_system_preset && provider.code !== 'deepseek' && provider.code !== 'aimixhub' && provider.code !== LMSTUDIO_PROVIDER_CODE)
    const result: Array<SettingsProvider & { display_name: string }> = []
    if (customProvider) result.push({ ...customProvider, display_name: '自定义供应商' })
    if (lmStudioProvider) result.push({ ...lmStudioProvider, display_name: 'LM Studio' })
    if (deepseekProvider) result.push({ ...deepseekProvider, display_name: 'DeepSeek' })
    if (aiMixHubProvider) result.push({ ...aiMixHubProvider, display_name: 'AiMixHub' })
    return result
  }, [providers])
  const modelFormProviders = createModeProviders.length
    ? createModeProviders
    : providers.map((provider) => ({ ...provider, display_name: provider.name }))
  const providerMap = useMemo(() => Object.fromEntries(providers.map((provider) => [provider.code, provider])), [providers])
  const selectedProvider = providerMap[modelForm.provider]
  const isLmStudioProvider = modelForm.provider === LMSTUDIO_PROVIDER_CODE
  const selectedProviderModelConfigs = selectedProvider?.model_configs ?? []
  const shouldShowModelAppCode = modelForm.provider === 'aimixhub'
  const users = usersQuery.data?.users ?? EMPTY_USERS
  const roles = rolesQuery.data?.roles ?? EMPTY_ROLES
  const permissions = permissionsQuery.data?.permissions ?? EMPTY_PERMISSIONS
  const scheduleTasks = scheduleTasksQuery.data?.tasks ?? []
  const maintenanceLogs = maintenanceLogsQuery.data?.logs ?? []
  const maintenanceLogTotal = maintenanceLogsQuery.data?.total_count ?? 0
  const maintenanceLogPageSize = 20
  const maintenanceCanPrevPage = maintenanceLogOffset > 0
  const maintenanceCanNextPage = maintenanceLogOffset + maintenanceLogs.length < maintenanceLogTotal
  const selectedRole = roles.find((role) => role.role_code === selectedRoleCode) || null
  const selectedScheduleTask = scheduleTasks.find((task) => task.task_code === selectedScheduleTaskCode) || null
  const permissionMap = useMemo(
    () => Object.fromEntries(permissions.map((permission) => [permission.permission_code, permission])),
    [permissions],
  )
  const filteredScheduleTasks = useMemo(
    () => scheduleTasks.filter((task) => scheduleTaskFilter === 'all' || task.task_type === scheduleTaskFilter),
    [scheduleTaskFilter, scheduleTasks],
  )
  const scheduleCalendarMonthData = useMemo(
    () => buildScheduleCalendarMonth(filteredScheduleTasks, scheduleCalendarMonth.year, scheduleCalendarMonth.month),
    [filteredScheduleTasks, scheduleCalendarMonth.month, scheduleCalendarMonth.year],
  )
  const selectedCalendarDayEntries = useMemo(
    () => scheduleCalendarMonthData.dayEntries[selectedCalendarDateKey] || [],
    [scheduleCalendarMonthData.dayEntries, selectedCalendarDateKey],
  )
  const selectedCalendarDateLabel = useMemo(() => {
    const [year, month, day] = selectedCalendarDateKey.split('-')
    if (!year || !month || !day) return selectedCalendarDateKey
    return `${year}年${month}月${day}日`
  }, [selectedCalendarDateKey])
  const scheduleRunLogTimelineByDateAndTask = useMemo(() => {
    const logs = scheduleRunLogsQuery.data?.logs ?? []
    const byDate = new Map<string, Map<string, MaintenanceRunLog[]>>()
    for (const item of logs) {
      const taskCode = item.schedule_task_code || null
      if (!taskCode) continue
      const dateKey = formatBeijingDateKey(item.started_at || item.created_at)
      if (!dateKey) continue
      const byTask = byDate.get(dateKey) || new Map<string, MaintenanceRunLog[]>()
      const taskLogs = byTask.get(taskCode) || []
      taskLogs.push(item)
      byTask.set(taskCode, taskLogs)
      byDate.set(dateKey, byTask)
    }
    for (const byTask of byDate.values()) {
      for (const [taskCode, taskLogs] of byTask.entries()) {
        taskLogs.sort((left, right) => {
          const leftTime = left.finished_at || left.started_at || left.created_at || 0
          const rightTime = right.finished_at || right.started_at || right.created_at || 0
          return rightTime - leftTime
        })
        byTask.set(taskCode, taskLogs)
      }
    }
    return byDate
  }, [scheduleRunLogsQuery.data?.logs])
  const selectedCalendarDayRunTimelineMap = useMemo(
    () => scheduleRunLogTimelineByDateAndTask.get(selectedCalendarDateKey) || new Map<string, MaintenanceRunLog[]>(),
    [scheduleRunLogTimelineByDateAndTask, selectedCalendarDateKey],
  )
  useEffect(() => {
    const keys = scheduleCalendarMonthData.cells.filter((item) => item.inCurrentMonth).map((item) => item.dateKey)
    if (!keys.length) return
    if (keys.includes(selectedCalendarDateKey)) return
    setSelectedCalendarDateKey(keys[0])
  }, [scheduleCalendarMonthData.cells, selectedCalendarDateKey])
  const selectedLotteryModels = useMemo(
    () => models.filter((model) => (
      model.is_active &&
      !model.is_deleted &&
      (model.lottery_codes || [DEFAULT_SETTINGS_LOTTERY]).includes(scheduleForm.lottery_code)
    )),
    [models, scheduleForm.lottery_code],
  )
  const sortedModels = useMemo(() => {
    const items = [...models]
    items.sort((left, right) => {
      if (modelSortOption === 'updated_desc') {
        return (right.updated_at || 0) - (left.updated_at || 0)
      }
      if (modelSortOption === 'updated_asc') {
        return (left.updated_at || 0) - (right.updated_at || 0)
      }
      if (modelSortOption === 'name_asc') {
        return left.display_name.localeCompare(right.display_name)
      }
      return right.display_name.localeCompare(left.display_name)
    })
    return items
  }, [modelSortOption, models])
  const visibleModels = useMemo(
    () =>
      sortedModels.filter((model) => {
        if (modelStatusFilter === 'active') return model.is_active && !model.is_deleted
        if (modelStatusFilter === 'inactive') return !model.is_active && !model.is_deleted
        return true
      }),
    [modelStatusFilter, sortedModels],
  )
  const selectedVisibleCount = visibleModels.filter((model) => selectedModelCodes.includes(model.model_code)).length
  const allVisibleModelsSelected = visibleModels.length > 0 && selectedVisibleCount === visibleModels.length
  const selectedRoleProtectionHint = getRoleProtectionHint(selectedRole)
  const currentSortMeta = MODEL_SORT_META[modelSortOption]
  const modelNameMap = useMemo(
    () => Object.fromEntries(models.map((model) => [model.model_code, model.display_name])),
    [models],
  )
  const modelLotteryCodeMap = useMemo(
    () =>
      Object.fromEntries(
        models.map((model) => [model.model_code, model.lottery_codes?.length ? model.lottery_codes : [DEFAULT_SETTINGS_LOTTERY]]),
      ),
    [models],
  )
  const isBulkGenerationTask = generationTask?.model_code === '__bulk__'
  const hasTaskGranularity = Boolean((generationTask?.progress_summary.task_total_count || 0) > 0)
  const generationTaskTotal = getGenerationTaskTotal(generationTask)
  const generationTaskCompleted = getGenerationTaskCompleted(generationTask)
  const generationProgressPercent = generationTaskTotal > 0 ? Math.min(100, Math.round((generationTaskCompleted / generationTaskTotal) * 100)) : 0
  const generationTaskParallelism = generationTask?.progress_summary.parallelism
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
      const next = previous.filter((code) => visibleModels.some((model) => model.model_code === code))
      return next.length === previous.length && next.every((code, index) => code === previous[index]) ? previous : next
    })
  }, [visibleModels])

  const profileMutation = useMutation({
    mutationFn: () => apiClient.updateProfile({ nickname: profileNickname.trim() }),
    onSuccess: (response) => {
      queryClient.setQueryData(['auth', 'me'], response.user)
      setMessage('基础信息已更新。')
      setMessageType('success')
      setIsProfileNameEditing(false)
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '保存失败')
      setMessageType('error')
    },
  })
  const profileAvatarMutation = useMutation({
    mutationFn: (file: File) => apiClient.uploadProfileAvatar(file),
    onSuccess: (response) => {
      queryClient.setQueryData(['auth', 'me'], response.user)
      setMessage('头像已更新。')
      setMessageType('success')
      closeProfileAvatarCropModal()
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '头像上传失败')
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
  const testModelConnectivityMutation = useMutation({
    mutationFn: (payload: {
      provider: string
      api_format?: string
      api_model_name: string
      base_url: string
      api_key: string
      app_code: string
      temperature: number
    }) =>
      apiClient.testSettingsModelConnectivity(payload),
    onSuccess: (result) => {
      setModelConnectivityResult({
        status: result.ok ? 'success' : 'error',
        message: result.message || (result.ok ? '连通性测试通过' : '连通性测试失败'),
        durationMs: result.duration_ms,
      })
    },
    onError: (error) => {
      setModelConnectivityResult({
        status: 'error',
        message: error instanceof Error ? error.message : '连通性测试失败',
      })
    },
  })
  const discoverLmStudioModelsMutation = useMutation({
    mutationFn: () => apiClient.discoverSettingsProviderModels({
      provider: modelForm.provider.trim(),
      base_url: modelForm.base_url.trim(),
      api_key: modelForm.api_key.trim(),
    }),
    onSuccess: (result) => {
      setLmStudioDiscoveredModels(result.models || [])
      setMessage(`已从 LM Studio 拉取 ${result.models.length} 个模型`)
      setMessageType('success')
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '拉取 LM Studio 模型失败')
      setMessageType('error')
    },
  })

  const saveProviderMutation = useMutation({
    mutationFn: (payload: SettingsProviderPayload) =>
      providerMode === 'create'
        ? apiClient.createSettingsProvider(payload)
        : apiClient.updateSettingsProvider(selectedProviderCode || '', payload),
    onSuccess: () => {
      setMessage(providerMode === 'create' ? '供应商已创建。' : '供应商已更新。')
      setMessageType('success')
      setProviderModalOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['settings-providers'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '供应商保存失败')
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

  const generatePredictionMutation = useMutation({
    mutationFn: () => {
      const parallelism = Number(generationForm.parallelism.trim())
      const historyRangePayload =
        generationForm.mode === 'history'
          ? generationForm.historyRangeMode === 'recent'
            ? { recent_period_count: Number(generationForm.recentPeriodCount.trim()) as 1 | 5 | 10 | 20 }
            : {
                start_period: generationForm.startPeriod.trim(),
                end_period: generationForm.endPeriod.trim(),
              }
          : {}
      return generationForm.modelCodes.length > 1
        ? apiClient.bulkGenerateSettingsModelPredictions({
            lottery_code: generationForm.lotteryCode,
            model_codes: generationForm.modelCodes,
            mode: generationForm.mode,
            prediction_play_mode: normalizePredictionPlayModeForLottery(generationForm.lotteryCode, generationForm.predictionPlayMode),
            overwrite: generationForm.overwrite,
            parallelism,
            ...historyRangePayload,
          })
        : apiClient.generateSettingsModelPredictions({
            lottery_code: generationForm.lotteryCode,
            model_code: generationForm.modelCodes[0] || '',
            mode: generationForm.mode,
            prediction_play_mode: normalizePredictionPlayModeForLottery(generationForm.lotteryCode, generationForm.predictionPlayMode),
            overwrite: generationForm.overwrite,
            parallelism,
            ...historyRangePayload,
          })
    },
    onSuccess: (task) => {
      setGenerationTask(task)
      setGenerationModalOpen(true)
      setSelectedModelCodes([])
      setMessage(generationForm.modelCodes.length > 1 ? '批量预测任务已创建，正在后台执行。' : '预测生成任务已创建，正在后台执行。')
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
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
      void queryClient.invalidateQueries({ queryKey: ['settings-models'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '批量模型操作失败')
      setMessageType('error')
    },
  })

  const fetchDltLotteryMutation = useMutation({
    mutationFn: (limit: number) => apiClient.fetchSettingsLotteryHistory('dlt', limit),
    onSuccess: (task, limit) => {
      setLotteryFetchTasks((previous) => ({ ...previous, dlt: task }))
      setMessage(`大乐透近 ${limit} 期数据更新任务已创建，正在后台执行。`)
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '创建大乐透数据更新任务失败')
      setMessageType('error')
    },
  })

  const fetchPl3LotteryMutation = useMutation({
    mutationFn: (limit: number) => apiClient.fetchSettingsLotteryHistory('pl3', limit),
    onSuccess: (task, limit) => {
      setLotteryFetchTasks((previous) => ({ ...previous, pl3: task }))
      setMessage(`排列3近 ${limit} 期数据更新任务已创建，正在后台执行。`)
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '创建排列3数据更新任务失败')
      setMessageType('error')
    },
  })

  const fetchPl5LotteryMutation = useMutation({
    mutationFn: (limit: number) => apiClient.fetchSettingsLotteryHistory('pl5', limit),
    onSuccess: (task, limit) => {
      setLotteryFetchTasks((previous) => ({ ...previous, pl5: task }))
      setMessage(`排列5近 ${limit} 期数据更新任务已创建，正在后台执行。`)
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '创建排列5数据更新任务失败')
      setMessageType('error')
    },
  })

  const fetchQxcLotteryMutation = useMutation({
    mutationFn: (limit: number) => apiClient.fetchSettingsLotteryHistory('qxc', limit),
    onSuccess: (task, limit) => {
      setLotteryFetchTasks((previous) => ({ ...previous, qxc: task }))
      setMessage(`七星彩近 ${limit} 期数据更新任务已创建，正在后台执行。`)
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-maintenance-logs'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '创建七星彩数据更新任务失败')
      setMessageType('error')
    },
  })

  const saveScheduleTaskMutation = useMutation({
    mutationFn: (payload: ScheduleForm) =>
      selectedScheduleTaskCode
        ? apiClient.updateScheduleTask(selectedScheduleTaskCode, payload)
        : apiClient.createScheduleTask(payload),
    onSuccess: () => {
      setMessage(selectedScheduleTaskCode ? '定时任务已更新。' : '定时任务已创建。')
      setMessageType('success')
      closeScheduleModal()
      void queryClient.invalidateQueries({ queryKey: ['settings-schedules'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '保存定时任务失败')
      setMessageType('error')
    },
  })

  const scheduleTaskActionMutation = useMutation({
    mutationFn: async (action: { type: 'toggle' | 'delete' | 'run'; task: ScheduleTask }) => {
      if (action.type === 'toggle') return apiClient.toggleScheduleTask(action.task.task_code, !action.task.is_active)
      if (action.type === 'run') return apiClient.runScheduleTaskNow(action.task.task_code)
      await apiClient.deleteScheduleTask(action.task.task_code)
      return null
    },
    onSuccess: (_, variables) => {
      if (variables.type === 'delete') {
        setMessage('定时任务已删除。')
        if (selectedScheduleTaskCode === variables.task.task_code) {
          setSelectedScheduleTaskCode(null)
          setScheduleForm({ ...EMPTY_SCHEDULE_FORM, lottery_code: DEFAULT_SETTINGS_LOTTERY })
        }
      } else if (variables.type === 'toggle') {
        setMessage(`定时任务已${variables.task.is_active ? '停用' : '启用'}。`)
      } else {
        setMessage('定时任务已立即执行。')
      }
      setMessageType('success')
      void queryClient.invalidateQueries({ queryKey: ['settings-schedules'] })
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : '定时任务操作失败')
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
    const defaultProvider = createModeProviders[0] || providers[0]
    setLmStudioDiscoveredModels([])
    setModelForm({
      ...EMPTY_MODEL_FORM,
      provider: defaultProvider?.code || '',
      api_format: defaultProvider?.api_format || 'openai_compatible',
      base_url: defaultProvider?.code === LMSTUDIO_PROVIDER_CODE ? (defaultProvider?.base_url || LMSTUDIO_DEFAULT_BASE_URL) : (defaultProvider?.base_url || ''),
      temperature: 0.3,
      lottery_codes: [DEFAULT_SETTINGS_LOTTERY],
    })
    setModelConnectivityResult(null)
    setModelModalOpen(true)
  }

  function applyProviderPreset(preset: 'custom' | 'deepseek' | 'aimixhub') {
    if (preset === 'custom') {
      setProviderForm({
        ...EMPTY_PROVIDER_FORM,
        code: '',
        name: '',
        api_format: 'openai_compatible',
      })
      return
    }
    if (preset === 'deepseek') {
      setProviderForm({
        ...EMPTY_PROVIDER_FORM,
        code: 'deepseek',
        name: 'DeepSeek',
        website_url: 'https://platform.deepseek.com',
        api_format: 'openai_compatible',
        base_url: 'https://api.deepseek.com/v1',
        model_configs: [
          { model_id: 'deepseek-chat', display_name: 'DeepSeek V3.2' },
          { model_id: 'deepseek-reasoner', display_name: 'DeepSeek R1' },
        ],
      })
      return
    }
    setProviderForm({
      ...EMPTY_PROVIDER_FORM,
      code: 'aimixhub',
      name: 'AiMixHub',
      website_url: 'https://aihubmix.com',
      api_format: 'anthropic',
      base_url: 'https://aihubmix.com/v1',
      model_configs: [
        { model_id: 'claude-sonnet-4-6', display_name: 'Claude Sonnet 4.6' },
        { model_id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6' },
      ],
    })
  }

  function openCreateProvider() {
    setProviderMode('create')
    setSelectedProviderCode(null)
    applyProviderPreset('custom')
    setProviderModalOpen(true)
  }

  function openEditProvider(provider: SettingsProvider) {
    setProviderMode('edit')
    setSelectedProviderCode(provider.code)
    setProviderForm({
      code: provider.code,
      name: provider.name,
      api_format: provider.api_format || 'openai_compatible',
      remark: provider.remark || '',
      website_url: provider.website_url || '',
      api_key: provider.api_key || '',
      base_url: provider.base_url || '',
      extra_options: provider.extra_options || {},
      model_configs: (provider.model_configs || []).map((model) => ({ id: model.id, model_id: model.model_id, display_name: model.display_name })),
    })
    setProviderModalOpen(true)
  }

  function addProviderModelConfig() {
    setProviderForm((previous) => ({
      ...previous,
      model_configs: [...previous.model_configs, { model_id: '', display_name: '' }],
    }))
  }

  function removeProviderModelConfig(index: number) {
    setProviderForm((previous) => ({
      ...previous,
      model_configs: previous.model_configs.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  function submitProviderForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload: SettingsProviderPayload = {
      ...providerForm,
      code: providerForm.code?.trim(),
      name: providerForm.name.trim(),
      remark: providerForm.remark.trim(),
      website_url: providerForm.website_url.trim(),
      api_key: providerForm.api_key.trim(),
      base_url: providerForm.base_url.trim(),
      model_configs: providerForm.model_configs
        .map((model) => ({
          id: model.id,
          model_id: model.model_id.trim(),
          display_name: model.display_name.trim(),
        }))
        .filter((model) => model.model_id),
    }
    saveProviderMutation.mutate(payload)
  }

  function openGenerateModel(modelCode: string, displayName: string) {
    const sourceModelCodes = [modelCode]
    const nextLottery = DEFAULT_SETTINGS_LOTTERY
    const nextModelCodes = sourceModelCodes.filter((code) => (modelLotteryCodeMap[code] || [DEFAULT_SETTINGS_LOTTERY]).includes(nextLottery))
    setGenerationTask(null)
    setGenerationSourceModelCodes(sourceModelCodes)
    setGenerationFilterNotice(sourceModelCodes.length > nextModelCodes.length ? `已移除 ${sourceModelCodes.length - nextModelCodes.length} 个不支持${getLotteryLabel(nextLottery)}的模型。` : null)
    setGenerationForm({
      lotteryCode: nextLottery,
      modelCodes: nextModelCodes,
      displayName,
      mode: 'current',
      predictionPlayMode: 'direct',
      historyRangeMode: 'custom',
      recentPeriodCount: '5',
      overwrite: false,
      parallelism: '3',
      startPeriod: '',
      endPeriod: '',
    })
    setGenerationModalOpen(true)
  }

  function openBulkGenerateModels() {
    const sourceModelCodes = selectedModelCodes
    const nextLottery = DEFAULT_SETTINGS_LOTTERY
    const nextModelCodes = sourceModelCodes.filter((code) => (modelLotteryCodeMap[code] || [DEFAULT_SETTINGS_LOTTERY]).includes(nextLottery))
    setGenerationTask(null)
    setGenerationSourceModelCodes(sourceModelCodes)
    setGenerationFilterNotice(sourceModelCodes.length > nextModelCodes.length ? `已移除 ${sourceModelCodes.length - nextModelCodes.length} 个不支持${getLotteryLabel(nextLottery)}的模型。` : null)
    setGenerationForm({
      lotteryCode: nextLottery,
      modelCodes: nextModelCodes,
      displayName: `已选 ${selectedModelCodes.length} 个模型`,
      mode: 'current',
      predictionPlayMode: 'direct',
      historyRangeMode: 'custom',
      recentPeriodCount: '5',
      overwrite: false,
      parallelism: '3',
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
    setSelectedModelCodes(checked ? visibleModels.map((model) => model.model_code) : [])
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
    setScheduleActionMenu(null)
    setToolbarMenuOpen((previous) => !previous)
  }

  function toggleSortMenu(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setToolbarMenuOpen(false)
    setModelActionMenu(null)
    setScheduleActionMenu(null)
    setSortMenuOpen((previous) => !previous)
  }

  function toggleModelMenu(menuId: string, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setToolbarMenuOpen(false)
    setSortMenuOpen(false)
    setScheduleActionMenu(null)
    setModelActionMenu((previous) => (previous === menuId ? null : menuId))
  }

  function toggleScheduleMenu(menuId: string, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    setToolbarMenuOpen(false)
    setSortMenuOpen(false)
    setModelActionMenu(null)
    setScheduleActionMenu((previous) => (previous === menuId ? null : menuId))
  }

  function selectSortOption(option: ModelSortOption) {
    setModelSortOption(option)
    setSortMenuOpen(false)
  }

  async function openEditModel(modelCode: string) {
    const model = await apiClient.getSettingsModel(modelCode)
    setModelMode('edit')
    setSelectedModelCode(modelCode)
    setLmStudioDiscoveredModels(model.provider === LMSTUDIO_PROVIDER_CODE ? [{
      model_id: model.api_model_name,
      display_name: model.provider_model_name || model.api_model_name,
    }] : [])
    setModelForm({
      model_code: model.model_code,
      display_name: model.display_name,
      provider: model.provider,
      provider_model_id: model.provider_model_id ?? null,
      provider_model_name: model.provider_model_name || '',
      api_format: model.api_format || providerMap[model.provider]?.api_format || 'openai_compatible',
      api_model_name: model.api_model_name,
      base_url: model.base_url,
      api_key: model.api_key,
      app_code: model.app_code,
      temperature: model.temperature ?? 0.3,
      is_active: model.is_active,
      lottery_codes: model.lottery_codes,
    })
    setModelConnectivityResult(null)
    setModelModalOpen(true)
  }

  function closeModelModal() {
    setModelModalOpen(false)
    setModelConnectivityResult(null)
    setLmStudioDiscoveredModels([])
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
    const modelCode = modelForm.model_code?.trim()
    const autoModelCode = `${modelForm.provider}-${modelForm.api_model_name || modelForm.provider_model_name || ''}`
      .toLowerCase()
      .replace(/[^a-z0-9-_.]+/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '')
    saveModelMutation.mutate({
      ...modelForm,
      model_code: modelCode || autoModelCode,
      display_name: modelForm.display_name.trim(),
      provider: modelForm.provider.trim(),
      provider_model_name: modelForm.provider_model_name?.trim(),
      api_model_name: modelForm.api_model_name.trim(),
      base_url: modelForm.base_url.trim(),
      api_key: modelForm.api_key.trim(),
      app_code: modelForm.app_code.trim(),
      temperature: Number(modelForm.temperature ?? 0.3),
    })
  }

  function testModelConnectivity() {
    setModelConnectivityResult(null)
    testModelConnectivityMutation.mutate({
      provider: modelForm.provider.trim(),
      api_format: modelForm.api_format,
      api_model_name: modelForm.api_model_name.trim(),
      base_url: modelForm.base_url.trim(),
      api_key: modelForm.api_key.trim(),
      app_code: modelForm.app_code.trim(),
      temperature: Number(modelForm.temperature ?? 0.3),
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
      setMessage('当前彩种暂无可用模型，请切换彩种后重试。')
      setMessageType('error')
      return
    }
    const parsedParallelism = Number(generationForm.parallelism.trim())
    if (!Number.isInteger(parsedParallelism) || parsedParallelism < 1 || parsedParallelism > 8) {
      setMessage('并发线程数必须为 1 到 8 的整数')
      setMessageType('error')
      return
    }
    if (generationForm.mode === 'history') {
      if (generationForm.historyRangeMode === 'custom') {
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
    }
    generatePredictionMutation.mutate()
  }

  function handleModelProviderChange(providerCode: string) {
    const provider = providerMap[providerCode]
    setLmStudioDiscoveredModels([])
    setModelForm((previous) => ({
      ...previous,
      provider: providerCode,
      api_format: provider?.api_format || 'openai_compatible',
      base_url: providerCode === LMSTUDIO_PROVIDER_CODE ? (provider?.base_url || LMSTUDIO_DEFAULT_BASE_URL) : (provider?.base_url || previous.base_url),
      api_key: providerCode === LMSTUDIO_PROVIDER_CODE ? '' : previous.api_key,
      provider_model_id: null,
      provider_model_name: '',
      api_model_name: '',
    }))
  }

  function handleProviderModelConfigChange(providerModelIdText: string) {
    const providerModelId = Number(providerModelIdText)
    const modelConfig = selectedProviderModelConfigs.find((item) => item.id === providerModelId)
    setModelForm((previous) => ({
      ...previous,
      provider_model_id: Number.isFinite(providerModelId) ? providerModelId : null,
      provider_model_name: modelConfig?.model_id || '',
      api_model_name: modelConfig?.model_id || previous.api_model_name,
      display_name: modelMode === 'create' && !previous.display_name ? (modelConfig?.display_name || previous.display_name) : previous.display_name,
    }))
  }

  function handleLmStudioDiscoveredModelChange(modelId: string) {
    const modelConfig = lmStudioDiscoveredModels.find((item) => item.model_id === modelId)
    setModelForm((previous) => ({
      ...previous,
      provider_model_id: null,
      provider_model_name: modelConfig?.model_id || '',
      api_model_name: modelConfig?.model_id || previous.api_model_name,
      display_name: modelMode === 'create' && !previous.display_name ? (modelConfig?.display_name || previous.display_name) : previous.display_name,
    }))
  }

  function handleGenerationLotteryChange(nextLottery: LotteryCode) {
    const nextModelCodes = generationSourceModelCodes.filter((code) => (modelLotteryCodeMap[code] || [DEFAULT_SETTINGS_LOTTERY]).includes(nextLottery))
    setGenerationFilterNotice(
      generationSourceModelCodes.length > nextModelCodes.length ? `已移除 ${generationSourceModelCodes.length - nextModelCodes.length} 个不支持${getLotteryLabel(nextLottery)}的模型。` : null,
    )
    setGenerationForm((previous) => ({
      ...previous,
      lotteryCode: nextLottery,
      modelCodes: nextModelCodes,
      predictionPlayMode: normalizePredictionPlayModeForLottery(nextLottery, previous.predictionPlayMode),
    }))
  }

  function submitBulkEditForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const updates: Record<string, unknown> = {}
    if (bulkEditForm.providerEnabled) updates.provider = bulkEditForm.provider.trim()
    if (bulkEditForm.baseUrlEnabled) updates.base_url = bulkEditForm.base_url.trim()
    if (bulkEditForm.apiKeyEnabled) updates.api_key = bulkEditForm.api_key.trim()
    if (bulkEditForm.isActiveEnabled) updates.is_active = bulkEditForm.is_active
    bulkModelActionMutation.mutate({ action: 'edit', updates })
  }

  function openCreateScheduleTask() {
    setSelectedScheduleTaskCode(null)
    setScheduleForm({ ...EMPTY_SCHEDULE_FORM, lottery_code: DEFAULT_SETTINGS_LOTTERY })
    setScheduleModalOpen(true)
  }

  function openEditScheduleTask(task: ScheduleTask) {
    setSelectedScheduleTaskCode(task.task_code)
    setScheduleForm({
      task_name: task.task_name,
      task_type: task.task_type,
      lottery_code: task.lottery_code,
      fetch_limit: normalizeFetchLimit(task.fetch_limit),
      model_codes: task.model_codes,
      generation_mode: 'current',
      prediction_play_mode: task.prediction_play_mode || 'direct',
      overwrite_existing: task.overwrite_existing,
      schedule_mode: task.schedule_mode,
      preset_type: task.preset_type || 'daily',
      time_of_day: task.time_of_day || '09:00',
      weekdays: task.weekdays,
      cron_expression: task.cron_expression || '',
      is_active: task.is_active,
    })
    setScheduleModalOpen(true)
  }

  function closeScheduleModal() {
    setScheduleModalOpen(false)
    setSelectedScheduleTaskCode(null)
    setScheduleForm({ ...EMPTY_SCHEDULE_FORM, lottery_code: DEFAULT_SETTINGS_LOTTERY })
  }

  const generationDisplayName = generationSourceModelCodes.length > 1
    ? `已选 ${generationForm.modelCodes.length} 个模型`
    : generationForm.displayName || generationForm.modelCodes.join(', ')

  function toggleScheduleWeekday(weekday: number) {
    setScheduleForm((previous) => ({
      ...previous,
      weekdays: previous.weekdays.includes(weekday)
        ? previous.weekdays.filter((value) => value !== weekday)
        : [...previous.weekdays, weekday].sort((left, right) => left - right),
    }))
  }

  useEffect(() => {
    if (!scheduleModalOpen || scheduleForm.task_type !== 'prediction_generate') return
    const availableModelCodes = new Set(selectedLotteryModels.map((model) => model.model_code))
    const filteredModelCodes = scheduleForm.model_codes.filter((code) => availableModelCodes.has(code))
    if (filteredModelCodes.length === scheduleForm.model_codes.length) return
    setScheduleForm((previous) => ({
      ...previous,
      model_codes: previous.model_codes.filter((code) => availableModelCodes.has(code)),
    }))
  }, [scheduleModalOpen, scheduleForm.task_type, scheduleForm.model_codes, selectedLotteryModels])

  function submitScheduleForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const availableModelCodes = new Set(selectedLotteryModels.map((model) => model.model_code))
    const nextModelCodes = scheduleForm.task_type === 'prediction_generate'
      ? scheduleForm.model_codes.filter((code) => availableModelCodes.has(code))
      : []
    if (scheduleForm.task_type === 'prediction_generate' && nextModelCodes.length === 0) {
      setMessage('预测任务至少选择一个模型')
      setMessageType('error')
      return
    }
    saveScheduleTaskMutation.mutate({
      ...scheduleForm,
      task_name: scheduleForm.task_name.trim(),
      fetch_limit: normalizeFetchLimit(scheduleForm.fetch_limit),
      prediction_play_mode:
        scheduleForm.task_type === 'prediction_generate'
          ? normalizePredictionPlayModeForLottery(scheduleForm.lottery_code, scheduleForm.prediction_play_mode)
          : 'direct',
      cron_expression: scheduleForm.schedule_mode === 'cron' ? scheduleForm.cron_expression?.trim() || '' : undefined,
      preset_type: scheduleForm.schedule_mode === 'preset' ? scheduleForm.preset_type || 'daily' : undefined,
      time_of_day: scheduleForm.schedule_mode === 'preset' ? scheduleForm.time_of_day || '09:00' : undefined,
      weekdays: scheduleForm.schedule_mode === 'preset' ? scheduleForm.weekdays : [],
      model_codes: nextModelCodes,
      generation_mode: 'current',
    })
  }

  function toggleScheduleTaskDetail(taskCode: string) {
    setExpandedScheduleTaskCode((previous) => (previous === taskCode ? null : taskCode))
  }

  function goToScheduleCalendarMonth(delta: number) {
    setScheduleCalendarMonth((previous) => shiftCalendarMonth(previous.year, previous.month, delta))
  }

  function getPermissionLabel(permissionCode: string) {
    return permissionMap[permissionCode]?.permission_name || permissionCode
  }

  function startScheduleColumnResize(event: MouseEvent<HTMLButtonElement>, column: ScheduleColumnKey) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const baseWidth = scheduleColumnWidths[column]
    const minWidth = SCHEDULE_COLUMN_MIN_WIDTHS[column]

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.max(minWidth, baseWidth + moveEvent.clientX - startX)
      setScheduleColumnWidths((previous) => ({ ...previous, [column]: Math.round(nextWidth) }))
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function startMaintenanceColumnResize(event: MouseEvent<HTMLButtonElement>, column: MaintenanceColumnKey) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const baseWidth = maintenanceColumnWidths[column]
    const minWidth = MAINTENANCE_COLUMN_MIN_WIDTHS[column]

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const nextWidth = Math.max(minWidth, baseWidth + moveEvent.clientX - startX)
      setMaintenanceColumnWidths((previous) => ({ ...previous, [column]: Math.round(nextWidth) }))
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  async function handlePageLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function submitProfileName() {
    if (!profileNickname.trim()) {
      setMessage('昵称不能为空')
      setMessageType('error')
      return
    }
    profileMutation.mutate()
  }

  function openProfileAvatarFilePicker() {
    profileAvatarInputRef.current?.click()
  }

  function closeProfileAvatarCropModal() {
    if (profileAvatarSourceUrl) {
      URL.revokeObjectURL(profileAvatarSourceUrl)
    }
    setAvatarCropModalOpen(false)
    setProfileAvatarSourceFile(null)
    setProfileAvatarSourceUrl('')
    setProfileAvatarCrop({ x: 0, y: 0 })
    setProfileAvatarZoom(1)
    setProfileAvatarCroppedAreaPixels(null)
  }

  function onProfileAvatarCropComplete(_: Area, croppedAreaPixels: Area) {
    setProfileAvatarCroppedAreaPixels(croppedAreaPixels)
  }

  function handleProfileAvatarFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const validationError = getProfileAvatarValidationError(file)
    if (validationError) {
      setMessage(validationError)
      setMessageType('error')
      return
    }
    if (profileAvatarSourceUrl) {
      URL.revokeObjectURL(profileAvatarSourceUrl)
    }
    setProfileAvatarSourceFile(file)
    setProfileAvatarSourceUrl(URL.createObjectURL(file))
    setProfileAvatarCrop({ x: 0, y: 0 })
    setProfileAvatarZoom(1)
    setProfileAvatarCroppedAreaPixels(null)
    setAvatarCropModalOpen(true)
  }

  async function submitProfileAvatarCrop() {
    if (!profileAvatarSourceFile || !profileAvatarCroppedAreaPixels) {
      setMessage('请先裁剪头像后再上传')
      setMessageType('error')
      return
    }
    try {
      const croppedFile = await createCroppedAvatarFile(profileAvatarSourceFile, profileAvatarCroppedAreaPixels)
      profileAvatarMutation.mutate(croppedFile)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '头像裁剪失败')
      setMessageType('error')
    }
  }

  return (
    <div className="page-stack">
      <datalist id="lottery-fetch-limit-presets">
        {LOTTERY_FETCH_LIMIT_PRESET_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <section className="settings-center-layout settings-center-layout--shell">
        <aside className="settings-center-sidebar" aria-label="设置导航">
          {availableTabs.map((tab) => (
              <button
                key={tab.id}
                className={clsx('settings-center-sidebar__link', activeTab === tab.id && 'is-active')}
                onClick={() => navigate(SETTINGS_TAB_PATHS[tab.id])}
              >
                {tab.label}
              </button>
          ))}
        </aside>

        <div className="settings-center-content settings-center-content--shell">
          {activeTab === 'profile' ? (
            <div className="page-section">
              <StatusCard title="个人资料" subtitle="管理你的头像、姓名等基本信息。">
                <div className="settings-split-page">
                  <div className="settings-split-row settings-split-row--avatar">
                    <div className="settings-split-row__main">
                      <h3>头像</h3>
                      <p>支持 JPG、PNG 格式，最大 4.5MB</p>
                    </div>
                    <div className="settings-split-row__extra">
                      <UserAvatar avatarUrl={user?.avatar_url} displayName={user?.nickname || user?.username || 'U'} className="settings-avatar-fallback" />
                    </div>
                    <button type="button" className="ghost-button settings-split-row__action" onClick={openProfileAvatarFilePicker} disabled={profileAvatarMutation.isPending}>
                      更换
                    </button>
                    <input
                      ref={profileAvatarInputRef}
                      type="file"
                      className="settings-avatar-file-input"
                      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
                      onChange={handleProfileAvatarFileChange}
                    />
                  </div>

                  <div
                    className="settings-split-row"
                  >
                    <div className="settings-split-row__main">
                      <h3>姓名</h3>
                      <p>你在平台上显示的名称</p>
                    </div>
                    {isProfileNameEditing ? (
                      <div className="settings-split-row__editor settings-split-row__editor--name">
                        <input
                          className="settings-split-input"
                          value={profileNickname}
                          onChange={(event) => setProfileNickname(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              submitProfileName()
                            }
                          }}
                          aria-label="昵称"
                          required
                        />
                        <button className="primary-button settings-split-row__action" type="button" disabled={profileMutation.isPending} onClick={submitProfileName}>
                          保存
                        </button>
                        <button
                          className="ghost-button settings-split-row__action settings-split-row__action--cancel"
                          type="button"
                          onClick={() => {
                            setProfileNickname(user?.nickname || '')
                            setIsProfileNameEditing(false)
                          }}
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <div className="settings-split-row__editor settings-split-row__editor--readonly">
                        <span className="settings-split-row__value settings-split-row__name-value">{profileNickname || '-'}</span>
                        <button
                          className="ghost-button settings-split-row__action settings-split-row__action--edit"
                          type="button"
                          aria-label="编辑姓名"
                          onClick={() => setIsProfileNameEditing(true)}
                        >
                          <EditIcon />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="settings-split-row">
                    <div className="settings-split-row__main">
                      <h3>邮箱</h3>
                      <p>邮箱地址暂不支持修改</p>
                    </div>
                    <div className="settings-split-row__editor settings-split-row__editor--readonly">
                      <span className="settings-split-row__value">{displayEmail}</span>
                    </div>
                  </div>

                  <div className="settings-split-row">
                    <div className="settings-split-row__main">
                      <h3>语言</h3>
                      <p>选择你的首选语言</p>
                    </div>
                    <div className="settings-split-row__editor">
                      <select className="settings-split-select" defaultValue="zh-CN" disabled aria-label="首选语言">
                        <option value="zh-CN">简体中文</option>
                        <option value="en-US">English</option>
                      </select>
                    </div>
                  </div>

                  <div className="settings-split-row">
                    <div className="settings-split-row__main">
                      <h3>动效分级</h3>
                    </div>
                    <div className="settings-split-row__editor settings-split-row__editor--chips" role="radiogroup" aria-label="全站动效分级">
                      {MOTION_PREFERENCE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={motionPreference === option.value}
                          className={clsx('chip-button', motionPreference === option.value && 'is-active')}
                          onClick={() => setMotionPreference(option.value)}
                          title={option.description}
                        >
                          <span className="chip-button__title">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </StatusCard>
            </div>
          ) : null}

          {activeTab === 'account' ? (
            <div className="page-section">
              <StatusCard title="账户管理" subtitle="邮箱验证和账户操作。">
                <div className="settings-split-page">
                  <div className="settings-split-row">
                    <div className="settings-split-row__icon-wrap">
                      <AccountLinkIcon />
                    </div>
                    <div className="settings-split-row__main">
                      <h3>绑定的登录方式</h3>
                      <p>绑定多种登录方式后，可用任意方式登录同一账号</p>
                      <div className="settings-linked-providers">
                        <div className="settings-linked-providers__item">
                          <span>邮箱密码</span>
                          <span className="status-pill is-active">已绑定</span>
                        </div>
                        <div className="settings-linked-providers__item">
                          <span>Google</span>
                          <button type="button" className="ghost-button" disabled title="即将开放">绑定</button>
                        </div>
                        <div className="settings-linked-providers__item">
                          <span>GitHub</span>
                          <button type="button" className="ghost-button" disabled title="即将开放">绑定</button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="settings-split-row">
                    <div className="settings-split-row__icon-wrap">
                      <KeySettingIcon />
                    </div>
                    <div className="settings-split-row__main">
                      <h3>登录密码</h3>
                      <p>定期更换密码以保护账户安全</p>
                    </div>
                    <button
                      type="button"
                      className="ghost-button settings-split-row__action"
                      onClick={() => setIsPasswordEditorOpen((current) => !current)}
                    >
                      {isPasswordEditorOpen ? '收起' : '修改密码'}
                    </button>
                  </div>

                  {isPasswordEditorOpen ? (
                    <form
                      className="settings-split-password-form"
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
                  ) : null}

                  <div className="settings-split-row">
                    <div className="settings-split-row__icon-wrap">
                      <MailSettingIcon />
                    </div>
                    <div className="settings-split-row__main">
                      <h3>邮箱验证</h3>
                      <p>{displayEmail}</p>
                    </div>
                    <span className="status-pill is-active">已验证</span>
                  </div>

                  <div className="settings-split-row">
                    <div className="settings-split-row__icon-wrap">
                      <ShieldSettingIcon />
                    </div>
                    <div className="settings-split-row__main">
                      <h3>账户创建时间</h3>
                      <p>你的账户注册时间</p>
                    </div>
                    <span className="settings-split-row__value">{displayCreatedAt}</span>
                  </div>

                  <div className="settings-split-row">
                    <div className="settings-split-row__icon-wrap">
                      <LogoutSettingIcon />
                    </div>
                    <div className="settings-split-row__main">
                      <h3>退出登录</h3>
                      <p>退出当前账户，可重新登录其他账户</p>
                    </div>
                    <button className="ghost-button settings-split-row__action" type="button" onClick={() => void handlePageLogout()}>
                      退出登录
                    </button>
                  </div>
                </div>
              </StatusCard>
            </div>
          ) : null}

          {activeTab === 'models' ? (
            <div className="page-section">
              <StatusCard
                title="模型管理"
                // subtitle="统一管理全部模型目录、彩种覆盖、Provider 连接与运行状态。"
                actions={
                  <div className="toolbar-inline settings-model-toolbar">
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
                        <button className="ghost-button settings-model-toolbar__create--compact" type="button" onClick={openCreateProvider}>
                          供应商管理
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
                        <div className="filter-chip-group" role="group" aria-label="模型状态筛选">
                          {MODEL_STATUS_FILTER_META.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={clsx('filter-chip', modelStatusFilter === option.value && 'is-active')}
                              onClick={() => setModelStatusFilter(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
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
                  </div>
                }
              >
                {modelManagementView === 'list' ? (
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
                          <th className="settings-model-table__compact-head">彩种</th>
                          <th className="settings-model-table__compact-head">Provider</th>
                          <th className="settings-model-table__compact-head">接口模型</th>
                          <th>状态</th>
                          <th>更新时间</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleModels.length ? (
                          visibleModels.map((model) => (
                            <tr
                              key={model.model_code}
                              className={clsx(modelActionMenu === `list:${model.model_code}` && 'is-menu-open')}
                            >
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
                                <div className="settings-model-table__tags">
                                  {(model.lottery_codes?.length ? model.lottery_codes : [DEFAULT_SETTINGS_LOTTERY]).map((code) => (
                                    <span key={`${model.model_code}-${code}`} className="tag tag--muted settings-model-table__tag-compact">
                                      {getLotteryLabel(code)}
                                    </span>
                                  ))}
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
                                <span className={clsx('status-pill settings-model-table__status', model.is_active ? 'is-active' : 'is-muted')}>
                                  {model.is_deleted ? '已删除' : model.is_active ? '启用中' : '已停用'}
                                </span>
                              </td>
                              <td>
                                <time className="settings-model-table__time" dateTime={String(model.updated_at || '')}>
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
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8}>
                              <div className="state-shell">当前筛选下暂无模型。</div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  ) : (
                  <div className="settings-grid-react">
                    {visibleModels.map((model) => (
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
                          <span>{(model.lottery_codes?.length ? model.lottery_codes : [DEFAULT_SETTINGS_LOTTERY]).map(getLotteryLabel).join(' / ')}</span>
                          <span>{model.base_url}</span>
                          <span>{formatDateTimeLocal(model.updated_at)}</span>
                        </div>
                      </article>
                    ))}
                    {visibleModels.length === 0 ? (
                      <div className="state-shell">当前筛选下暂无模型。</div>
                    ) : null}
                  </div>
                )}
              </StatusCard>
            </div>
          ) : null}

          {activeTab === 'maintenance' ? (
            <div className="page-section">
              <StatusCard title="数据维护" subtitle="统一维护大乐透、排列3、排列5与七星彩开奖历史数据，支持按期数执行并记录运行日志。">
                <div className="page-stack">
                  <div className="panel-card settings-schedule-list-card">
                    <div className="panel-card__header">
                      <div>
                        <h2 className="panel-card__title">维护列表</h2>
                        <p className="panel-card__subtitle">每行对应一个彩种，支持立即执行，执行中会自动刷新状态。</p>
                      </div>
                    </div>
                    <div className="table-shell settings-model-table-shell settings-table-scroll-shell">
                      <table className="history-table settings-model-table settings-schedule-table settings-maintenance-table--task-list">
                        <thead>
                          <tr>
                            <th className="settings-maintenance-table__col-lottery is-resizable" style={{ width: maintenanceColumnWidths.lottery, minWidth: maintenanceColumnWidths.lottery }}>
                              彩种
                              <ColumnResizeHandle label="调整彩种列宽" onMouseDown={(event) => startMaintenanceColumnResize(event, 'lottery')} />
                            </th>
                            <th className="settings-maintenance-table__col-status is-resizable" style={{ width: maintenanceColumnWidths.status, minWidth: maintenanceColumnWidths.status }}>
                              状态
                              <ColumnResizeHandle label="调整状态列宽" onMouseDown={(event) => startMaintenanceColumnResize(event, 'status')} />
                            </th>
                            <th className="settings-maintenance-table__col-metric is-resizable" style={{ width: maintenanceColumnWidths.fetched, minWidth: maintenanceColumnWidths.fetched }}>
                              抓取条数
                              <ColumnResizeHandle label="调整抓取条数列宽" onMouseDown={(event) => startMaintenanceColumnResize(event, 'fetched')} />
                            </th>
                            <th className="settings-maintenance-table__col-metric is-resizable" style={{ width: maintenanceColumnWidths.saved, minWidth: maintenanceColumnWidths.saved }}>
                              写入条数
                              <ColumnResizeHandle label="调整写入条数列宽" onMouseDown={(event) => startMaintenanceColumnResize(event, 'saved')} />
                            </th>
                            <th className="settings-maintenance-table__col-period is-resizable" style={{ width: maintenanceColumnWidths.period, minWidth: maintenanceColumnWidths.period }}>
                              最新期号
                              <ColumnResizeHandle label="调整最新期号列宽" onMouseDown={(event) => startMaintenanceColumnResize(event, 'period')} />
                            </th>
                            <th className="settings-maintenance-table__col-time is-resizable" style={{ width: maintenanceColumnWidths.created, minWidth: maintenanceColumnWidths.created }}>
                              创建时间
                              <ColumnResizeHandle label="调整创建时间列宽" onMouseDown={(event) => startMaintenanceColumnResize(event, 'created')} />
                            </th>
                            <th className="settings-maintenance-table__col-actions is-resizable" style={{ width: maintenanceColumnWidths.actions, minWidth: maintenanceColumnWidths.actions }}>
                              操作
                              <ColumnResizeHandle label="调整操作列宽" onMouseDown={(event) => startMaintenanceColumnResize(event, 'actions')} />
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(['dlt', 'pl3', 'pl5', 'qxc'] as LotteryCode[]).map((lotteryCode) => {
                            const task = lotteryFetchTasks[lotteryCode]
                            const mutation = lotteryCode === 'pl3' ? fetchPl3LotteryMutation : lotteryCode === 'pl5' ? fetchPl5LotteryMutation : lotteryCode === 'qxc' ? fetchQxcLotteryMutation : fetchDltLotteryMutation
                            const limitInput = lotteryFetchLimitInputs[lotteryCode] || String(LOTTERY_FETCH_LIMIT_DEFAULT)
                            const parsedLimit = parseFetchLimitInput(limitInput)
                            const hasInvalidLimit = parsedLimit === null
                            const running = mutation.isPending || Boolean(task && ['queued', 'running'].includes(task.status))
                            return (
                              <tr key={lotteryCode}>
                                <td className="settings-maintenance-table__col-lottery" style={{ width: maintenanceColumnWidths.lottery, minWidth: maintenanceColumnWidths.lottery }}>{getLotteryLabel(lotteryCode)}</td>
                                <td className="settings-maintenance-table__col-status" style={{ width: maintenanceColumnWidths.status, minWidth: maintenanceColumnWidths.status }}>
                                  <span className={clsx('status-pill', task?.status === 'succeeded' && 'is-active', task?.status === 'failed' && 'is-deleted')}>
                                    {task ? getTaskStatusLabel(task.status) : '尚未执行'}
                                  </span>
                                </td>
                                <td className="settings-maintenance-table__col-metric" style={{ width: maintenanceColumnWidths.fetched, minWidth: maintenanceColumnWidths.fetched }}>{task?.progress_summary.fetched_count ?? 0}</td>
                                <td className="settings-maintenance-table__col-metric" style={{ width: maintenanceColumnWidths.saved, minWidth: maintenanceColumnWidths.saved }}>{task?.progress_summary.saved_count ?? 0}</td>
                                <td className="settings-maintenance-table__col-period" style={{ width: maintenanceColumnWidths.period, minWidth: maintenanceColumnWidths.period }}>{task?.progress_summary.latest_period || '-'}</td>
                                <td className="settings-maintenance-table__col-time" style={{ width: maintenanceColumnWidths.created, minWidth: maintenanceColumnWidths.created }}>{task ? formatDateTimeLocal(task.created_at) : '-'}</td>
                                <td className="settings-maintenance-table__col-actions" style={{ width: maintenanceColumnWidths.actions, minWidth: maintenanceColumnWidths.actions }}>
                                  <div className="settings-maintenance-action-controls">
                                    <input
                                      className="settings-maintenance-action-controls__input"
                                      type="number"
                                      min={1}
                                      max={500}
                                      step={1}
                                      list="lottery-fetch-limit-presets"
                                      aria-label={`${getLotteryLabel(lotteryCode)}抓取期数`}
                                      title="抓取期数（1-500）"
                                      value={limitInput}
                                      onChange={(event) =>
                                        setLotteryFetchLimitInputs((previous) => ({
                                          ...previous,
                                          [lotteryCode]: event.target.value,
                                        }))
                                      }
                                    />
                                    <span className="settings-maintenance-action-controls__unit">期</span>
                                    <button
                                      className="secondary-button"
                                      type="button"
                                      onClick={() => {
                                        if (parsedLimit === null) {
                                          setMessage('抓取期数需为 1-500 的整数')
                                          setMessageType('error')
                                          return
                                        }
                                        mutation.mutate(parsedLimit)
                                      }}
                                      disabled={running || hasInvalidLimit}
                                    >
                                      {running ? '执行中...' : '立即执行'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="panel-card settings-schedule-list-card">
                    <div className="panel-card__header">
                      <div>
                        <h2 className="panel-card__title">运行日志</h2>
                        <p className="panel-card__subtitle">记录每次数据维护执行结果，包含状态、时间、统计与错误信息。</p>
                      </div>
                      <div className="settings-schedule-list-toolbar">
                        <div className="filter-chip-group">
                          {[
                            { value: 'all', label: '全部' },
                            { value: 'dlt', label: '大乐透' },
                            { value: 'pl3', label: '排列3' },
                            { value: 'pl5', label: '排列5' },
                            { value: 'qxc', label: '七星彩' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={clsx('filter-chip', maintenanceLogFilter === option.value && 'is-active')}
                              onClick={() => setMaintenanceLogFilter(option.value as MaintenanceLogFilter)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="settings-schedule-list-summary">
                      <span>总计 {maintenanceLogTotal} 条</span>
                      <span>当前显示 {maintenanceLogs.length} 条</span>
                    </div>
                    <div className="table-shell settings-model-table-shell">
                      <table className="history-table settings-model-table settings-schedule-table settings-maintenance-log-table">
                        <colgroup>
                          <col className="settings-maintenance-log-table__col-started" />
                          <col className="settings-maintenance-log-table__col-finished" />
                          <col className="settings-maintenance-log-table__col-lottery" />
                          <col className="settings-maintenance-log-table__col-task-type" />
                          <col className="settings-maintenance-log-table__col-trigger" />
                          <col className="settings-maintenance-log-table__col-status" />
                          <col className="settings-maintenance-log-table__col-summary" />
                          <col className="settings-maintenance-log-table__col-detail" />
                          <col className="settings-maintenance-log-table__col-error" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>开始时间</th>
                            <th>结束时间</th>
                            <th>彩种</th>
                            <th>任务类型</th>
                            <th>触发方式</th>
                            <th>状态</th>
                            <th>统计</th>
                            <th>详情</th>
                            <th>错误信息</th>
                          </tr>
                        </thead>
                        <tbody>
                          {maintenanceLogsQuery.isLoading ? (
                            <tr>
                              <td colSpan={9}>日志加载中...</td>
                            </tr>
                          ) : maintenanceLogs.length ? (
                            maintenanceLogs.map((item: MaintenanceRunLog) => (
                              (() => {
                                const taskType = getMaintenanceTaskType(item)
                                const summaryText = taskType === 'prediction_generate'
                                  ? `${item.processed_count || 0} / ${item.skipped_count || 0} / ${item.failed_count || 0}`
                                  : `${item.fetched_count} / ${item.saved_count}`
                                const detailText = taskType === 'prediction_generate'
                                  ? `${getGenerationModeLabel(item.mode)} · ${item.model_code === '__bulk__' ? '批量模型' : item.model_code || '-'}`
                                  : item.latest_period || '-'
                                return (
                                  <tr key={item.id}>
                                    <td className="settings-maintenance-log-table__time">{formatDateTimeLocal(item.started_at || item.created_at)}</td>
                                    <td className="settings-maintenance-log-table__time">{item.finished_at ? formatDateTimeLocal(item.finished_at) : '-'}</td>
                                    <td>{getLotteryLabel(item.lottery_code)}</td>
                                    <td>{getMaintenanceTaskTypeLabel(taskType)}</td>
                                    <td>{getMaintenanceTriggerLabel(item.trigger_type)}</td>
                                    <td>
                                      <span className={clsx('status-pill', item.status === 'succeeded' && 'is-active', item.status === 'failed' && 'is-deleted')}>
                                        {getTaskStatusLabel(item.status)}
                                      </span>
                                    </td>
                                    <td>{summaryText}</td>
                                    <td className="settings-maintenance-log-table__detail">{detailText}</td>
                                    <td className="settings-maintenance-log-table__error" title={item.error_message || undefined}>
                                      <span>{item.error_message || '-'}</span>
                                    </td>
                                  </tr>
                                )
                              })()
                            ))
                          ) : (
                            <tr>
                              <td colSpan={9}>暂无日志</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="settings-schedule-list-summary">
                      <span>当前第 {Math.floor(maintenanceLogOffset / maintenanceLogPageSize) + 1} 页</span>
                      <span className="settings-maintenance-pagination">
                        <button className="secondary-button" type="button" disabled={!maintenanceCanPrevPage} onClick={() => setMaintenanceLogOffset((value) => Math.max(0, value - maintenanceLogPageSize))}>
                          上一页
                        </button>
                        <button className="secondary-button" type="button" disabled={!maintenanceCanNextPage} onClick={() => setMaintenanceLogOffset((value) => value + maintenanceLogPageSize)}>
                          下一页
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              </StatusCard>
            </div>
          ) : null}

          {activeTab === 'schedules' ? (
            <div className="page-section">
              <StatusCard title="定时任务" subtitle="综合维护开奖抓取与预测生成任务，固定时间表与 Cron 默认按北京时间执行。">
                <div className="page-stack">
                  <div className="panel-card settings-schedule-list-card">
                    <div className="panel-card__header">
                      <div>
                        <h2 className="panel-card__title">任务列表</h2>
                        <p className="panel-card__subtitle">默认展示全部定时任务，可按类型筛选并展开查看最近执行详情；时间规则默认按北京时间解释。</p>
                      </div>
                      <div className="settings-schedule-list-toolbar">
                        <div className="filter-chip-group">
                          {[
                            { value: 'all', label: '全部' },
                            { value: 'lottery_fetch', label: '抓取' },
                            { value: 'prediction_generate', label: '预测' },
                          ].map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={clsx('filter-chip', scheduleTaskFilter === option.value && 'is-active')}
                              onClick={() => setScheduleTaskFilter(option.value as ScheduleTaskFilter)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                        <div className="view-switch settings-model-toolbar__view-switch settings-schedule-view-switch" role="tablist" aria-label="定时任务视图切换">
                          <IconButton
                            label="列表视图"
                            icon={<ListIcon />}
                            active={scheduleListView === 'list'}
                            onClick={() => setScheduleListView('list')}
                          />
                          <IconButton
                            label="日历视图"
                            icon={<CalendarIcon />}
                            active={scheduleListView === 'calendar'}
                            onClick={() => setScheduleListView('calendar')}
                          />
                        </div>
                        <button className="primary-button" type="button" onClick={openCreateScheduleTask}>
                          新增任务
                        </button>
                      </div>
                    </div>
                    <div className="settings-schedule-list-summary">
                      <span>总计 {scheduleTasks.length} 条</span>
                      <span>当前筛选 {filteredScheduleTasks.length} 条</span>
                    </div>
                    {filteredScheduleTasks.length ? (
                      scheduleListView === 'list' ? (
                      <div className="table-shell settings-model-table-shell settings-table-scroll-shell">
                        <table className="history-table settings-model-table settings-schedule-table settings-schedule-table--task-list">
                          <thead>
                            <tr>
                              <th className="settings-schedule-table__col-name is-resizable" style={{ width: scheduleColumnWidths.name, minWidth: scheduleColumnWidths.name }}>
                                名称
                                <ColumnResizeHandle label="调整名称列宽" onMouseDown={(event) => startScheduleColumnResize(event, 'name')} />
                              </th>
                              <th className="settings-schedule-table__col-type is-resizable" style={{ width: scheduleColumnWidths.type, minWidth: scheduleColumnWidths.type }}>
                                类型
                                <ColumnResizeHandle label="调整类型列宽" onMouseDown={(event) => startScheduleColumnResize(event, 'type')} />
                              </th>
                              <th className="settings-schedule-table__col-lottery is-resizable" style={{ width: scheduleColumnWidths.lottery, minWidth: scheduleColumnWidths.lottery }}>
                                彩种
                                <ColumnResizeHandle label="调整彩种列宽" onMouseDown={(event) => startScheduleColumnResize(event, 'lottery')} />
                              </th>
                              <th className="settings-schedule-table__col-models is-resizable" style={{ width: scheduleColumnWidths.models, minWidth: scheduleColumnWidths.models }}>
                                模型
                                <ColumnResizeHandle label="调整模型列宽" onMouseDown={(event) => startScheduleColumnResize(event, 'models')} />
                              </th>
                              <th className="settings-schedule-table__col-rule is-resizable" style={{ width: scheduleColumnWidths.rule, minWidth: scheduleColumnWidths.rule }}>
                                规则
                                <ColumnResizeHandle label="调整规则列宽" onMouseDown={(event) => startScheduleColumnResize(event, 'rule')} />
                              </th>
                              <th className="settings-schedule-table__col-next-run is-resizable" style={{ width: scheduleColumnWidths.next_run, minWidth: scheduleColumnWidths.next_run }}>
                                下次执行（北京时间）
                                <ColumnResizeHandle label="调整下次执行列宽" onMouseDown={(event) => startScheduleColumnResize(event, 'next_run')} />
                              </th>
                              <th className="settings-schedule-table__col-status is-resizable" style={{ width: scheduleColumnWidths.status, minWidth: scheduleColumnWidths.status }}>
                                最近状态
                                <ColumnResizeHandle label="调整最近状态列宽" onMouseDown={(event) => startScheduleColumnResize(event, 'status')} />
                              </th>
                              <th className="settings-schedule-table__col-enabled is-resizable" style={{ width: scheduleColumnWidths.enabled, minWidth: scheduleColumnWidths.enabled }}>
                                启用
                                <ColumnResizeHandle label="调整启用列宽" onMouseDown={(event) => startScheduleColumnResize(event, 'enabled')} />
                              </th>
                              <th className="settings-schedule-table__col-actions is-resizable" style={{ width: scheduleColumnWidths.actions, minWidth: scheduleColumnWidths.actions }}>
                                操作
                                <ColumnResizeHandle label="调整操作列宽" onMouseDown={(event) => startScheduleColumnResize(event, 'actions')} />
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredScheduleTasks.map((task) => {
                              const isExpanded = expandedScheduleTaskCode === task.task_code
                              const scheduleMenuId = `schedule:${task.task_code}`
                              const runStatusMeta = getScheduleRunStatusMeta(task.last_run_status)
                              const enabledMeta = getScheduleEnabledMeta(task.is_active)
                              const playModeLabel = getSchedulePredictionPlayModeLabel(task)
                              const fetchLimitLabel = task.task_type === 'lottery_fetch' ? `近${normalizeFetchLimit(task.fetch_limit)}期` : null
                              const modelNames = task.task_type === 'prediction_generate'
                                ? task.model_codes.map((code) => modelNameMap[code] || code).filter(Boolean)
                                : []
                              const visibleModelNames = modelNames.slice(0, 2)
                              const remainingModelCount = Math.max(0, modelNames.length - visibleModelNames.length)
                              const statusTooltip = [
                                `最近执行：${task.last_run_at ? formatDateTimeBeijing(task.last_run_at) : '尚未执行'}`,
                                `状态：${runStatusMeta.label}`,
                                task.last_error_message ? `错误：${task.last_error_message}` : null,
                              ]
                                .filter(Boolean)
                                .join('\n')
                              const enabledTooltip = [
                                `下次执行：${task.next_run_at ? formatDateTimeBeijing(task.next_run_at) : '未安排'}`,
                                `规则类型：${getScheduleModeLabel(task.schedule_mode, task.preset_type)}`,
                              ].join('\n')
                              return (
                                <Fragment key={task.task_code}>
                                  <tr className={clsx(scheduleActionMenu === scheduleMenuId && 'is-menu-open')}>
                                    <td className="settings-schedule-table__col-name" style={{ width: scheduleColumnWidths.name, minWidth: scheduleColumnWidths.name }}>
                                      <div className="settings-model-table__title settings-schedule-table__title">
                                        <strong>{task.task_name}</strong>
                                        <span>{task.task_code}</span>
                                      </div>
                                    </td>
                                    <td className="settings-schedule-table__col-type" style={{ width: scheduleColumnWidths.type, minWidth: scheduleColumnWidths.type }}>
                                      <span className="settings-model-table__chip">{getScheduleTaskTypeLabel(task.task_type)}</span>
                                    </td>
                                    <td className="settings-schedule-table__col-lottery" style={{ width: scheduleColumnWidths.lottery, minWidth: scheduleColumnWidths.lottery }}>{getLotteryLabel(task.lottery_code as LotteryCode)}</td>
                                    <td className="settings-schedule-table__models settings-schedule-table__col-models" style={{ width: scheduleColumnWidths.models, minWidth: scheduleColumnWidths.models }}>
                                      {task.task_type === 'prediction_generate' && modelNames.length ? (
                                        <div className="settings-schedule-table__models-wrap" title={modelNames.join(' / ')}>
                                          <div className="settings-schedule-table__model-badges">
                                            {visibleModelNames.map((name) => (
                                              <span key={`${task.task_code}-${name}`} className="settings-schedule-table__model-chip">
                                                {name}
                                              </span>
                                            ))}
                                            {remainingModelCount ? (
                                              <span className="settings-schedule-table__model-more">+{remainingModelCount}</span>
                                            ) : null}
                                          </div>
                                          <span className="settings-schedule-table__model-count">
                                            共 {modelNames.length} 个模型
                                          </span>
                                        </div>
                                      ) : (
                                        '-'
                                      )}
                                    </td>
                                    <td className="settings-schedule-table__rule settings-schedule-table__col-rule" style={{ width: scheduleColumnWidths.rule, minWidth: scheduleColumnWidths.rule }}>
                                      <strong>{task.rule_summary || '-'}</strong>
                                      <span>
                                        {[
                                          getScheduleModeLabel(task.schedule_mode, task.preset_type),
                                          playModeLabel,
                                          fetchLimitLabel,
                                        ].filter(Boolean).join(' · ')}
                                      </span>
                                    </td>
                                    <td className="settings-schedule-table__col-next-run" style={{ width: scheduleColumnWidths.next_run, minWidth: scheduleColumnWidths.next_run }}>{task.next_run_at ? formatDateTimeBeijing(task.next_run_at) : '-'}</td>
                                    <td className="settings-schedule-table__col-status" style={{ width: scheduleColumnWidths.status, minWidth: scheduleColumnWidths.status }}>
                                      <span
                                        className={clsx('schedule-status-pill', 'lite-tooltip', `schedule-status-pill--${runStatusMeta.tone}`)}
                                        data-tooltip={statusTooltip}
                                        title={statusTooltip}
                                      >
                                        <span className="schedule-status-pill__icon" aria-hidden="true">
                                          <ScheduleStatusIcon tone={runStatusMeta.tone} />
                                        </span>
                                        <span>{runStatusMeta.label}</span>
                                      </span>
                                    </td>
                                    <td className="settings-schedule-table__col-enabled" style={{ width: scheduleColumnWidths.enabled, minWidth: scheduleColumnWidths.enabled }}>
                                      <span
                                        className={clsx('schedule-status-pill', 'lite-tooltip', `schedule-status-pill--${enabledMeta.tone}`)}
                                        data-tooltip={enabledTooltip}
                                        title={enabledTooltip}
                                      >
                                        <span className="schedule-status-pill__icon" aria-hidden="true">
                                          <ScheduleStatusIcon tone={enabledMeta.tone} />
                                        </span>
                                        <span>{enabledMeta.label}</span>
                                      </span>
                                    </td>
                                    <td className="settings-schedule-table__col-actions" style={{ width: scheduleColumnWidths.actions, minWidth: scheduleColumnWidths.actions }}>
                                      <div className="settings-model-table__actions settings-schedule-actions">
                                        <IconButton
                                          label={`${isExpanded ? '收起详情' : '查看详情'}：${task.task_name}`}
                                          icon={<EyeIcon open={isExpanded} />}
                                          active={isExpanded}
                                          expanded={isExpanded}
                                          onClick={() => toggleScheduleTaskDetail(task.task_code)}
                                        />
                                        <div className="action-menu" onClick={stopMenuEvent}>
                                          <IconButton
                                            label={`更多操作：${task.task_name}`}
                                            icon={<MoreIcon />}
                                            onClick={(event) => toggleScheduleMenu(scheduleMenuId, event)}
                                            expanded={scheduleActionMenu === scheduleMenuId}
                                          />
                                          {scheduleActionMenu === scheduleMenuId ? (
                                            <div className="action-menu__panel settings-action-menu__panel settings-schedule-action-menu__panel">
                                              <button
                                                className="action-menu__item"
                                                type="button"
                                                onClick={() => {
                                                  setScheduleActionMenu(null)
                                                  openEditScheduleTask(task)
                                                }}
                                              >
                                                编辑任务
                                              </button>
                                              <button
                                                className="action-menu__item"
                                                type="button"
                                                onClick={() => {
                                                  setScheduleActionMenu(null)
                                                  scheduleTaskActionMutation.mutate({ type: 'run', task })
                                                }}
                                              >
                                                立即执行
                                              </button>
                                              <button
                                                className="action-menu__item"
                                                type="button"
                                                onClick={() => {
                                                  setScheduleActionMenu(null)
                                                  scheduleTaskActionMutation.mutate({ type: 'toggle', task })
                                                }}
                                              >
                                                {task.is_active ? '停用任务' : '启用任务'}
                                              </button>
                                              <button
                                                className="action-menu__item action-menu__item--danger"
                                                type="button"
                                                onClick={() => {
                                                  setScheduleActionMenu(null)
                                                  const confirmed = window.confirm(`确认删除定时任务“${task.task_name}”吗？`)
                                                  if (confirmed) {
                                                    scheduleTaskActionMutation.mutate({ type: 'delete', task })
                                                  }
                                                }}
                                              >
                                                删除任务
                                              </button>
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                  {isExpanded ? (
                                    <tr>
                                      <td colSpan={9} className="settings-schedule-detail-cell">
                                        <div className="settings-schedule-detail-panel">
                                          <div className="settings-schedule-detail-grid">
                                            <article className="settings-schedule-detail-item">
                                              <span>最近执行</span>
                                              <strong>{task.last_run_at ? formatDateTimeBeijing(task.last_run_at) : '尚未执行'}</strong>
                                            </article>
                                            <article className="settings-schedule-detail-item">
                                              <span>最近状态</span>
                                              <strong>{task.last_run_status ? getTaskStatusLabel(task.last_run_status) : '未执行'}</strong>
                                            </article>
                                            <article className="settings-schedule-detail-item">
                                              <span>最近任务 ID</span>
                                              <strong>{task.last_task_id || '-'}</strong>
                                            </article>
                                            <article className="settings-schedule-detail-item">
                                              <span>规则类型</span>
                                              <strong>{getScheduleModeLabel(task.schedule_mode, task.preset_type)}</strong>
                                            </article>
                                            {playModeLabel ? (
                                              <article className="settings-schedule-detail-item">
                                                <span>预测玩法</span>
                                                <strong>{playModeLabel}</strong>
                                              </article>
                                            ) : null}
                                            {task.task_type === 'lottery_fetch' ? (
                                              <article className="settings-schedule-detail-item">
                                                <span>抓取期数</span>
                                                <strong>近 {normalizeFetchLimit(task.fetch_limit)} 期</strong>
                                              </article>
                                            ) : null}
                                          </div>
                                          <div className="settings-schedule-detail-log">
                                            <span>错误信息</span>
                                            <div className={clsx('state-shell', task.last_error_message ? 'state-shell--error' : 'settings-schedule-detail-log--empty')}>
                                              {task.last_error_message || '最近一次执行没有错误信息。'}
                                            </div>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  ) : null}
                                </Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="settings-schedule-calendar">
                        <div className="settings-schedule-calendar__main">
                          <div className="settings-schedule-calendar__month-bar">
                            <button className="secondary-button" type="button" onClick={() => goToScheduleCalendarMonth(-1)}>
                              上个月
                            </button>
                            <strong>{buildMonthLabel(scheduleCalendarMonth.year, scheduleCalendarMonth.month)}</strong>
                            <button className="secondary-button" type="button" onClick={() => goToScheduleCalendarMonth(1)}>
                              下个月
                            </button>
                          </div>
                          <div className="settings-schedule-calendar__weekdays" role="presentation">
                            {CALENDAR_WEEKDAY_LABELS.map((label) => (
                              <span key={label}>{label}</span>
                            ))}
                          </div>
                          <div className="settings-schedule-calendar__grid">
                            {scheduleCalendarMonthData.cells.map((cell) => {
                              const dayEntries = scheduleCalendarMonthData.dayEntries[cell.dateKey] || []
                              const isSelected = selectedCalendarDateKey === cell.dateKey
                              const isToday = beijingToday.dateKey === cell.dateKey
                              const dayBadgeLabel = dayEntries.length ? `${dayEntries.length} 个触发项` : '无触发'
                              return (
                                <button
                                  key={cell.dateKey}
                                  type="button"
                                  className={clsx(
                                    'settings-schedule-calendar__day',
                                    !cell.inCurrentMonth && 'is-outside',
                                    isSelected && 'is-selected',
                                    isToday && 'is-today',
                                  )}
                                  onClick={() => {
                                    if (!cell.inCurrentMonth) return
                                    setSelectedCalendarDateKey(cell.dateKey)
                                  }}
                                  disabled={!cell.inCurrentMonth}
                                  aria-label={`${cell.dateKey}，${dayBadgeLabel}`}
                                >
                                  <span className="settings-schedule-calendar__day-number">{cell.dayOfMonth}</span>
                                  <span className="settings-schedule-calendar__day-count">{dayEntries.length || '-'}</span>
                                  <div className="settings-schedule-calendar__day-items">
                                    {dayEntries.slice(0, 3).map((entry) => (
                                      <span key={`${cell.dateKey}-${entry.task.task_code}`} className="settings-schedule-calendar__day-chip" title={`${entry.task.task_name} · ${entry.triggerTimes.join('、')}`}>
                                        <em>{entry.triggerTimes[0]}</em>
                                        <span>{entry.task.task_name}</span>
                                      </span>
                                    ))}
                                    {dayEntries.length > 3 ? (
                                      <span className="settings-schedule-calendar__day-more">+{dayEntries.length - 3}</span>
                                    ) : null}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <aside className="settings-schedule-calendar__detail">
                          <div className="settings-schedule-calendar__detail-header">
                            <h3>{selectedCalendarDateLabel}</h3>
                            <p>北京时间 · 共 {selectedCalendarDayEntries.length} 个触发任务</p>
                          </div>
                          {selectedCalendarDayEntries.length ? (
                            <div className="settings-schedule-calendar__detail-list">
                              {selectedCalendarDayEntries.map((entry) => {
                                const task = entry.task
                                const dayRunLogs = selectedCalendarDayRunTimelineMap.get(task.task_code) || []
                                const latestDayRunLog = dayRunLogs[0]
                                const runStatusMeta = getScheduleRunStatusMeta(latestDayRunLog?.status || null)
                                const enabledMeta = getScheduleEnabledMeta(task.is_active)
                                const playModeLabel = getSchedulePredictionPlayModeLabel(task)
                                const fetchLimitLabel = task.task_type === 'lottery_fetch' ? `近${normalizeFetchLimit(task.fetch_limit)}期` : null
                                return (
                                  <article key={`${selectedCalendarDateKey}-${task.task_code}`} className="settings-schedule-calendar__detail-card">
                                    <div className="settings-schedule-calendar__detail-title">
                                      <div>
                                        <h4>{task.task_name}</h4>
                                        <p>{task.task_code}</p>
                                      </div>
                                      <span className={clsx('schedule-status-pill', `schedule-status-pill--${enabledMeta.tone}`)}>
                                        <span className="schedule-status-pill__icon" aria-hidden="true">
                                          <ScheduleStatusIcon tone={enabledMeta.tone} />
                                        </span>
                                        <span>{enabledMeta.label}</span>
                                      </span>
                                    </div>
                                    <p className="settings-schedule-calendar__detail-meta">
                                      {[
                                        getScheduleTaskTypeLabel(task.task_type),
                                        getLotteryLabel(task.lottery_code),
                                        task.rule_summary,
                                        playModeLabel,
                                        fetchLimitLabel,
                                      ].filter(Boolean).join(' · ')}
                                    </p>
                                    <div className="settings-schedule-calendar__detail-times">
                                      {entry.triggerTimes.map((time) => (
                                        <span key={`${task.task_code}-${time}`}>{time}</span>
                                      ))}
                                    </div>
                                    <div className="settings-schedule-calendar__detail-status">
                                      <span className={clsx('schedule-status-pill', `schedule-status-pill--${runStatusMeta.tone}`)}>
                                        <span className="schedule-status-pill__icon" aria-hidden="true">
                                          <ScheduleStatusIcon tone={runStatusMeta.tone} />
                                        </span>
                                        <span>{runStatusMeta.label}</span>
                                      </span>
                                      <span>当日执行次数：{dayRunLogs.length}</span>
                                      <span>{task.next_run_at ? `下次执行：${formatDateTimeBeijing(task.next_run_at)}` : '下次执行：未安排'}</span>
                                    </div>
                                    {dayRunLogs.length ? (
                                      <div className="settings-schedule-calendar__timeline">
                                        {dayRunLogs.map((item) => {
                                          const runStatus = getScheduleRunStatusMeta(item.status)
                                          const runAt = item.finished_at || item.started_at || item.created_at || null
                                          return (
                                            <article key={`${task.task_code}-${item.id}`} className="settings-schedule-calendar__timeline-item">
                                              <div className="settings-schedule-calendar__timeline-top">
                                                <span className="settings-schedule-calendar__timeline-time">{runAt ? formatDateTimeBeijing(runAt) : '-'}</span>
                                                <span className={clsx('settings-schedule-calendar__timeline-trigger', item.trigger_type === 'schedule' ? 'is-schedule' : 'is-manual')}>
                                                  {getScheduleRunTriggerLabel(item.trigger_type)}
                                                </span>
                                                <span className={clsx('schedule-status-pill', `schedule-status-pill--${runStatus.tone}`)}>
                                                  <span className="schedule-status-pill__icon" aria-hidden="true">
                                                    <ScheduleStatusIcon tone={runStatus.tone} />
                                                  </span>
                                                  <span>{runStatus.label}</span>
                                                </span>
                                              </div>
                                              {item.error_message ? (
                                                <p className="settings-schedule-calendar__timeline-error">错误：{item.error_message}</p>
                                              ) : null}
                                            </article>
                                          )
                                        })}
                                      </div>
                                    ) : (
                                      <div className="settings-schedule-calendar__timeline-empty">当日未执行</div>
                                    )}
                                    <div className="settings-schedule-calendar__detail-actions">
                                      <button className="secondary-button" type="button" onClick={() => openEditScheduleTask(task)}>编辑</button>
                                      <button className="secondary-button" type="button" onClick={() => scheduleTaskActionMutation.mutate({ type: 'run', task })}>执行</button>
                                      <button className="secondary-button" type="button" onClick={() => scheduleTaskActionMutation.mutate({ type: 'toggle', task })}>
                                        {task.is_active ? '停用' : '启用'}
                                      </button>
                                      <button
                                        className="ghost-button"
                                        type="button"
                                        onClick={() => {
                                          const confirmed = window.confirm(`确认删除定时任务“${task.task_name}”吗？`)
                                          if (confirmed) {
                                            scheduleTaskActionMutation.mutate({ type: 'delete', task })
                                          }
                                        }}
                                      >
                                        删除
                                      </button>
                                    </div>
                                  </article>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="state-shell">当天没有触发任务，可切换月份或选择其他日期。</div>
                          )}
                        </aside>
                      </div>
                    )
                    ) : (
                      <div className="state-shell">当前筛选下还没有定时任务。</div>
                    )}
                  </div>
                </div>
              </StatusCard>
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
        <div className="modal-shell" role="presentation" onClick={closeModelModal}>
          <div className="modal-card modal-card--form model-config-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form className="settings-form-grid model-config-modal__form" onSubmit={submitModelForm}>
              <div className="modal-card__header model-config-modal__header">
                <div className="model-config-modal__header-main">
                  <p className="modal-card__eyebrow">模型配置</p>
                  <h3>{modelMode === 'create' ? '新增模型' : '编辑模型'}</h3>
                  <p className="model-config-modal__mode-tip">{modelMode === 'create' ? '创建新模型用于预测生成。' : '修改当前模型配置，不影响历史记录。'}</p>
                </div>
                <button className="ghost-button" type="button" onClick={closeModelModal}>关闭</button>
              </div>
              <section className="model-config-modal__section">
                <div className="model-config-modal__section-title">
                  <strong>基础信息</strong>
                  <span>确定模型标识、展示名称和服务提供方。</span>
                </div>
                <div className="model-config-modal__grid">
                  <label className="field">
                    <span>模型编码</span>
                    <input value={modelForm.model_code || ''} onChange={(event) => setModelForm((previous) => ({ ...previous, model_code: event.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>显示名称</span>
                    <input value={modelForm.display_name} onChange={(event) => setModelForm((previous) => ({ ...previous, display_name: event.target.value }))} required />
                  </label>
                  <label className="field">
                    <span>Provider</span>
                    <select value={modelForm.provider} onChange={(event) => handleModelProviderChange(event.target.value)}>
                      {modelFormProviders.map((provider) => (
                        <option key={provider.code} value={provider.code}>
                          {provider.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>接口格式</span>
                    <select
                      value={modelForm.api_format || selectedProvider?.api_format || 'openai_compatible'}
                      onChange={(event) => setModelForm((previous) => ({ ...previous, api_format: event.target.value as SettingsProviderPayload['api_format'] }))}
                      disabled={isLmStudioProvider}
                    >
                      <option value="openai_responses">OpenAI Responses</option>
                      <option value="openai_compatible">OpenAI Compatible</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="amazon_bedrock">Amazon Bedrock</option>
                      <option value="google_gemini">Google(Gemini)</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>供应商模型</span>
                    <select
                      value={modelForm.provider_model_id ? String(modelForm.provider_model_id) : ''}
                      onChange={(event) => handleProviderModelConfigChange(event.target.value)}
                    >
                      <option value="">请选择供应商模型</option>
                      {selectedProviderModelConfigs.map((modelConfig) => (
                        <option key={modelConfig.id} value={modelConfig.id}>
                          {modelConfig.display_name} ({modelConfig.model_id})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>API 模型名</span>
                    <input value={modelForm.api_model_name} onChange={(event) => setModelForm((previous) => ({ ...previous, api_model_name: event.target.value }))} required />
                  </label>
                  {isLmStudioProvider ? (
                    <>
                      <label className="field">
                        <span>LM Studio 已加载模型</span>
                        <select
                          aria-label="LM Studio 已加载模型"
                          value={modelForm.provider_model_name || ''}
                          onChange={(event) => handleLmStudioDiscoveredModelChange(event.target.value)}
                        >
                          <option value="">请选择已加载模型</option>
                          {lmStudioDiscoveredModels.map((modelConfig) => (
                            <option key={modelConfig.model_id} value={modelConfig.model_id}>
                              {modelConfig.display_name} ({modelConfig.model_id})
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="field">
                        <span>&nbsp;</span>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => discoverLmStudioModelsMutation.mutate()}
                          disabled={discoverLmStudioModelsMutation.isPending}
                        >
                          {discoverLmStudioModelsMutation.isPending ? '加载中...' : '从 LM Studio 拉取模型'}
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="model-config-modal__section">
                <div className="model-config-modal__section-title">
                  <strong>连接与鉴权</strong>
                  <span>维护接口地址和访问凭证，支持按模型独立配置。</span>
                </div>
                <div className="model-config-modal__grid">
                  <label className="field model-config-modal__field--full">
                    <span>Base URL</span>
                    <input value={modelForm.base_url} onChange={(event) => setModelForm((previous) => ({ ...previous, base_url: event.target.value }))} />
                  </label>
                  <label className="field model-config-modal__field--full">
                    <span>{isLmStudioProvider ? 'API Key（可选）' : 'API Key'}</span>
                    <input value={modelForm.api_key} onChange={(event) => setModelForm((previous) => ({ ...previous, api_key: event.target.value }))} />
                  </label>
                  {isLmStudioProvider ? <div className="settings-inline-hint">LM Studio 本地服务可不填写 API Key。</div> : null}
                  {shouldShowModelAppCode ? (
                    <label className="field">
                      <span>APP Code</span>
                      <input value={modelForm.app_code} onChange={(event) => setModelForm((previous) => ({ ...previous, app_code: event.target.value }))} />
                    </label>
                  ) : null}
                  <label className="field">
                    <span>Temperature</span>
                    <input
                      type="number"
                      step="0.1"
                      value={modelForm.temperature ?? 0.3}
                      onChange={(event) => setModelForm((previous) => ({ ...previous, temperature: Number(event.target.value) }))}
                      required
                    />
                  </label>
                </div>
                <div className="model-config-modal__connectivity">
                  <button
                    className="ghost-button model-config-modal__connectivity-button"
                    type="button"
                    onClick={testModelConnectivity}
                    disabled={testModelConnectivityMutation.isPending}
                  >
                    {testModelConnectivityMutation.isPending ? '测试中...' : '测试连通性'}
                  </button>
                  {modelConnectivityResult ? (
                    <p className={clsx('model-config-modal__connectivity-result', modelConnectivityResult.status === 'success' && 'is-success')}>
                      <span className="model-config-modal__connectivity-result-icon" aria-hidden="true">
                        {modelConnectivityResult.status === 'success' ? '✓' : '✕'}
                      </span>
                      {modelConnectivityResult.message}
                      {typeof modelConnectivityResult.durationMs === 'number' ? `（${modelConnectivityResult.durationMs}ms）` : ''}
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="model-config-modal__section">
                <div className="model-config-modal__section-title">
                  <strong>高级参数</strong>
                  <span>配置模型启用状态与投放彩种。</span>
                </div>
                <div className="model-config-modal__toggles">
                  <label className="toggle-chip model-config-modal__toggle">
                    <input type="checkbox" checked={modelForm.is_active} onChange={(event) => setModelForm((previous) => ({ ...previous, is_active: event.target.checked }))} />
                    <span>启用模型</span>
                  </label>
                  <div className="field model-config-modal__lottery-field">
                    <span>适用彩种</span>
                    <div className="filter-chip-group">
                      {(['dlt', 'pl3', 'pl5', 'qxc'] as LotteryCode[]).map((code) => {
                        const active = modelForm.lottery_codes.includes(code)
                        return (
                          <button
                            key={code}
                            type="button"
                            className={clsx('filter-chip', active && 'is-active')}
                            onClick={() =>
                              setModelForm((previous) => ({
                                ...previous,
                                lottery_codes: active
                                  ? previous.lottery_codes.filter((item) => item !== code)
                                  : [...previous.lottery_codes, code],
                              }))
                            }
                          >
                            {getLotteryLabel(code)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <div className="form-actions model-config-modal__actions">
                <button className="ghost-button" type="button" onClick={closeModelModal}>关闭</button>
                <button className="primary-button" type="submit">{modelMode === 'create' ? '创建模型' : '保存修改'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {avatarCropModalOpen ? (
        <div className="modal-shell" role="presentation" onClick={() => !profileAvatarMutation.isPending && closeProfileAvatarCropModal()}>
          <div className="modal-card modal-card--form settings-avatar-crop-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-card__header">
              <div>
                <p className="modal-card__eyebrow">头像裁剪</p>
                <h3>调整头像显示区域</h3>
              </div>
              <button className="ghost-button" type="button" onClick={closeProfileAvatarCropModal} disabled={profileAvatarMutation.isPending}>关闭</button>
            </div>
            <div className="settings-avatar-crop-modal__body">
              <div className="settings-avatar-crop-modal__canvas">
                {profileAvatarSourceUrl ? (
                  <Cropper
                    image={profileAvatarSourceUrl}
                    crop={profileAvatarCrop}
                    zoom={profileAvatarZoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={setProfileAvatarCrop}
                    onZoomChange={setProfileAvatarZoom}
                    onCropComplete={onProfileAvatarCropComplete}
                  />
                ) : null}
              </div>
              <label className="field settings-avatar-crop-modal__zoom">
                <span>缩放</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={profileAvatarZoom}
                  onChange={(event) => setProfileAvatarZoom(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="form-actions settings-avatar-crop-modal__actions">
              <button className="ghost-button" type="button" onClick={closeProfileAvatarCropModal} disabled={profileAvatarMutation.isPending}>取消</button>
              <button
                className="primary-button"
                type="button"
                onClick={() => void submitProfileAvatarCrop()}
                disabled={profileAvatarMutation.isPending || !profileAvatarCroppedAreaPixels}
              >
                {profileAvatarMutation.isPending ? '上传中...' : '确认上传'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {providerModalOpen ? (
        <div className="modal-shell" role="presentation" onClick={() => setProviderModalOpen(false)}>
          <div className="modal-card modal-card--form model-config-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form className="settings-form-grid model-config-modal__form" onSubmit={submitProviderForm}>
              <div className="modal-card__header model-config-modal__header">
                <div className="model-config-modal__header-main">
                  <p className="modal-card__eyebrow">供应商管理</p>
                  <h3>{providerMode === 'create' ? '新增供应商' : '编辑供应商'}</h3>
                </div>
                <button className="ghost-button" type="button" onClick={() => setProviderModalOpen(false)}>关闭</button>
              </div>

              <div className="toolbar-inline provider-config-modal__preset-group">
                <button className="ghost-button provider-config-modal__preset-button" type="button" onClick={() => applyProviderPreset('custom')}>自定义供应商</button>
                <button className="ghost-button provider-config-modal__preset-button" type="button" onClick={() => applyProviderPreset('deepseek')}>DeepSeek</button>
                <button className="ghost-button provider-config-modal__preset-button" type="button" onClick={() => applyProviderPreset('aimixhub')}>AiMixHub</button>
              </div>

              <label className="field">
                <span>供应商标识</span>
                <input
                  value={providerForm.code || ''}
                  onChange={(event) => setProviderForm((previous) => ({ ...previous, code: event.target.value }))}
                  required
                  disabled={providerMode === 'edit'}
                />
              </label>
              <label className="field">
                <span>供应商名称</span>
                <input value={providerForm.name} onChange={(event) => setProviderForm((previous) => ({ ...previous, name: event.target.value }))} required />
              </label>
              <label className="field">
                <span>官网链接</span>
                <input value={providerForm.website_url} onChange={(event) => setProviderForm((previous) => ({ ...previous, website_url: event.target.value }))} />
              </label>
              <label className="field">
                <span>接口格式</span>
                <select
                  value={providerForm.api_format}
                  onChange={(event) => setProviderForm((previous) => ({ ...previous, api_format: event.target.value as SettingsProviderPayload['api_format'] }))}
                >
                  <option value="openai_responses">OpenAI Responses</option>
                  <option value="openai_compatible">OpenAI Compatible</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="amazon_bedrock">Amazon Bedrock</option>
                  <option value="google_gemini">Google(Gemini)</option>
                </select>
              </label>
              <label className="field">
                <span>API Key</span>
                <input value={providerForm.api_key} onChange={(event) => setProviderForm((previous) => ({ ...previous, api_key: event.target.value }))} />
              </label>
              <label className="field">
                <span>Base URL</span>
                <input value={providerForm.base_url} onChange={(event) => setProviderForm((previous) => ({ ...previous, base_url: event.target.value }))} />
              </label>
              <label className="field model-config-modal__field--full">
                <span>备注</span>
                <input value={providerForm.remark} onChange={(event) => setProviderForm((previous) => ({ ...previous, remark: event.target.value }))} />
              </label>

              <div className="panel-card provider-config-modal__model-section">
                <div className="toolbar-inline provider-config-modal__section-header">
                  <strong>模型配置</strong>
                  <button className="ghost-button" type="button" onClick={addProviderModelConfig}>+ 添加模型</button>
                </div>
                {providerForm.model_configs.map((modelConfig, index) => (
                  <div key={`${modelConfig.id || 'new'}-${index}`} className="model-config-modal__grid provider-config-modal__model-row">
                    <label className="field">
                      <span>模型ID</span>
                      <input
                        value={modelConfig.model_id}
                        onChange={(event) => setProviderForm((previous) => ({
                          ...previous,
                          model_configs: previous.model_configs.map((item, itemIndex) => itemIndex === index ? { ...item, model_id: event.target.value } : item),
                        }))}
                      />
                    </label>
                    <label className="field">
                      <span>显示名称</span>
                      <input
                        value={modelConfig.display_name}
                        onChange={(event) => setProviderForm((previous) => ({
                          ...previous,
                          model_configs: previous.model_configs.map((item, itemIndex) => itemIndex === index ? { ...item, display_name: event.target.value } : item),
                        }))}
                      />
                    </label>
                    <button className="ghost-button" type="button" onClick={() => removeProviderModelConfig(index)}>删除</button>
                  </div>
                ))}
              </div>

              <div className="panel-card">
                <strong>现有供应商</strong>
                <div className="toolbar-inline provider-config-modal__provider-list">
                  {providers.map((provider) => (
                    <button key={provider.code} className="ghost-button" type="button" onClick={() => openEditProvider(provider)}>
                      {provider.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-actions model-config-modal__actions">
                <button className="ghost-button" type="button" onClick={() => setProviderModalOpen(false)}>关闭</button>
                {providerMode === 'edit' ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => {
                      if (!selectedProviderCode) return
                      apiClient.deleteSettingsProvider(selectedProviderCode)
                        .then(() => {
                          setMessage('供应商已删除。')
                          setMessageType('success')
                          setProviderModalOpen(false)
                          void queryClient.invalidateQueries({ queryKey: ['settings-providers'] })
                        })
                        .catch((error) => {
                          setMessage(error instanceof Error ? error.message : '删除供应商失败')
                          setMessageType('error')
                        })
                    }}
                  >
                    删除
                  </button>
                ) : null}
                <button className="primary-button" type="submit">{providerMode === 'create' ? '创建供应商' : '保存供应商'}</button>
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

      {scheduleModalOpen ? (
        <div className="modal-shell" role="presentation" onClick={closeScheduleModal}>
          <div className="modal-card modal-card--form" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form className="settings-form-grid" onSubmit={submitScheduleForm}>
              <div className="modal-card__header">
                <div>
                  <p className="modal-card__eyebrow">定时任务</p>
                  <h3>{selectedScheduleTask ? '编辑任务' : '新增任务'}</h3>
                  <p className="settings-inline-hint">预测任务按“彩种 + 多模型”执行，开奖抓取任务按彩种执行；时间规则默认使用北京时间。</p>
                </div>
                <button className="ghost-button" type="button" onClick={closeScheduleModal}>关闭</button>
              </div>
              <label className="field">
                <span>任务名称</span>
                <input
                  value={scheduleForm.task_name}
                  onChange={(event) => setScheduleForm((previous) => ({ ...previous, task_name: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>任务类型</span>
                <select
                  aria-label="任务类型"
                  value={scheduleForm.task_type}
                  onChange={(event) =>
                    setScheduleForm((previous) => ({
                      ...previous,
                      task_type: event.target.value as ScheduleTaskType,
                      model_codes: event.target.value === 'prediction_generate' ? previous.model_codes : [],
                    }))
                  }
                >
                  <option value="lottery_fetch">开奖抓取</option>
                  <option value="prediction_generate">预测生成</option>
                </select>
              </label>
              <label className="field">
                <span>彩种</span>
                <select
                  aria-label="彩种"
                  value={scheduleForm.lottery_code}
                  onChange={(event) => {
                    const nextLottery = event.target.value as LotteryCode
                    setScheduleForm((previous) => ({
                      ...previous,
                      lottery_code: nextLottery,
                      prediction_play_mode: normalizePredictionPlayModeForLottery(nextLottery, previous.prediction_play_mode),
                      model_codes: [],
                    }))
                  }}
                >
                  <option value="dlt">大乐透</option>
                  <option value="pl3">排列3</option>
                  <option value="pl5">排列5</option>
                  <option value="qxc">七星彩</option>
                </select>
              </label>
              <label className="field">
                <span>规则模式</span>
                <select
                  aria-label="规则模式"
                  value={scheduleForm.schedule_mode}
                  onChange={(event) => setScheduleForm((previous) => ({ ...previous, schedule_mode: event.target.value as ScheduleMode }))}
                >
                  <option value="preset">固定时间表</option>
                  <option value="cron">Cron 表达式</option>
                </select>
              </label>
              {scheduleForm.task_type === 'prediction_generate' ? (
                <>
                  {scheduleForm.lottery_code === 'pl3' || scheduleForm.lottery_code === 'dlt' || scheduleForm.lottery_code === 'qxc' ? (
                    <label className="field">
                      <span>预测玩法</span>
                      <select
                        aria-label="预测玩法"
                        value={scheduleForm.prediction_play_mode}
                        onChange={(event) =>
                          setScheduleForm((previous) => ({ ...previous, prediction_play_mode: event.target.value as ModelPredictionPlayMode }))
                        }
                      >
                        {scheduleForm.lottery_code === 'pl3' ? (
                          <>
                            <option value="direct">直选</option>
                            <option value="direct_sum">和值</option>
                          </>
                        ) : scheduleForm.lottery_code === 'qxc' ? (
                          <>
                            <option value="direct">直选</option>
                            <option value="compound">复式</option>
                          </>
                        ) : (
                          <>
                            <option value="direct">普通</option>
                            <option value="compound">复式</option>
                            <option value="dantuo">胆拖</option>
                          </>
                        )}
                      </select>
                    </label>
                  ) : null}
                  <div className="field field--full">
                    <span>预测模型</span>
                    <div className="settings-schedule-model-picker" role="group" aria-label="预测模型">
                      {selectedLotteryModels.length ? (
                        selectedLotteryModels.map((model) => (
                          <label
                            key={model.model_code}
                            className={clsx('settings-schedule-model-option', scheduleForm.model_codes.includes(model.model_code) && 'is-selected')}
                          >
                            <input
                              type="checkbox"
                              aria-label={model.display_name}
                              checked={scheduleForm.model_codes.includes(model.model_code)}
                              onChange={(event) =>
                                setScheduleForm((previous) => ({
                                  ...previous,
                                  model_codes: event.target.checked
                                    ? [...previous.model_codes, model.model_code]
                                    : previous.model_codes.filter((code) => code !== model.model_code),
                                }))
                              }
                            />
                            <span className="settings-schedule-model-option__content">
                              <strong>{model.display_name}</strong>
                              <small>{model.api_model_name || model.model_code}</small>
                            </span>
                            <span className="settings-schedule-model-option__meta">
                              <span className="settings-model-table__chip settings-model-table__tag-compact">
                                {getScheduleModelProviderLabel(model, providers)}
                              </span>
                            </span>
                          </label>
                        ))
                      ) : (
                        <span className="settings-inline-hint">当前彩种暂无可选启用模型。</span>
                      )}
                    </div>
                  </div>
                </>
              ) : null}
              {scheduleForm.task_type === 'lottery_fetch' ? (
                <label className="field">
                  <span>抓取期数</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    list="lottery-fetch-limit-presets"
                    value={scheduleForm.fetch_limit}
                    onChange={(event) =>
                      setScheduleForm((previous) => ({
                        ...previous,
                        fetch_limit: normalizeFetchLimit(event.target.value),
                      }))
                    }
                  />
                </label>
              ) : null}
              {scheduleForm.schedule_mode === 'preset' ? (
                <>
                  <label className="field">
                    <span>执行频率</span>
                    <select
                      aria-label="执行频率"
                      value={scheduleForm.preset_type || 'daily'}
                      onChange={(event) => setScheduleForm((previous) => ({ ...previous, preset_type: event.target.value as SchedulePresetType }))}
                    >
                      <option value="daily">每天</option>
                      <option value="weekly">每周</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>执行时间</span>
                    <input
                      aria-label="执行时间"
                      type="time"
                      value={scheduleForm.time_of_day || '09:00'}
                      onChange={(event) => setScheduleForm((previous) => ({ ...previous, time_of_day: event.target.value }))}
                      required
                    />
                  </label>
                  {scheduleForm.task_type === 'prediction_generate' ? (
                    <label className="toggle-chip">
                      <input
                        type="checkbox"
                        checked={scheduleForm.overwrite_existing}
                        onChange={(event) => setScheduleForm((previous) => ({ ...previous, overwrite_existing: event.target.checked }))}
                      />
                      <span>覆盖已有预测</span>
                    </label>
                  ) : null}
                  {scheduleForm.preset_type === 'weekly' ? (
                    <div className="field field--full">
                      <span>执行日</span>
                      <div className="filter-chip-group">
                        {WEEKDAY_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={clsx('filter-chip', scheduleForm.weekdays.includes(option.value) && 'is-active')}
                            onClick={() => toggleScheduleWeekday(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <label className="field field--full">
                  <span>Cron 表达式</span>
                  <input
                    aria-label="Cron 表达式"
                    value={scheduleForm.cron_expression || ''}
                    onChange={(event) => setScheduleForm((previous) => ({ ...previous, cron_expression: event.target.value }))}
                    placeholder="例如 30 9 * * 1,3,5"
                    required
                  />
                </label>
              )}
              <label className="toggle-chip">
                <input
                  type="checkbox"
                  checked={scheduleForm.is_active}
                  onChange={(event) => setScheduleForm((previous) => ({ ...previous, is_active: event.target.checked }))}
                />
                <span>创建后立即启用</span>
              </label>
              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={saveScheduleTaskMutation.isPending}>
                  {selectedScheduleTask ? '保存任务' : '创建任务'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {generationModalOpen ? (
        <div className="modal-shell" role="presentation" onClick={() => setGenerationModalOpen(false)}>
          <div className="modal-card modal-card--form generation-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <form className="settings-form-grid generation-modal__form" onSubmit={submitGenerationForm}>
              <div className="modal-card__header generation-modal__header">
                <div className="generation-modal__header-main">
                  <p className="modal-card__eyebrow">预测生成</p>
                  <h3>{generationDisplayName}</h3>
                  <p className="generation-modal__lottery">
                    当前生成彩种：{getLotteryLabel(generationForm.lotteryCode)}
                  </p>
                </div>
                <button className="ghost-button" type="button" onClick={() => setGenerationModalOpen(false)}>关闭</button>
              </div>
              <section className="generation-modal__section generation-modal__section--config">
                <div className="generation-modal__section-title">
                  <strong>任务参数</strong>
                  <span>设置彩种、模式、覆盖策略与并发线程数。</span>
                </div>
                <div className="generation-modal__grid">
                  <label className="field">
                    <span>彩种</span>
                    <select value={generationForm.lotteryCode} aria-label="生成彩种" onChange={(event) => handleGenerationLotteryChange(event.target.value as LotteryCode)}>
                      <option value="dlt">大乐透</option>
                      <option value="pl3">排列3</option>
                      <option value="pl5">排列5</option>
                      <option value="qxc">七星彩</option>
                    </select>
                  </label>
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
                  {generationForm.lotteryCode === 'pl3' || generationForm.lotteryCode === 'dlt' || generationForm.lotteryCode === 'qxc' ? (
                    <label className="field">
                      <span>{generationForm.lotteryCode === 'pl3' ? '排列3预测玩法' : generationForm.lotteryCode === 'qxc' ? '七星彩预测玩法' : '大乐透预测玩法'}</span>
                      <select
                        value={generationForm.predictionPlayMode}
                        onChange={(event) => setGenerationForm((previous) => ({ ...previous, predictionPlayMode: event.target.value as ModelPredictionPlayMode }))}
                      >
                        {generationForm.lotteryCode === 'pl3' ? (
                          <>
                            <option value="direct">直选预测</option>
                            <option value="direct_sum">和值预测</option>
                          </>
                        ) : generationForm.lotteryCode === 'qxc' ? (
                          <>
                            <option value="direct">直选预测</option>
                            <option value="compound">复式预测</option>
                          </>
                        ) : (
                          <>
                            <option value="direct">普通预测</option>
                            <option value="compound">复式预测</option>
                            <option value="dantuo">胆拖预测</option>
                          </>
                        )}
                      </select>
                    </label>
                  ) : null}
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
                  <label className="field">
                    <span>并发线程数</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      step={1}
                      value={generationForm.parallelism}
                      onChange={(event) => setGenerationForm((previous) => ({ ...previous, parallelism: event.target.value }))}
                      placeholder="默认 3"
                    />
                  </label>
                </div>
                {generationForm.mode === 'history' ? (
                  <div className="generation-modal__history-grid">
                    <label className="field">
                      <span>历史范围</span>
                      <select
                        value={generationForm.historyRangeMode === 'recent' ? generationForm.recentPeriodCount : 'custom'}
                        aria-label="历史范围"
                        onChange={(event) => {
                          const nextValue = event.target.value
                          setGenerationForm((previous) => ({
                            ...previous,
                            historyRangeMode: nextValue === 'custom' ? 'custom' : 'recent',
                            recentPeriodCount: nextValue === 'custom' ? previous.recentPeriodCount : (nextValue as GenerationRecentPeriodCount),
                          }))
                        }}
                      >
                        <option value="custom">自定义</option>
                        {GENERATION_RECENT_PERIOD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>开始期号</span>
                      <input
                        value={generationForm.startPeriod}
                        onChange={(event) => setGenerationForm((previous) => ({ ...previous, startPeriod: event.target.value }))}
                        required={generationForm.historyRangeMode === 'custom'}
                        disabled={generationForm.historyRangeMode === 'recent'}
                      />
                    </label>
                    <label className="field">
                      <span>结束期号</span>
                      <input
                        value={generationForm.endPeriod}
                        onChange={(event) => setGenerationForm((previous) => ({ ...previous, endPeriod: event.target.value }))}
                        required={generationForm.historyRangeMode === 'custom'}
                        disabled={generationForm.historyRangeMode === 'recent'}
                      />
                    </label>
                  </div>
                ) : null}
                {generationFilterNotice ? <div className="settings-inline-hint generation-modal__hint">{generationFilterNotice}</div> : null}
                {!generationForm.modelCodes.length ? <div className="state-shell generation-modal__warning">当前彩种暂无可用模型，请切换彩种。</div> : null}
              </section>
              {generationTask ? (
                <section className="generation-modal__section generation-modal__section--task" aria-live="polite">
                  <div className="generation-modal__section-title">
                    <strong>任务状态</strong>
                    <span>创建后会持续刷新执行进度与失败明细。</span>
                  </div>
                  <section className="generation-task-panel">
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
                        <span>{generationTaskCompleted} / {generationTaskTotal || generationForm.modelCodes.length} 个{hasTaskGranularity ? '子任务' : '模型'}</span>
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
                          <span>{hasTaskGranularity ? '总子任务数' : '总模型数'}</span>
                        </article>
                        <article>
                          <strong>{generationTaskParallelism || '-'}</strong>
                          <span>并发线程数</span>
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
                        {hasTaskGranularity ? (
                          <>
                            <article>
                              <strong>{generationTask.progress_summary.task_processed_count || 0}</strong>
                              <span>子任务成功</span>
                            </article>
                            <article>
                              <strong>{generationTask.progress_summary.task_skipped_count || 0}</strong>
                              <span>子任务跳过</span>
                            </article>
                            <article>
                              <strong>{generationTask.progress_summary.task_failed_count || 0}</strong>
                              <span>子任务失败</span>
                            </article>
                          </>
                        ) : null}
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
                        <strong>{generationTaskParallelism || '-'}</strong>
                        <span>并发线程数</span>
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
                  )}
                  {generationTask.error_message ? <div className="state-shell state-shell--error">任务失败：{generationTask.error_message}</div> : null}
                  </section>
                </section>
              ) : null}
              <div className="form-actions generation-modal__actions">
                <button className="primary-button" type="submit" disabled={generatePredictionMutation.isPending || generationForm.modelCodes.length === 0}>创建任务</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

    </div>
  )
}
