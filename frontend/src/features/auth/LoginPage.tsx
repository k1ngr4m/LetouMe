import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/auth/AuthProvider'

function PasswordToggleIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 3l18 18M10.58 10.59A2 2 0 0012 14a2 2 0 001.41-.58M9.88 5.09A9.77 9.77 0 0112 4c5 0 9.27 3.11 11 8a12.46 12.46 0 01-4.04 5.19M6.1 6.1A12.57 12.57 0 001 12c1.73 4.89 6 8 11 8a10.7 10.7 0 005.02-1.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setIsSubmitting(true)
      setError(null)
      await login({ username, password })
      navigate((location.state as { from?: string } | null)?.from || '/dashboard/prediction', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '登录失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="landing-shell">
      <section className="landing-panel landing-panel--auth">
        <div className="landing-panel__copy landing-panel__copy--auth">
          <p className="landing-panel__eyebrow">Authentication</p>
          <h1 className="landing-panel__title landing-panel__title--auth">欢迎回到 LetouMe</h1>
          {/*<p className="landing-panel__description">登录后即可进入控制台，查看预测结果、模型配置与系统设置。</p>*/}
          <div className="auth-highlight-list" aria-label="登录后可用功能">
            <div className="auth-highlight-card">
              <strong>实时预测</strong>
              <span>快速进入大乐透预测与历史数据视图。</span>
            </div>
            <div className="auth-highlight-card">
              <strong>模型管理</strong>
              <span>统一查看模型状态、参数和策略配置。</span>
            </div>
            <div className="auth-highlight-card">
              <strong>账号安全</strong>
              <span>在个人设置中维护资料与密码信息。</span>
            </div>
          </div>
        </div>
        <div className="auth-panel">
          <div className="auth-panel__header">
            <p className="auth-panel__eyebrow">Sign In</p>
            <h2 className="auth-panel__title">账号登录</h2>
            <p className="auth-panel__subtitle">请输入你的系统账号和密码继续使用平台。</p>
          </div>
          <form className="auth-form auth-form--card" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span className="auth-field__label">用户名</span>
              <input className="auth-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入用户名" />
            </label>
            <label className="auth-field">
              <span className="auth-field__label">密码</span>
              <div className="auth-input-wrap">
                <input
                  className="auth-input auth-input--password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                />
                <button
                  className="auth-input-toggle"
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  title={showPassword ? '隐藏密码' : '显示密码'}
                >
                  <PasswordToggleIcon visible={showPassword} />
                </button>
              </div>
            </label>
            {error ? <p className="landing-panel__error landing-panel__error--auth">登录失败：{error}</p> : null}
            <button className="landing-panel__button landing-panel__button--auth" type="submit" disabled={isSubmitting}>
              {isSubmitting ? '登录中...' : '登录'}
            </button>
          </form>
          <div className="auth-panel__footer">
            <span>还没有账号？</span>
            <Link className="ghost-button auth-panel__link" to="/register">
              立即注册
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
