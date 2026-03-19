import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RegisterPage } from './RegisterPage'
import { DISCLAIMER_TEXT } from '../../shared/components/SiteDisclaimer'

vi.mock('../../shared/auth/AuthProvider', () => ({
  useAuth: () => ({
    register: vi.fn(),
  }),
}))

function renderPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RegisterPage', () => {
  it('shows the site disclaimer', () => {
    renderPage()

    expect(screen.getByText(DISCLAIMER_TEXT)).toBeInTheDocument()
  })
})
