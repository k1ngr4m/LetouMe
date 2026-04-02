import { useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'
import './auth-redesign.css'

export function OAuthCallbackPage() {
  const navigate = useNavigate()
  const { provider } = useParams()
  const [searchParams] = useSearchParams()
  const status = searchParams.get('status') || 'error'
  const message = searchParams.get('message') || 'OAuth 登录失败，请重试。'

  useEffect(() => {
    if (status !== 'success') return
    const timer = window.setTimeout(() => {
      navigate('/dashboard/prediction', { replace: true })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [navigate, status])

  return (
    <div className="authx-page">
      <div className="authx-wrap">
        <SiteDisclaimer compact />
        <section className="authx-panel">
          <header className="authx-head">
            <h1>OAuth 回调</h1>
            <p>{provider || 'Provider'}：{status === 'success' ? '登录成功，正在进入系统…' : message}</p>
          </header>
          <div className="authx-actions">
            {status === 'success' ? (
              <Link className="authx-secondary authx-link-btn" to="/dashboard/prediction">
                立即进入
              </Link>
            ) : (
              <Link className="authx-primary authx-link-btn" to="/login">
                返回登录
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
