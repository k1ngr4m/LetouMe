import clsx from 'clsx'
import { CircleDollarSign, History, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { WORLDCUP_TAB_PATHS, type WorldCupTab } from '../home/navigation'

const ITEMS: Array<{ key: WorldCupTab; label: string; icon: typeof Sparkles }> = [
  { key: 'overview', label: '预测总览', icon: Sparkles },
  { key: 'simulation', label: '模拟试玩', icon: CircleDollarSign },
  { key: 'history', label: '开奖回溯', icon: History },
]

export function WorldCupTabStrip({ activeTab }: { activeTab: WorldCupTab }) {
  const navigate = useNavigate()
  return (
    <section className="tab-strip dashboard-tab-strip dashboard-bottom-nav dashboard-bottom-nav--mobile" aria-label="世界杯导航">
      {ITEMS.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            className={clsx('tab-strip__item dashboard-bottom-nav__item', activeTab === item.key && 'is-active')}
            type="button"
            onClick={() => navigate(WORLDCUP_TAB_PATHS[item.key])}
            aria-label={item.label}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="dashboard-bottom-nav__label">{item.label}</span>
          </button>
        )
      })}
    </section>
  )
}
