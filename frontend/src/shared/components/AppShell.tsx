import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  CheckSquare,
  CircleDollarSign,
  Gauge,
  History,
  LogOut,
  Menu,
  Settings2,
  Sparkles,
  SunMoon,
  UserCog,
  UsersRound,
  WalletCards,
  Wrench,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../theme/ThemeProvider'
import { SiteDisclaimer } from './SiteDisclaimer'
import { UserAvatar } from './UserAvatar'
import { HOME_RULES_PATH, HOME_SMART_PREDICTION_PATH, HOME_TAB_PATHS, MESSAGE_CENTER_PATH } from '../../features/home/navigation'
import { useLotterySelection } from '../lottery/LotterySelectionProvider'
import { loadSidebarCollapsePreference, saveSidebarCollapsePreference } from '../lib/storage'
import { apiClient } from '../api/client'
import type { LotteryCode, MessageStatusFilter } from '../types/api'

const SETTINGS_PATHS = {
  profile: '/settings/profile',
  account: '/settings/account',
  models: '/settings/models',
  experts: '/settings/experts',
  maintenance: '/settings/maintenance',
  schedules: '/settings/schedules',
  users: '/settings/users',
  roles: '/settings/roles',
}
const LOTTERY_OPTIONS: Array<{ code: LotteryCode; label: string }> = [
  { code: 'dlt', label: '大乐透' },
  { code: 'pl3', label: '排列3' },
  { code: 'pl5', label: '排列5' },
  { code: 'qxc', label: '七星彩' },
]
const MESSAGE_BIZ_CODE = 'draw'
const MESSAGE_STATUS_OPTIONS: Array<{ value: MessageStatusFilter; label: string }> = [
  { value: 'unread', label: '未读消息' },
  { value: 'read', label: '已读消息' },
  { value: 'all', label: '全部消息' },
]

type SidebarPanelMode = 'workspace' | 'settings'

const CHART_CENTER_GROUPS = [
  {
    id: 'number-analysis',
    title: '号码分析',
    items: [
      { id: 'number-base', label: '基础分析' },
      { id: 'number-distribution', label: '分布分析' },
      { id: 'number-pattern', label: '形态分析' },
    ],
  },
  {
    id: 'backtest-analysis',
    title: '回溯分析',
    items: [
      { id: 'backtest-base', label: '基础趋势' },
      { id: 'backtest-revenue', label: '收益分析' },
      { id: 'backtest-stability', label: '稳定性分析' },
    ],
  },
] as const

function hasChartSubItems(
  group: (typeof CHART_CENTER_GROUPS)[number],
): group is Extract<(typeof CHART_CENTER_GROUPS)[number], { items: readonly { id: string; label: string }[] }> {
  return 'items' in group
}

function SidebarCollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 6h12" />
      <path d="M4 12h12" />
      <path d="M4 18h12" />
      <path d="m18 12 3-2.5v5L18 12Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function getLotteryLogoSrc(code: LotteryCode) {
  if (code === 'pl3') return '/lottery/pl3.png'
  if (code === 'pl5') return '/lottery/pl5.png'
  if (code === 'qxc') return '/lottery/qxc.png'
  return '/lottery/dlt.png'
}

