import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { Activity, BarChart3, ChevronDown, Gauge, Trophy } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import { useLotterySelection } from '../../shared/lottery/LotterySelectionProvider'
import type { BacktestPeriod, BacktestPeriodModel, BacktestSummaryResponse, LotteryCode } from '../../shared/types/api'
import { HomeDashboardTabStrip } from './HomeDashboardTabStrip'
import type { PredictionPlayType } from './lib/home'

const RECENT_PERIOD_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 5, label: '近 5 期' },
  { value: 10, label: '近 10 期' },
  { value: 20, label: '近 20 期' },
  { value: 50, label: '近 50 期' },
  { value: null, label: '全部' },
]

const PLAY_TYPE_OPTIONS: Record<LotteryCode, Array<{ value: PredictionPlayType; label: string }>> = {
  dlt: [
    { value: 'direct', label: '普通' },
    { value: 'dlt_compound', label: '复式' },
    { value: 'dlt_dantuo', label: '胆拖' },
  ],
  pl3: [
    { value: 'direct', label: '直选' },
    { value: 'direct_sum', label: '和值' },
    { value: 'pl3_compound', label: '复式' },
  ],
  pl5: [{ value: 'direct', label: '直选' }],
  qxc: [
    { value: 'direct', label: '普通' },
    { value: 'qxc_compound', label: '复式' },
  ],
}

function formatCurrency(value?: number | null) {
  const numeric = Number(value || 0)
  return `¥${numeric.toLocaleString('zh-CN', { maximumFractionDigits: Number.isInteger(numeric) ? 0 : 1 })}`
}

function formatPercent(value?: number | null) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}

function getLotteryDisplayName(lotteryCode: LotteryCode) {
  if (lotteryCode === 'dlt') return '大乐透'
  if (lotteryCode === 'pl3') return '排列3'
  if (lotteryCode === 'pl5') return '排列5'
  return '七星彩'
}

function getPlayModeLabel(value?: string | null, lotteryCode: LotteryCode = 'dlt') {
  if (value === 'compound') return '复式'
  if (value === 'dantuo') return lotteryCode === 'pl3' ? '复式' : '胆拖'
  if (value === 'direct_sum') return '和值'
  return '直选/普通'
}

