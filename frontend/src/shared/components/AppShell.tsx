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

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedLottery, setSelectedLottery } = useLotterySelection()
  const { user, logout, hasPermission } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [activePlaceholderPanel, setActivePlaceholderPanel] = useState<PlaceholderPanelKey>(null)
  const [isLotteryMenuOpen, setIsLotteryMenuOpen] = useState(false)
  const lotteryMenuRef = useRef<HTMLDivElement | null>(null)

  const canOpenSettings = hasPermission('basic_profile')
  const canManageModels = hasPermission('model_management')
  const canManageSchedules = hasPermission('schedule_management')
  const canManageUsers = hasPermission('user_management')
  const canManageRoles = hasPermission('role_management')
  const isSettingsRoute = location.pathname.startsWith('/settings')
  const isDashboardRoute = location.pathname.startsWith('/dashboard')
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

  return (
    <div className="app-shell crm-shell">
      <aside className={clsx('crm-sidebar', isSidebarOpen && 'is-open')} aria-label="主导航">
        <div className="crm-sidebar__brand">
          <span className="crm-sidebar__brand-mark">L</span>
          <div>
            <p className="crm-sidebar__brand-eyebrow">LetouMe</p>
            <h1 className="crm-sidebar__brand-title">乐透么</h1>
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
                    aria-expanded={isLotteryMenuOpen}
                    aria-haspopup="menu"
                    onClick={() => setIsLotteryMenuOpen((current) => !current)}
                  >
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
                          onClick={() => handleLotterySelect(item.code)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.prediction} onClick={onWorkspaceNavigate}>
                <Sparkles size={16} aria-hidden="true" />
                <span>预测总览</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.simulation} onClick={onWorkspaceNavigate}>
                <CircleDollarSign size={16} aria-hidden="true" />
                <span>模拟试玩</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.analysis} onClick={onWorkspaceNavigate}>
                <ChartColumnIncreasing size={16} aria-hidden="true" />
                <span>图表分析</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS.history} onClick={onWorkspaceNavigate}>
                <History size={16} aria-hidden="true" />
                <span>历史回溯</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_TAB_PATHS['my-bets']} onClick={onWorkspaceNavigate}>
                <WalletCards size={16} aria-hidden="true" />
                <span>我的投注</span>
              </NavLink>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={HOME_RULES_PATH} onClick={onWorkspaceNavigate}>
                <BookOpen size={16} aria-hidden="true" />
                <span>规则说明</span>
              </NavLink>
            </>
          ) : canOpenSettings ? (
            <>
              <p className="crm-sidebar__group-title">设置中心</p>
              <button className="crm-sidebar__back" type="button" onClick={openWorkspaceCenter}>
                <ArrowLeft size={16} aria-hidden="true" />
                <span>返回工作台</span>
              </button>
              <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.profile} onClick={onSettingsNavigate}>
                <Settings2 size={16} aria-hidden="true" />
                <span>基本设置</span>
              </NavLink>
              {canManageModels ? (
                <>
                  <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.models} onClick={onSettingsNavigate}>
                    <Gauge size={16} aria-hidden="true" />
                    <span>模型管理</span>
                  </NavLink>
                  <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.maintenance} onClick={onSettingsNavigate}>
                    <Wrench size={16} aria-hidden="true" />
                    <span>维护记录</span>
                  </NavLink>
                </>
              ) : null}
              {canManageSchedules ? (
                <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.schedules} onClick={onSettingsNavigate}>
                  <CheckSquare size={16} aria-hidden="true" />
                  <span>任务调度</span>
                </NavLink>
              ) : null}
              {canManageUsers ? (
                <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.users} onClick={onSettingsNavigate}>
                  <UsersRound size={16} aria-hidden="true" />
                  <span>用户管理</span>
                </NavLink>
              ) : null}
              {canManageRoles ? (
                <NavLink className={({ isActive }) => `crm-nav-item${isActive ? ' is-active' : ''}`} to={SETTINGS_PATHS.roles} onClick={onSettingsNavigate}>
                  <UserCog size={16} aria-hidden="true" />
                  <span>角色权限</span>
                </NavLink>
              ) : null}
            </>
          ) : null}
        </nav>

        <div className="crm-sidebar__footer">
          <button className="crm-logout-btn" type="button" onClick={() => void logout().then(() => navigate('/login', { replace: true }))}>
            <LogOut size={16} aria-hidden="true" />
            <span>退出登录</span>
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
            <span className="crm-topbar__user">{displayName}</span>
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
