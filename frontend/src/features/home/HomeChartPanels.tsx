import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toPng } from 'html-to-image'
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

const MOBILE_EXPORT_MAX_WIDTH = 760

function sanitizeDownloadFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
}

function slugifyTitle(value: string) {
  return sanitizeDownloadFileName(value.toLowerCase()).replace(/_+/g, '_')
}

function formatExportTimestamp() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${year}${month}${day}_${hours}${minutes}${seconds}`
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

function triggerDownload(downloadUrl: string, fileName: string) {
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = fileName
  link.click()
}

function getCsvColumns(rows: Array<Record<string, unknown>>) {
  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key)
    }
  }
  return columns
}

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function buildCsvContent(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return ''
  const columns = getCsvColumns(rows)
  const header = columns.join(',')
  const lines = rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(','))
  return `${header}\n${lines.join('\n')}`
}

function formatProfitValue(value: number) {
  return `${new Intl.NumberFormat('zh-CN', { signDisplay: 'exceptZero' }).format(Number(value) || 0)} 元`
}

function ChartInfoTooltip({ title, description }: { title: string; description: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ top: number; left: number; arrowLeft: number; placement: 'top' | 'bottom' } | null>(null)

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !panelRef.current || typeof window === 'undefined') return

    const gutter = 12
    const offset = 12

    const updatePosition = () => {
      if (!triggerRef.current || !panelRef.current) return

      const triggerRect = triggerRef.current.getBoundingClientRect()
      const panelRect = panelRef.current.getBoundingClientRect()
      const panelWidth = panelRect.width
      const panelHeight = panelRect.height

      const preferredLeft = triggerRect.right - panelWidth
      const left = Math.min(Math.max(gutter, preferredLeft), Math.max(gutter, window.innerWidth - panelWidth - gutter))

      const spaceAbove = triggerRect.top - gutter
      const spaceBelow = window.innerHeight - triggerRect.bottom - gutter
      const placement: 'top' | 'bottom' =
        spaceAbove >= panelHeight + offset || spaceAbove >= spaceBelow ? 'top' : 'bottom'

      const rawTop =
        placement === 'top'
          ? triggerRect.top - panelHeight - offset
          : triggerRect.bottom + offset
      const top = Math.min(Math.max(gutter, rawTop), Math.max(gutter, window.innerHeight - panelHeight - gutter))

      const arrowLeft = Math.min(panelWidth - 18, Math.max(18, triggerRect.left + triggerRect.width / 2 - left))

      setPosition({ top, left, arrowLeft, placement })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  return (
    <div
      className="chart-info-tooltip"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        className="chart-info-tooltip__trigger"
        aria-label={`${title}说明`}
        onClick={(event) => event.preventDefault()}
      >
        ?
      </button>
      {isOpen
        ? createPortal(
            <div
              ref={panelRef}
              className="chart-info-tooltip__panel"
              data-placement={position?.placement || 'top'}
              role="tooltip"
              style={{
                position: 'fixed',
                left: `${position?.left ?? -9999}px`,
                top: `${position?.top ?? -9999}px`,
                width: `${Math.min(288, typeof window === 'undefined' ? 288 : window.innerWidth - 24)}px`,
                visibility: position ? 'visible' : 'hidden',
              }}
            >
              <strong>{title}</strong>
              <span>{description}</span>
              <span className="chart-info-tooltip__arrow" aria-hidden="true" style={{ left: `${position?.arrowLeft ?? 24}px` }} />
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function ChartExportIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3.5v8.2" />
      <path d="m6.9 8.7 3.1 3.2 3.1-3.2" />
      <path d="M4.6 13.4h10.8v2.8H4.6z" />
    </svg>
  )
}

function ChartCard({
  title,
  description,
  children,
  className,
  exportData,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
  exportData?: Array<Record<string, unknown>>
}) {
  const cardRef = useRef<HTMLElement | null>(null)
  const actionRef = useRef<HTMLDivElement | null>(null)
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false)
  const [isExportingPng, setIsExportingPng] = useState(false)
  const [isExportingCsv, setIsExportingCsv] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const hasCsvData = Boolean(exportData?.length)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof window.matchMedia !== 'function') return
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_EXPORT_MAX_WIDTH}px)`)
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)
    setIsMobile(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!isExportMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.chart-export-menu__panel')) return
      if (actionRef.current && actionRef.current.contains(target)) return
      setIsExportMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsExportMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isExportMenuOpen])

  async function handleExportPng() {
    if (isExportingPng || !cardRef.current) return
    setIsExportingPng(true)
    setIsExportMenuOpen(false)
    try {
      await waitForNextPaint()
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: document.documentElement.dataset.theme === 'light' ? '#f8f2ea' : '#101827',
      })
      const fileName = `${slugifyTitle(title)}_${formatExportTimestamp()}.png`
      triggerDownload(dataUrl, fileName)
    } catch (error) {
      console.error(`导出图表 PNG 失败: ${title}`, error)
    } finally {
      setIsExportingPng(false)
    }
  }

  async function handleExportCsv() {
    if (isExportingCsv || !hasCsvData || !exportData) return
    setIsExportingCsv(true)
    setIsExportMenuOpen(false)
    try {
      const csvContent = buildCsvContent(exportData)
      if (!csvContent) return
      const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
      const downloadUrl = URL.createObjectURL(blob)
      triggerDownload(downloadUrl, `${slugifyTitle(title)}_${formatExportTimestamp()}.csv`)
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
    } catch (error) {
      console.error(`导出图表 CSV 失败: ${title}`, error)
    } finally {
      setIsExportingCsv(false)
    }
  }

  return (
    <section ref={cardRef} className={`panel-card chart-card${className ? ` ${className}` : ''}`}>
      <div className="panel-card__header">
        <div className="chart-card__title-row">
          <h2 className="panel-card__title">{title}</h2>
          {description ? <ChartInfoTooltip title={title} description={description} /> : null}
        </div>
        {!isMobile ? (
          <div ref={actionRef} className="chart-card__actions">
            <button
              type="button"
              className="icon-button chart-export-menu__trigger"
              aria-label={`导出图表：${title}`}
              title="导出图表"
              aria-haspopup="menu"
              aria-expanded={isExportMenuOpen}
              onClick={() => setIsExportMenuOpen((previous) => !previous)}
            >
              <ChartExportIcon />
            </button>
            {isExportMenuOpen ? (
              <div className="chart-export-menu__panel" role="menu" aria-label={`导出图表：${title}`}>
                <button className="chart-export-menu__item" type="button" role="menuitem" onClick={() => void handleExportPng()} disabled={isExportingPng}>
                  {isExportingPng ? '导出 PNG 中...' : '导出 PNG'}
                </button>
                <button className="chart-export-menu__item" type="button" role="menuitem" onClick={() => void handleExportCsv()} disabled={!hasCsvData || isExportingCsv}>
                  {isExportingCsv ? '导出 CSV 中...' : '导出 CSV'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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
  qxcPositionCharts,
}: {
  lotteryCode: LotteryCode
  redChart: FrequencyChartItem[]
  blueChart: FrequencyChartItem[]
  pl3UnitChart: FrequencyChartItem[]
  pl5PositionCharts: FrequencyChartItem[][]
  qxcPositionCharts: FrequencyChartItem[][]
}) {
  if (lotteryCode === 'pl3') {
    return (
      <div className="page-section chart-grid">
        <ChartCard
          title="百位热号 Top 10"
          description="统计最近样本中百位数字的出现次数，快速找出当前更活跃的候选数字。柱子越高，说明该数字近期出现越频繁。"
          exportData={redChart}
        >
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
        <ChartCard
          title="十位热号 Top 10"
          description="统计最近样本中十位数字的出现次数，用来判断十位号码的近期热度分布。适合和百位、个位热号一起交叉观察。"
          exportData={blueChart}
        >
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
        <ChartCard
          title="个位热号 Top 10"
          description="统计最近样本中个位数字的出现次数，帮助识别个位数字的短期活跃区间。可配合和值和奇偶结构一起解读。"
          exportData={pl3UnitChart}
        >
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
        <ChartCard title="万位热号 Top 10" description="统计最近样本中万位数字的出现次数，帮助识别万位近期更常出现的数字。" exportData={tenThousands}>
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
        <ChartCard title="千位热号 Top 10" description="统计最近样本中千位数字的出现次数，适合观察千位号码是否出现明显集中。" exportData={thousands}>
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
        <ChartCard title="百位热号 Top 10" description="统计最近样本中百位数字的出现次数，用来判断这一位是否存在持续活跃的候选数字。" exportData={hundreds}>
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
        <ChartCard title="十位热号 Top 10" description="统计最近样本中十位数字的出现次数，帮助识别十位近期的热度变化。" exportData={tens}>
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
        <ChartCard title="个位热号 Top 10" description="统计最近样本中个位数字的出现次数，观察个位数字是否出现局部聚集或轮动。" exportData={units}>
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

  if (lotteryCode === 'qxc') {
    const [first = [], second = [], third = [], fourth = [], fifth = [], sixth = [], seventh = []] = qxcPositionCharts
    return (
      <div className="page-section chart-grid">
        <ChartCard title="第一位热号 Top 10" description="统计最近样本中第一位号码的出现次数，帮助判断首位近期更活跃的数字。" exportData={first}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={first}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--red-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="第二位热号 Top 10" description="统计最近样本中第二位号码的出现次数，适合与相邻位置交叉观察热度轮动。" exportData={second}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={second}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--amber-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="第三位热号 Top 10" description="统计最近样本中第三位号码的出现次数，用来识别第三位近期集中区域。" exportData={third}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={third}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--blue-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="第四位热号 Top 10" description="统计最近样本中第四位号码的出现次数，帮助查看中部位置是否存在明显热号。" exportData={fourth}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={fourth}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="第五位热号 Top 10" description="统计最近样本中第五位号码的出现次数，观察该位置的热度集中和切换节奏。" exportData={fifth}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={fifth}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="#22c55e" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="第六位热号 Top 10" description="统计最近样本中第六位号码的出现次数，适合与前五位一起观察整体定位分布。" exportData={sixth}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sixth}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="#06b6d4" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="第七位热号 Top 15" description="统计最近样本中第七位号码的出现次数。第七位范围为 00-14，和前六位的 00-09 规则不同，需要单独观察。" exportData={seventh}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={seventh}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ball" />
              <YAxis allowDecimals={false} />
              <Tooltip {...commonChartTooltipProps} />
              <Bar dataKey="count" fill="var(--violet-500)" radius={[12, 12, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    )
  }

  return (
    <div className="page-section chart-grid">
      <ChartCard title="前区热号 Top 12" description="统计最近样本中前区号码的出现次数，帮助判断当前更热的前区号码。它回答的是“哪些号更常出现”，不表示命中概率保证。" exportData={redChart}>
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
      <ChartCard title="后区热号 Top 12" description="统计最近样本中后区号码的出现次数，适合用来观察后区近期的热度集中和轮动情况。" exportData={blueChart}>
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
          : lotteryCode === 'qxc'
            ? '展示七星彩当期 7 位号码和值随期数变化的趋势，用来判断和值是否集中在某个区间，或是否出现明显波动。'
            : '展示当期开奖号码和值随期数变化的趋势，用来判断和值是否集中在某个区间，或是否出现明显波动。'}
        className="chart-card--focus"
        exportData={sumTrendChart}
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
        <ChartCard
          title="奇偶结构走势"
          description="展示每期号码中的奇偶数量结构，帮助判断近期更偏奇数还是偶数，以及结构是否稳定。适合配合和值和热号一起看整体形态。"
          className="chart-card--focus"
          exportData={structureTrend}
        >
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
        <ChartCard
          title="奇偶结构走势"
          description="展示每期号码中的奇偶数量结构，帮助观察排列5近期是否偏奇、偏偶或在不同结构间切换。"
          className="chart-card--focus"
          exportData={structureTrend}
        >
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

  if (lotteryCode === 'qxc') {
    const structureTrend = oddEvenChart as Pl5OddEvenStructureChartItem[]
    return (
      <div className="page-section chart-grid chart-grid--single">
        <ChartCard
          title="奇偶结构走势"
          description="展示七星彩每期 7 位号码中的奇偶数量结构，帮助判断近期更偏奇数还是偶数，以及结构是否稳定。"
          className="chart-card--focus"
          exportData={structureTrend}
        >
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={structureTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="period" />
              <YAxis allowDecimals={false} ticks={[0, 1, 2, 3, 4, 5, 6, 7]} tickFormatter={(value) => `${Number(value)}:${7 - Number(value)}`} />
              <Tooltip {...commonChartTooltipProps} formatter={(value) => `${Number(value)}:${7 - Number(value)}`} />
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
      <ChartCard
        title="奇偶结构走势"
        description="展示每期前区号码的奇偶结构变化，用来判断当前更常见的奇偶配比以及切换节奏。"
        className="chart-card--focus"
        exportData={oddEvenTrend}
      >
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
  qxcPositionCharts,
  oddEvenChart,
  sumTrendChart,
}: {
  lotteryCode: LotteryCode
  redChart: FrequencyChartItem[]
  blueChart: FrequencyChartItem[]
  pl3UnitChart: FrequencyChartItem[]
  pl5PositionCharts: FrequencyChartItem[][]
  qxcPositionCharts: FrequencyChartItem[][]
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
        qxcPositionCharts={qxcPositionCharts}
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
        description={lotteryCode === 'qxc'
          ? '统计最近样本里 7 位号码和值的出现次数，用来判断七星彩和值更常集中在哪些区间。它强调的是整体分布，而不是逐期波动。'
          : '统计最近样本里不同和值区间出现了多少次，用来判断和值更常落在哪些位置。它强调的是整体分布，而不是逐期走势。'}
        exportData={sumDistribution}
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
      <ChartCard title="奇偶比分布" description={lotteryCode === 'qxc'
        ? '统计最近样本里 7 位号码不同奇偶配比出现的次数，帮助识别七星彩近期更常见的奇偶结构。'
        : '统计最近样本里不同奇偶配比出现的次数，帮助识别当前更常见的奇偶结构。适合用来验证结构是否偏向某一类组合。'}
        exportData={oddEvenDistribution}
      >
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
      <ChartCard title="区间占比分布" description={lotteryCode === 'qxc'
        ? '统计最近样本中七星彩号码落入各区间的总体占比。前六位按 0-9 分区，第七位按 00-14 单独分区，用来观察整体落点分布。'
        : '统计最近样本中全部号码落入各区间的总体占比，帮助判断号码更集中在哪个区段。它看的是整体落点占比，不是每期结构模式。'}
        exportData={zoneShareDistribution}
      >
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
      <ChartCard title="跨度趋势" description={lotteryCode === 'qxc'
        ? '展示七星彩每期 7 位号码最大值与最小值的差距变化，用来观察号码分散程度是放大还是收缩。'
        : '展示每期号码最大值与最小值的差距变化，用来观察号码分散程度是放大还是收缩。跨度越大，说明号码分布越开。'}
        exportData={spanTrend}
      >
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
      <ChartCard title={lotteryCode === 'dlt' ? '区间分布' : lotteryCode === 'qxc' ? '区段结构分布' : '区段分布'} description={lotteryCode === 'qxc'
        ? '统计七星彩每期前六位区段结构与第七位区段的组合出现次数，用来观察近期更常见的结构模式。'
        : '统计每期开奖结果在各区间结构组合上的出现次数，用来观察近期更常见的结构模式。它和区间占比分布不同，这里强调的是“每期结构组合”。'}
        exportData={zoneDistribution}
      >
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
      <ChartCard title="012路走势" description={lotteryCode === 'qxc'
        ? '按七星彩 7 位号码除以 3 后的余数结构展示每期变化，用来观察 0 路、1 路、2 路的组合是否存在明显偏态或轮动。'
        : '按号码除以 3 后的余数结构展示每期变化，用来观察 0 路、1 路、2 路的组合是否存在明显偏态或轮动。'}
        exportData={moduloTrend}
      >
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
    <ChartCard
      title="命中趋势折线"
      description="展示各模型在每一期的最佳命中数量变化，用来观察命中表现是否持续稳定。折线越平稳，通常代表表现波动越小。"
      className="chart-card--focus"
      exportData={sortedTrendData}
    >
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
    <ChartCard
      title="命中堆叠柱形统计"
      description="把同一期不同模型的命中数量堆叠在一起，方便横向比较同一期里谁贡献更高。它更适合看结构占比，而不是连续趋势。"
      className="chart-card--focus"
      exportData={sortedTrendData}
    >
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
    <ChartCard
      title="盈亏趋势折线"
      description="展示各模型每一期的单期净盈亏变化，用来快速识别大赚、大亏和波动放大的阶段。适合观察短期收益节奏。 "
      className="chart-card--focus"
      exportData={sortedProfitData}
    >
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
    <ChartCard
      title="累计盈亏曲线"
      description="按时间累加每期净盈亏，直接判断模型长期是否整体向上。曲线越平滑且向上，通常代表长期收益更稳。 "
      className="chart-card--focus"
      exportData={sortedTrendData}
    >
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
    <ChartCard
      title="累计 ROI 曲线"
      description="用累计收益相对累计成本的比值来比较模型效率，适合不同投注规模之间做标准化对比。数值越高，代表资金使用效率越好。 "
      className="chart-card--focus"
      exportData={sortedTrendData}
    >
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
    <ChartCard
      title={`滚动命中率（近 ${rollingWindow} 期）`}
      description="按滚动窗口计算近几期的命中率，用来观察模型稳定性而不是单期波动。窗口越大，曲线越平滑，越适合看趋势。 "
      className="chart-card--focus"
      exportData={sortedTrendData}
    >
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
    <ChartCard
      title="最大回撤曲线"
      description="展示模型从阶段高点回落的幅度，帮助判断策略在盈利过程中承受了多大回吐。越接近 0，通常说明风险控制越稳。 "
      className="chart-card--focus"
      exportData={sortedTrendData}
    >
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
    <ChartCard
      title="模型排名变化图"
      description="按累计表现给模型排序，观察每一期谁领先、谁掉队。排名越靠前越强，适合看 leader 是否频繁切换。 "
      className="chart-card--focus"
      exportData={sortedTrendData}
    >
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
    <ChartCard
      title="胜负分布图"
      description="统计每个模型盈利期、亏损期和持平期的数量分布，帮助判断它更常见的是小赚小亏还是稳定正向。 "
      className="chart-card--focus"
      exportData={distribution}
    >
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
    <ChartCard
      title="命中热力图"
      description="用模型和期号构成二维热力图，快速看出哪些模型更稳定、哪些阶段明显失真。颜色越暖，通常代表命中更强。 "
      className="chart-card--focus"
      exportData={heatmap}
    >
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
