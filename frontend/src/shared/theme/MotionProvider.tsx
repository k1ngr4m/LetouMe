import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { loadMotionPreference, saveMotionPreference, type MotionPreference } from '../lib/storage'

export type EffectiveMotionLevel = 'minimal' | 'normal' | 'enhanced'

type MotionContextValue = {
  motionPreference: MotionPreference
  motionLevel: EffectiveMotionLevel
  setMotionPreference: (preference: MotionPreference) => void
}

const MotionContext = createContext<MotionContextValue | null>(null)

function getSystemMotionLevel(): EffectiveMotionLevel {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'normal'
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'minimal' : 'normal'
}

function toEffectiveMotionLevel(preference: MotionPreference): EffectiveMotionLevel {
  if (preference === 'system') return getSystemMotionLevel()
  return preference
}

export function MotionProvider({ children }: PropsWithChildren) {
  const [motionPreference, setMotionPreferenceState] = useState<MotionPreference>(() => loadMotionPreference())
  const [motionLevel, setMotionLevel] = useState<EffectiveMotionLevel>(() => toEffectiveMotionLevel(loadMotionPreference()))

  useEffect(() => {
    if (motionPreference !== 'system') {
      setMotionLevel(toEffectiveMotionLevel(motionPreference))
      return
    }

    const mediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null

    function syncFromSystem() {
      setMotionLevel(mediaQuery?.matches ? 'minimal' : 'normal')
    }

    syncFromSystem()
    mediaQuery?.addEventListener?.('change', syncFromSystem)
    return () => mediaQuery?.removeEventListener?.('change', syncFromSystem)
  }, [motionPreference])

  useEffect(() => {
    document.documentElement.dataset.motion = motionLevel
  }, [motionLevel])

  function setMotionPreference(preference: MotionPreference) {
    setMotionPreferenceState(preference)
    saveMotionPreference(preference)
    setMotionLevel(toEffectiveMotionLevel(preference))
  }

  const value = useMemo(
    () => ({
      motionPreference,
      motionLevel,
      setMotionPreference,
    }),
    [motionPreference, motionLevel],
  )

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
}

export function useMotion() {
  const context = useContext(MotionContext)
  if (!context) {
    throw new Error('useMotion must be used within MotionProvider')
  }
  return context
}
