import { Link, useParams } from 'react-router-dom'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'
import './auth-redesign.css'

export function OAuthCallbackPage() {
  const { provider } = useParams()

  return (
    <div className="authx-page">
      <div className="authx-wrap">
        <SiteDisclaimer compact />
        <section className="authx-panel">
          <header className="authx-head">
            <h1>OAuth 回调</h1>
            <p>{provider || 'Provider'} 登录回调尚未启用，请先使用账号密码登录。</p>
          </header>
          <div className="authx-actions">
            <Link className="authx-primary authx-link-btn" to="/login">
              返回登录
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
