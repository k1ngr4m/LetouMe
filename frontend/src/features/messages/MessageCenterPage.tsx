import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, CircleAlert, Filter, Inbox, Search } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiClient } from '../../shared/api/client'
import { useToast } from '../../shared/feedback/ToastProvider'
import { formatDateTimeBeijing } from '../../shared/lib/format'
import { useLotterySelection } from '../../shared/lottery/LotterySelectionProvider'
import type { LotteryCode, MessageResultFilter, MessageStatusFilter, SiteMessage } from '../../shared/types/api'
import { HOME_TAB_PATHS, type HomeDetailRouteState } from '../home/navigation'

const PAGE_SIZE = 20
const MESSAGE_BIZ_CODE = 'draw'
const STATUS_OPTIONS: Array<{ value: MessageStatusFilter; label: string }> = [
  { value: 'unread', label: '未读消息' },
  { value: 'read', label: '已读消息' },
  { value: 'all', label: '全部消息' },
]
const RESULT_OPTIONS: Array<{ value: MessageResultFilter; label: string }> = [
  { value: 'all', label: '全部结果' },
  { value: 'won', label: '中奖' },
  { value: 'lost', label: '未中奖' },
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
  if (winningBetCount > 0) {
    return {
      tone: 'win' as const,
      statusLabel: `中奖 ${winningBetCount} 注`,
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
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { setSelectedLottery } = useLotterySelection()
  const searchStatus = searchParams.get('status')
  const statusFilter: MessageStatusFilter = searchStatus === 'read' || searchStatus === 'all' || searchStatus === 'unread' ? searchStatus : 'unread'
  const businessCode = searchParams.get('biz') === MESSAGE_BIZ_CODE ? MESSAGE_BIZ_CODE : MESSAGE_BIZ_CODE
  const [resultFilter, setResultFilter] = useState<MessageResultFilter>('all')
  const [lotteryFilter, setLotteryFilter] = useState<LotteryCode | 'all'>('all')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [keywordFilter, setKeywordFilter] = useState('')
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [draftResultFilter, setDraftResultFilter] = useState<MessageResultFilter>('all')
  const [draftLotteryFilter, setDraftLotteryFilter] = useState<LotteryCode | 'all'>('all')
  const [draftDateStart, setDraftDateStart] = useState('')
  const [draftDateEnd, setDraftDateEnd] = useState('')
  const [offset, setOffset] = useState(0)
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null)

  const listQuery = useQuery({
    queryKey: ['messages', 'list', businessCode, statusFilter, resultFilter, lotteryFilter, dateStart, dateEnd, keywordFilter, offset],
    queryFn: () =>
      apiClient.getMessages({
        status_filter: statusFilter,
        result_filter: resultFilter,
        lottery_code: lotteryFilter === 'all' ? undefined : lotteryFilter,
        keyword: keywordFilter || undefined,
        date_start: dateStart || undefined,
        date_end: dateEnd || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    staleTime: 10_000,
  })

  const unreadCountQuery = useQuery({
    queryKey: ['messages', 'unread-count'],
    queryFn: () => apiClient.getMessageUnreadCount(),
    staleTime: 10_000,
  })

  const messages = listQuery.data?.messages || []
  const totalCount = Number(listQuery.data?.total_count || 0)
  const hasPrevPage = offset > 0
  const hasNextPage = offset + PAGE_SIZE < totalCount
  const unreadCount = Math.max(0, Number(unreadCountQuery.data?.unread_count || 0))
  const unreadCountLabel = unreadCount > 99 ? '99+' : `${unreadCount}`
  const selectedMessage = useMemo(
    () => messages.find((item) => item.id === selectedMessageId) || messages[0] || null,
    [messages, selectedMessageId],
  )
  const activeStatusLabel = STATUS_OPTIONS.find((item) => item.value === statusFilter)?.label || '消息列表'

  const refreshMessageQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ['messages', 'list'] })
    void queryClient.invalidateQueries({ queryKey: ['messages', 'unread-count'] })
  }

  const markReadMutation = useMutation({
    mutationFn: (messageId: number) => apiClient.markMessageRead(messageId),
    onSuccess: refreshMessageQueries,
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.markAllMessagesRead({}),
    onSuccess: () => {
      refreshMessageQueries()
      showToast('已将当前消息标记为已读。', 'success')
    },
    onError: (error: Error) => showToast(error.message || '操作失败', 'error'),
  })

  useEffect(() => {
    const normalized = new URLSearchParams(searchParams)
    const nextStatus = statusFilter
    const nextBiz = MESSAGE_BIZ_CODE
    if (normalized.get('status') !== nextStatus || normalized.get('biz') !== nextBiz) {
      normalized.set('status', nextStatus)
      normalized.set('biz', nextBiz)
      setSearchParams(normalized, { replace: true })
    }
  }, [searchParams, setSearchParams, statusFilter])

  useEffect(() => {
    setOffset(0)
  }, [statusFilter, businessCode])

  useEffect(() => {
    if (!messages.length) {
      setSelectedMessageId(null)
      return
    }
    if (!selectedMessageId || !messages.some((item) => item.id === selectedMessageId)) {
      setSelectedMessageId(messages[0].id)
    }
  }, [messages, selectedMessageId])

  function handleApplyKeyword() {
    setKeywordFilter(keywordInput.trim())
    setOffset(0)
  }

  function handleOpenFilterModal() {
    setDraftLotteryFilter(lotteryFilter)
    setDraftResultFilter(resultFilter)
    setDraftDateStart(dateStart)
    setDraftDateEnd(dateEnd)
    setFilterModalOpen(true)
  }

  function handleApplyFilters() {
    setLotteryFilter(draftLotteryFilter)
    setResultFilter(draftResultFilter)
    setDateStart(draftDateStart)
    setDateEnd(draftDateEnd)
    setOffset(0)
    setFilterModalOpen(false)
  }

  function handleResetFilters() {
    setDraftLotteryFilter('all')
    setDraftResultFilter('all')
    setDraftDateStart('')
    setDraftDateEnd('')
  }

  function handleSelectMessage(message: SiteMessage) {
    setSelectedMessageId(message.id)
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

  const detailSnapshot = (selectedMessage?.snapshot || {}) as Record<string, unknown>
  const detailAmount = Number(detailSnapshot.amount || 0)
  const detailNetAmount = Number(detailSnapshot.net_amount || 0)
  const detailTags = selectedMessage ? getSummaryTags(selectedMessage) : null

  return (
    <section className="message-center-v2" aria-label="消息中心">
      <div className="message-center-v2__layout">
        <section className="message-center-v2__list-panel">
          <header className="message-center-v2__list-header">
            <div className="message-center-v2__list-title">
              <h3>{activeStatusLabel}</h3>
              {statusFilter === 'unread' && unreadCount > 0 ? <em>{unreadCountLabel}</em> : null}
            </div>
            <div className="message-center-v2__header-actions">
              <button
                type="button"
                title="全部标记已读"
                aria-label="全部标记已读"
                className="message-center-v2__icon-btn"
                disabled={markAllReadMutation.isPending || unreadCount <= 0 || statusFilter === 'read'}
                onClick={() => markAllReadMutation.mutate()}
              >
                <CheckCheck size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                title="筛选"
                aria-label="筛选"
                className="message-center-v2__icon-btn"
                onClick={handleOpenFilterModal}
              >
                <Filter size={16} aria-hidden="true" />
              </button>
            </div>
          </header>

          <label className="message-center-v2__search">
            <Search size={16} aria-hidden="true" />
            <input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleApplyKeyword()
                }
              }}
              placeholder="搜索消息"
            />
          </label>

          {listQuery.isLoading ? <div className="state-shell">正在加载消息...</div> : null}
          {listQuery.isError ? (
            <div className="state-shell state-shell--error">
              <CircleAlert size={16} aria-hidden="true" />
              <span>加载失败：{(listQuery.error as Error).message}</span>
            </div>
          ) : null}
          {!listQuery.isLoading && !listQuery.isError && messages.length <= 0 ? (
            <div className="message-center-v2__empty">
              <Inbox size={22} aria-hidden="true" />
              <p>当前筛选下暂无消息。</p>
            </div>
          ) : null}

          {!listQuery.isLoading && !listQuery.isError && messages.length > 0 ? (
            <div className="message-center-v2__list">
              {messages.map((message) => {
                const tags = getSummaryTags(message)
                const isActive = selectedMessage?.id === message.id
                return (
                  <article
                    key={message.id}
                    className={`message-center-v2__item${isActive ? ' is-active' : ''}${message.is_read ? ' is-read' : ''}`}
                    onClick={() => handleSelectMessage(message)}
                  >
                    <div className="message-center-v2__item-meta">
                      <span className={`message-center-v2__item-status is-${tags.tone}`}>{tags.statusLabel}</span>
                      <time>{formatDateTimeBeijing(message.created_at)}</time>
                    </div>
                    <h4>{message.title}</h4>
                    <p>{message.content}</p>
                  </article>
                )
              })}
            </div>
          ) : null}

          {!listQuery.isLoading && !listQuery.isError && totalCount > 0 ? (
            <footer className="message-center-v2__pager">
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

        <section className="message-center-v2__detail-panel">
          {selectedMessage ? (
            <>
              <header className="message-center-v2__detail-header">
                <h3>{selectedMessage.title}</h3>
                <p>
                  <span>通知时间</span>
                  <time>{formatDateTimeBeijing(selectedMessage.created_at)}</time>
                </p>
              </header>
              <div className="message-center-v2__detail-body">
                <p>{selectedMessage.content}</p>
              </div>
              <div className="message-center-v2__detail-metrics">
                <span>投注金额：{formatYuan(detailAmount)}</span>
                <span>实付金额：{formatYuan(detailNetAmount)}</span>
                <span>奖金：{detailTags?.prizeAmount || formatYuan(0)}</span>
                <span>盈亏：{detailTags?.netProfit || formatYuan(0)}</span>
              </div>
              <footer className="message-center-v2__detail-actions">
                <button type="button" onClick={() => jumpToBetDetail(selectedMessage)}>
                  查看
                </button>
              </footer>
            </>
          ) : (
            <div className="message-center-v2__detail-empty">
              <Inbox size={24} aria-hidden="true" />
              <p>请选择一条消息查看详情</p>
            </div>
          )}
        </section>
      </div>

      {filterModalOpen ? (
        <div className="message-center-v2__filter-layer" role="dialog" aria-modal="true" aria-label="筛选消息">
          <button
            type="button"
            className="message-center-v2__filter-backdrop"
            aria-label="关闭筛选"
            onClick={() => setFilterModalOpen(false)}
          />
          <div className="message-center-v2__filter-modal">
            <h4>筛选条件</h4>
            <label>
              <span>彩种</span>
              <select value={draftLotteryFilter} onChange={(event) => setDraftLotteryFilter(event.target.value as LotteryCode | 'all')}>
                {LOTTERY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>中奖结果</span>
              <select value={draftResultFilter} onChange={(event) => setDraftResultFilter(event.target.value as MessageResultFilter)}>
                {RESULT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="message-center-v2__date-range">
              <label>
                <span>开始日期</span>
                <input type="date" value={draftDateStart} onChange={(event) => setDraftDateStart(event.target.value)} />
              </label>
              <label>
                <span>结束日期</span>
                <input type="date" value={draftDateEnd} onChange={(event) => setDraftDateEnd(event.target.value)} />
              </label>
            </div>
            <footer>
              <button type="button" className="is-ghost" onClick={handleResetFilters}>
                重置
              </button>
              <button type="button" onClick={handleApplyFilters}>
                搜索
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  )
}
