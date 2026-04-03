import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing, CheckCheck, CircleAlert, Inbox, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import { useToast } from '../../shared/feedback/ToastProvider'
import { formatDateTimeBeijing } from '../../shared/lib/format'
import { useLotterySelection } from '../../shared/lottery/LotterySelectionProvider'
import type { LotteryCode, MessageStatusFilter, SiteMessage } from '../../shared/types/api'
import { HOME_TAB_PATHS, type HomeDetailRouteState } from '../home/navigation'

const PAGE_SIZE = 20
const STATUS_OPTIONS: Array<{ value: MessageStatusFilter; label: string }> = [
  { value: 'all', label: '全部消息' },
  { value: 'unread', label: '未读' },
  { value: 'read', label: '已读' },
]
const LOTTERY_OPTIONS: Array<{ value: LotteryCode | 'all'; label: string }> = [
  { value: 'all', label: '全部彩种' },
  { value: 'dlt', label: '大乐透' },
  { value: 'pl3', label: '排列3' },
  { value: 'pl5', label: '排列5' },
]

function formatYuan(value: number | null | undefined) {
  return `${Number(value || 0)} 元`
}

function getSummaryTags(message: SiteMessage) {
  const snapshot = message.snapshot as Record<string, unknown> | null | undefined
  const winningBetCount = Number(snapshot?.winning_bet_count || 0)
  const prizeAmount = Number(snapshot?.prize_amount || 0)
  const netProfit = Number(snapshot?.net_profit || 0)
  const prizeLevel = String(snapshot?.prize_level || '').trim()
  if (winningBetCount > 0) {
    return {
      tone: 'win' as const,
      statusLabel: prizeLevel ? `${prizeLevel} · 中 ${winningBetCount} 注` : `中奖 ${winningBetCount} 注`,
      prizeAmount: formatYuan(prizeAmount),
      netProfit: formatYuan(netProfit),
    }
  }
  return {
    tone: 'lose' as const,
    statusLabel: '未中奖',
    prizeAmount: formatYuan(prizeAmount),
    netProfit: formatYuan(netProfit),
  }
}

