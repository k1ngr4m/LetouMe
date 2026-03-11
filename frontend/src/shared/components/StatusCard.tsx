import type { PropsWithChildren, ReactNode } from 'react'

type StatusCardProps = PropsWithChildren<{
  title: string
  subtitle?: string
  actions?: ReactNode
}>

export function StatusCard({ title, subtitle, actions, children }: StatusCardProps) {
  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <div>
          <h2 className="panel-card__title">{title}</h2>
          {subtitle ? <p className="panel-card__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel-card__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}
