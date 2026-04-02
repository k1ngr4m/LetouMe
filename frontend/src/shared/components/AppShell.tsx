import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import clsx from 'clsx'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bell,
  BookOpen,
  ChartColumnIncreasing,
  ChevronDown,
  CheckSquare,
  CircleDollarSign,
  Gauge,
  Grid2x2,
  History,
  LayoutGrid,
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
import { HOME_RULES_PATH, HOME_TAB_PATHS } from '../../features/home/navigation'
import { useLotterySelection } from '../lottery/LotterySelectionProvider'
import { loadSidebarCollapsePreference, saveSidebarCollapsePreference } from '../lib/storage'
import type { LotteryCode } from '../types/api'

const SETTINGS_PATHS = {
  profile: '/settings/profile',
  models: '/settings/models',
  maintenance: '/settings/maintenance',
  schedules: '/settings/schedules',
  users: '/settings/users',
  roles: '/settings/roles',
}
const LOTTERY_OPTIONS: Array<{ code: LotteryCode; label: string }> = [
  { code: 'dlt', label: '大乐透' },
  { code: 'pl3', label: '排列3' },
  { code: 'pl5', label: '排列5' },
]

type PlaceholderPanelKey = 'messages' | 'todos' | 'apps' | null
type SidebarPanelMode = 'workspace' | 'settings'

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

