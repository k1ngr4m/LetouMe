import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { StatusCard } from '../../shared/components/StatusCard'
import { loadSelectedLottery } from '../../shared/lib/storage'
import type { LotteryCode } from '../../shared/types/api'
import { HOME_TAB_PATHS, type HomeRulesRouteState } from './navigation'
import { HomeDashboardTabStrip } from './HomeDashboardTabStrip'

const DLT_RULES_PDF_PATH = '/rules/dlt-rules.pdf'
const DLT_PRIZE_TABLE_IMAGE_PATH = '/rules/dlt-prize-table.png'

const PL3_RULE_CHAPTERS = [
  {
    title: '第一章 总则',
    items: [
      '第一条 根据《彩票管理条例》、《彩票管理条例实施细则》、《彩票发行销售管理办法》（财综[2012]102号）等相关规定，制定本规则。',
      '第二条 中国体育彩票排列3游戏（以下简称排列3）由国家体育总局体育彩票管理中心（以下简称中体彩中心）发行和组织销售。由各省、自治区、直辖市体育彩票销售机构（以下称各省体彩机构）在所辖区域内销售。',
      '第三条 排列3采用计算机网络系统发行，在各省体彩机构设置的销售网点销售，定期开奖。',
      '第四条 排列3实行自愿购买，凡购票者均被视为同意并遵守本规则。',
      '第五条 不得向未成年人出售彩票或兑付奖金。',
    ],
  },
  {
    title: '第二章 投注',
    items: [
      '第六条 排列3是指从000-999的数字中选取1个3位数作为一注投注号码进行的投注。每注金额人民币2元。',
      '第七条 排列3投注方式分为直选投注和组选投注。直选投注：所选3位数以唯一排列方式作为一注的投注。组选投注：所选3位数以所有排列方式作为一注的投注。组选6：若3位数字各不相同，则有6种不同排列方式；组选3：若有2位数字相同，则有3种不同排列方式。',
      '第八条 购买者可对其选定的投注号码进行多倍投注，投注倍数范围为2-99倍。单张彩票的投注金额最高不得超过20000元。',
      '第九条 排列3每天销售一期，期号以开奖日界定，按日历年度编排。',
      '第十条 购买者可在各省体彩机构设置的销售网点投注。投注号码经投注机打印出的对奖凭证，交购买者保存，此对奖凭证即为排列3彩票。',
      '第十一条 投注者可选择机选号码投注、自选号码投注。机选号码投注是指由投注机随机产生投注号码进行投注，自选号码投注是指将购买者选定的号码输入投注机进行投注。',
      '第十二条 排列3对每期全部投注号码的可投注数量实行限量销售，若投注号码受限，则不能投注。若因销售终端故障、通讯线路故障和投注站信用额度受限等原因造成投注不成功，应退还购买者投注金额。',
    ],
  },
  {
    title: '第三章 设奖',
    items: [
      '第十三条 排列3按当期销售总额的53%、13%、34％分别计提彩票奖金、彩票发行费和彩票公益金。彩票奖金分为当期奖金和调节基金，其中，52％为当期奖金，1％为调节基金。',
      '第十四条 排列3按不同投注方式设奖，均为固定奖：直选投注单注奖金1040元；组选6单注奖金173元；组选3单注奖金346元。',
      '第十五条 排列3设置调节基金。调节基金包括按销售总额1％的提取部分、逾期未退票的票款。调节基金专项用于支付不可预见情况下的奖金支出风险，以及设立特别奖。',
      '第十六条 排列3设置奖池，奖池资金由计提当期奖金与实际中出奖金的差额组成。当期实际中出奖金小于计提当期奖金时，余额进入奖池；当期实际中出奖金超过计提当期奖金时，差额由奖池资金补足；当奖池资金不足时，由调节基金补足。',
    ],
  },
  {
    title: '第四章 开奖',
    items: [
      '第十七条 排列3每天开奖一次。以中国体育彩票排列5当期开奖号码的前三位号码作为排列3当期开奖号码。',
      '第十八条 每期开奖后，由各省体彩机构向社会公布当期销售总额、开奖号码、各奖级中奖情况以及奖池资金余额等信息，并将开奖结果通知各销售网点。',
    ],
  },
  {
    title: '第五章 中奖',
    items: [
      '第十九条 排列3根据投注号码与开奖号码相符情况确定相应中奖资格。直选投注：投注号码与开奖号码数字相同且顺序一致即中奖。组选6：开奖号码每位数字均不相同，投注号码与开奖号码数字相同且顺序不限即中奖。组选3：开奖号码中任意2位数字相同，投注号码与开奖号码数字相同且顺序不限即中奖。',
    ],
  },
  {
    title: '第六章 兑奖',
    items: [
      '第二十条 排列3兑奖当期有效。中奖者应当自开奖之日起60个自然日内，持中奖彩票到指定地点兑奖。逾期未兑奖视为弃奖，弃奖奖金纳入彩票公益金。',
      '第二十一条 中奖彩票为兑奖唯一凭证，中奖彩票因玷污、损坏等原因不能正确识别的，不能兑奖。',
      '第二十二条 兑奖机构有权查验中奖者的中奖彩票及有效身份证件，兑奖者应予配合。',
    ],
  },
  {
    title: '第七章 附则',
    items: [
      '第二十三条 本规则自批准之日起执行。',
    ],
  },
] as const

