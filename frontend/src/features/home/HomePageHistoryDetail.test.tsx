import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  getPredictionsHistoryDetail,
  simulateDltDantuoCurrentPredictions,
  simulatePl3SumCurrentPredictions,
  simulatePl3SumHistoryMislabel,
  renderPage,
} from './HomePage.testUtils'

describe('HomePage history detail', () => {
  it('loads history detail on expand and highlights hit numbers', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['01', '02', '03', '12', '15'],
                  blue_balls: ['06', '10'],
                  description: '模型A第1组：覆盖胆码与后区防守组合，优先控制回撤并兼顾上限。',
                  hit_result: {
                    red_hits: ['01', '12'],
                    red_hit_count: 2,
                    blue_hits: ['06'],
                    blue_hit_count: 1,
                    total_hits: 3,
                  },
                },
                {
                  group_id: 2,
                  red_balls: ['01', '08', '12', '19', '30'],
                  blue_balls: ['09', '10'],
                  hit_result: {
                    red_hits: ['01', '08', '12', '19'],
                    red_hit_count: 4,
                    blue_hits: [],
                    blue_hit_count: 0,
                    total_hits: 4,
                  },
                },
                {
                  group_id: 3,
                  red_balls: ['01', '08', '12', '19', '30'],
                  blue_balls: ['06', '10'],
                  hit_result: {
                    red_hits: ['01', '08', '12', '19'],
                    red_hit_count: 4,
                    blue_hits: ['06'],
                    blue_hit_count: 1,
                    total_hits: 5,
                  },
                },
                {
                  group_id: 4,
                  red_balls: ['01', '08', '12', '19', '25'],
                  blue_balls: ['06', '11'],
                  hit_result: {
                    red_hits: ['01', '08', '12', '19', '25'],
                    red_hit_count: 5,
                    blue_hits: ['06'],
                    blue_hit_count: 1,
                    total_hits: 6,
                  },
                },
              ],
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['08', '09', '10', '11', '12'],
                  blue_balls: ['01', '02'],
                  description: '模型B第1组：偏进攻型号码分布。',
                  hit_result: {
                    red_hits: ['08', '12'],
                    red_hit_count: 2,
                    blue_hits: [],
                    blue_hit_count: 0,
                    total_hits: 2,
                  },
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' })).toBeInTheDocument()

    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    expect(groupCard).toHaveClass('is-compact')
    const cardScope = within(groupCard as HTMLElement)
    const descNode = cardScope.getByText('模型A第1组：覆盖胆码与后区防守组合，优先控制回撤并兼顾上限。')
    expect(descNode).toHaveAttribute('title', '模型A第1组：覆盖胆码与后区防守组合，优先控制回撤并兼顾上限。')
    expect(descNode).toHaveClass('prediction-group-card__desc--compact')
    expect(cardScope.getByText('01')).toHaveClass('is-hit')
    expect(cardScope.getByText('12')).toHaveClass('is-hit')
    expect(cardScope.getByText('06')).toHaveClass('is-hit')
    expect(cardScope.getByText('02')).not.toHaveClass('is-hit')
    expect(cardScope.getByText('02')).toHaveClass('number-ball--muted')
    expect(cardScope.getByText('10')).toHaveClass('number-ball--muted')
    expect(cardScope.getByText('01')).not.toHaveClass('number-ball--muted')

    const hit4Card = screen.getByText('G-2').closest('.prediction-group-card')
    const hit5Card = screen.getByText('G-3').closest('.prediction-group-card')
    const hit6Card = screen.getByText('G-4').closest('.prediction-group-card')
    expect(within(firstHistoryCard as HTMLElement).getAllByText('注数').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('成本').length).toBeGreaterThan(0)
    expect(within(firstHistoryCard as HTMLElement).getAllByText('奖金').length).toBeGreaterThan(0)
    const detailRateGrid = (detailSection as HTMLElement).querySelector('.history-record-card__detail-rate-grid')
    expect(detailRateGrid).not.toBeNull()
    expect(detailRateGrid).toHaveClass('is-soft-hidden')
    expect(within(detailSection as HTMLElement).getByText('按期中奖率')).toBeInTheDocument()
    expect(within(detailSection as HTMLElement).getByText('按注中奖率')).toBeInTheDocument()
    expect(groupCard).not.toHaveClass('is-hit-tier-4')
    expect(groupCard).not.toHaveClass('is-hit-tier-5')
    expect(groupCard).not.toHaveClass('is-hit-tier-6')
    expect(hit4Card).toHaveClass('is-hit-tier-4')
    expect(hit5Card).toHaveClass('is-hit-tier-5')
    expect(hit6Card).toHaveClass('is-hit-tier-6')
    expect(within(detailSection as HTMLElement).getAllByText('成本 2 元')).toHaveLength(4)

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型B' }))
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型B' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('deepseek')).toBeInTheDocument()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' }))
    expect(within(firstHistoryCard as HTMLElement).queryByText('openai_compatible')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('deepseek')).toBeInTheDocument()
  })

  it('shows dlt dantuo sections with dan/tuo labels', async () => {
    simulateDltDantuoCurrentPredictions.current = true
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'dlt_dantuo',
                  front_dan: ['01', '08'],
                  front_tuo: ['12', '19', '25', '31'],
                  back_dan: [],
                  back_tuo: ['06', '11'],
                  red_balls: ['01', '08', '12', '19', '25', '31'],
                  blue_balls: ['06', '11'],
                  hit_result: {
                    red_hits: ['01', '08', '12', '19', '25'],
                    red_hit_count: 5,
                    blue_hits: ['06', '11'],
                    blue_hit_count: 2,
                    total_hits: 7,
                  },
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    await userEvent.click(screen.getByRole('button', { name: '胆拖' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))
    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    const cardScope = within(groupCard as HTMLElement)
    expect(cardScope.getByText('前胆')).toBeInTheDocument()
    expect(cardScope.getByText('前拖')).toBeInTheDocument()
    expect(cardScope.queryByText('后胆')).not.toBeInTheDocument()
    expect(cardScope.getByText('后拖')).toBeInTheDocument()
    const numberLines = (groupCard as HTMLElement).querySelectorAll('.number-row__line')
    expect(numberLines).toHaveLength(2)
    expect(within(numberLines[0] as HTMLElement).getByText('前胆')).toBeInTheDocument()
    expect(within(numberLines[0] as HTMLElement).getByText('前拖')).toBeInTheDocument()
    expect(within(numberLines[1] as HTMLElement).getByText('后拖')).toBeInTheDocument()
    expect(cardScope.getByText('01')).toHaveClass('is-hit')
    expect(cardScope.getByText('31')).toHaveClass('number-ball--muted')

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '显示该期预测统计：第 2026031 期' }))
    expect(within(firstHistoryCard as HTMLElement).getByText('前区胆统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('前区拖统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('后区胆统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('后区拖统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('supports one-click expand and collapse for all models in a record', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['01', '02', '03', '12', '15'],
                  blue_balls: ['06', '10'],
                },
              ],
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['08', '09', '10', '11', '12'],
                  blue_balls: ['01', '02'],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开该期全部模型详情：第 2026031 期' }))
    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型B' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起该期全部模型详情：第 2026031 期' })).toBeInTheDocument()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起该期全部模型详情：第 2026031 期' }))
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型B' })).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('openai_compatible')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('deepseek')).not.toBeInTheDocument()
  })

  it('shows period prediction summary only after clicking summary toggle', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                { group_id: 1, red_balls: ['01', '02', '03', '12', '15'], blue_balls: ['06', '10'] },
                { group_id: 2, red_balls: ['01', '08', '18', '28', '33'], blue_balls: ['02', '06'] },
              ],
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              best_hit_count: 1,
              predictions: [
                { group_id: 1, red_balls: ['08', '09', '10', '11', '12'], blue_balls: ['01', '02'] },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    expect(within(firstHistoryCard as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '显示该期预测统计：第 2026031 期' }))
    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))
    expect(within(firstHistoryCard as HTMLElement).getByText('前区统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('后区统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '隐藏该期预测统计：第 2026031 期' })).toBeInTheDocument()
    const periodSummary = (firstHistoryCard as HTMLElement).querySelector('.history-record-card__period-summary')
    const modelsSection = (firstHistoryCard as HTMLElement).querySelector('.history-record-card__models')
    expect(periodSummary).not.toBeNull()
    expect(modelsSection).not.toBeNull()
    expect(periodSummary?.compareDocumentPosition(modelsSection as Node)).toBe(Node.DOCUMENT_POSITION_PRECEDING)
    expect(within(periodSummary as HTMLElement).getByText('06')).not.toHaveClass('number-ball--muted')
    const tenBalls = within(periodSummary as HTMLElement).getAllByText('10')
    expect(tenBalls.length).toBeGreaterThan(0)
    expect(tenBalls.every((node) => node.classList.contains('number-ball--muted'))).toBe(true)

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '隐藏该期预测统计：第 2026031 期' }))
    expect(within(firstHistoryCard as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('shows seven position period summary columns for qxc', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '七星彩' }))
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()

    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '显示该期预测统计：第 2026031 期' }))
    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'qxc'))
    expect(within(firstHistoryCard as HTMLElement).getByText('第一位统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('第二位统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('第三位统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('第四位统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('第五位统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('第六位统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('第七位统计')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('前区统计')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('reuses shared model filters in history and trims record details', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 3,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['01', '02', '03', '12', '15'],
                  blue_balls: ['06', '10'],
                },
              ],
            },
            {
              model_id: 'model-b',
              model_name: '模型B',
              model_provider: 'deepseek',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  red_balls: ['08', '09', '10', '11', '12'],
                  blue_balls: ['01', '02'],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '筛选' }))
    await userEvent.click(screen.getByRole('button', { name: 'openai_compatible' }))
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const historySection = screen.getByRole('heading', { name: '命中回溯' }).closest('section')
    expect(historySection).not.toBeNull()
    const historyRecords = (historySection as HTMLElement).querySelector('.history-card-list__records')
    expect(historyRecords).not.toBeNull()

    expect(screen.getByText('已显示 1 / 2 个模型')).toBeInTheDocument()
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(within(historyRecords as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
    expect(screen.queryByText('第 2026030 期')).not.toBeInTheDocument()

    const firstHistoryCard = within(historySection as HTMLElement).getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))
    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'dlt'))

    expect(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '收起模型详情：模型A' })).toBeInTheDocument()
    expect(screen.getAllByText('模型A').length).toBeGreaterThan(0)
    expect(within(historyRecords as HTMLElement).queryByText('模型B')).not.toBeInTheDocument()
    expect(screen.getByText('G-1').closest('.prediction-group-card')).toHaveClass('is-compact')
    const descFallback = within(firstHistoryCard as HTMLElement).getByText('暂无说明')
    expect(descFallback).toHaveClass('prediction-group-card__desc--compact')
    expect(descFallback).toHaveAttribute('title', '暂无说明')
    expect(screen.getAllByText('注数').length).toBeGreaterThan(0)
  })

  it('requests pl3 history detail and highlights direct hits by position', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: ['01', '08', '12', '19', '25'],
            blue_balls: ['06', '11'],
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 2,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct',
                  red_balls: [],
                  blue_balls: [],
                  digits: ['01', '01', '12'],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    expect(screen.getByText('方案筛选')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    expect(screen.getByText('方案筛选')).toBeInTheDocument()
    expect(screen.queryByText('当前暂无可选方案')).not.toBeInTheDocument()
    expect(screen.queryByText('正在更新方案筛选结果...')).not.toBeInTheDocument()
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    expect(await within(firstHistoryCard as HTMLElement).findByText('直选')).toBeInTheDocument()

    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    expect(groupCard).toHaveClass('is-compact')
    const detailRateGrid = (detailSection as HTMLElement).querySelector('.history-record-card__detail-rate-grid')
    expect(detailRateGrid).not.toBeNull()
    expect(detailRateGrid).toHaveClass('is-soft-hidden')
    expect(within(detailSection as HTMLElement).getByText('按期中奖率')).toBeInTheDocument()

    const cardScope = within(groupCard as HTMLElement)
    const oneDigits = cardScope.getAllByText('01')
    expect(oneDigits[0]).toHaveClass('is-hit')
    expect(oneDigits[1]).not.toHaveClass('is-hit')
    expect(oneDigits[1]).toHaveClass('number-ball--muted')
    expect(cardScope.getByText('12')).toHaveClass('is-hit')
  })

  it('matches pl3 history detail by play mode when model id repeats', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '01', '12'],
            lottery_code: 'pl3',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'direct',
              best_hit_count: 2,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct',
                  red_balls: [],
                  blue_balls: [],
                  digits: ['01', '01', '12'],
                },
              ],
            },
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'direct_sum',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct_sum',
                  sum_value: '14',
                  red_balls: [],
                  blue_balls: [],
                  digits: [],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    expect(within(firstHistoryCard as HTMLElement).queryByText('该模型不满足所选玩法。')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('G-1')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('直选')).toBeInTheDocument()
  })

  it('shows pl3 direct_sum detail when history list mode is mislabeled', async () => {
    simulatePl3SumHistoryMislabel.current = true
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '02', '07'],
            lottery_code: 'pl3',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'direct',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct',
                  red_balls: [],
                  blue_balls: [],
                  digits: ['01', '02', '07'],
                  description: '直选分支',
                },
              ],
            },
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              prediction_play_mode: 'direct_sum',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct_sum',
                  sum_value: '10',
                  red_balls: [],
                  blue_balls: [],
                  digits: [],
                  description: '和值分支',
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    expect(within(firstHistoryCard as HTMLElement).queryByText('该模型不满足所选玩法。')).not.toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('和值')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).getByText('和值分支')).toBeInTheDocument()
    expect(within(firstHistoryCard as HTMLElement).queryByText('直选分支')).not.toBeInTheDocument()
  })

  it('uses group-level cost for pl3 direct_sum detail summary', async () => {
    simulatePl3SumHistoryMislabel.current = true
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '02', '07'],
            lottery_code: 'pl3',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 1,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct_sum',
                  sum_value: '10',
                  red_balls: [],
                  blue_balls: [],
                  digits: [],
                  cost_amount: 126,
                  prize_level: '和值',
                  prize_amount: 1040,
                  prize_source: 'fallback',
                },
                {
                  group_id: 2,
                  play_type: 'direct_sum',
                  sum_value: '11',
                  red_balls: [],
                  blue_balls: [],
                  digits: [],
                  cost_amount: 138,
                  prize_amount: 0,
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    expect(within(detailSection as HTMLElement).getByText('264 元')).toBeInTheDocument()
    expect(within(detailSection as HTMLElement).getByText('成本 126 元')).toBeInTheDocument()
    expect(within(detailSection as HTMLElement).getByText('成本 138 元')).toBeInTheDocument()
    const detailSummaryGrid = (detailSection as HTMLElement).querySelector('.history-record-card__model-grid--summary')
    expect(detailSummaryGrid).not.toBeNull()
    expect(detailSummaryGrid).toHaveClass('is-soft-hidden')
    expect(within(detailSummaryGrid as HTMLElement).getByText('1,040 元')).toBeInTheDocument()
  })

  it('shows pl3 sum history records even when model mode is mislabeled', async () => {
    simulatePl3SumHistoryMislabel.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])

    expect(await screen.findByText('第 2026031 期')).toBeInTheDocument()
    expect(screen.queryByText('当前筛选条件下没有历史回溯记录。')).not.toBeInTheDocument()
  })

  it('renders five digits for pl5 prediction groups', async () => {
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '02', '03', '04', '05'],
            lottery_code: 'pl5',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 5,
              predictions: [
                {
                  group_id: 1,
                  play_type: 'direct',
                  red_balls: [],
                  blue_balls: [],
                  digits: ['01', '02', '03', '04', '05'],
                },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列5' }))
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    const firstHistoryCard = screen.getByText('第 2026031 期').closest('.history-record-card')
    expect(firstHistoryCard).not.toBeNull()
    await userEvent.click(within(firstHistoryCard as HTMLElement).getByRole('button', { name: '展开模型详情：模型A' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl5'))

    const detailSection = within(firstHistoryCard as HTMLElement).getByText('openai_compatible').closest('.history-record-card__detail-model')
    expect(detailSection).not.toBeNull()
    const groupCard = within(detailSection as HTMLElement).getByText('G-1').closest('.prediction-group-card')
    expect(groupCard).not.toBeNull()
    expect(groupCard?.querySelectorAll('.number-ball').length).toBe(5)
    expect(within(groupCard as HTMLElement).getByText('04')).toBeInTheDocument()
    expect(within(groupCard as HTMLElement).getByText('05')).toBeInTheDocument()
  })

  it('uses direct-only display and three-position summary for pl3', async () => {
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    expect(screen.queryByText('玩法筛选')).not.toBeInTheDocument()
    expect(screen.queryByText('预测玩法筛选')).not.toBeInTheDocument()
    expect(screen.getByText('第一位（百位）统计')).toBeInTheDocument()
    expect(screen.getByText('第二位（十位）统计')).toBeInTheDocument()
    expect(screen.getByText('第三位（个位）统计')).toBeInTheDocument()
    expect(screen.queryByText('前区统计')).not.toBeInTheDocument()
    expect(screen.queryByText('后区统计')).not.toBeInTheDocument()
  })

  it('shows sum-only statistics for pl3 direct_sum in prediction overview', async () => {
    simulatePl3SumCurrentPredictions.current = true
    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])

    expect(screen.getByText('和值统计')).toBeInTheDocument()
    expect(screen.queryByText('第一位（百位）统计')).not.toBeInTheDocument()
    expect(screen.queryByText('第二位（十位）统计')).not.toBeInTheDocument()
    expect(screen.queryByText('第三位（个位）统计')).not.toBeInTheDocument()
  })

  it('shows sum-only statistics in pl3 history period summary', async () => {
    simulatePl3SumHistoryMislabel.current = true
    getPredictionsHistoryDetail.mockResolvedValue({
      predictions_history: [
        {
          prediction_date: '2026-03-12',
          target_period: '2026031',
          actual_result: {
            period: '2026031',
            date: '2026-03-10',
            red_balls: [],
            blue_balls: [],
            digits: ['01', '02', '07'],
            lottery_code: 'pl3',
          },
          models: [
            {
              model_id: 'model-a',
              model_name: '模型A',
              model_provider: 'openai_compatible',
              best_hit_count: 1,
              predictions: [
                { group_id: 1, play_type: 'direct_sum', sum_value: '10', red_balls: [], blue_balls: [], digits: [] },
                { group_id: 2, play_type: 'direct_sum', sum_value: '11', red_balls: [], blue_balls: [], digits: [] },
              ],
            },
          ],
        },
      ],
      total_count: 1,
    })

    renderPage()

    await userEvent.click(screen.getByRole('button', { name: '排列3' }))
    await userEvent.click(screen.getByRole('button', { name: '开奖回溯' }))
    await userEvent.click(screen.getAllByRole('button', { name: '和值' })[0])

    const firstHistoryCard = await screen.findByText('第 2026031 期')
    const card = firstHistoryCard.closest('.history-record-card')
    expect(card).not.toBeNull()
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: '显示该期预测统计：第 2026031 期' }))

    await waitFor(() => expect(getPredictionsHistoryDetail).toHaveBeenCalledWith('2026031', 'pl3'))
    expect(within(card as HTMLElement).getByText('和值统计')).toBeInTheDocument()
    expect(within(card as HTMLElement).queryByText('第一位（百位）统计')).not.toBeInTheDocument()
    expect(within(card as HTMLElement).queryByText('第二位（十位）统计')).not.toBeInTheDocument()
    expect(within(card as HTMLElement).queryByText('第三位（个位）统计')).not.toBeInTheDocument()
  })
})
