import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { loadThemePreference, saveThemePreference } from '../lib/storage'

export type AppTheme = 'dark' | 'light'

type ThemeContextValue = {
  theme: AppTheme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): AppTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreference] = useState<AppTheme | null>(() => loadThemePreference())
  const [theme, setTheme] = useState<AppTheme>(() => loadThemePreference() ?? getSystemTheme())

  useEffect(() => {
    if (preference) {
      setTheme(preference)
      return
    }

    const mediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null

    function syncFromSystem() {
      setTheme(mediaQuery?.matches ? 'dark' : 'light')
    }

    syncFromSystem()
    mediaQuery?.addEventListener?.('change', syncFromSystem)
    return () => mediaQuery?.removeEventListener?.('change', syncFromSystem)
  }, [preference])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
  }, [theme])

  function toggleTheme() {
    setTheme((previous) => {
      const next = previous === 'dark' ? 'light' : 'dark'
      setPreference(next)
      saveThemePreference(next)
      return next
    })
  }

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
    }),
    [theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
