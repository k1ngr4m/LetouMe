import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  renderPage,
} from './HomePage.testUtils'

describe('HomePage navigation', () => {
  it('updates url when switching dashboard tabs', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/history')
  })

  it('navigates to rules page from tab strip', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '规则' }))

    expect(screen.getByTestId('location-display')).toHaveTextContent('/dashboard/rules')
  })
})
