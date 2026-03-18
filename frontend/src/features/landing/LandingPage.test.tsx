import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { LandingPage } from './LandingPage'

const navigateMock = vi.fn()
const currentPredictionsQueryOptionsMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('../home/hooks/useHomeData', () => ({
  currentPredictionsQueryOptions: () => currentPredictionsQueryOptionsMock(),
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
        <LandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('LandingPage', () => {
  beforeEach(() => {
    navigateMock.mockReset()
    currentPredictionsQueryOptionsMock.mockReset()
  })

  it('preloads prediction data and navigates to dashboard', async () => {
    currentPredictionsQueryOptionsMock.mockReturnValue({
      queryKey: ['current-predictions'],
      queryFn: vi.fn().mockResolvedValue({ models: [] }),
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '获取大乐透预测' }))

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/dashboard/prediction')
    })
  })

  it('shows an error when preload fails', async () => {
    currentPredictionsQueryOptionsMock.mockReturnValue({
      queryKey: ['current-predictions'],
      queryFn: vi.fn().mockRejectedValue(new Error('网络异常')),
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '获取大乐透预测' }))

    expect(await screen.findByText('加载失败：网络异常')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
  })
})
