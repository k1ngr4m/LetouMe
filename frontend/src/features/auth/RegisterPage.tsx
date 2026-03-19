import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/auth/AuthProvider'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'

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
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

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
      await register({ username, password })
      navigate('/dashboard/prediction', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '注册失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="landing-shell">
      <div className="landing-page-stack">
        <SiteDisclaimer />
        <section className="landing-panel landing-panel--auth">
        <div className="landing-panel__copy landing-panel__copy--auth">
          <p className="landing-panel__eyebrow">Registration</p>
          <h1 className="landing-panel__title landing-panel__title--auth">创建 LetouMe 账号</h1>
          <p className="landing-panel__description">完成注册后会自动进入预测控制台，默认以普通用户身份开始使用系统。</p>
          <div className="auth-highlight-list" aria-label="注册账号说明">
            <div className="auth-highlight-card">
              <strong>开通即用</strong>
              <span>注册成功后直接进入控制台，无需额外激活。</span>
            </div>
            <div className="auth-highlight-card">
              <strong>安全规范</strong>
              <span>密码至少 8 位，建议同时包含数字与字母。</span>
            </div>
            <div className="auth-highlight-card">
              <strong>资料可修改</strong>
              <span>后续可在设置页更新昵称和密码信息。</span>
            </div>
          </div>
        </div>
        <div className="auth-panel">
          <div className="auth-panel__header">
            <p className="auth-panel__eyebrow">Create Account</p>
            <h2 className="auth-panel__title">新用户注册</h2>
            <p className="auth-panel__subtitle">填写账号信息后即可创建新账户并进入平台。</p>
          </div>
          <form className="auth-form auth-form--card" onSubmit={handleSubmit}>
            <label className="auth-field">
              <span className="auth-field__label">用户名</span>
              <input className="auth-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="设置登录用户名" />
            </label>
            <label className="auth-field">
              <span className="auth-field__label">密码</span>
              <div className="auth-input-wrap">
                <input
                  className="auth-input auth-input--password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="不少于 8 位密码"
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
            <label className="auth-field">
              <span className="auth-field__label">确认密码</span>
              <div className="auth-input-wrap">
                <input
                  className="auth-input auth-input--password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入密码"
                />
                <button
                  className="auth-input-toggle"
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  aria-label={showConfirmPassword ? '隐藏密码' : '显示密码'}
                  title={showConfirmPassword ? '隐藏密码' : '显示密码'}
                >
                  <PasswordToggleIcon visible={showConfirmPassword} />
                </button>
              </div>
            </label>
            {error ? <p className="landing-panel__error landing-panel__error--auth">注册失败：{error}</p> : null}
            <button className="landing-panel__button landing-panel__button--auth" type="submit" disabled={isSubmitting}>
              {isSubmitting ? '注册中...' : '注册'}
            </button>
          </form>
          <div className="auth-panel__footer">
            <span>已经有账号了？</span>
            <Link className="ghost-button auth-panel__link" to="/login">
              去登录
            </Link>
          </div>
        </div>
        </section>
      </div>
    </div>
  )
}
