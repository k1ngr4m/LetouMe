import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../shared/components/AppShell'
import { HomePage } from '../features/home/HomePage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { LandingPage } from '../features/landing/LandingPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { AuthProvider } from '../shared/auth/AuthProvider'
import { ProtectedRoute } from '../shared/auth/ProtectedRoute'
import { ThemeProvider } from '../shared/theme/ThemeProvider'
import { ThemeToggle } from '../shared/theme/ThemeToggle'

const BASIC_PROFILE_PERMISSION = 'basic_profile'

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ThemeToggle />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AppShell>
                  <HomePage />
                </AppShell>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute requiredPermission={BASIC_PROFILE_PERMISSION}>
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
