import clsx from 'clsx'

type NumberBallProps = {
  value: string
  color: 'red' | 'blue'
  isHit?: boolean
  size?: 'sm' | 'md'
  tone?: 'default' | 'muted'
}

export function NumberBall({ value, color, isHit = false, size = 'md', tone = 'default' }: NumberBallProps) {
  return (
    <span
      className={clsx(
        'number-ball',
        `number-ball--${color}`,
        `number-ball--${size}`,
        tone === 'muted' && 'number-ball--muted',
        isHit && 'is-hit',
      )}
    >
      {value}
    </span>
  )
}
