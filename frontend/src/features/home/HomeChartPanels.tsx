import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { LotteryCode } from '../../shared/types/api'

type FrequencyChartItem = {
  ball: string
  count: number
}

type OddEvenChartItem = {
  period: string
  odd: number
  even: number
}

type Pl3OddEvenStructureChartItem = {
  period: string
  oddCount: number
  structure: string
}

type Pl5OddEvenStructureChartItem = {
  period: string
  oddCount: number
  structure: string
}

type SumTrendChartItem = {
  period: string
  sum: number
}

type NumberDistributionChartItem = {
  label: string
  count: number
  ratio?: number
}

type NumberTrendChartItem = {
  period: string
  value: number
  pattern?: string
}

type HistoryModelRef = {
  model_id: string
  model_name: string
}

type HistoryTrendItem = Record<string, string | number>

type HistoryHeatmapCell = {
  period: string
  model_id: string
  model_name: string
  hit_count: number
  is_winning_period: boolean
}

type HistoryProfitDistributionItem = {
  model_id: string
  model_name: string
  profitPeriods: number
  lossPeriods: number
  flatPeriods: number
}

function formatProfitValue(value: number) {
  return `${new Intl.NumberFormat('zh-CN', { signDisplay: 'exceptZero' }).format(Number(value) || 0)} 元`
}

function ChartInfoTooltip({ title, description }: { title: string; description: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div
      className="chart-info-tooltip"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button
        type="button"
        className="chart-info-tooltip__trigger"
        aria-label={`${title}说明`}
        onClick={(event) => event.preventDefault()}
      >
        ?
      </button>
      {isOpen ? (
        <div className="chart-info-tooltip__panel" role="tooltip">
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
      ) : null}
    </div>
  )
}

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel-card chart-card${className ? ` ${className}` : ''}`}>
      <div className="panel-card__header">
        <div className="chart-card__title-row">
          <h2 className="panel-card__title">{title}</h2>
          {description ? <ChartInfoTooltip title={title} description={description} /> : null}
        </div>
      </div>
      {children}
    </section>
  )
}

function getModelTrendColor(index: number) {
  const palette = ['#f2a54f', '#3d8df5', '#d7405a', '#3fc27d', '#c084fc', '#fb7185', '#22d3ee', '#f97316']
  return palette[index % palette.length]
}

const chartTooltipContentStyle: CSSProperties = {
  background: 'var(--chart-tooltip-bg)',
  border: '1px solid var(--chart-tooltip-border)',
  borderRadius: '14px',
  boxShadow: 'var(--chart-tooltip-shadow)',
  backdropFilter: 'blur(10px)',
  padding: '10px 12px',
}

const chartTooltipLabelStyle: CSSProperties = {
  color: 'var(--chart-tooltip-label)',
  fontWeight: 600,
  marginBottom: '6px',
}

const chartTooltipItemStyle: CSSProperties = {
  color: 'var(--chart-tooltip-text)',
  fontWeight: 600,
}

const chartTooltipCursor = { stroke: 'rgba(173, 191, 220, 0.42)', strokeWidth: 1.2 }

const commonChartTooltipProps = {
  contentStyle: chartTooltipContentStyle,
  labelStyle: chartTooltipLabelStyle,
  itemStyle: chartTooltipItemStyle,
  cursor: chartTooltipCursor,
  wrapperStyle: {
    zIndex: 80,
    pointerEvents: 'none',
  } satisfies CSSProperties,
}

function HistoryChartShell({ title, children, ariaLabel }: { title: string; children: ReactNode; ariaLabel?: string }) {
  return (
    <div className="history-hit-trend__chart-shell" aria-label={ariaLabel}>
      <p className="history-hit-trend__chart-title">{title}</p>
      {children}
    </div>
  )
}

function getSortedHistoryData(historyHitTrend: HistoryTrendItem[], historyProfitTrend: HistoryTrendItem[]) {
  const sortByPeriod = (left: HistoryTrendItem, right: HistoryTrendItem) => {
    const leftPeriod = Number(left.period)
    const rightPeriod = Number(right.period)
    const leftIsNumber = Number.isFinite(leftPeriod)
    const rightIsNumber = Number.isFinite(rightPeriod)
    if (leftIsNumber && rightIsNumber) return leftPeriod - rightPeriod
    return String(left.period || '').localeCompare(String(right.period || ''))
  }

  return {
    sortedTrendData: [...historyHitTrend].sort(sortByPeriod),
    sortedProfitData: [...historyProfitTrend].sort(sortByPeriod),
  }
}

function buildHistoryChartClickHandler(onPeriodSelect?: (period: string) => void) {
  return (state?: { activeLabel?: string | number | null }) => {
    const period = state?.activeLabel
    if (period !== undefined && period !== null) onPeriodSelect?.(String(period))
  }
}

function formatRoiValue(value: number) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`
}

