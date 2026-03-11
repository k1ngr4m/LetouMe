import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.mock('../features/home/HomePage', () => ({
  HomePage: () => <div>Home Page Mock</div>,
}))

vi.mock('../features/settings/SettingsPage', () => ({
  SettingsPage: () => <div>Settings Page Mock</div>,
}))

function renderApp(initialEntries: string[]) {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('App routing', () => {
  it('renders home route', () => {
    renderApp(['/'])
    expect(screen.getByText('Home Page Mock')).toBeInTheDocument()
  })

  it('renders settings route', () => {
    renderApp(['/settings'])
    expect(screen.getByText('Settings Page Mock')).toBeInTheDocument()
  })
})
