import { NavLink } from 'react-router-dom'
import { useMemo, useState, type PropsWithChildren } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { SiteDisclaimer } from './SiteDisclaimer'
import type { LotteryCode } from '../types/api'
import { getDashboardLotteryFromPath, getDashboardPathForLottery } from '../../features/home/navigation'

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, hasPermission } = useAuth()
  const canOpenSettings = hasPermission('basic_profile')
  const [isLotteryListExpanded, setIsLotteryListExpanded] = useState(true)
  const isDashboardRoute = location.pathname.startsWith('/dashboard/')
  const dashboardLottery = getDashboardLotteryFromPath(location.pathname)
  const activeLottery = dashboardLottery || 'dlt'
  const lotteryItems = useMemo<Array<{ code: LotteryCode; label: string }>>(
    () => [
      { code: 'dlt', label: '超级大乐透' },
      { code: 'pl3', label: '排列三' },
      { code: 'pl5', label: '排列五' },
    ],
    [],
  )

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__mark">L</span>
          <div>
            <p className="app-header__eyebrow">LetouMe</p>
            <h1 className="app-header__title">大乐透 AI 控制台</h1>
          </div>
        </div>
        <nav className="app-nav">
          <NavLink className={({ isActive }) => `app-nav__link${isActive ? ' is-active' : ''}`} to="/dashboard">
            预测总览
          </NavLink>
          {canOpenSettings ? (
            <NavLink className={({ isActive }) => `app-nav__link${isActive ? ' is-active' : ''}`} to="/settings">
              设置中心
            </NavLink>
          ) : null}
          <span className="app-nav__meta">{user?.nickname || user?.username || '-'}</span>
          <button
            className="ghost-button"
            onClick={() => {
              void logout().then(() => navigate('/login', { replace: true }))
            }}
          >
            退出登录
          </button>
        </nav>
      </header>
      <main className={isDashboardRoute ? 'app-main app-main--with-dashboard-sidebar' : 'app-main'}>
        {isDashboardRoute ? (
          <aside className="app-dashboard-sidebar" aria-label="彩种导航">
            <button
              type="button"
              className="app-dashboard-sidebar__trigger"
              aria-expanded={isLotteryListExpanded}
              onClick={() => setIsLotteryListExpanded((value) => !value)}
            >
              彩种
            </button>
            {isLotteryListExpanded ? (
              <div className="app-dashboard-lottery-listbox" role="listbox" aria-label="彩种选择">
                {lotteryItems.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    role="option"
                    aria-selected={activeLottery === item.code}
                    className={`app-dashboard-lottery-listbox__option${activeLottery === item.code ? ' is-active' : ''}`}
                    onClick={() => navigate(getDashboardPathForLottery(location.pathname, item.code))}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </aside>
        ) : null}
        <div className="app-main__content">
          <SiteDisclaimer compact />
          {children}
        </div>
      </main>
    </div>
  )
}
