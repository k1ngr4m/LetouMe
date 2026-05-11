import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  renderPage,
} from './HomePage.testUtils'

describe('HomePage prediction smoke', () => {
  it('renders prediction overview summary', () => {
    renderPage()
    expect(screen.getByLabelText('当前预测摘要')).toBeInTheDocument()
  })
})
