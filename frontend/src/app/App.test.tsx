import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { DISCLAIMER_TEXT } from '../shared/components/SiteDisclaimer'

vi.mock('../features/home/HomePage', () => ({
  HomePage: () => <div>Home Page Mock</div>,
}))

vi.mock('../features/home/HomeModelDetailPage', () => ({
  HomeModelDetailPage: () => <div>Home Model Detail Page Mock</div>,
}))

vi.mock('../features/landing/LandingPage', () => ({
  LandingPage: () => <div>Landing Page Mock</div>,
}))

vi.mock('../features/settings/SettingsPage', () => ({
  SettingsPage: () => <div>Settings Page Mock</div>,
}))
vi.mock('../features/auth/LoginPage', () => ({
  LoginPage: () => <div>Login Page Mock</div>,
}))
vi.mock('../features/auth/RegisterPage', () => ({
  RegisterPage: () => <div>Register Page Mock</div>,
}))
vi.mock('../shared/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: 1, username: 'admin', nickname: '管理员', role: 'super_admin', role_name: '超级管理员', is_active: true, permissions: ['basic_profile'] },
    isLoading: false,
    isAuthenticated: true,
    hasPermission: () => true,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}))
vi.mock('../shared/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

function renderApp(initialEntries: string[]) {
  const client = new QueryClient()
  function LocationDisplay() {
    const location = useLocation()
    return <div data-testid="location-display">{location.pathname}</div>
  }

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App routing', () => {
  it('renders landing route', () => {
    renderApp(['/'])
    expect(screen.getByText('Landing Page Mock')).toBeInTheDocument()
  })

  it('redirects dashboard route to prediction route', () => {
    renderApp(['/dashboard'])
    expect(screen.getByText('Home Page Mock')).toBeInTheDocument()
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeInTheDocument()
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/prediction')
  })

  it('renders dashboard model detail route', () => {
    renderApp(['/dashboard/models/model-a'])
    expect(screen.getByText('Home Model Detail Page Mock')).toBeInTheDocument()
  })

  it('redirects settings route to profile route', () => {
    renderApp(['/settings'])
    expect(screen.getByText('Settings Page Mock')).toBeInTheDocument()
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeInTheDocument()
    expect(screen.getByTestId('location-display')).toHaveTextContent('/settings/profile')
  })

  it('renders login route', () => {
    renderApp(['/login'])
    expect(screen.getByText('Login Page Mock')).toBeInTheDocument()
  })

  it('renders register route', () => {
    renderApp(['/register'])
    expect(screen.getByText('Register Page Mock')).toBeInTheDocument()
  })
})
