import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'
import './auth-redesign.css'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSendCode = useMemo(() => countdown <= 0 && email.trim().length > 0 && !isSendingCode, [countdown, email, isSendingCode])

  async function handleSendCode() {
    if (!canSendCode) return
    try {
      setIsSendingCode(true)
      setError(null)
      setMessage(null)
      await apiClient.sendForgotPasswordCode({ email })
      setMessage('验证码已发送，请检查邮箱。')
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
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (newPassword.length < 8) {
      setError('密码长度至少为 8 位')
      return
    }
    try {
      setIsSubmitting(true)
      setError(null)
      setMessage(null)
      await apiClient.resetForgotPassword({
        email,
        code,
        new_password: newPassword,
      })
      setMessage('密码已重置，请重新登录。')
      window.setTimeout(() => navigate('/login', { replace: true }), 900)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '密码重置失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="authx-page">
      <div className="authx-wrap">
        <SiteDisclaimer compact />
        <section className="authx-panel">
          <header className="authx-head">
            <h1>重置密码</h1>
            <p>输入邮箱并验证验证码后重置账户密码</p>
          </header>
          <form className="authx-form" onSubmit={handleSubmit}>
            <label className="authx-field">
              <span>邮箱</span>
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
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
              <span>新密码</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="不少于 8 位"
                required
              />
            </label>
            <label className="authx-field">
              <span>确认新密码</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
                required
              />
            </label>
            {message ? <p className="authx-success">{message}</p> : null}
            {error ? <p className="authx-error">{error}</p> : null}
            <button className="authx-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? '提交中...' : '确认重置'}
            </button>
          </form>
          <p className="authx-switch">
            返回
            <Link to="/login">登录页</Link>
          </p>
        </section>
      </div>
    </div>
  )
}
