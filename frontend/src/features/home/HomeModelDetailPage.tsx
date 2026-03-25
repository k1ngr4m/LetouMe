import { useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { StatusCard } from '../../shared/components/StatusCard'
import { loadSelectedLottery } from '../../shared/lib/storage'
import { useHomeData } from './hooks/useHomeData'
import { getActualResult, normalizePredictionModelPlayMode } from './lib/home'
import { useHomeModelFilters } from './hooks/useHomeModelFilters'
import { ModelScoreShowcase, PredictionGroupCard } from './HomePage'
import type { HomeDetailRouteState } from './navigation'

const HISTORY_PAGE_SIZE = 10
const LOTTERY_PAGE_SIZE = 10

export function HomeModelDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { modelId = '' } = useParams()
  const navigationState = location.state as HomeDetailRouteState | null
  const selectedLottery = loadSelectedLottery()
  const expectedPlayMode = selectedLottery === 'pl3' ? navigationState?.predictionPlayMode : undefined

  const { currentPredictions, lotteryCharts, predictionsHistory } = useHomeData(selectedLottery, 1, HISTORY_PAGE_SIZE, [], [], 1, LOTTERY_PAGE_SIZE, {
    enableCurrentPredictions: true,
    enableLotteryCharts: true,
    enablePredictionsHistory: false,
    enablePagedLotteryHistory: false,
  })
  const models = currentPredictions.data?.models || []
  const history = predictionsHistory.data
  const chartDraws = lotteryCharts.data?.data || []
  const { modelScores } = useHomeModelFilters(models, history, [])

  const selectedModel = useMemo(
    () =>
      models.find(
        (item) =>
          item.model_id === modelId &&
          (!expectedPlayMode || normalizePredictionModelPlayMode(item) === expectedPlayMode),
      ) ||
      models.find((item) => item.model_id === modelId) ||
      null,
    [expectedPlayMode, modelId, models],
  )
  const selectedScore = selectedModel ? modelScores[selectedModel.model_id] : undefined
  const actualResult = getActualResult(chartDraws, currentPredictions.data?.target_period || '')

  function handleBack() {
    navigate('/dashboard/prediction')
  }

  if (currentPredictions.isLoading || lotteryCharts.isLoading || predictionsHistory.isLoading) {
    return <div className="state-shell">正在加载模型详情...</div>
  }

  const error =
    currentPredictions.error instanceof Error
      ? currentPredictions.error
      : lotteryCharts.error instanceof Error
        ? lotteryCharts.error
        : predictionsHistory.error instanceof Error
          ? predictionsHistory.error
          : null

  if (error) {
    return <div className="state-shell state-shell--error">模型详情加载失败：{error.message}</div>
  }

  if (!selectedModel) {
    return (
      <div className="page-stack model-detail-page">
        <StatusCard
          title="模型详情不存在"
          subtitle="当前模型可能已下线，或你是从旧入口进入了详情页。"
          actions={
            <button className="ghost-button" type="button" onClick={handleBack}>
              返回总览
            </button>
          }
        >
          <div className="state-shell">未找到对应模型：`{modelId || '-'}`</div>
        </StatusCard>
      </div>
    )
  }

  return (
    <div className="page-stack model-detail-page">
      <section className="panel-card model-detail-page__hero">
        <div className="model-detail-page__hero-top">
          <button className="ghost-button" type="button" onClick={handleBack}>
            返回总览
          </button>
          <span className="model-detail-page__path">预测总览 / 模型详情</span>
        </div>
        <div className="model-detail-page__hero-main">
          <div className="model-detail-page__hero-copy">
            <p className="modal-card__eyebrow">Model Detail</p>
            <div className="model-detail-page__title-row">
              <h2>{selectedModel.model_name}</h2>
              {selectedScore ? <span className="model-detail-page__score-badge">综合 {selectedScore.overallScore}</span> : null}
            </div>
            <p className="model-detail-page__description">
              查看当前目标期 <strong>{currentPredictions.data?.target_period || '-'}</strong> 下该模型的能力画像与全部预测组合。
            </p>
            <div className="model-detail-page__meta">
              <span>{selectedModel.model_provider}</span>
              <span>{selectedModel.predictions.length} 组预测</span>
              {selectedScore ? <span>近期 {selectedScore.recentScore} / 长期 {selectedScore.longTermScore}</span> : null}
              <span>{actualResult ? '已开奖' : '待开奖'}</span>
            </div>
          </div>
          <div className="model-detail-page__hero-side">
            <article className="model-detail-page__metric-card">
              <span>目标期号</span>
              <strong>{currentPredictions.data?.target_period || '-'}</strong>
              <small>预测日期 {currentPredictions.data?.prediction_date || '-'}</small>
            </article>
            <article className="model-detail-page__metric-card">
              <span>能力摘要</span>
              <strong>{selectedScore?.perPeriodScore || 0}</strong>
              <small>按期分 / ROI 近期 {Math.round((selectedScore?.recentWindow.roi || 0) * 100)}%</small>
            </article>
          </div>
        </div>
      </section>

      {selectedScore ? (
        <section className="detail-score-section model-detail-page__panel" aria-label="能力画像">
          <div className="model-detail-page__section-header">
            <span>能力画像</span>
            <small>综合分、按注分、按期分、近期/长期与上下限都在这里看。</small>
          </div>
          <ModelScoreShowcase score={selectedScore} compact={false} lotteryCode={selectedLottery} />
        </section>
      ) : null}

      <StatusCard title="本期预测组" subtitle="展示该模型当前期号下的全部预测组合与命中情况。">
        <div className="detail-group-list model-detail-page__group-list">
          {selectedModel.predictions.map((group) => (
            <PredictionGroupCard key={`${selectedModel.model_id}-${group.group_id}`} group={group} actualResult={actualResult} />
          ))}
        </div>
      </StatusCard>
    </div>
  )
}
