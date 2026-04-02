import { createContext, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import clsx from 'clsx'

type ToastTone = 'success' | 'error'

type ToastState = {
  message: string
  tone: ToastTone
} | null

type ToastContextValue = {
  showToast: (message: string, tone: ToastTone) => void
}

const TOAST_DURATION_MS = 2000
const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ToastState>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast: (message, tone) => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current)
        }
        setToast({ message, tone })
        timerRef.current = window.setTimeout(() => {
          setToast(null)
          timerRef.current = null
        }, TOAST_DURATION_MS)
      },
    }),
    [],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div className={clsx('export-toast', toast.tone === 'error' && 'is-error')} role="status" aria-live="polite">
          <div className="export-toast__badge">{toast.tone === 'error' ? '操作失败' : '操作成功'}</div>
          <div className="export-toast__message">{toast.message}</div>
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

