const DISCLAIMER_TEXT = '预测结果仅供娱乐与参考，不保证中奖，请理性购彩。'

export function SiteDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`site-disclaimer${compact ? ' site-disclaimer--compact' : ''}`} role="note" aria-label="购彩免责声明">
      <span className="site-disclaimer__badge">温馨提示</span>
      <span className="site-disclaimer__text">{DISCLAIMER_TEXT}</span>
    </div>
  )
}

export { DISCLAIMER_TEXT }
