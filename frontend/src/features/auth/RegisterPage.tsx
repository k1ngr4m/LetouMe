import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/auth/AuthProvider'

export function RegisterPage() {
  const navigate = useNavigate()
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
      navigate('/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '注册失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="landing-shell">
      <section className="landing-panel">
        <div className="landing-panel__copy">
          <p className="landing-panel__eyebrow">Registration</p>
          <h1 className="landing-panel__title">注册 LetouMe</h1>
          <p className="landing-panel__description">注册成功后将自动成为普通用户，并直接进入预测控制台。</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input className="search-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名" />
          <input className="search-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码" />
          <input
            className="search-input"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="确认密码"
          />
          <button className="landing-panel__button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '注册中...' : '注册'}
          </button>
          <Link className="ghost-button" to="/login">
            已有账号，去登录
          </Link>
          {error ? <p className="landing-panel__error">注册失败：{error}</p> : null}
        </form>
      </section>
    </div>
  )
}
