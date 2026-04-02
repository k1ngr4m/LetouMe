import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { HomeRulesPage } from './HomeRulesPage'

vi.mock('../../shared/lib/storage', () => ({
  loadSelectedLottery: () => 'dlt',
  saveSelectedLottery: () => undefined,
}))

function renderPage(initialEntry: string | { pathname: string; state?: unknown } = '/dashboard/rules') {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  function LocationDisplay() {
    const location = useLocation()
    return <div data-testid="location-display">{location.pathname}</div>
  }

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/dashboard/rules"
            element={
              <>
                <HomeRulesPage />
                <LocationDisplay />
              </>
            }
          />
          <Route path="/dashboard/prediction" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HomeRulesPage', () => {
  it('renders dlt rules and prize references', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: '大乐透规则' })).toBeInTheDocument()
    expect(document.querySelector('.tab-strip.dashboard-tab-strip')).not.toBeNull()
    expect(screen.getByRole('button', { name: '规则' })).toHaveClass('is-active')
    expect(screen.getByTitle('中国体育彩票超级大乐透游戏规则')).toBeInTheDocument()
    expect(screen.getByAltText('大乐透奖金对照表')).toBeInTheDocument()
    expect(screen.getByText('规则切换说明')).toBeInTheDocument()
    expect(screen.getByText(/26014期及之后：使用新规则，奖级共七档/)).toBeInTheDocument()
    expect(screen.getByText('当前查看彩种：大乐透')).toBeInTheDocument()
  })

  it('shows pl3 chapters and fixed prizes when entering from pl3 context', () => {
    renderPage({ pathname: '/dashboard/rules', state: { lotteryCode: 'pl3' } })

    expect(screen.getByText('当前查看彩种：排列3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '第一章 总则' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '第三章 设奖' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '第七章 附则' })).toBeInTheDocument()
    expect(screen.getByText('1040 元 / 注')).toBeInTheDocument()
    expect(screen.getByText('173 元 / 注')).toBeInTheDocument()
    expect(screen.getByText('346 元 / 注')).toBeInTheDocument()
    expect(screen.queryByTitle('中国体育彩票超级大乐透游戏规则')).not.toBeInTheDocument()
  })

  it('navigates from rules tab strip to prediction page', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '预测总览' }))
    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/prediction')
  })
})
