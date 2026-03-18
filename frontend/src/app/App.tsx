import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../shared/components/AppShell'
import { HomePage } from '../features/home/HomePage'
import { HomeModelDetailPage } from '../features/home/HomeModelDetailPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { LandingPage } from '../features/landing/LandingPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { AuthProvider } from '../shared/auth/AuthProvider'
import { ProtectedRoute } from '../shared/auth/ProtectedRoute'
import { ThemeProvider } from '../shared/theme/ThemeProvider'
import { ThemeToggle } from '../shared/theme/ThemeToggle'
import { HOME_TAB_PATHS } from '../features/home/navigation'

const BASIC_PROFILE_PERMISSION = 'basic_profile'
const MODEL_MANAGEMENT_PERMISSION = 'model_management'
const SCHEDULE_MANAGEMENT_PERMISSION = 'schedule_management'
const USER_MANAGEMENT_PERMISSION = 'user_management'
const ROLE_MANAGEMENT_PERMISSION = 'role_management'

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemeToggle />
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
            path="/dashboard/models/:modelId"
            element={
              <ProtectedRoute>
                <AppShell>
                  <HomeModelDetailPage />
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
      </AuthProvider>
    </ThemeProvider>
  )
}