function LotterySwitchIcon({ code, label }: { code: LotteryCode; label: string }) {
  return <img className="crm-lottery-picker__logo" src={getLotteryLogoSrc(code)} alt={label} loading="lazy" />
}

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedLottery, setSelectedLottery } = useLotterySelection()
  const { user, hasPermission, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isLotteryMenuOpen, setIsLotteryMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => loadSidebarCollapsePreference())
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isPredictionSubmenuOpen, setIsPredictionSubmenuOpen] = useState(true)
  const [isChartNumberMenuOpen, setIsChartNumberMenuOpen] = useState(true)
  const [isChartBacktestMenuOpen, setIsChartBacktestMenuOpen] = useState(true)
  const lotteryMenuRef = useRef<HTMLDivElement | null>(null)
  const userMenuRef = useRef<HTMLDivElement | null>(null)

  const canOpenSettings = hasPermission('basic_profile')
  const canManageModels = hasPermission('model_management')
  const canManageExperts = hasPermission('expert_management')
  const canManageSchedules = hasPermission('schedule_management')
  const canManageUsers = hasPermission('user_management')
  const canManageRoles = hasPermission('role_management')
  const isSettingsRoute = location.pathname.startsWith('/settings')
  const isDashboardRoute = location.pathname.startsWith('/dashboard')
  const isChartCenterRoute = location.pathname === HOME_TAB_PATHS.charts
  const isMessageCenterRoute = location.pathname === MESSAGE_CENTER_PATH
  const isPredictionRoute = location.pathname === HOME_TAB_PATHS.prediction
  const isSmartPredictionRoute = location.pathname === HOME_SMART_PREDICTION_PATH
  const canUseSmartPrediction = user?.role === 'super_admin'
  const activePredictionSubsection = location.hash === '#weights' ? 'weights' : 'models'
  const [sidebarMode, setSidebarMode] = useState<SidebarPanelMode>(
    canOpenSettings && isSettingsRoute ? 'settings' : 'workspace',
  )

  const nextThemeLabel = theme === 'dark' ? '切换浅色' : '切换深色'
  const displayName = user?.nickname || user?.username || '-'
  const selectedLotteryLabel = useMemo(
    () => LOTTERY_OPTIONS.find((item) => item.code === selectedLottery)?.label || '大乐透',
    [selectedLottery],
  )
  const messageUnreadCountQuery = useQuery({
    queryKey: ['messages', 'unread-count'],
    queryFn: async () => {
      try {
        return await apiClient.getMessageUnreadCount()
      } catch {
        return { unread_count: 0 }
      }
    },
    staleTime: 20_000,
    refetchInterval: 30_000,
  })
  const unreadCount = Math.max(0, Number(messageUnreadCountQuery.data?.unread_count || 0))
  const unreadCountLabel = unreadCount > 99 ? '99+' : `${unreadCount}`
  const messageSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search])
  const messageStatus = useMemo<MessageStatusFilter>(() => {
    const status = messageSearchParams.get('status')
    return status === 'read' || status === 'all' || status === 'unread' ? status : 'unread'
  }, [messageSearchParams])
  const messageBiz = MESSAGE_BIZ_CODE

  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith('/settings')) return '设置中心'
    if (location.pathname === HOME_TAB_PATHS.charts) return '图表中心'
    if (location.pathname === HOME_TAB_PATHS.history) return '开奖回溯'
    if (location.pathname === HOME_TAB_PATHS.simulation) return '模拟试玩'
    if (location.pathname === HOME_TAB_PATHS['my-bets']) return '我的投注'
    if (location.pathname === HOME_RULES_PATH) return '规则说明'
    if (location.pathname === HOME_SMART_PREDICTION_PATH) return '智能预测'
    if (location.pathname === MESSAGE_CENTER_PATH) return '消息中心'
    return '预测总览'
  }, [location.pathname])

  const pageSubtitle = useMemo(() => {
    if (location.pathname.startsWith('/settings')) return '模型、用户与任务管理'
    if (location.pathname === MESSAGE_CENTER_PATH) return '开奖通知与站内信'
    return '预测工作台'
  }, [location.pathname])

  const onNavigate = () => {
    setIsSidebarOpen(false)
  }

  useEffect(() => {
    saveSidebarCollapsePreference(isSidebarCollapsed)
  }, [isSidebarCollapsed])

  useEffect(() => {
    if (!canOpenSettings) {
      setSidebarMode('workspace')
      return
    }
    if (isSettingsRoute) {
      setSidebarMode('settings')
      return
    }
    setSidebarMode('workspace')
  }, [canOpenSettings, isSettingsRoute])

  useEffect(() => {
    setIsLotteryMenuOpen(false)
    setIsUserMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    const isNumberHash = ['#number-base', '#number-distribution', '#number-pattern'].includes(location.hash)
    const isBacktestHash = ['#backtest-base', '#backtest-revenue', '#backtest-stability'].includes(location.hash)
    if (isNumberHash) {
      setIsChartNumberMenuOpen(true)
    }
    if (isBacktestHash) {
      setIsChartBacktestMenuOpen(true)
    }
  }, [location.hash])

  useEffect(() => {
    if (!isLotteryMenuOpen) return

    function handleDocumentClick(event: MouseEvent) {
      if (!(event.target instanceof Node)) return
      if (!lotteryMenuRef.current?.contains(event.target)) {
        setIsLotteryMenuOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsLotteryMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isLotteryMenuOpen])

  useEffect(() => {
    if (!isUserMenuOpen) return

    function handleDocumentClick(event: MouseEvent) {
      if (!(event.target instanceof Node)) return
      if (!userMenuRef.current?.contains(event.target)) {
        setIsUserMenuOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isUserMenuOpen])

  function openWorkspaceCenter() {
    setSidebarMode('workspace')
    setIsSidebarOpen(false)
    navigate(HOME_TAB_PATHS.prediction)
  }

  function openChartCenter() {
    setSidebarMode('workspace')
    setIsSidebarOpen(false)
    navigate(`${HOME_TAB_PATHS.charts}#number-base`)
  }

  function openSettingsCenter() {
    if (!canOpenSettings) return
    setSidebarMode('settings')
    setIsSidebarOpen(true)
    navigate(SETTINGS_PATHS.profile)
  }

  function handleLotterySelect(lotteryCode: LotteryCode) {
    setSelectedLottery(lotteryCode)
    setIsLotteryMenuOpen(false)
  }

  function onWorkspaceNavigate() {
    setSidebarMode('workspace')
    onNavigate()
  }

  function onSettingsNavigate() {
    setSidebarMode('settings')
    onNavigate()
  }

  function openChartDirectoryItem(itemId: string) {
    setSidebarMode('workspace')
    setIsSidebarOpen(false)
    navigate(`${HOME_TAB_PATHS.charts}#${itemId}`)
  }

  function buildMessageCenterSearch(status: MessageStatusFilter, biz: string = MESSAGE_BIZ_CODE) {
    const params = new URLSearchParams()
    params.set('status', status)
    params.set('biz', biz)
    return `?${params.toString()}`
  }

  function onMessageCenterNav(status: MessageStatusFilter) {
    setSidebarMode('workspace')
    setIsSidebarOpen(false)
    navigate({
      pathname: MESSAGE_CENTER_PATH,
      search: buildMessageCenterSearch(status, messageBiz),
    })
  }

  function openMessageCenter() {
    setSidebarMode('workspace')
    setIsSidebarOpen(false)
    navigate({
      pathname: MESSAGE_CENTER_PATH,
      search: buildMessageCenterSearch('unread', MESSAGE_BIZ_CODE),
    })
  }

  function toggleSidebarCollapsed() {
    setIsSidebarCollapsed((current) => !current)
  }

  async function handleLogout() {
    setIsUserMenuOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={clsx('app-shell crm-shell', isSidebarCollapsed && 'is-sidebar-collapsed')}>
      <aside className={clsx('crm-sidebar', isSidebarOpen && 'is-open')} aria-label="主导航">
        <div className="crm-sidebar__brand">
          <img className="crm-sidebar__brand-mark" src="/LetouMe_ico.png" alt="LetouMe 图标" />
          <div className="crm-sidebar__brand-copy">
            <p className="crm-sidebar__brand-eyebrow" title="LetouMe">LetouMe</p>
            <h1 className="crm-sidebar__brand-title" title="乐透么">乐透么</h1>
          </div>
        </div>

        <nav className="crm-sidebar__nav">
          {isMessageCenterRoute ? (
            <>
              <p className="crm-sidebar__group-title">消息中心</p>
              {MESSAGE_STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={clsx('crm-message-nav-item', messageStatus === option.value && 'is-active')}
                  title={option.label}
                  onClick={() => onMessageCenterNav(option.value)}
                >
                  <span>{option.label}</span>
                  {option.value === 'unread' && unreadCount > 0 ? <em>{unreadCountLabel}</em> : null}
                </button>
              ))}
              <div className="crm-message-nav-divider" />
              <p className="crm-sidebar__group-title">业务消息</p>
              <button type="button" className="crm-message-nav-item is-active" title="开奖通知" onClick={() => onMessageCenterNav(messageStatus)}>
                <span>开奖通知</span>
              </button>
            </>
          ) : sidebarMode === 'workspace' && isChartCenterRoute ? (
            <>
              <p className="crm-sidebar__group-title">图表中心</p>
              <div className={clsx('crm-lottery-picker', isLotteryMenuOpen && 'is-open')} ref={lotteryMenuRef}>
                <button
                  className="crm-lottery-picker__trigger"
                  type="button"
                  aria-label="彩种切换"
                  title={`彩种切换：${selectedLotteryLabel}`}
                  aria-expanded={isLotteryMenuOpen}
                  aria-haspopup="menu"
                  onClick={() => setIsLotteryMenuOpen((current) => !current)}
                >
                  <LotterySwitchIcon code={selectedLottery} label={selectedLotteryLabel} />
                  <span className="crm-lottery-picker__label">{selectedLotteryLabel}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {isLotteryMenuOpen ? (
                  <div className="crm-lottery-picker__menu" role="menu" aria-label="彩种菜单">
                    {LOTTERY_OPTIONS.map((item) => (
                      <button
                        key={item.code}
                        className={clsx('crm-lottery-picker__option', selectedLottery === item.code && 'is-active')}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selectedLottery === item.code}
                        title={item.label}
                        onClick={() => handleLotterySelect(item.code)}
                      >
                        <LotterySwitchIcon code={item.code} label={item.label} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="crm-chart-nav" aria-label="图表目录">
                {CHART_CENTER_GROUPS.filter(hasChartSubItems).map((group) => (
                  <div
                    key={group.id}
                    className={clsx(
                      'crm-chart-nav__group',
                      (
                        group.id === 'number-analysis'
                          ? ['#number-base', '#number-distribution', '#number-pattern']
                          : ['#backtest-base', '#backtest-revenue', '#backtest-stability']
                      ).includes(location.hash) && 'is-active',
                    )}
                  >
                    <div
                      className={clsx(
                        'crm-nav-item',
                        'crm-nav-item--with-toggle',
                        'crm-chart-nav__group-head',
                        'crm-chart-nav__item',
                        (
                          group.id === 'number-analysis'
                            ? ['#number-base', '#number-distribution', '#number-pattern']
                            : ['#backtest-base', '#backtest-revenue', '#backtest-stability']
                        ).includes(location.hash) && 'is-active',
                      )}
                      title={group.title}
                    >
                      <button className="crm-nav-item__main" type="button" onClick={() => openChartDirectoryItem(group.items[0].id)}>
                        <span className="crm-chart-nav__group-mark" aria-hidden="true" />
                        <span>{group.title}</span>
                      </button>
                      <button
                        className={clsx('crm-nav-submenu__toggle', (group.id === 'number-analysis' ? isChartNumberMenuOpen : isChartBacktestMenuOpen) && 'is-open')}
                        type="button"
                        aria-label={
                          group.id === 'number-analysis'
                            ? (isChartNumberMenuOpen ? '收起号码分析目录' : '展开号码分析目录')
                            : (isChartBacktestMenuOpen ? '收起回溯分析目录' : '展开回溯分析目录')
                        }
                        title={
                          group.id === 'number-analysis'
                            ? (isChartNumberMenuOpen ? '收起号码分析目录' : '展开号码分析目录')
                            : (isChartBacktestMenuOpen ? '收起回溯分析目录' : '展开回溯分析目录')
                        }
                        aria-controls={group.id === 'number-analysis' ? 'chart-number-submenu' : 'chart-backtest-submenu'}
                        aria-expanded={group.id === 'number-analysis' ? isChartNumberMenuOpen : isChartBacktestMenuOpen}
                        onClick={() =>
                          group.id === 'number-analysis'
                            ? setIsChartNumberMenuOpen((current) => !current)
                            : setIsChartBacktestMenuOpen((current) => !current)
                        }
                      >
                        <ChevronDown size={14} aria-hidden="true" />
                      </button>
                    </div>
                    <div
                      className={clsx(
                        'crm-nav-submenu',
                        'crm-chart-nav__submenu',
                        !(group.id === 'number-analysis' ? isChartNumberMenuOpen : isChartBacktestMenuOpen) && 'is-collapsed',
                      )}
                      id={group.id === 'number-analysis' ? 'chart-number-submenu' : 'chart-backtest-submenu'}
                      aria-label={group.id === 'number-analysis' ? '号码分析子菜单' : '回溯分析子菜单'}
                      aria-hidden={!(group.id === 'number-analysis' ? isChartNumberMenuOpen : isChartBacktestMenuOpen)}
                    >
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={clsx('crm-nav-submenu__item', 'crm-chart-nav__subitem', location.hash === `#${item.id}` && 'is-active')}
                          title={item.label}
                          aria-current={location.hash === `#${item.id}` ? 'page' : undefined}
                          onClick={() => openChartDirectoryItem(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : sidebarMode === 'workspace' ? (
            <>
              <p className="crm-sidebar__group-title">工作台</p>
              {isDashboardRoute ? (
                <div className={clsx('crm-lottery-picker', isLotteryMenuOpen && 'is-open')} ref={lotteryMenuRef}>
                  <button
                    className="crm-lottery-picker__trigger"
                    type="button"
                    aria-label="彩种切换"
                    title={`彩种切换：${selectedLotteryLabel}`}
                    aria-expanded={isLotteryMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setIsLotteryMenuOpen((current) => !current)}
                  >
                    <LotterySwitchIcon code={selectedLottery} label={selectedLotteryLabel} />
                    <span className="crm-lottery-picker__label">{selectedLotteryLabel}</span>
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                  {isLotteryMenuOpen ? (
                    <div className="crm-lottery-picker__menu" role="menu" aria-label="彩种菜单">
                      {LOTTERY_OPTIONS.map((item) => (
                        <button
                          key={item.code}
                          className={clsx('crm-lottery-picker__option', selectedLottery === item.code && 'is-active')}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selectedLottery === item.code}
                          title={item.label}
                          onClick={() => handleLotterySelect(item.code)}
                        >
                          <LotterySwitchIcon code={item.code} label={item.label} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {isPredictionRoute ? (
                <div className="crm-nav-item crm-nav-item--with-toggle is-active" title="预测总览">
                  <button className="crm-nav-item__main" type="button" onClick={() => navigate(HOME_TAB_PATHS.prediction)}>
                    <Sparkles size={16} aria-hidden="true" />
                    <span>预测总览</span>
                  </button>
                  <button
                    className={clsx('crm-nav-submenu__toggle', isPredictionSubmenuOpen && 'is-open')}
                    type="button"
                    aria-label={isPredictionSubmenuOpen ? '收起二级菜单' : '展开二级菜单'}
                    title={isPredictionSubmenuOpen ? '收起二级菜单' : '展开二级菜单'}
                    aria-controls="prediction-submenu"
                    aria-expanded={isPredictionSubmenuOpen}
                    onClick={() => setIsPredictionSubmenuOpen((current) => !current)}
                  >
                    <ChevronDown size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.prediction} onClick={onWorkspaceNavigate} title="预测总览">
                  <Sparkles size={16} aria-hidden="true" />
                  <span>预测总览</span>
                </NavLink>
              )}
              {isPredictionRoute ? (
                <div
                  className={clsx('crm-nav-submenu', !isPredictionSubmenuOpen && 'is-collapsed')}
                  id="prediction-submenu"
                  aria-label="预测总览二级菜单"
                  aria-hidden={!isPredictionSubmenuOpen}
                >
                  <NavLink
                    className={clsx('crm-nav-submenu__item', activePredictionSubsection === 'models' && 'is-active')}
                    to={`${HOME_TAB_PATHS.prediction}#models`}
                    onClick={onWorkspaceNavigate}
                    title="模型列表"
                  >
                    模型列表
                  </NavLink>
                  <NavLink
                    className={clsx('crm-nav-submenu__item', activePredictionSubsection === 'weights' && 'is-active')}
                    to={`${HOME_TAB_PATHS.prediction}#weights`}
                    onClick={onWorkspaceNavigate}
                    title="预测统计"
                  >
                    预测统计
                  </NavLink>
                </div>
              ) : null}
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.simulation} onClick={onWorkspaceNavigate} title="模拟试玩">
                <CircleDollarSign size={16} aria-hidden="true" />
                <span>模拟试玩</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.history} onClick={onWorkspaceNavigate} title="开奖回溯">
                <History size={16} aria-hidden="true" />
                <span>开奖回溯</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS['my-bets']} onClick={onWorkspaceNavigate} title="我的投注">
                <WalletCards size={16} aria-hidden="true" />
                <span>我的投注</span>
              </NavLink>
              {canUseSmartPrediction ? (
                <NavLink
                  className={({ isActive }) => `crm-nav-item${isActive || isSmartPredictionRoute ? ' is-active' : ''}`}
                  to={HOME_SMART_PREDICTION_PATH}
                  onClick={onWorkspaceNavigate}
                  title="智能预测"
                >
                  <Sparkles size={16} aria-hidden="true" />
                  <span>智能预测</span>
                </NavLink>
              ) : null}
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_RULES_PATH} onClick={onWorkspaceNavigate} title="规则说明">
                <BookOpen size={16} aria-hidden="true" />
                <span>规则说明</span>
              </NavLink>
            </>
          ) : canOpenSettings ? (
            <>
              <p className="crm-sidebar__group-title">设置中心</p>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.profile} onClick={onSettingsNavigate} title="个人资料">
                <Settings2 size={16} aria-hidden="true" />
                <span>个人资料</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.account} onClick={onSettingsNavigate} title="账户管理">
                <UserCog size={16} aria-hidden="true" />
                <span>账户管理</span>
              </NavLink>
              {canManageModels ? (
                <>
                  <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.models} onClick={onSettingsNavigate} title="模型管理">
                    <Gauge size={16} aria-hidden="true" />
                    <span>模型管理</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.maintenance} onClick={onSettingsNavigate} title="维护记录">
                    <Wrench size={16} aria-hidden="true" />
                    <span>维护记录</span>
                  </NavLink>
                </>
              ) : null}
              {canManageExperts ? (
                <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.experts} onClick={onSettingsNavigate} title="专家管理">
                  <Sparkles size={16} aria-hidden="true" />
                  <span>专家管理</span>
                </NavLink>
              ) : null}
              {canManageSchedules ? (
                <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.schedules} onClick={onSettingsNavigate} title="任务调度">
                  <CheckSquare size={16} aria-hidden="true" />
                  <span>任务调度</span>
                </NavLink>
              ) : null}
              {canManageUsers ? (
                <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.users} onClick={onSettingsNavigate} title="用户管理">
                  <UsersRound size={16} aria-hidden="true" />
                  <span>用户管理</span>
                </NavLink>
              ) : null}
              {canManageRoles ? (
                <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.roles} onClick={onSettingsNavigate} title="角色权限">
                  <UserCog size={16} aria-hidden="true" />
                  <span>角色权限</span>
                </NavLink>
              ) : null}
            </>
          ) : null}
        </nav>

        <div className="crm-sidebar__footer">
          <button
            className="crm-sidebar__collapse-btn"
            type="button"
            title={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-label={isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-pressed={isSidebarCollapsed}
            onClick={toggleSidebarCollapsed}
          >
            <SidebarCollapseIcon />
          </button>
        </div>
      </aside>

      <div className={clsx('crm-sidebar-overlay', isSidebarOpen && 'is-open')} onClick={() => setIsSidebarOpen(false)} aria-hidden="true" />

      <div className="crm-workspace">
        <header className="crm-topbar">
          <div className="crm-topbar__meta">
            <button
              className="crm-topbar__icon-btn crm-topbar__menu-btn"
              type="button"
              aria-label="切换导航"
              title="切换导航"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
            >
              <Menu size={18} aria-hidden="true" />
            </button>
            <div>
              <p className="crm-topbar__eyebrow">{pageSubtitle}</p>
              <h2 className="crm-topbar__title">{pageTitle}</h2>
            </div>
          </div>
          <div className="crm-topbar__workspace-actions">
            <button
              className={clsx('crm-topbar__workspace-btn', isDashboardRoute && !isChartCenterRoute && 'is-active')}
              type="button"
              onClick={openWorkspaceCenter}
              aria-label="工作台"
              title="工作台"
            >
              <Gauge size={15} aria-hidden="true" className="crm-topbar__workspace-icon" />
              <span className="crm-topbar__workspace-label">工作台</span>
            </button>
            <button
              className={clsx('crm-topbar__workspace-btn crm-topbar__workspace-btn--secondary', location.pathname === HOME_TAB_PATHS.charts && 'is-active')}
              type="button"
              onClick={openChartCenter}
              aria-label="图表中心"
              title="图表中心"
            >
              <BarChart3 size={15} aria-hidden="true" className="crm-topbar__workspace-icon" />
              <span className="crm-topbar__workspace-label">图表中心</span>
            </button>
          </div>

          <nav className="crm-topbar__actions" aria-label="快捷入口">
            <button
              className={clsx('crm-topbar__icon-btn crm-topbar__icon-btn--with-badge', location.pathname === MESSAGE_CENTER_PATH && 'is-active')}
              type="button"
              aria-label="消息中心"
              title="消息中心"
              onClick={openMessageCenter}
            >
              <Bell size={16} aria-hidden="true" />
              {unreadCount > 0 ? <span className="crm-topbar__badge">{unreadCountLabel}</span> : null}
            </button>
            {canOpenSettings ? (
              <div className="crm-topbar__settings-entry">
                <button
                  className={clsx('crm-topbar__icon-btn', sidebarMode === 'settings' && 'is-active')}
                  type="button"
                  onClick={openSettingsCenter}
                  aria-label="设置中心"
                  title="设置中心"
                >
                  <Settings2 size={16} aria-hidden="true" />
                </button>
                <span className="crm-topbar__settings-tooltip">管理中心</span>
              </div>
            ) : null}
            <button className="crm-topbar__icon-btn" type="button" onClick={toggleTheme} aria-label={nextThemeLabel} title={nextThemeLabel}>
              <SunMoon size={16} aria-hidden="true" />
            </button>
            <div className={clsx('crm-topbar__user-entry', isUserMenuOpen && 'is-open')} ref={userMenuRef}>
              <button
                className="crm-topbar__user"
                type="button"
                aria-label="用户菜单"
                aria-expanded={isUserMenuOpen}
                aria-haspopup="menu"
                onClick={() => setIsUserMenuOpen((current) => !current)}
              >
                <UserAvatar avatarUrl={user?.avatar_url} displayName={displayName} className="crm-topbar__user-avatar" />
                <span>{displayName}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              {isUserMenuOpen ? (
                <div className="crm-topbar__user-menu" role="menu" aria-label="用户菜单">
                  <button className="crm-topbar__user-menu-item" type="button" role="menuitem" onClick={() => void handleLogout()}>
                    <LogOut size={14} aria-hidden="true" />
                    <span>退出登录</span>
                  </button>
                </div>
              ) : null}
            </div>
          </nav>
        </header>

        <main className="app-main crm-main">
          <SiteDisclaimer compact />
          {children}
        </main>
      </div>
    </div>
  )
}