export function HomeBacktestPage() {
  const { selectedLottery } = useLotterySelection()
  const [recentPeriodCount, setRecentPeriodCount] = useState<number | null>(20)
  const [selectedModelCodes, setSelectedModelCodes] = useState<string[]>([])
  const [selectedPlayTypes, setSelectedPlayTypes] = useState<PredictionPlayType[]>([])
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([])
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null)

  const backtestQuery = useQuery({
    queryKey: [
      'prediction-backtest-summary',
      selectedLottery,
      recentPeriodCount ?? 'all',
      [...selectedModelCodes].sort().join('|'),
      [...selectedPlayTypes].sort().join('|'),
      [...selectedStrategies].sort().join('|'),
    ],
    queryFn: async () =>
      apiClient.getPredictionBacktestSummary({
        lottery_code: selectedLottery,
        recent_period_count: recentPeriodCount,
        model_codes: selectedModelCodes,
        play_type_filters: selectedPlayTypes,
        strategy_filters: selectedStrategies,
      }),
  })

  const data = backtestQuery.data
  const overview = data?.overview
  const modelOptions = useMemo(() => {
    const seen = new Set<string>()
    return (data?.model_rankings || []).filter((item) => {
      if (seen.has(item.model_id)) return false
      seen.add(item.model_id)
      return true
    })
  }, [data?.model_rankings])

  const maxTrendProfit = useMemo(() => {
    const values = (data?.periods || []).map((period) => Math.abs(Number(period.summary.total_prize_amount || 0) - Number(period.summary.total_cost_amount || 0)))
    return Math.max(1, ...values)
  }, [data?.periods])

  function toggleModel(modelId: string) {
    setSelectedModelCodes((previous) => (previous.includes(modelId) ? previous.filter((item) => item !== modelId) : [...previous, modelId]))
  }

  function togglePlayType(playType: PredictionPlayType) {
    setSelectedPlayTypes((previous) => (previous.includes(playType) ? previous.filter((item) => item !== playType) : [...previous, playType]))
  }

  function toggleStrategy(strategy: string) {
    setSelectedStrategies((previous) => (previous.includes(strategy) ? previous.filter((item) => item !== strategy) : [...previous, strategy]))
  }

  return (
    <div className="home-page backtest-page">
      <HomeDashboardTabStrip activeTab="backtest" />
      <section className="page-section backtest-page__shell">
        <StatusCard title="AI 预测回测" subtitle={`${getLotteryDisplayName(selectedLottery)}历史报告事后验证，按综合口径比较模型建议质量。`}>
          <div className="backtest-toolbar">
            <div className="backtest-toolbar__group">
              <span className="backtest-toolbar__label">时间范围</span>
              <div className="filter-chip-group">
                {RECENT_PERIOD_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    className={clsx('filter-chip', recentPeriodCount === option.value && 'is-active')}
                    type="button"
                    onClick={() => setRecentPeriodCount(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="backtest-toolbar__group">
              <span className="backtest-toolbar__label">玩法</span>
              <div className="filter-chip-group">
                {PLAY_TYPE_OPTIONS[selectedLottery].map((option) => (
                  <button
                    key={option.value}
                    className={clsx('filter-chip', selectedPlayTypes.includes(option.value) && 'is-active')}
                    type="button"
                    onClick={() => togglePlayType(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {modelOptions.length ? (
              <div className="backtest-toolbar__group">
                <span className="backtest-toolbar__label">模型</span>
                <div className="filter-chip-group">
                  {modelOptions.slice(0, 12).map((model) => (
                    <button
                      key={model.model_id}
                      className={clsx('filter-chip', selectedModelCodes.includes(model.model_id) && 'is-active')}
                      type="button"
                      onClick={() => toggleModel(model.model_id)}
                    >
                      {model.model_name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {data?.strategy_options?.length ? (
              <div className="backtest-toolbar__group">
                <span className="backtest-toolbar__label">方案</span>
                <div className="filter-chip-group">
                  {data.strategy_options.map((strategy) => (
                    <button
                      key={strategy}
                      className={clsx('filter-chip', selectedStrategies.includes(strategy) && 'is-active')}
                      type="button"
                      onClick={() => toggleStrategy(strategy)}
                    >
                      {strategy}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {backtestQuery.isLoading ? <div className="state-shell">正在计算历史回测...</div> : null}
          {backtestQuery.isError ? <div className="state-shell">回测数据加载失败，请稍后重试。</div> : null}
          {data && !data.periods.length ? <div className="state-shell">当前筛选条件下暂无可回测的历史报告。</div> : null}

          {overview && data?.periods.length ? (
            <>
              <BacktestOverviewGrid data={data} />
              <BacktestRankingTable data={data} lotteryCode={selectedLottery} />
              <BacktestTrend data={data} maxTrendProfit={maxTrendProfit} />
              {data.strategy_breakdown.length ? <BacktestStrategyGrid data={data} /> : null}
              <BacktestPeriodList
                periods={data.periods}
                lotteryCode={data.lottery_code}
                expandedPeriod={expandedPeriod}
                onToggleExpanded={(period) => setExpandedPeriod((current) => (current === period ? null : period))}
              />
            </>
          ) : null}
        </StatusCard>
      </section>
    </div>
  )
}

function BacktestOverviewGrid({ data }: { data: BacktestSummaryResponse }) {
  const overview = data.overview
  const items = [
    { label: '综合分', value: overview.overall_score.toFixed(1), icon: Gauge },
    { label: '中奖期率', value: formatPercent(overview.win_rate_by_period), icon: Trophy },
    { label: 'ROI', value: formatPercent(overview.roi), icon: Activity },
    { label: '净盈亏', value: formatCurrency(overview.net_profit), icon: BarChart3 },
  ]
  return (
    <div className="backtest-overview-grid">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <article key={item.label} className="backtest-overview-card">
            <Icon size={20} aria-hidden="true" />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        )
      })}
      <article className="backtest-overview-card backtest-overview-card--wide">
        <span>样本</span>
        <strong>{overview.period_count} 期 / {overview.model_count} 个模型</strong>
        <small>成本 {formatCurrency(overview.total_cost_amount)}，奖金 {formatCurrency(overview.total_prize_amount)}，中奖 {overview.winning_bet_count}/{overview.total_bet_count} 注</small>
      </article>
    </div>
  )
}

function BacktestRankingTable({ data, lotteryCode }: { data: BacktestSummaryResponse; lotteryCode: LotteryCode }) {
  return (
    <section className="backtest-section">
      <div className="backtest-section__header">
        <h3>模型排行榜</h3>
        <span>按综合分、净盈亏和中奖期率排序</span>
      </div>
      <div className="backtest-table-shell">
        <table className="backtest-table">
          <thead>
            <tr>
              <th>模型</th>
              <th>玩法</th>
              <th>综合分</th>
              <th>中奖期率</th>
              <th>按注中奖</th>
              <th>ROI</th>
              <th>净盈亏</th>
              <th>最佳 / 最差期</th>
            </tr>
          </thead>
          <tbody>
            {data.model_rankings.map((model) => (
              <tr key={`${model.model_id}-${model.prediction_play_mode}`}>
                <td><strong>{model.model_name}</strong><span>{model.model_id}</span></td>
                <td>{getPlayModeLabel(model.prediction_play_mode, lotteryCode)}</td>
                <td>{model.overall_score}</td>
                <td>{formatPercent(model.win_rate_by_period)}</td>
                <td>{formatPercent(model.win_rate_by_bet)}</td>
                <td>{formatPercent(model.roi)}</td>
                <td className={clsx(model.net_profit >= 0 ? 'is-positive' : 'is-negative')}>{formatCurrency(model.net_profit)}</td>
                <td>{model.best_period?.target_period || '-'} / {model.worst_period?.target_period || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function BacktestTrend({ data, maxTrendProfit }: { data: BacktestSummaryResponse; maxTrendProfit: number }) {
  return (
    <section className="backtest-section">
      <div className="backtest-section__header">
        <h3>期号趋势</h3>
        <span>每期净盈亏、中奖状态和最佳命中数</span>
      </div>
      <div className="backtest-trend">
        {[...data.periods].reverse().map((period) => {
          const netProfit = Number(period.summary.total_prize_amount || 0) - Number(period.summary.total_cost_amount || 0)
          const bestHitCount = Math.max(0, ...period.models.map((model) => Number(model.best_hit_count || 0)))
          const isWinning = period.models.some((model) => model.hit_period_win)
          const width = `${Math.max(8, Math.round((Math.abs(netProfit) / maxTrendProfit) * 100))}%`
          return (
            <article key={period.target_period} className="backtest-trend__row">
              <span>第 {period.target_period} 期</span>
              <div className="backtest-trend__bar-track">
                <div className={clsx('backtest-trend__bar', netProfit >= 0 ? 'is-positive' : 'is-negative')} style={{ width }} />
              </div>
              <strong>{formatCurrency(netProfit)}</strong>
              <small>{isWinning ? '中奖' : '未中'} / 最佳 {bestHitCount}</small>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function BacktestStrategyGrid({ data }: { data: BacktestSummaryResponse }) {
  return (
    <section className="backtest-section">
      <div className="backtest-section__header">
        <h3>方案表现</h3>
        <span>按历史报告里的策略标签拆分</span>
      </div>
      <div className="backtest-strategy-grid">
        {data.strategy_breakdown.map((strategy) => (
          <article key={strategy.strategy} className="backtest-strategy-card">
            <strong>{strategy.strategy}</strong>
            <span>综合分 {strategy.overall_score}</span>
            <span>中奖期率 {formatPercent(strategy.win_rate_by_period)}</span>
            <span>ROI {formatPercent(strategy.roi)}</span>
            <small>{strategy.period_count} 期，净盈亏 {formatCurrency(strategy.net_profit)}</small>
          </article>
        ))}
      </div>
    </section>
  )
}

function BacktestPeriodList({
  periods,
  lotteryCode,
  expandedPeriod,
  onToggleExpanded,
}: {
  periods: BacktestPeriod[]
  lotteryCode: LotteryCode
  expandedPeriod: string | null
  onToggleExpanded: (period: string) => void
}) {
  return (
    <section className="backtest-section">
      <div className="backtest-section__header">
        <h3>期号明细</h3>
        <span>逐期核对开奖号与模型建议验证结果</span>
      </div>
      <div className="backtest-period-list">
        {periods.map((period) => (
          <article key={period.target_period} className="backtest-period-card">
            <button className="backtest-period-card__trigger" type="button" onClick={() => onToggleExpanded(period.target_period)}>
              <div>
                <strong>第 {period.target_period} 期</strong>
                <span>{period.actual_result?.date || period.prediction_date || '-'}</span>
              </div>
              <ActualNumbers period={period} />
              <div className="backtest-period-card__summary">
                <span>{period.summary.total_bet_count} 注</span>
                <span>{formatCurrency(period.summary.total_prize_amount - period.summary.total_cost_amount)}</span>
                <ChevronDown className={clsx(expandedPeriod === period.target_period && 'is-open')} size={18} aria-hidden="true" />
              </div>
            </button>
            {expandedPeriod === period.target_period ? (
              <div className="backtest-period-card__models">
                {period.models.map((model) => (
                  <PeriodModelRow key={`${period.target_period}-${model.model_id}-${model.prediction_play_mode}`} model={model} lotteryCode={lotteryCode} />
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}

function ActualNumbers({ period }: { period: BacktestPeriod }) {
  const result = period.actual_result
  if (!result) return <span className="backtest-period-card__empty">无开奖号</span>
  const values = result.digits?.length ? result.digits : result.red_balls
  return (
    <div className="backtest-number-row">
      {values.map((ball, index) => <NumberBall key={`${ball}-${index}`} value={ball} color="red" />)}
      {(result.blue_balls || []).map((ball, index) => <NumberBall key={`blue-${ball}-${index}`} value={ball} color="blue" />)}
    </div>
  )
}

function PeriodModelRow({ model, lotteryCode }: { model: BacktestPeriodModel; lotteryCode: LotteryCode }) {
  return (
    <div className="backtest-period-model">
      <strong>{model.model_name}</strong>
      <span>{getPlayModeLabel(model.prediction_play_mode, lotteryCode)} · 最佳 {model.best_hit_count}</span>
      <span>{model.winning_bet_count}/{model.bet_count} 注</span>
      <span className={clsx(model.net_profit >= 0 ? 'is-positive' : 'is-negative')}>{formatCurrency(model.net_profit)}</span>
    </div>
  )
}
