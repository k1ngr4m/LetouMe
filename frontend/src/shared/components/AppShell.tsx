import { NavLink } from 'react-router-dom'
import type { PropsWithChildren } from 'react'

export function AppShell({ children }: PropsWithChildren) {
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
          <NavLink className={({ isActive }) => `app-nav__link${isActive ? ' is-active' : ''}`} to="/">
            预测总览
          </NavLink>
          <NavLink className={({ isActive }) => `app-nav__link${isActive ? ' is-active' : ''}`} to="/settings">
            模型设置
          </NavLink>
        </nav>
      </header>
      <main className="app-main">{children}</main>
    </div>
  )
}
