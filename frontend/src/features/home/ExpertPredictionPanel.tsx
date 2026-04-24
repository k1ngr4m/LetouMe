import { useState } from 'react'
import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../../shared/api/client'
import { NumberBall } from '../../shared/components/NumberBall'
import { StatusCard } from '../../shared/components/StatusCard'
import type { LotteryCode } from '../../shared/types/api'

type ExpertPredictionPanelProps = {
  lotteryCode: LotteryCode
}

const TIER_OPTIONS: Array<{ key: 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5'; label: string }> = [
  { key: 'tier1', label: '第一档' },
  { key: 'tier2', label: '第二档' },
  { key: 'tier3', label: '第三档' },
  { key: 'tier4', label: '第四档' },
  { key: 'tier5', label: '第五档' },
]

export function ExpertPredictionPanel({ lotteryCode }: ExpertPredictionPanelProps) {
  const [selectedExpertCode, setSelectedExpertCode] = useState('')
  const [selectedTier, setSelectedTier] = useState<'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5'>('tier5')

  const listQuery = useQuery({
    queryKey: ['experts-list', lotteryCode],
    queryFn: async () => apiClient.getExpertsList(lotteryCode),
    enabled: lotteryCode === 'dlt',
  })

  const effectiveExpertCode = selectedExpertCode || listQuery.data?.experts?.[0]?.expert_code || ''
  const detailQuery = useQuery({
    queryKey: ['experts-detail', lotteryCode, effectiveExpertCode],
    queryFn: async () => apiClient.getExpertCurrentDetail(effectiveExpertCode, lotteryCode),
    enabled: Boolean(effectiveExpertCode && lotteryCode === 'dlt'),
  })

  if (lotteryCode !== 'dlt') {
    return (
      <StatusCard title="专家方案" subtitle="当前仅支持大乐透专家方案。">
        <div className="state-shell">请切换到大乐透查看专家五档方案。</div>
      </StatusCard>
    )
  }

  const experts = listQuery.data?.experts || []
  const detail = detailQuery.data
  const tier = detail?.tiers?.[selectedTier]

  return (
    <StatusCard title="专家方案" subtitle={`目标期 ${listQuery.data?.target_period || '-'} · 采用五档嵌套输出`}>
      <div className="page-stack">
        <div className="filter-chip-group" role="group" aria-label="专家选择">
          {experts.map((expert) => (
            <button
              key={expert.expert_code}
              className={clsx('filter-chip', effectiveExpertCode === expert.expert_code && 'is-active')}
              type="button"
              onClick={() => setSelectedExpertCode(expert.expert_code)}
            >
              {expert.display_name}
            </button>
          ))}
          {!experts.length ? <span className="state-shell">暂无可用专家方案。</span> : null}
        </div>

        {detail ? (
          <>
            <div className="state-shell">
              <strong>{detail.display_name}</strong>：{detail.bio || '暂无简介'}
            </div>
            <div className="filter-chip-group" role="tablist" aria-label="档位选择">
              {TIER_OPTIONS.map((item) => (
                <button
                  key={item.key}
                  className={clsx('filter-chip', selectedTier === item.key && 'is-active')}
                  type="button"
                  onClick={() => setSelectedTier(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {tier ? (
              <div className="summary-columns">
                <section className="summary-column">
                  <h3>前区</h3>
                  <div className="number-ball-row">
                    {(tier.front || []).map((value) => (
                      <NumberBall key={`front-${value}`} value={value} color="dlt-front" />
                    ))}
                  </div>
                </section>
                <section className="summary-column">
                  <h3>后区</h3>
                  <div className="number-ball-row">
                    {(tier.back || []).map((value) => (
                      <NumberBall key={`back-${value}`} value={value} color="dlt-back" />
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="state-shell">该档位暂无数据。</div>
            )}
            {detail.analysis?.strategy_summary ? <div className="state-shell">{detail.analysis.strategy_summary}</div> : null}
            {detail.analysis?.technical_style ? <div className="state-shell">{detail.analysis.technical_style}</div> : null}
          </>
        ) : detailQuery.isLoading ? (
          <div className="state-shell">正在加载专家详情...</div>
        ) : null}
      </div>
    </StatusCard>
  )
}
