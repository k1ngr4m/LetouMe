import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { currentPredictionsQueryOptions } from '../home/hooks/useHomeData'
import { appLogger } from '../../shared/lib/logger'

export function LandingPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleStart() {
    try {
      setIsLoading(true)
      setError(null)
      await queryClient.fetchQuery(currentPredictionsQueryOptions())
      navigate('/dashboard')
    } catch (requestError) {
      appLogger.error('Landing page failed to load predictions', {
        error: requestError instanceof Error ? requestError.message : 'unknown',
      })
      if (requestError instanceof Error && requestError.message.includes('请先登录')) {
        navigate('/login')
        return
      }
      setError(requestError instanceof Error ? requestError.message : '预测数据加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="landing-shell">
      <section className="landing-panel">
        <div className="landing-panel__copy">
          <p className="landing-panel__eyebrow">AI DLT Forecast System</p>
          <h1 className="landing-panel__title">AI 大乐透预测系统</h1>
        </div>
        <div className="landing-panel__actions">
          <button className="landing-panel__button" onClick={() => void handleStart()} disabled={isLoading}>
            {isLoading ? '正在获取预测...' : '获取大乐透预测'}
          </button>
          <button className="ghost-button" onClick={() => navigate('/login')}>
            管理员登录
          </button>
          {error ? <p className="landing-panel__error">加载失败：{error}</p> : null}
        </div>
      </section>
    </div>
  )
}
