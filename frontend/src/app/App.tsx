import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from '../shared/components/AppShell'
import { AuthProvider } from '../shared/auth/AuthProvider'
import { ProtectedRoute } from '../shared/auth/ProtectedRoute'
import { ThemeProvider } from '../shared/theme/ThemeProvider'
import { ThemeToggle } from '../shared/theme/ThemeToggle'
import { loadSelectedLottery } from '../shared/lib/storage'
import {
  DASHBOARD_BASE_PATH,
  getDashboardPath,
  getHomeModelDetailPath,
  getHomeRulesPath,
  normalizeLotteryCodeParam,
} from '../features/home/navigation'

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

function LegacyDashboardTabRedirect({ tab }: { tab: 'prediction' | 'analysis' | 'history' | 'simulation' | 'my-bets' }) {
  return <Navigate to={getDashboardPath(tab, loadSelectedLottery())} replace />
}

function LegacyDashboardRulesRedirect() {
  return <Navigate to={getHomeRulesPath(loadSelectedLottery())} replace />
}

function LegacyDashboardModelDetailRedirect() {
  const { modelId = '' } = useParams()
  return <Navigate to={getHomeModelDetailPath(loadSelectedLottery(), modelId)} replace />
}

function DashboardLotteryRootRedirect() {
  const { lotteryCode } = useParams()
  return <Navigate to={getDashboardPath('prediction', normalizeLotteryCodeParam(lotteryCode))} replace />
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemeToggle />
        <Suspense fallback={<RouteLoadingFallback />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path={DASHBOARD_BASE_PATH} element={<Navigate to={getDashboardPath('prediction', loadSelectedLottery())} replace />} />
            <Route path="/dashboard/prediction" element={<LegacyDashboardTabRedirect tab="prediction" />} />
            <Route path="/dashboard/simulation" element={<LegacyDashboardTabRedirect tab="simulation" />} />
            <Route path="/dashboard/analysis" element={<LegacyDashboardTabRedirect tab="analysis" />} />
            <Route path="/dashboard/history" element={<LegacyDashboardTabRedirect tab="history" />} />
            <Route path="/dashboard/my-bets" element={<LegacyDashboardTabRedirect tab="my-bets" />} />
            <Route path="/dashboard/rules" element={<LegacyDashboardRulesRedirect />} />
            <Route path="/dashboard/models/:modelId" element={<LegacyDashboardModelDetailRedirect />} />
            <Route path="/dashboard/:lotteryCode" element={<DashboardLotteryRootRedirect />} />
            <Route
              path="/dashboard/:lotteryCode/prediction"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/:lotteryCode/simulation"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/:lotteryCode/analysis"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/:lotteryCode/history"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/:lotteryCode/my-bets"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomePage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/:lotteryCode/models/:modelId"
              element={
                <ProtectedRoute>
                  <AppShell>
                    <HomeModelDetailPage />
                  </AppShell>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/:lotteryCode/rules"
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
      </AuthProvider>
    </ThemeProvider>
  )
}