function formatPercentValue(value: number) {
  return `${(Number(value || 0) * 100).toFixed(0)}%`
}

function resolveHeatmapCellTone(hitCount: number, isWinningPeriod: boolean) {
  if (hitCount >= 4) return 'history-heatmap__cell--strong'
  if (hitCount >= 2) return 'history-heatmap__cell--warm'
  if (isWinningPeriod) return 'history-heatmap__cell--win'
  return 'history-heatmap__cell--cool'
}

export function AnalysisHotChartsPanel({
  lotteryCode,
  redChart,
  blueChart,
  pl3UnitChart,
  pl5PositionCharts,
}: {
  lotteryCode: LotteryCode
  redChart: FrequencyChartItem[]
  blueChart: FrequencyChartItem[]
  pl3UnitChart: FrequencyChartItem[]
  pl5PositionCharts: FrequencyChartItem[][]
}) {
  if (lotteryCode === 'pl3') {
    return (
      <div className="page-section chart-grid">
        <ChartCard title="百位热号 Top 10" description="统计最近样本中百位数字的出现次数，快速找出当前更活跃的候选数字。柱子越高，说明该数字近期出现越频繁。">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={redChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--red-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="十位热号 Top 10" description="统计最近样本中十位数字的出现次数，用来判断十位号码的近期热度分布。适合和百位、个位热号一起交叉观察。">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={blueChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--amber-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="个位热号 Top 10" description="统计最近样本中个位数字的出现次数，帮助识别个位数字的短期活跃区间。可配合和值和奇偶结构一起解读。">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={pl3UnitChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--blue-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    )
  }

  if (lotteryCode === 'pl5') {
    const [tenThousands = [], thousands = [], hundreds = [], tens = [], units = []] = pl5PositionCharts
    return (
      <div className="page-section chart-grid">
        <ChartCard title="万位热号 Top 10" description="统计最近样本中万位数字的出现次数，帮助识别万位近期更常出现的数字。">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={tenThousands}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--red-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="千位热号 Top 10" description="统计最近样本中千位数字的出现次数，适合观察千位号码是否出现明显集中。">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={thousands}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--amber-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="百位热号 Top 10" description="统计最近样本中百位数字的出现次数，用来判断这一位是否存在持续活跃的候选数字。">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hundreds}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--blue-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="十位热号 Top 10" description="统计最近样本中十位数字的出现次数，帮助识别十位近期的热度变化。">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={tens}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="个位热号 Top 10" description="统计最近样本中个位数字的出现次数，观察个位数字是否出现局部聚集或轮动。">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={units}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="#22c55e" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    )
  }

  return (
    <div className="page-section chart-grid">
      <ChartCard title="前区热号 Top 12" description="统计最近样本中前区号码的出现次数，帮助判断当前更热的前区号码。它回答的是“哪些号更常出现”，不表示命中概率保证。">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={redChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="ball" />
            <YAxis allowDecimals={false} />
            <Tooltip {...commonChartTooltipProps} />
            <Bar dataKey="count" fill="var(--red-500)" radius={[12, 12, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="后区热号 Top 12" description="统计最近样本中后区号码的出现次数，适合用来观察后区近期的热度集中和轮动情况。">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={blueChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="ball" />
            <YAxis allowDecimals={false} />
            <Tooltip {...commonChartTooltipProps} />
            <Bar dataKey="count" fill="var(--blue-500)" radius={[12, 12, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

export function AnalysisSumTrendChartCard({
  lotteryCode,
  sumTrendChart,
}: {
  lotteryCode: LotteryCode
  sumTrendChart: SumTrendChartItem[]
}) {
  const title = lotteryCode === 'dlt' ? '前区和值趋势' : '和值趋势'

  return (
    <div className="page-section chart-grid chart-grid--single">
      <ChartCard
        title={title}
        description={lotteryCode === 'dlt'
          ? '展示前区号码和值随期数变化的趋势，用来判断和值是否处于高位、低位或中枢附近震荡。适合观察节奏变化，不适合单独做号码判断。'
          : '展示当期开奖号码和值随期数变化的趋势，用来判断和值是否集中在某个区间，或是否出现明显波动。'}
        className="chart-card--focus"
      >
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={sumTrendChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" />
            <YAxis allowDecimals={false} />
            <Tooltip {...commonChartTooltipProps} />
            <Line type="monotone" dataKey="sum" stroke="var(--blue-500)" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

export function AnalysisOddEvenTrendChartCard({
  lotteryCode,
  oddEvenChart,
}: {
  lotteryCode: LotteryCode
  oddEvenChart: Array<OddEvenChartItem | Pl3OddEvenStructureChartItem | Pl5OddEvenStructureChartItem>
}) {
  if (lotteryCode === 'pl3') {
    const structureTrend = oddEvenChart as Pl3OddEvenStructureChartItem[]
    return (
      <div className="page-section chart-grid chart-grid--single">
        <ChartCard title="奇偶结构走势" description="展示每期号码中的奇偶数量结构，帮助判断近期更偏奇数还是偶数，以及结构是否稳定。适合配合和值和热号一起看整体形态。" className="chart-card--focus">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={structureTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} ticks={[0, 1, 2, 3]} tickFormatter={(value) => `${Number(value)}:${3 - Number(value)}`} />
              <Tooltip {...commonChartTooltipProps} formatter={(value) => `${Number(value)}:${3 - Number(value)}`} />
              <Line type="monotone" dataKey="oddCount" stroke="var(--red-500)" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    )
  }

  if (lotteryCode === 'pl5') {
    const structureTrend = oddEvenChart as Pl5OddEvenStructureChartItem[]
    return (
      <div className="page-section chart-grid chart-grid--single">
        <ChartCard title="奇偶结构走势" description="展示每期号码中的奇偶数量结构，帮助观察排列5近期是否偏奇、偏偶或在不同结构间切换。" className="chart-card--focus">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={structureTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} ticks={[0, 1, 2, 3, 4, 5]} tickFormatter={(value) => `${Number(value)}:${5 - Number(value)}`} />
              <Tooltip {...commonChartTooltipProps} formatter={(value) => `${Number(value)}:${5 - Number(value)}`} />
              <Line type="monotone" dataKey="oddCount" stroke="var(--red-500)" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    )
  }

  const oddEvenTrend = oddEvenChart as OddEvenChartItem[]
  return (
    <div className="page-section chart-grid chart-grid--single">
      <ChartCard title="奇偶结构走势" description="展示每期前区号码的奇偶结构变化，用来判断当前更常见的奇偶配比以及切换节奏。" className="chart-card--focus">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={oddEvenTrend}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" />
            <YAxis allowDecimals={false} />
            <Tooltip {...commonChartTooltipProps} />
            <Legend />
            <Area type="monotone" dataKey="odd" stackId="1" stroke="var(--red-500)" fill="rgba(215, 64, 90, 0.6)" />
            <Area type="monotone" dataKey="even" stackId="1" stroke="var(--amber-500)" fill="rgba(242, 165, 79, 0.6)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

export function AnalysisChartsPanel({
  lotteryCode,
  redChart,
  blueChart,
  pl3UnitChart,
  pl5PositionCharts,
  oddEvenChart,
  sumTrendChart,
}: {
  lotteryCode: LotteryCode
  redChart: FrequencyChartItem[]
  blueChart: FrequencyChartItem[]
  pl3UnitChart: FrequencyChartItem[]
  pl5PositionCharts: FrequencyChartItem[][]
  oddEvenChart: Array<OddEvenChartItem | Pl3OddEvenStructureChartItem | Pl5OddEvenStructureChartItem>
  sumTrendChart: SumTrendChartItem[]
}) {
  return (
    <>
      <AnalysisHotChartsPanel
        lotteryCode={lotteryCode}
        redChart={redChart}
        blueChart={blueChart}
        pl3UnitChart={pl3UnitChart}
        pl5PositionCharts={pl5PositionCharts}
      />
      <AnalysisSumTrendChartCard lotteryCode={lotteryCode} sumTrendChart={sumTrendChart} />
      <AnalysisOddEvenTrendChartCard lotteryCode={lotteryCode} oddEvenChart={oddEvenChart} />
    </>
  )
}

export function AnalysisDistributionChartsPanel({
  lotteryCode,
  sumDistribution,
  oddEvenDistribution,
  zoneShareDistribution,
}: {
  lotteryCode: LotteryCode
  sumDistribution: NumberDistributionChartItem[]
  oddEvenDistribution: NumberDistributionChartItem[]
  zoneShareDistribution: NumberDistributionChartItem[]
}) {
  return (
    <div className="page-section chart-grid">
      <ChartCard
        title={lotteryCode === 'dlt' ? '前区和值分布' : '和值分布'}
        description="统计最近样本里不同和值区间出现了多少次，用来判断和值更常落在哪些位置。它强调的是整体分布，而不是逐期走势。"
      >
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={sumDistribution}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip {...commonChartTooltipProps} />
            <Bar dataKey="count" fill="var(--blue-500)" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="奇偶比分布" description="统计最近样本里不同奇偶配比出现的次数，帮助识别当前更常见的奇偶结构。适合用来验证结构是否偏向某一类组合。">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={oddEvenDistribution}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip {...commonChartTooltipProps} />
            <Bar dataKey="count" fill="var(--amber-500)" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="区间占比分布" description="统计最近样本中全部号码落入各区间的总体占比，帮助判断号码更集中在哪个区段。它看的是整体落点占比，不是每期结构模式。">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={zoneShareDistribution}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip
              {...commonChartTooltipProps}
              formatter={(value, _name, item) => {
                const ratio = Number(item?.payload?.ratio || 0)
                return [`${value} 次（${formatPercentValue(ratio)}）`, '区间占比']
              }}
            />
            <Bar dataKey="count" fill="var(--violet-500)" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

export function AnalysisPatternChartsPanel({
  lotteryCode,
  spanTrend,
  zoneDistribution,
  moduloTrend,
}: {
  lotteryCode: LotteryCode
  spanTrend: NumberTrendChartItem[]
  zoneDistribution: NumberDistributionChartItem[]
  moduloTrend: NumberTrendChartItem[]
}) {
  return (
    <div className="page-section chart-grid">
      <ChartCard title="跨度趋势" description="展示每期号码最大值与最小值的差距变化，用来观察号码分散程度是放大还是收缩。跨度越大，说明号码分布越开。">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={spanTrend}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" />
            <YAxis allowDecimals={false} />
            <Tooltip {...commonChartTooltipProps} />
            <Line type="monotone" dataKey="value" stroke="var(--red-500)" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title={lotteryCode === 'dlt' ? '区间分布' : '区段分布'} description="统计每期开奖结果在各区间结构组合上的出现次数，用来观察近期更常见的结构模式。它和区间占比分布不同，这里强调的是“每期结构组合”。">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={zoneDistribution}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip {...commonChartTooltipProps} />
            <Bar dataKey="count" fill="var(--blue-500)" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="012路走势" description="按号码除以 3 后的余数结构展示每期变化，用来观察 0 路、1 路、2 路的组合是否存在明显偏态或轮动。">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={moduloTrend}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" />
            <YAxis allowDecimals={false} tickFormatter={(value) => String(value)} />
            <Tooltip {...commonChartTooltipProps} formatter={(_, __, payload) => payload?.payload?.pattern || ''} />
            <Line type="monotone" dataKey="value" stroke="var(--amber-500)" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

export function HistoryHitTrendLineChartCard({
  historyVisibleModels,
  historyHitTrend,
  selectedPeriod,
  onPeriodSelect,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyHitTrend: HistoryTrendItem[]
  selectedPeriod?: string | null
  onPeriodSelect?: (period: string) => void
}) {
  const { sortedTrendData } = getSortedHistoryData(historyHitTrend, [])
  const onChartClick = buildHistoryChartClickHandler(onPeriodSelect)

  return (
    <ChartCard title="命中趋势折线" description="展示各模型在每一期的最佳命中数量变化，用来观察命中表现是否持续稳定。折线越平稳，通常代表表现波动越小。" className="chart-card--focus">
      {historyVisibleModels.length && historyHitTrend.length ? (
        <HistoryChartShell title="模型命中趋势" ariaLabel="模型命中趋势图">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={sortedTrendData} onClick={onChartClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} />
              {selectedPeriod ? <ReferenceLine x={selectedPeriod} stroke="rgba(242, 165, 79, 0.72)" strokeDasharray="4 4" /> : null}
              <Tooltip {...commonChartTooltipProps} />
              <Legend />
              {historyVisibleModels.map((model, index) => (
                <Line
                  key={model.model_id}
                  type="monotone"
                  dataKey={model.model_id}
                  name={model.model_name}
                  stroke={getModelTrendColor(index)}
                  strokeWidth={3}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的历史命中趋势。</div>
      )}
    </ChartCard>
  )
}

export function HistoryHitTrendStackedChartCard({
  historyVisibleModels,
  historyHitTrend,
  selectedPeriod,
  onPeriodSelect,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyHitTrend: HistoryTrendItem[]
  selectedPeriod?: string | null
  onPeriodSelect?: (period: string) => void
}) {
  const { sortedTrendData } = getSortedHistoryData(historyHitTrend, [])
  const onChartClick = buildHistoryChartClickHandler(onPeriodSelect)

  return (
    <ChartCard title="命中堆叠柱形统计" description="把同一期不同模型的命中数量堆叠在一起，方便横向比较同一期里谁贡献更高。它更适合看结构占比，而不是连续趋势。" className="chart-card--focus">
      {historyVisibleModels.length && historyHitTrend.length ? (
        <HistoryChartShell title="模型命中堆叠统计" ariaLabel="模型命中堆叠统计图">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={sortedTrendData} onClick={onChartClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} />
              {selectedPeriod ? <ReferenceLine x={selectedPeriod} stroke="rgba(242, 165, 79, 0.72)" strokeDasharray="4 4" /> : null}
              <Tooltip {...commonChartTooltipProps} />
              <Legend />
              {historyVisibleModels.map((model, index) => (
                <Bar
                  key={`stack-${model.model_id}`}
                  dataKey={model.model_id}
                  name={model.model_name}
                  stackId="hitStack"
                  fill={getModelTrendColor(index)}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的历史命中趋势。</div>
      )}
    </ChartCard>
  )
}

export function HistoryProfitTrendChartCard({
  historyVisibleModels,
  historyProfitTrend,
  selectedPeriod,
  onPeriodSelect,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyProfitTrend: HistoryTrendItem[]
  selectedPeriod?: string | null
  onPeriodSelect?: (period: string) => void
}) {
  const { sortedProfitData } = getSortedHistoryData([], historyProfitTrend)
  const onChartClick = buildHistoryChartClickHandler(onPeriodSelect)

  return (
    <ChartCard title="盈亏趋势折线" description="展示各模型每一期的单期净盈亏变化，用来快速识别大赚、大亏和波动放大的阶段。适合观察短期收益节奏。 " className="chart-card--focus">
      {historyVisibleModels.length && historyProfitTrend.length ? (
        <HistoryChartShell title="模型盈亏趋势" ariaLabel="模型盈亏趋势图">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={sortedProfitData} onClick={onChartClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis
                domain={([dataMin, dataMax]) => {
                  const min = Number.isFinite(Number(dataMin)) ? Number(dataMin) : 0
                  const max = Number.isFinite(Number(dataMax)) ? Number(dataMax) : 0
                  if (min === max) return [min - 1, max + 1]
                  return [Math.min(min, 0), Math.max(max, 0)]
                }}
              />
              {selectedPeriod ? <ReferenceLine x={selectedPeriod} stroke="rgba(242, 165, 79, 0.72)" strokeDasharray="4 4" /> : null}
              <ReferenceLine y={0} stroke="rgba(173, 191, 220, 0.52)" strokeDasharray="4 4" />
              <Tooltip {...commonChartTooltipProps} formatter={(value) => formatProfitValue(Number(value || 0))} />
              <Legend />
              {historyVisibleModels.map((model, index) => (
                <Line
                  key={`prize-${model.model_id}`}
                  type="monotone"
                  dataKey={model.model_id}
                  name={model.model_name}
                  stroke={getModelTrendColor(index)}
                  strokeWidth={3}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的历史命中趋势。</div>
      )}
    </ChartCard>
  )
}

export function HistoryCumulativeProfitChartCard({
  historyVisibleModels,
  historyTrend,
  selectedPeriod,
  onPeriodSelect,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyTrend: HistoryTrendItem[]
  selectedPeriod?: string | null
  onPeriodSelect?: (period: string) => void
}) {
  const { sortedTrendData } = getSortedHistoryData(historyTrend, [])
  const onChartClick = buildHistoryChartClickHandler(onPeriodSelect)

  return (
    <ChartCard title="累计盈亏曲线" description="按时间累加每期净盈亏，直接判断模型长期是否整体向上。曲线越平滑且向上，通常代表长期收益更稳。 " className="chart-card--focus">
      {historyVisibleModels.length && historyTrend.length ? (
        <HistoryChartShell title="累计净盈亏" ariaLabel="模型累计盈亏曲线">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={sortedTrendData} onClick={onChartClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis />
              {selectedPeriod ? <ReferenceLine x={selectedPeriod} stroke="rgba(242, 165, 79, 0.72)" strokeDasharray="4 4" /> : null}
              <ReferenceLine y={0} stroke="rgba(173, 191, 220, 0.52)" strokeDasharray="4 4" />
              <Tooltip {...commonChartTooltipProps} formatter={(value) => formatProfitValue(Number(value || 0))} />
              <Legend />
              {historyVisibleModels.map((model, index) => (
                <Line key={`cum-profit-${model.model_id}`} type="monotone" dataKey={model.model_id} name={model.model_name} stroke={getModelTrendColor(index)} strokeWidth={3} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的累计盈亏数据。</div>
      )}
    </ChartCard>
  )
}

export function HistoryCumulativeRoiChartCard({
  historyVisibleModels,
  historyTrend,
  selectedPeriod,
  onPeriodSelect,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyTrend: HistoryTrendItem[]
  selectedPeriod?: string | null
  onPeriodSelect?: (period: string) => void
}) {
  const { sortedTrendData } = getSortedHistoryData(historyTrend, [])
  const onChartClick = buildHistoryChartClickHandler(onPeriodSelect)

  return (
    <ChartCard title="累计 ROI 曲线" description="用累计收益相对累计成本的比值来比较模型效率，适合不同投注规模之间做标准化对比。数值越高，代表资金使用效率越好。 " className="chart-card--focus">
      {historyVisibleModels.length && historyTrend.length ? (
        <HistoryChartShell title="累计收益率" ariaLabel="模型累计ROI曲线">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={sortedTrendData} onClick={onChartClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
              {selectedPeriod ? <ReferenceLine x={selectedPeriod} stroke="rgba(242, 165, 79, 0.72)" strokeDasharray="4 4" /> : null}
              <ReferenceLine y={0} stroke="rgba(173, 191, 220, 0.52)" strokeDasharray="4 4" />
              <Tooltip {...commonChartTooltipProps} formatter={(value) => formatRoiValue(Number(value || 0))} />
              <Legend />
              {historyVisibleModels.map((model, index) => (
                <Line key={`cum-roi-${model.model_id}`} type="monotone" dataKey={model.model_id} name={model.model_name} stroke={getModelTrendColor(index)} strokeWidth={3} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的累计 ROI 数据。</div>
      )}
    </ChartCard>
  )
}

export function HistoryRollingHitRateChartCard({
  historyVisibleModels,
  historyTrend,
  selectedPeriod,
  onPeriodSelect,
  rollingWindow,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyTrend: HistoryTrendItem[]
  selectedPeriod?: string | null
  onPeriodSelect?: (period: string) => void
  rollingWindow: number
}) {
  const { sortedTrendData } = getSortedHistoryData(historyTrend, [])
  const onChartClick = buildHistoryChartClickHandler(onPeriodSelect)

  return (
    <ChartCard title={`滚动命中率（近 ${rollingWindow} 期）`} description="按滚动窗口计算近几期的命中率，用来观察模型稳定性而不是单期波动。窗口越大，曲线越平滑，越适合看趋势。 " className="chart-card--focus">
      {historyVisibleModels.length && historyTrend.length ? (
        <HistoryChartShell title="滚动命中稳定性" ariaLabel="模型滚动命中率曲线">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={sortedTrendData} onClick={onChartClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`} />
              {selectedPeriod ? <ReferenceLine x={selectedPeriod} stroke="rgba(242, 165, 79, 0.72)" strokeDasharray="4 4" /> : null}
              <Tooltip {...commonChartTooltipProps} formatter={(value) => formatPercentValue(Number(value || 0))} />
              <Legend />
              {historyVisibleModels.map((model, index) => (
                <Line key={`rolling-hit-${model.model_id}`} type="monotone" dataKey={model.model_id} name={model.model_name} stroke={getModelTrendColor(index)} strokeWidth={3} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的滚动命中率数据。</div>
      )}
    </ChartCard>
  )
}

export function HistoryDrawdownChartCard({
  historyVisibleModels,
  historyTrend,
  selectedPeriod,
  onPeriodSelect,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyTrend: HistoryTrendItem[]
  selectedPeriod?: string | null
  onPeriodSelect?: (period: string) => void
}) {
  const { sortedTrendData } = getSortedHistoryData(historyTrend, [])
  const onChartClick = buildHistoryChartClickHandler(onPeriodSelect)

  return (
    <ChartCard title="最大回撤曲线" description="展示模型从阶段高点回落的幅度，帮助判断策略在盈利过程中承受了多大回吐。越接近 0，通常说明风险控制越稳。 " className="chart-card--focus">
      {historyVisibleModels.length && historyTrend.length ? (
        <HistoryChartShell title="回撤风险" ariaLabel="模型最大回撤曲线">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={sortedTrendData} onClick={onChartClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis />
              {selectedPeriod ? <ReferenceLine x={selectedPeriod} stroke="rgba(242, 165, 79, 0.72)" strokeDasharray="4 4" /> : null}
              <ReferenceLine y={0} stroke="rgba(173, 191, 220, 0.52)" strokeDasharray="4 4" />
              <Tooltip {...commonChartTooltipProps} formatter={(value) => formatProfitValue(Number(value || 0))} />
              <Legend />
              {historyVisibleModels.map((model, index) => (
                <Area key={`drawdown-${model.model_id}`} type="monotone" dataKey={model.model_id} name={model.model_name} stroke={getModelTrendColor(index)} fill={getModelTrendColor(index)} fillOpacity={0.18} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的回撤数据。</div>
      )}
    </ChartCard>
  )
}

export function HistoryRankTrendChartCard({
  historyVisibleModels,
  historyTrend,
  selectedPeriod,
  onPeriodSelect,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyTrend: HistoryTrendItem[]
  selectedPeriod?: string | null
  onPeriodSelect?: (period: string) => void
}) {
  const { sortedTrendData } = getSortedHistoryData(historyTrend, [])
  const onChartClick = buildHistoryChartClickHandler(onPeriodSelect)

  return (
    <ChartCard title="模型排名变化图" description="按累计表现给模型排序，观察每一期谁领先、谁掉队。排名越靠前越强，适合看 leader 是否频繁切换。 " className="chart-card--focus">
      {historyVisibleModels.length && historyTrend.length ? (
        <HistoryChartShell title="累计收益排名" ariaLabel="模型排名变化图">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={sortedTrendData} onClick={onChartClick}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} reversed domain={[1, Math.max(historyVisibleModels.length, 1)]} />
              {selectedPeriod ? <ReferenceLine x={selectedPeriod} stroke="rgba(242, 165, 79, 0.72)" strokeDasharray="4 4" /> : null}
              <Tooltip {...commonChartTooltipProps} formatter={(value) => `第 ${Number(value || 0)} 名`} />
              <Legend />
              {historyVisibleModels.map((model, index) => (
                <Line key={`rank-${model.model_id}`} type="monotone" dataKey={model.model_id} name={model.model_name} stroke={getModelTrendColor(index)} strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的排名变化数据。</div>
      )}
    </ChartCard>
  )
}

export function HistoryProfitDistributionChartCard({
  distribution,
}: {
  distribution: HistoryProfitDistributionItem[]
}) {
  return (
    <ChartCard title="胜负分布图" description="统计每个模型盈利期、亏损期和持平期的数量分布，帮助判断它更常见的是小赚小亏还是稳定正向。 " className="chart-card--focus">
      {distribution.length ? (
        <HistoryChartShell title="盈利 / 亏损 / 持平期数分布" ariaLabel="模型胜负分布图">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={distribution} layout="vertical" margin={{ left: 16, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="model_name" width={90} />
              <Tooltip {...commonChartTooltipProps} />
              <Legend />
              <Bar dataKey="profitPeriods" name="盈利期" stackId="profitMix" fill="var(--green-500, #22c55e)" />
              <Bar dataKey="flatPeriods" name="持平期" stackId="profitMix" fill="var(--amber-500)" />
              <Bar dataKey="lossPeriods" name="亏损期" stackId="profitMix" fill="var(--red-500)" />
            </BarChart>
          </ResponsiveContainer>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的胜负分布数据。</div>
      )}
    </ChartCard>
  )
}

export function HistoryHitHeatmapCard({
  heatmap,
  historyVisibleModels,
  onPeriodSelect,
}: {
  heatmap: HistoryHeatmapCell[]
  historyVisibleModels: HistoryModelRef[]
  onPeriodSelect?: (period: string) => void
}) {
  const periods = Array.from(new Set(heatmap.map((item) => item.period)))
  const cellsByKey = new Map(heatmap.map((item) => [`${item.model_id}::${item.period}`, item]))

  return (
    <ChartCard title="命中热力图" description="用模型和期号构成二维热力图，快速看出哪些模型更稳定、哪些阶段明显失真。颜色越暖，通常代表命中更强。 " className="chart-card--focus">
      {heatmap.length && historyVisibleModels.length ? (
        <HistoryChartShell title="模型 × 期号命中热度" ariaLabel="模型命中热力图">
          <div className="history-heatmap">
            <div className="history-heatmap__header">
              <span className="history-heatmap__corner">模型/期号</span>
              <div className="history-heatmap__periods">
                {periods.map((period) => (
                  <button key={period} type="button" className="history-heatmap__period" onClick={() => onPeriodSelect?.(period)}>
                    {period}
                  </button>
                ))}
              </div>
            </div>
            <div className="history-heatmap__rows">
              {historyVisibleModels.map((model) => (
                <div key={`heatmap-${model.model_id}`} className="history-heatmap__row">
                  <span className="history-heatmap__label">{model.model_name}</span>
                  <div className="history-heatmap__cells">
                    {periods.map((period) => {
                      const cell = cellsByKey.get(`${model.model_id}::${period}`)
                      const hitCount = Number(cell?.hit_count || 0)
                      const isWinningPeriod = Boolean(cell?.is_winning_period)
                      return (
                        <button
                          key={`${model.model_id}-${period}`}
                          type="button"
                          className={`history-heatmap__cell ${resolveHeatmapCellTone(hitCount, isWinningPeriod)}`}
                          title={`${model.model_name} · ${period} · 命中 ${hitCount}`}
                          onClick={() => onPeriodSelect?.(period)}
                        >
                          {hitCount}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </HistoryChartShell>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的热力图数据。</div>
      )}
    </ChartCard>
  )
}

export function HistoryHitTrendCard({
  historyVisibleModels,
  historyHitTrend,
  historyProfitTrend,
  selectedPeriod,
  onPeriodSelect,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyHitTrend: HistoryTrendItem[]
  historyProfitTrend: HistoryTrendItem[]
  selectedPeriod?: string | null
  onPeriodSelect?: (period: string) => void
}) {
  return (
    <ChartCard title="模型历史命中趋势" description="汇总展示模型历史命中趋势、堆叠统计和盈亏趋势，适合作为回溯分析的总览入口。">
      {historyVisibleModels.length && historyHitTrend.length ? (
        <div className="history-hit-trend__charts">
          <HistoryHitTrendLineChartCard
            historyVisibleModels={historyVisibleModels}
            historyHitTrend={historyHitTrend}
            selectedPeriod={selectedPeriod}
            onPeriodSelect={onPeriodSelect}
          />
          <HistoryHitTrendStackedChartCard
            historyVisibleModels={historyVisibleModels}
            historyHitTrend={historyHitTrend}
            selectedPeriod={selectedPeriod}
            onPeriodSelect={onPeriodSelect}
          />
          <HistoryProfitTrendChartCard
            historyVisibleModels={historyVisibleModels}
            historyProfitTrend={historyProfitTrend}
            selectedPeriod={selectedPeriod}
            onPeriodSelect={onPeriodSelect}
          />
        </div>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的历史命中趋势。</div>
      )}
    </ChartCard>
  )
}