export function HomeRulesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationState = location.state as HomeRulesRouteState | null
  const selectedLottery = useMemo<LotteryCode>(() => navigationState?.lotteryCode || loadSelectedLottery(), [navigationState?.lotteryCode])
  const isPl3 = selectedLottery === 'pl3'
  const isPl5 = selectedLottery === 'pl5'

  return (
    <div className="page-stack rules-page">
      <section className="panel-card">
        <div className="panel-card__header">
          <div>
            <p className="modal-card__eyebrow">Game Rules</p>
            <h2 className="panel-card__title">{isPl3 ? '排列3规则与奖金' : isPl5 ? '排列5规则与奖金' : '大乐透规则与奖金'}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={() => navigate(HOME_TAB_PATHS.prediction)}>
            返回预测总览
          </button>
        </div>
        <div className="rules-page__lottery-note">当前查看彩种：{isPl3 ? '排列3' : isPl5 ? '排列5' : '大乐透'}</div>
      </section>
      <HomeDashboardTabStrip activeTab="rules" selectedLottery={selectedLottery} />

      {!isPl3 && !isPl5 ? (
        <>
          <StatusCard
            title="官方规则文档"
            subtitle="以下为完整大乐透游戏规则原文，可直接滚动阅读。"
            actions={
              <a className="ghost-button" href={DLT_RULES_PDF_PATH} target="_blank" rel="noreferrer">
                新窗口打开 PDF
              </a>
            }
          >
            <div className="rules-page__pdf-shell">
              <iframe title="中国体育彩票超级大乐透游戏规则" src={`${DLT_RULES_PDF_PATH}#toolbar=1`} className="rules-page__pdf-frame" />
            </div>
          </StatusCard>

          <StatusCard
            title="奖金对照表"
            subtitle="26014期前按旧规（九等奖），26014期及之后按新规（七等奖）；新规固定奖按上期奖池是否达到 8 亿元分档。"
            actions={
              <a className="ghost-button" href={DLT_PRIZE_TABLE_IMAGE_PATH} target="_blank" rel="noreferrer">
                查看原图
              </a>
            }
          >
            <div className="rules-page__text-shell">
              <section className="rules-page__chapter">
                <h3>规则切换说明</h3>
                <p>26014期之前：使用旧规则，奖级共九档（一等奖至九等奖）。</p>
                <p>26014期及之后：使用新规则，奖级共七档（一等奖至七等奖）。</p>
                <p>新规则固定奖分档：上期奖池&lt;8亿元按低档发放；上期奖池≥8亿元按高档发放。</p>
              </section>
            </div>
            <div className="rules-page__image-shell">
              <img src={DLT_PRIZE_TABLE_IMAGE_PATH} alt="大乐透奖金对照表" className="rules-page__image" loading="lazy" />
            </div>
          </StatusCard>
        </>
      ) : isPl3 ? (
        <>
          <StatusCard title="排列3规则正文" subtitle="以下内容依据你提供的排列3规则原文整理，按章节完整展示。">
            <div className="rules-page__text-shell">
              {PL3_RULE_CHAPTERS.map((chapter) => (
                <section key={chapter.title} className="rules-page__chapter">
                  <h3>{chapter.title}</h3>
                  {chapter.items.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </section>
              ))}
            </div>
          </StatusCard>

          <StatusCard title="排列3固定奖金" subtitle="依据第三章第十四条。">
            <div className="rules-page__prize-grid">
              <article>
                <span>直选</span>
                <strong>1040 元 / 注</strong>
              </article>
              <article>
                <span>组选6</span>
                <strong>173 元 / 注</strong>
              </article>
              <article>
                <span>组选3</span>
                <strong>346 元 / 注</strong>
              </article>
            </div>
          </StatusCard>
        </>
      ) : (
        <StatusCard title="排列5规则摘要" subtitle="本页面先提供核心规则摘要，后续可补充完整规则正文。">
          <div className="rules-page__text-shell">
            <section className="rules-page__chapter">
              <h3>核心规则</h3>
              <p>排列5为 5 位数字定位玩法，号码范围为 00000-99999。</p>
              <p>仅支持直选投注：投注号码与开奖号码数字相同且顺序一致即中奖。</p>
              <p>每注金额 2 元，可进行多倍投注（具体倍数以销售终端规则为准）。</p>
            </section>
          </div>
          <div className="rules-page__prize-grid">
            <article>
              <span>直选</span>
              <strong>100000 元 / 注</strong>
            </article>
          </div>
        </StatusCard>
      )}
    </div>
  )
}
