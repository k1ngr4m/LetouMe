import { useTheme } from './ThemeProvider'
import { useMotion } from './MotionProvider'
import type { MotionPreference } from '../lib/storage'

const motionOptions: Array<{ value: MotionPreference; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'minimal', label: '极简' },
  { value: 'normal', label: '标准' },
  { value: 'enhanced', label: '增强' },
]

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const { motionPreference, motionLevel, setMotionPreference } = useMotion()
  const nextLabel = theme === 'dark' ? '切换浅色' : '切换深色'

  return (
    <div className="app-preference-panel" role="group" aria-label="界面偏好设置">
      <button className="app-theme-toggle" type="button" onClick={toggleTheme} aria-label={nextLabel} title={nextLabel}>
        {theme === 'dark' ? '浅色' : '深色'}
      </button>
      <div className="app-motion-toggle" role="tablist" aria-label="动效分级">
        {motionOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={motionPreference === option.value}
            className={motionPreference === option.value ? 'is-active' : undefined}
            onClick={() => setMotionPreference(option.value)}
            title={`动效：${option.label}（当前生效：${motionLevel}）`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
