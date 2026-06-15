import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CheckCircle2, CircleDollarSign, Trash2 } from 'lucide-react'
import { apiClient } from '../../shared/api/client'
import { SiteDisclaimer } from '../../shared/components/SiteDisclaimer'
import { formatDateTimeLocal } from '../../shared/lib/format'
import { useToast } from '../../shared/feedback/ToastProvider'
import type { WorldCupPlayType, WorldCupSimulationTicket } from '../../shared/types/api'
import { WorldCupTabStrip } from './WorldCupTabStrip'

function formatPlayType(playType: WorldCupPlayType) {
  if (playType === 'win_draw_win') return '胜平负'
  if (playType === 'handicap_win_draw_win') return '让球胜平负'
  if (playType === 'total_goals') return '总进球数'
  if (playType === 'correct_score') return '比分'
  return '半全场'
}

function statusLabel(status: WorldCupSimulationTicket['status']) {
  if (status === 'active') return '已确认'
  if (status === 'settled') return '已结算'
  if (status === 'archived') return '已归档'
  return '草稿'
}

export function WorldCupSimulationPage() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const ticketsQuery = useQuery({
    queryKey: ['worldcup', 'simulation', 'tickets'],
    queryFn: () => apiClient.listWorldCupSimulationTickets(),
  })

  const updateMutation = useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: number; status: WorldCupSimulationTicket['status'] }) =>
      apiClient.updateWorldCupSimulationTicket(ticketId, { status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['worldcup', 'simulation'] })
      showToast('模拟方案已更新', 'success')
    },
    onError: (error) => showToast(error instanceof Error ? error.message : '更新失败', 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (ticketId: number) => apiClient.deleteWorldCupSimulationTicket(ticketId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['worldcup', 'simulation'] })
      showToast('模拟方案已删除', 'success')
    },
    onError: (error) => showToast(error instanceof Error ? error.message : '删除失败', 'error'),
  })

  const tickets = ticketsQuery.data?.tickets || []
  const totalAmount = tickets.reduce((sum, ticket) => sum + ticket.total_amount, 0)

  return (
    <div className="worldcup-page">
      <section className="worldcup-hero worldcup-hero--compact">
        <div className="worldcup-hero__copy">
          <p className="worldcup-hero__eyebrow">模拟试玩</p>
          <h1 className="worldcup-hero__title">世界杯模拟方案</h1>
          <p className="worldcup-hero__description">从 AI 推荐生成模拟单，保存玩法、选项、赔率快照与预算，方便赛前核对。</p>
        </div>
        <div className="worldcup-hero__stats" aria-label="模拟概览">
          <div><span>方案</span><strong>{tickets.length}</strong></div>
          <div><span>预算</span><strong>{totalAmount} 元</strong></div>
          <div><span>状态</span><strong>{tickets.filter((ticket) => ticket.status === 'active').length} 已确认</strong></div>
        </div>
      </section>

      <SiteDisclaimer />

      {ticketsQuery.isLoading ? (
        <div className="worldcup-empty">正在加载模拟方案...</div>
      ) : tickets.length === 0 ? (
        <div className="worldcup-empty">暂无模拟方案，可先到预测总览把推荐加入模拟。</div>
      ) : (
        <section className="worldcup-ticket-list">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="worldcup-ticket">
              <div className="worldcup-card__header">
                <div>
                  <p>{formatDateTimeLocal(ticket.updated_at)}</p>
                  <h2>{ticket.title}</h2>
                </div>
                <span className={clsx('worldcup-status-pill', `is-${ticket.status}`)}>{statusLabel(ticket.status)}</span>
              </div>
              <div className="worldcup-card__meta">
                <span>{ticket.total_amount} 元</span>
                <span>{ticket.multiplier} 倍</span>
                <span>{ticket.items.length} 场</span>
              </div>
              <div className="worldcup-ticket__items">
                {ticket.items.map((item) => (
                  <div key={item.id} className="worldcup-ticket__item">
                    <strong>{item.match.home_team} vs {item.match.away_team}</strong>
                    <span>{formatPlayType(item.play_type)} · {item.selection}</span>
                    <span>{item.odds_value ? `赔率 ${item.odds_value}` : '赔率待同步'}</span>
                  </div>
                ))}
              </div>
              {ticket.note ? <p className="worldcup-card__notice">{ticket.note}</p> : null}
              <div className="worldcup-card__actions">
                <button
                  className="ghost-button ghost-button--compact"
                  type="button"
                  onClick={() => updateMutation.mutate({ ticketId: ticket.id, status: ticket.status === 'active' ? 'draft' : 'active' })}
                >
                  <CheckCircle2 size={14} aria-hidden="true" /> {ticket.status === 'active' ? '改为草稿' : '确认方案'}
                </button>
                <button className="ghost-button ghost-button--compact" type="button" onClick={() => deleteMutation.mutate(ticket.id)}>
                  <Trash2 size={14} aria-hidden="true" /> 删除
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="worldcup-card worldcup-card--flat">
        <div className="worldcup-card__header">
          <div>
            <p>理性参与</p>
            <h2>模拟单不会自动购买彩票</h2>
          </div>
          <CircleDollarSign size={20} aria-hidden="true" />
        </div>
        <p className="worldcup-card__reason">{ticketsQuery.data?.compliance_notice || '预测仅供参考研究，不保证命中；请以线下实体店和官方公告为准。'}</p>
      </section>
      <WorldCupTabStrip activeTab="simulation" />
    </div>
  )
}
