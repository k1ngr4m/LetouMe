import type { ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

type HistoryModelRef = {
  model_id: string
  model_name: string
}

type HistoryTrendItem = Record<string, string | number>

function formatPrizeValue(value: number) {
  return `${new Intl.NumberFormat('zh-CN').format(Number(value) || 0)} 元`
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel-card chart-card">
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
  if (lotteryCode === 'pl3') {
    const structureTrend = oddEvenChart as Pl3OddEvenStructureChartItem[]
    return (
      <div className="page-section chart-grid">
        <ChartCard title="百位热号 Top 10">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={redChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip />
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
              <Tooltip />
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
              <Tooltip />
              <Bar dataKey="count" fill="var(--blue-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="和值趋势">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sumTrendChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="sum" stroke="var(--blue-500)" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="奇偶结构走势">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={structureTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} ticks={[0, 1, 2, 3]} tickFormatter={(value) => `${Number(value)}:${3 - Number(value)}`} />
              <Tooltip formatter={(value) => `${Number(value)}:${3 - Number(value)}`} />
              <Line type="monotone" dataKey="oddCount" stroke="var(--red-500)" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    )
  }
  if (lotteryCode === 'pl5') {
    const structureTrend = oddEvenChart as Pl5OddEvenStructureChartItem[]
    const [tenThousands = [], thousands = [], hundreds = [], tens = [], units = []] = pl5PositionCharts
    return (
      <div className="page-section chart-grid">
        <ChartCard title="万位热号 Top 10">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={tenThousands}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip />
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
              <Tooltip />
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
              <Tooltip />
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
              <Tooltip />
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
              <Tooltip />
              <Bar dataKey="count" fill="#22c55e" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="和值趋势">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sumTrendChart}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="sum" stroke="var(--blue-500)" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="奇偶结构走势">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={structureTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} ticks={[0, 1, 2, 3, 4, 5]} tickFormatter={(value) => `${Number(value)}:${5 - Number(value)}`} />
              <Tooltip formatter={(value) => `${Number(value)}:${5 - Number(value)}`} />
              <Line type="monotone" dataKey="oddCount" stroke="var(--red-500)" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    )
  }
  const oddEvenTrend = oddEvenChart as OddEvenChartItem[]

  return (
    <div className="page-section chart-grid">
      <ChartCard title="前区热号 Top 12">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={redChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="ball" />
            <YAxis allowDecimals={false} />
            <Tooltip />
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
            <Tooltip />
            <Bar dataKey="count" fill="var(--blue-500)" radius={[12, 12, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="奇偶结构走势">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={oddEvenTrend}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="odd" stackId="1" stroke="var(--red-500)" fill="rgba(215, 64, 90, 0.6)" />
            <Area type="monotone" dataKey="even" stackId="1" stroke="var(--amber-500)" fill="rgba(242, 165, 79, 0.6)" />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
      <ChartCard title="前区和值趋势">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={sumTrendChart}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="sum" stroke="var(--blue-500)" strokeWidth={3} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}

export function HistoryHitTrendCard({
  historyVisibleModels,
  historyHitTrend,
  historyPrizeTrend,
}: {
  historyVisibleModels: HistoryModelRef[]
  historyHitTrend: HistoryTrendItem[]
  historyPrizeTrend: HistoryTrendItem[]
}) {
  const sortedTrendData = [...historyHitTrend].sort((left, right) => {
    const leftPeriod = Number(left.period)
    const rightPeriod = Number(right.period)
    const leftIsNumber = Number.isFinite(leftPeriod)
    const rightIsNumber = Number.isFinite(rightPeriod)
    if (leftIsNumber && rightIsNumber) return leftPeriod - rightPeriod
    return String(left.period || '').localeCompare(String(right.period || ''))
  })
  const sortedPrizeData = [...historyPrizeTrend].sort((left, right) => {
    const leftPeriod = Number(left.period)
    const rightPeriod = Number(right.period)
    const leftIsNumber = Number.isFinite(leftPeriod)
    const rightIsNumber = Number.isFinite(rightPeriod)
    if (leftIsNumber && rightIsNumber) return leftPeriod - rightPeriod
    return String(left.period || '').localeCompare(String(right.period || ''))
  })

  return (
    <ChartCard title="模型历史命中趋势">
      {historyVisibleModels.length && historyHitTrend.length ? (
        <div className="history-hit-trend__charts">
          <div className="history-hit-trend__chart-shell">
            <p className="history-hit-trend__chart-title">命中趋势折线</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={sortedTrendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" />
                <YAxis allowDecimals={false} />
                <Tooltip />
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
          </div>
          <div className="history-hit-trend__chart-shell" aria-label="模型命中堆叠统计图">
            <p className="history-hit-trend__chart-title">命中堆叠柱形统计</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={sortedTrendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" />
                <YAxis allowDecimals={false} />
                <Tooltip />
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
          </div>
          <div className="history-hit-trend__chart-shell" aria-label="模型奖金趋势图">
            <p className="history-hit-trend__chart-title">奖金趋势折线</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={sortedPrizeData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip formatter={(value) => formatPrizeValue(Number(value || 0))} />
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
          </div>
        </div>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的历史命中趋势。</div>
      )}
    </ChartCard>
  )
}
