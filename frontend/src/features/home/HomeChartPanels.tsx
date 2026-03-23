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

type FrequencyChartItem = {
  ball: string
  count: number
}

type OddEvenChartItem = {
  period: string
  odd: number
  even: number
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
  redChart,
  blueChart,
  oddEvenChart,
  sumTrendChart,
}: {
  redChart: FrequencyChartItem[]
  blueChart: FrequencyChartItem[]
  oddEvenChart: OddEvenChartItem[]
  sumTrendChart: SumTrendChartItem[]
}) {
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
          <AreaChart data={oddEvenChart}>
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

export function HistoryHitTrendCard({ historyVisibleModels, historyHitTrend }: { historyVisibleModels: HistoryModelRef[]; historyHitTrend: HistoryTrendItem[] }) {
  const sortedTrendData = [...historyHitTrend].sort((left, right) => {
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
        </div>
      ) : (
        <div className="state-shell">当前筛选条件下没有可展示的历史命中趋势。</div>
      )}
    </ChartCard>
  )
}
