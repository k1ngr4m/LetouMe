import type { CSSProperties, ReactNode } from 'react'
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

function ChartCard({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel-card chart-card${className ? ` ${className}` : ''}`}>
      <div className="panel-card__header">
        <h2 className="panel-card__title">{title}</h2>
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
        <ChartCard title="百位热号 Top 10">
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
        <ChartCard title="十位热号 Top 10">
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
        <ChartCard title="个位热号 Top 10">
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
        <ChartCard title="万位热号 Top 10">
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
        <ChartCard title="千位热号 Top 10">
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
        <ChartCard title="百位热号 Top 10">
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
        <ChartCard title="十位热号 Top 10">
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
        <ChartCard title="个位热号 Top 10">
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
      <ChartCard title="前区热号 Top 12">
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
      <ChartCard title="后区热号 Top 12">
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
      <ChartCard title={title} className="chart-card--focus">
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
        <ChartCard title="奇偶结构走势" className="chart-card--focus">
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
        <ChartCard title="奇偶结构走势" className="chart-card--focus">
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
      <ChartCard title="奇偶结构走势" className="chart-card--focus">
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
      <ChartCard title={lotteryCode === 'dlt' ? '前区和值分布' : '和值分布'}>
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
      <ChartCard title="奇偶比分布">
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
      <ChartCard title="区间占比分布">
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
      <ChartCard title="跨度趋势">
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
      <ChartCard title={lotteryCode === 'dlt' ? '区间分布' : '区段分布'}>
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
      <ChartCard title="012路走势">
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
    <ChartCard title="命中趋势折线" className="chart-card--focus">
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
    <ChartCard title="命中堆叠柱形统计" className="chart-card--focus">
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
    <ChartCard title="盈亏趋势折线" className="chart-card--focus">
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
    <ChartCard title="累计盈亏曲线" className="chart-card--focus">
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
    <ChartCard title="累计 ROI 曲线" className="chart-card--focus">
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
    <ChartCard title={`滚动命中率（近 ${rollingWindow} 期）`} className="chart-card--focus">
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
    <ChartCard title="最大回撤曲线" className="chart-card--focus">
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
    <ChartCard title="模型排名变化图" className="chart-card--focus">
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
    <ChartCard title="胜负分布图" className="chart-card--focus">
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
    <ChartCard title="命中热力图" className="chart-card--focus">
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
    <ChartCard title="模型历史命中趋势">
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
