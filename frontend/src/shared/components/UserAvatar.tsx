import clsx from 'clsx'

type UserAvatarProps = {
  avatarUrl?: string | null
  displayName: string
  className?: string
}

export function UserAvatar({ avatarUrl, displayName, className }: UserAvatarProps) {
  const normalizedUrl = (avatarUrl || '').trim()
  const fallback = (displayName || 'U').slice(0, 1).toUpperCase()
  if (normalizedUrl) {
    return (
      <span className={clsx('user-avatar', className)}>
        <img className="user-avatar__image" src={normalizedUrl} alt={`${displayName || '用户'}头像`} />
      </span>
    )
  }
  return (
    <span className={clsx('user-avatar', className, 'is-fallback')} aria-hidden="true">
      {fallback}
    </span>
  )
}
