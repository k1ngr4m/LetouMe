import { useNavigate } from 'react-router-dom'
import { StatusCard } from '../../shared/components/StatusCard'
import { useLotterySelection } from '../../shared/lottery/LotterySelectionProvider'
import { HOME_TAB_PATHS } from './navigation'
import { SmartPredictionPanel } from './SmartPredictionPanel'

export function HomeSmartPredictionPage() {
  const navigate = useNavigate()
  const { selectedLottery } = useLotterySelection()
  const lotteryLabel = selectedLottery === 'pl3' ? '排列3' : selectedLottery === 'pl5' ? '排列5' : selectedLottery === 'qxc' ? '七星彩' : '大乐透'

  return (
    <div className="page-stack rules-page">
      <section className="panel-card">
        <div className="panel-card__header">
          <div>
            <p className="modal-card__eyebrow">Smart Prediction</p>
            <h2 className="panel-card__title">智能预测</h2>
          </div>
          <button className="ghost-button" type="button" onClick={() => navigate(HOME_TAB_PATHS.prediction)}>
            返回预测总览
          </button>
        </div>
        <div className="rules-page__lottery-note">当前查看彩种：{lotteryLabel}</div>
      </section>
      <StatusCard title="功能说明" subtitle="双阶段智能推演：先生成策略评估表，再生成最终5注+胆拖。">
      </StatusCard>
      <SmartPredictionPanel lotteryCode={selectedLottery} />
    </div>
  )
}
