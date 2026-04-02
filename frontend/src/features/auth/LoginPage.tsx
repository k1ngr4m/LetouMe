import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/auth/AuthProvider'
import { apiClient } from '../../shared/api/client'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'
import './auth-redesign.css'

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
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setIsSubmitting(true)
      setError(null)
      await login({ identifier, password })
      navigate((location.state as { from?: string } | null)?.from || '/dashboard/prediction', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '登录失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    try {
      setOauthLoading(provider)
      setError(null)
      const response = await apiClient.getOAuthStart(provider)
      if (!response.enabled || !response.auth_url) {
        throw new Error(response.message || '第三方登录暂未开通')
      }
      window.location.href = response.auth_url
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '暂时无法使用第三方登录')
    } finally {
      setOauthLoading(null)
    }
  }

  return (
    <div className="authx-page">
      <div className="authx-wrap">
        <SiteDisclaimer compact />
        <section className="authx-panel">
          <header className="authx-head">
            <h1>登录</h1>
            <p>输入用户名或邮箱与密码登录您的账户</p>
          </header>
          <form className="authx-form" onSubmit={handleSubmit}>
            <label className="authx-field">
              <span>用户名或邮箱</span>
              <input
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="username / name@example.com"
                required
              />
            </label>
            <label className="authx-field">
              <div className="authx-field-row">
                <span>密码</span>
                <Link to="/forgot-password">忘记密码?</Link>
              </div>
              <div className="authx-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  required
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                  <PasswordToggleIcon visible={showPassword} />
                </button>
              </div>
            </label>
            {error ? <p className="authx-error">登录失败：{error}</p> : null}
            <button className="authx-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? '登录中...' : '登录'}
            </button>
          </form>
          <button className="authx-secondary" type="button" onClick={() => setError('魔法链接功能即将上线')}>
            使用魔法链接登录
          </button>
          <p className="authx-switch">
            还没有账号？
            <Link to="/register">立即注册</Link>
          </p>
          <div className="authx-divider">或者使用</div>
          <div className="authx-social">
            <button type="button" onClick={() => void handleOAuth('google')} disabled={oauthLoading !== null}>
              <span aria-hidden="true">G</span> Google
            </button>
            <button type="button" onClick={() => void handleOAuth('github')} disabled={oauthLoading !== null}>
              <span aria-hidden="true">⌘</span> GitHub
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