function LotterySwitchIcon({ code }: { code: LotteryCode }) {
  if (code === 'pl3') {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2.8" y="8.2" width="3.2" height="3.2" rx="0.7" />
        <rect x="8.4" y="8.2" width="3.2" height="3.2" rx="0.7" />
        <rect x="14" y="8.2" width="3.2" height="3.2" rx="0.7" />
      </svg>
    )
  }
  if (code === 'pl5') {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="3.6" cy="10" r="1.2" />
        <circle cx="7.8" cy="10" r="1.2" />
        <circle cx="10" cy="10" r="1.2" />
        <circle cx="12.2" cy="10" r="1.2" />
        <circle cx="16.4" cy="10" r="1.2" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6.4" cy="10" r="2.4" />
      <circle cx="13.6" cy="10" r="2.4" />
      <path d="M8.8 10h2.4" />
    </svg>
  )
}

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedLottery, setSelectedLottery } = useLotterySelection()
  const { user, hasPermission, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [activePlaceholderPanel, setActivePlaceholderPanel] = useState<PlaceholderPanelKey>(null)
  const [isLotteryMenuOpen, setIsLotteryMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => loadSidebarCollapsePreference())
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const lotteryMenuRef = useRef<HTMLDivElement | null>(null)
  const userMenuRef = useRef<HTMLDivElement | null>(null)

  const canOpenSettings = hasPermission('basic_profile')
  const canManageModels = hasPermission('model_management')
  const canManageSchedules = hasPermission('schedule_management')
  const canManageUsers = hasPermission('user_management')
  const canManageRoles = hasPermission('role_management')
  const isSettingsRoute = location.pathname.startsWith('/settings')
  const isDashboardRoute = location.pathname.startsWith('/dashboard')
  const isPredictionRoute = location.pathname === HOME_TAB_PATHS.prediction
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

  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith('/settings')) return '设置中心'
    if (location.pathname === HOME_TAB_PATHS.analysis) return '图表分析'
    if (location.pathname === HOME_TAB_PATHS.history) return '历史回溯'
    if (location.pathname === HOME_TAB_PATHS.simulation) return '模拟试玩'
    if (location.pathname === HOME_TAB_PATHS['my-bets']) return '我的投注'
    if (location.pathname === HOME_RULES_PATH) return '规则说明'
    return '预测总览'
  }, [location.pathname])

  const pageSubtitle = useMemo(() => {
    if (location.pathname.startsWith('/settings')) return '模型、用户与任务管理'
    return '预测工作台'
  }, [location.pathname])

  const placeholderPanelTitle = useMemo(() => {
    if (activePlaceholderPanel === 'messages') return '消息中心即将上线'
    if (activePlaceholderPanel === 'todos') return '待办中心即将上线'
    if (activePlaceholderPanel === 'apps') return '应用菜单即将上线'
    return ''
  }, [activePlaceholderPanel])

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
    }
  }, [canOpenSettings, isSettingsRoute])

  useEffect(() => {
    setIsLotteryMenuOpen(false)
    setIsUserMenuOpen(false)
  }, [location.pathname])

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

  function openPlaceholderPanel(panel: Exclude<PlaceholderPanelKey, null>) {
    setActivePlaceholderPanel((current) => (current === panel ? null : panel))
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
          <span className="crm-sidebar__brand-mark">L</span>
          <div className="crm-sidebar__brand-copy">
            <p className="crm-sidebar__brand-eyebrow" title="LetouMe">LetouMe</p>
            <h1 className="crm-sidebar__brand-title" title="乐透么">乐透么</h1>
          </div>
        </div>

        <nav className="crm-sidebar__nav">
          {sidebarMode === 'workspace' ? (
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
                    <LotterySwitchIcon code={selectedLottery} />
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
                          <LotterySwitchIcon code={item.code} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.prediction} onClick={onWorkspaceNavigate} title="预测总览">
                <Sparkles size={16} aria-hidden="true" />
                <span>预测总览</span>
              </NavLink>
              {isPredictionRoute ? (
                <div className="crm-nav-submenu" aria-label="预测总览二级菜单">
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
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.analysis} onClick={onWorkspaceNavigate} title="图表分析">
                <ChartColumnIncreasing size={16} aria-hidden="true" />
                <span>图表分析</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.history} onClick={onWorkspaceNavigate} title="历史回溯">
                <History size={16} aria-hidden="true" />
                <span>历史回溯</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS['my-bets']} onClick={onWorkspaceNavigate} title="我的投注">
                <WalletCards size={16} aria-hidden="true" />
                <span>我的投注</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_RULES_PATH} onClick={onWorkspaceNavigate} title="规则说明">
                <BookOpen size={16} aria-hidden="true" />
                <span>规则说明</span>
              </NavLink>
            </>
          ) : canOpenSettings ? (
            <>
              <p className="crm-sidebar__group-title">设置中心</p>
              <button className="crm-sidebar__back" type="button" title="返回工作台" onClick={openWorkspaceCenter}>
                <ArrowLeft size={16} aria-hidden="true" />
                <span>返回工作台</span>
              </button>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.profile} onClick={onSettingsNavigate} title="基本设置">
                <Settings2 size={16} aria-hidden="true" />
                <span>基本设置</span>
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

          <nav className="crm-topbar__actions" aria-label="快捷入口">
            <button
              className={clsx('crm-topbar__icon-btn', activePlaceholderPanel === 'messages' && 'is-active')}
              type="button"
              aria-label="消息中心"
              title="消息中心"
              onClick={() => openPlaceholderPanel('messages')}
            >
              <Bell size={16} aria-hidden="true" />
            </button>
            <button
              className={clsx('crm-topbar__icon-btn', activePlaceholderPanel === 'todos' && 'is-active')}
              type="button"
              aria-label="待办中心"
              title="待办中心"
              onClick={() => openPlaceholderPanel('todos')}
            >
              <CheckSquare size={16} aria-hidden="true" />
            </button>
            <button
              className={clsx('crm-topbar__icon-btn', activePlaceholderPanel === 'apps' && 'is-active')}
              type="button"
              aria-label="应用菜单"
              title="应用菜单"
              onClick={() => openPlaceholderPanel('apps')}
            >
              <Grid2x2 size={16} aria-hidden="true" />
            </button>
            {canOpenSettings ? (
              <div className={clsx('crm-topbar__settings-entry', sidebarMode === 'settings' && 'is-open')}>
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

        {activePlaceholderPanel ? (
          <section className="crm-placeholder-panel" role="status" aria-live="polite">
            <LayoutGrid size={16} aria-hidden="true" />
            <span>{placeholderPanelTitle}</span>
          </section>
        ) : null}

        <main className="app-main crm-main">
          <SiteDisclaimer compact />
          {children}
        </main>
      </div>
    </div>
  )
}
