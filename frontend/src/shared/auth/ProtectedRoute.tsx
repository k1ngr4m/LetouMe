import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function ProtectedRoute({
  children,
  requiredPermission,
}: {
  children: React.ReactNode
  requiredPermission?: string
}) {
  const location = useLocation()
  const { isLoading, isAuthenticated, hasPermission } = useAuth()

  if (isLoading) {
    return <div className="state-shell">正在验证登录状态...</div>
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/dashboard/prediction" replace />
  }
  return <>{children}</>
}
