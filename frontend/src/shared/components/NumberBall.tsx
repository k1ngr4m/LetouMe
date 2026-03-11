import clsx from 'clsx'

type NumberBallProps = {
  value: string
  color: 'red' | 'blue'
  isHit?: boolean
  size?: 'sm' | 'md'
}

export function NumberBall({ value, color, isHit = false, size = 'md' }: NumberBallProps) {
  return (
    <span className={clsx('number-ball', `number-ball--${color}`, `number-ball--${size}`, isHit && 'is-hit')}>
      {value}
    </span>
  )
}
