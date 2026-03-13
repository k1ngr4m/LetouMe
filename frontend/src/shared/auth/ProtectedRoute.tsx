import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children: React.ReactNode
  requireAdmin?: boolean
}) {
  const location = useLocation()
  const { isLoading, isAuthenticated, isAdmin } = useAuth()

  if (isLoading) {
    return <div className="state-shell">正在验证登录状态...</div>
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}
