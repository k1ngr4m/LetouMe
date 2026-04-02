import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../shared/components/AppShell'
import { AuthProvider } from '../shared/auth/AuthProvider'
import { ProtectedRoute } from '../shared/auth/ProtectedRoute'
import { MotionProvider } from '../shared/theme/MotionProvider'
import { ThemeProvider } from '../shared/theme/ThemeProvider'
import { LotterySelectionProvider } from '../shared/lottery/LotterySelectionProvider'
import { ToastProvider } from '../shared/feedback/ToastProvider'
import { HOME_RULES_PATH, HOME_TAB_PATHS } from '../features/home/navigation'

const BASIC_PROFILE_PERMISSION = 'basic_profile'
const MODEL_MANAGEMENT_PERMISSION = 'model_management'
const SCHEDULE_MANAGEMENT_PERMISSION = 'schedule_management'
const USER_MANAGEMENT_PERMISSION = 'user_management'
const ROLE_MANAGEMENT_PERMISSION = 'role_management'

const LandingPage = lazy(() => import('../features/landing/LandingPage').then((module) => ({ default: module.LandingPage })))
const LoginPage = lazy(() => import('../features/auth/LoginPage').then((module) => ({ default: module.LoginPage })))
const RegisterPage = lazy(() => import('../features/auth/RegisterPage').then((module) => ({ default: module.RegisterPage })))
const HomePage = lazy(() => import('../features/home/HomePage').then((module) => ({ default: module.HomePage })))
const HomeModelDetailPage = lazy(() =>
  import('../features/home/HomeModelDetailPage').then((module) => ({ default: module.HomeModelDetailPage })),
)
const HomeRulesPage = lazy(() => import('../features/home/HomeRulesPage').then((module) => ({ default: module.HomeRulesPage })))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })))

function RouteLoadingFallback() {
  return <div style={{ padding: '24px', textAlign: 'center' }}>加载中...</div>
}

export function App() {
  return (
    <ThemeProvider>
      <MotionProvider>
        <AuthProvider>
          <ToastProvider>
            <LotterySelectionProvider>
              <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={<Navigate to={HOME_TAB_PATHS.prediction} replace />} />
            <Route
              path={HOME_TAB_PATHS.prediction}
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path={HOME_TAB_PATHS.simulation}
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path={HOME_TAB_PATHS.analysis}
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path={HOME_TAB_PATHS.history}
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path={HOME_TAB_PATHS['my-bets']}
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/models/:modelId"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomeModelDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path={HOME_RULES_PATH}
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomeRulesPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
            <Route
              path="/settings/profile"
              element={
                <ProtectedRoute requiredPermission={BASIC_PROFILE_PERMISSION}>
                  <AppShell>
                    <SettingsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/account"
              element={
                <ProtectedRoute requiredPermission={BASIC_PROFILE_PERMISSION}>
                  <AppShell>
                    <SettingsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/models"
              element={
                <ProtectedRoute requiredPermission={MODEL_MANAGEMENT_PERMISSION}>
                  <AppShell>
                    <SettingsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/maintenance"
              element={
                <ProtectedRoute requiredPermission={MODEL_MANAGEMENT_PERMISSION}>
                  <AppShell>
                    <SettingsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/schedules"
              element={
                <ProtectedRoute requiredPermission={SCHEDULE_MANAGEMENT_PERMISSION}>
                  <AppShell>
                    <SettingsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/users"
              element={
                <ProtectedRoute requiredPermission={USER_MANAGEMENT_PERMISSION}>
                  <AppShell>
                    <SettingsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/roles"
              element={
                <ProtectedRoute requiredPermission={ROLE_MANAGEMENT_PERMISSION}>
                  <AppShell>
                    <SettingsPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </LotterySelectionProvider>
          </ToastProvider>
        </AuthProvider>
      </MotionProvider>
    </ThemeProvider>
  )
}
