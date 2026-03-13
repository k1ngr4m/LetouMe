import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../shared/auth/AuthProvider'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      setIsSubmitting(true)
      setError(null)
      await login({ username, password })
      navigate((location.state as { from?: string } | null)?.from || '/dashboard', { replace: true })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : '登录失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="landing-shell">
      <section className="landing-panel">
        <div className="landing-panel__copy">
          <p className="landing-panel__eyebrow">Authentication</p>
          <h1 className="landing-panel__title">登录 LetouMe</h1>
          <p className="landing-panel__description">请输入系统账号后进入控制台。普通用户可查看预测，管理员可管理模型和用户。</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <input className="search-input" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名" />
          <input
            className="search-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="密码"
          />
          <button className="landing-panel__button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? '登录中...' : '登录'}
          </button>
          <Link className="ghost-button" to="/register">
            没有账号，去注册
          </Link>
          {error ? <p className="landing-panel__error">登录失败：{error}</p> : null}
        </form>
      </section>
    </div>
  )
}
