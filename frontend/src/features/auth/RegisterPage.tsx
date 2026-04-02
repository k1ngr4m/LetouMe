import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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

export function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null)
  const canSendCode = useMemo(() => countdown <= 0 && email.trim().length > 0 && !isSendingCode, [countdown, email, isSendingCode])

  async function handleSendCode() {
    if (!canSendCode) return
    try {
      setIsSendingCode(true)
      setError(null)
      setMessage(null)
      await apiClient.sendRegisterCode({ email })
      setMessage('注册验证码已发送，请检查邮箱。')
      setCountdown(60)
      const timer = window.setInterval(() => {
        setCountdown((value) => {
          if (value <= 1) {
            window.clearInterval(timer)
            return 0
          }
          return value - 1
        })
      }, 1000)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '验证码发送失败')
    } finally {
      setIsSendingCode(false)
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (password.length < 8) {
      setError('密码长度至少为 8 位')
      return
    }
    try {
      setIsSubmitting(true)
      setError(null)
      setMessage(null)
      await register({ username, email, password, code })
      navigate('/dashboard/prediction', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '注册失败')
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
            <h1>创建账户</h1>
            <p>填写以下信息创建您的 LetouMe 账户</p>
          </header>
          <form className="authx-form" onSubmit={handleSubmit}>
            <label className="authx-field">
              <span>用户名</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="输入您的用户名" required />
            </label>
            <label className="authx-field">
              <span>邮箱</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                required
              />
            </label>
            <label className="authx-field">
              <span>验证码</span>
              <div className="authx-inline-action">
                <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="6 位验证码" required />
                <button type="button" className="authx-inline-btn" onClick={() => void handleSendCode()} disabled={!canSendCode}>
                  {countdown > 0 ? `${countdown}s` : isSendingCode ? '发送中' : '发送验证码'}
                </button>
              </div>
            </label>
            <label className="authx-field">
              <span>密码</span>
              <div className="authx-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="不少于 8 位"
                  required
                />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? '隐藏密码' : '显示密码'}>
                  <PasswordToggleIcon visible={showPassword} />
                </button>
              </div>
            </label>
            <label className="authx-field">
              <span>确认密码</span>
              <div className="authx-password-wrap">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入密码"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}
                >
                  <PasswordToggleIcon visible={showConfirmPassword} />
                </button>
              </div>
            </label>
            {message ? <p className="authx-success">{message}</p> : null}
            {error ? <p className="authx-error">注册失败：{error}</p> : null}
            <button className="authx-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? '注册中...' : '注册'}
            </button>
          </form>
          <div className="authx-divider">或者使用</div>
          <div className="authx-social">
            <button type="button" onClick={() => void handleOAuth('google')} disabled={oauthLoading !== null}>
              <span aria-hidden="true">G</span> Google
            </button>
            <button type="button" onClick={() => void handleOAuth('github')} disabled={oauthLoading !== null}>
              <span aria-hidden="true">⌘</span> GitHub
            </button>
          </div>
          <p className="authx-switch">
            已有账户？
            <Link to="/login">立即登录</Link>
          </p>
        </section>
      </div>
    </div>
  )
}
