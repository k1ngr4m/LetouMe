import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import type { LotteryCode } from '../../shared/types/api'
import { HOME_RULES_PATH, getDashboardPath, type HomeRulesRouteState } from './navigation'

type DashboardActiveTab = 'prediction' | 'simulation' | 'analysis' | 'history' | 'my-bets' | 'rules'

export function HomeDashboardTabStrip({
  activeTab,
  selectedLottery,
}: {
  activeTab: DashboardActiveTab
  selectedLottery: LotteryCode
}) {
  const navigate = useNavigate()

  return (
    <section className="tab-strip dashboard-tab-strip">
      <button className={clsx('tab-strip__item', activeTab === 'prediction' && 'is-active')} onClick={() => navigate(getDashboardPath('prediction'))}>
        预测总览
      </button>
      <button className={clsx('tab-strip__item', activeTab === 'simulation' && 'is-active')} onClick={() => navigate(getDashboardPath('simulation'))}>
        模拟试玩
      </button>
      <button className={clsx('tab-strip__item', activeTab === 'analysis' && 'is-active')} onClick={() => navigate(getDashboardPath('analysis'))}>
        图表分析
      </button>
      <button className={clsx('tab-strip__item', activeTab === 'history' && 'is-active')} onClick={() => navigate(getDashboardPath('history'))}>
        历史回溯
      </button>
      <button
        className={clsx('tab-strip__item', activeTab === 'rules' && 'is-active')}
        onClick={() => navigate(HOME_RULES_PATH, { state: { lotteryCode: selectedLottery } satisfies HomeRulesRouteState })}
      >
        规则与奖金
      </button>
      <button className={clsx('tab-strip__item', activeTab === 'my-bets' && 'is-active')} onClick={() => navigate(getDashboardPath('my-bets'))}>
        我的投注
      </button>
    </section>
  )
}
