import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const nextLabel = theme === 'dark' ? '切换浅色' : '切换深色'

  return (
    <button className="app-theme-toggle" type="button" onClick={toggleTheme} aria-label={nextLabel} title={nextLabel}>
      {theme === 'dark' ? '浅色' : '深色'}
    </button>
  )
}
