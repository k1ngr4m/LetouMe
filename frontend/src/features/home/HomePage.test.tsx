import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  renderPage,
} from './HomePage.testUtils'

describe('HomePage smoke', () => {
  it('renders the prediction summary on the default dashboard tab', () => {
    renderPage()
    const summary = screen.getByLabelText('当前预测摘要')
    expect(within(summary).getByText('目标期号')).toBeInTheDocument()
    expect(within(summary).getByText('开奖状态')).toBeInTheDocument()
  })
})
