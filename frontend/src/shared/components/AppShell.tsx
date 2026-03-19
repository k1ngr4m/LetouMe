import { NavLink } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { SiteDisclaimer } from './SiteDisclaimer'

export function AppShell({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const { user, logout, hasPermission } = useAuth()
  const canOpenSettings = hasPermission('basic_profile')

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
      <main className="app-main">
        <SiteDisclaimer compact />
        {children}
      </main>
    </div>
  )
}