export function MessageCenterPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { setSelectedLottery } = useLotterySelection()
  const [statusFilter, setStatusFilter] = useState<MessageStatusFilter>('all')
  const [lotteryFilter, setLotteryFilter] = useState<LotteryCode | 'all'>('all')
  const [offset, setOffset] = useState(0)

  const listQuery = useQuery({
    queryKey: ['messages', 'list', statusFilter, lotteryFilter, offset],
    queryFn: () =>
      apiClient.getMessages({
        status_filter: statusFilter,
        lottery_code: lotteryFilter === 'all' ? undefined : lotteryFilter,
        limit: PAGE_SIZE,
        offset,
      }),
    staleTime: 10_000,
  })

  const messages = listQuery.data?.messages || []
  const totalCount = Number(listQuery.data?.total_count || 0)
  const hasPrevPage = offset > 0
  const hasNextPage = offset + PAGE_SIZE < totalCount

  const unreadCount = useMemo(() => messages.filter((item) => !item.is_read).length, [messages])

  const refreshMessageQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['messages', 'list'] })
    void queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
  }

  const markReadMutation = useMutation({
    mutationFn: (messageId: number) => apiClient.markMessageRead(messageId),
    onSuccess: refreshMessageQueries,
  })

  const deleteMutation = useMutation({
    mutationFn: (messageId: number) => apiClient.deleteMessage(messageId),
    onSuccess: () => {
      refreshMessageQueries()
      showToast('消息已删除。', 'success')
    },
    onError: (error: Error) => showToast(error.message || '删除消息失败', 'error'),
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.markAllMessagesRead({ lottery_code: lotteryFilter === 'all' ? undefined : lotteryFilter }),
    onSuccess: () => {
      refreshMessageQueries()
      showToast('已将当前筛选消息标记为已读。', 'success')
    },
    onError: (error: Error) => showToast(error.message || '操作失败', 'error'),
  })

  function handleFilterChange(nextStatus: MessageStatusFilter) {
    setStatusFilter(nextStatus)
    setOffset(0)
  }

  function handleLotteryChange(value: LotteryCode | 'all') {
    setLotteryFilter(value)
    setOffset(0)
  }

  function handleOpenMessage(message: SiteMessage) {
    if (!message.is_read && !markReadMutation.isPending) {
      markReadMutation.mutate(message.id)
    }
  }

  function jumpToBetDetail(message: SiteMessage) {
    if (message.lottery_code) {
      setSelectedLottery(message.lottery_code)
    }
    const routeState: HomeDetailRouteState = {
      focusBetRecordId: message.my_bet_record_id,
      focusNonce: `msg-${message.id}-${Date.now()}`,
    }
    navigate(HOME_TAB_PATHS['my-bets'], { state: routeState })
  }

  return (
    <section className="message-center" aria-label="消息中心">
      <header className="message-center__header">
        <div className="message-center__title-wrap">
          <div className="message-center__title-icon" aria-hidden="true">
            <BellRing size={18} />
          </div>
          <div>
            <h2>消息中心</h2>
            <p>开奖后自动推送投注结算消息，可随时回看历史通知。</p>
          </div>
        </div>
        <button
          className="message-center__mark-all"
          type="button"
          disabled={markAllReadMutation.isPending || unreadCount <= 0}
          onClick={() => markAllReadMutation.mutate()}
        >
          <CheckCheck size={15} aria-hidden="true" />
          <span>{markAllReadMutation.isPending ? '处理中...' : '全部标记已读'}</span>
        </button>
      </header>

      <div className="message-center__toolbar">
        <div className="message-center__status-tabs" role="tablist" aria-label="消息状态">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={statusFilter === option.value}
              className={`message-center__status-tab${statusFilter === option.value ? ' is-active' : ''}`}
              onClick={() => handleFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="message-center__lottery-select">
          <span>彩种筛选</span>
          <select
            value={lotteryFilter}
            onChange={(event) => handleLotteryChange(event.target.value as LotteryCode | 'all')}
            aria-label="彩种筛选"
          >
            {LOTTERY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {listQuery.isLoading ? <div className="state-shell">正在加载消息...</div> : null}
      {listQuery.isError ? (
        <div className="state-shell state-shell--error">
          <CircleAlert size={16} aria-hidden="true" />
          <span>加载失败：{(listQuery.error as Error).message}</span>
        </div>
      ) : null}
      {!listQuery.isLoading && !listQuery.isError && messages.length <= 0 ? (
        <div className="message-center__empty">
          <Inbox size={22} aria-hidden="true" />
          <p>当前筛选下暂无消息。</p>
        </div>
      ) : null}

      {!listQuery.isLoading && !listQuery.isError && messages.length > 0 ? (
        <div className="message-center__list">
          {messages.map((message) => {
            const tags = getSummaryTags(message)
            const snapshot = (message.snapshot || {}) as Record<string, unknown>
            const amount = Number(snapshot.amount || 0)
            const netAmount = Number(snapshot.net_amount || 0)
            return (
              <article
                key={message.id}
                className={`message-card${message.is_read ? ' is-read' : ''}`}
                onClick={() => handleOpenMessage(message)}
              >
                <div className="message-card__meta">
                  <span className={`message-card__status is-${tags.tone}`}>{tags.statusLabel}</span>
                  {!message.is_read ? <em className="message-card__unread">未读</em> : null}
                  <time>{formatDateTimeBeijing(message.created_at)}</time>
                </div>
                <h3>{message.title}</h3>
                <p>{message.content}</p>
                <div className="message-card__metrics">
                  <span>投注 {formatYuan(amount)}</span>
                  <span>实付 {formatYuan(netAmount)}</span>
                  <span>奖金 {tags.prizeAmount}</span>
                  <span>盈亏 {tags.netProfit}</span>
                </div>
                <div className="message-card__actions">
                  <button type="button" onClick={() => jumpToBetDetail(message)}>
                    查看投注
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    aria-label={`删除消息：${message.title}`}
                    onClick={() => deleteMutation.mutate(message.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    <span>删除</span>
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      {!listQuery.isLoading && !listQuery.isError && totalCount > 0 ? (
        <footer className="message-center__pager">
          <button type="button" disabled={!hasPrevPage} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}>
            上一页
          </button>
          <span>
            {Math.floor(offset / PAGE_SIZE) + 1} / {Math.max(1, Math.ceil(totalCount / PAGE_SIZE))}
          </span>
          <button type="button" disabled={!hasNextPage} onClick={() => setOffset((current) => current + PAGE_SIZE)}>
            下一页
          </button>
        </footer>
      ) : null}
    </section>
  )
}
