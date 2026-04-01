import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChartColumnIncreasing, CircleDollarSign, History, Sparkles, WalletCards } from 'lucide-react'
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
  const [isCompact, setIsCompact] = useState(false)
  const [isReveal, setIsReveal] = useState(false)
  const compactRef = useRef(false)
  const revealRef = useRef(false)
  const revealTimerRef = useRef<number | null>(null)

  useEffect(() => {
    let lastScrollY = window.scrollY
    let ticking = false

    const setCompactState = (next: boolean) => {
      if (compactRef.current === next) return
      compactRef.current = next
      setIsCompact(next)
    }

    const setRevealState = (next: boolean) => {
      if (revealRef.current === next) return
      revealRef.current = next
      setIsReveal(next)
    }

    const triggerReveal = () => {
      setRevealState(true)
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current)
      }
      revealTimerRef.current = window.setTimeout(() => {
        setRevealState(false)
        revealTimerRef.current = null
      }, 420)
    }

    const updateByScroll = () => {
      const currentScrollY = window.scrollY
      const delta = currentScrollY - lastScrollY
      const isNearTop = currentScrollY < 56

      if (isNearTop) {
        setCompactState(false)
        setRevealState(false)
      } else if (delta > 8 && currentScrollY > 120) {
        setCompactState(true)
        setRevealState(false)
      } else if (delta < -4) {
        if (compactRef.current) {
          setCompactState(false)
          triggerReveal()
        }
      }

      lastScrollY = currentScrollY
      ticking = false
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(updateByScroll)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (revealTimerRef.current !== null) {
        window.clearTimeout(revealTimerRef.current)
      }
    }
  }, [])

  const items: Array<{
    key: DashboardActiveTab
    label: string
    icon: typeof Sparkles
    onClick: () => void
  }> = [
    {
      key: 'prediction',
      label: '预测总览',
      icon: Sparkles,
      onClick: () => navigate(getDashboardPath('prediction')),
    },
    {
      key: 'simulation',
      label: '模拟试玩',
      icon: CircleDollarSign,
      onClick: () => navigate(getDashboardPath('simulation')),
    },
    {
      key: 'analysis',
      label: '图表分析',
      icon: ChartColumnIncreasing,
      onClick: () => navigate(getDashboardPath('analysis')),
    },
    {
      key: 'history',
      label: '历史回溯',
      icon: History,
      onClick: () => navigate(getDashboardPath('history')),
    },
    {
      key: 'rules',
      label: '规则',
      icon: BookOpen,
      onClick: () => navigate(HOME_RULES_PATH, { state: { lotteryCode: selectedLottery } satisfies HomeRulesRouteState }),
    },
    {
      key: 'my-bets',
      label: '我的投注',
      icon: WalletCards,
      onClick: () => navigate(getDashboardPath('my-bets')),
    },
  ]

  return (
    <section
      className={clsx(
        'tab-strip dashboard-tab-strip dashboard-bottom-nav',
        isCompact && 'is-compact',
        isReveal && 'is-reveal',
      )}
      aria-label="主导航"
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.key}
            className={clsx('tab-strip__item dashboard-bottom-nav__item', activeTab === item.key && 'is-active')}
            onClick={item.onClick}
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
