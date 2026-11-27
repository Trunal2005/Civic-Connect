import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getUserInitials } from '@/utils/avatar'
import { cn } from '@/utils/cn'

/**
 * Renders a user's profile photo when available, falling back to uppercase
 * initials when no photo is set or if the image fails to load.
 */
export function UserAvatar({
  src,
  name,
  alt,
  className,
  fallbackClassName,
  imgClassName,
}) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [src])

  const initials = getUserInitials(name)
  const showImage = Boolean(src) && !imgError

  return (
    <Avatar className={className}>
      {showImage ? (
        <img
          src={src}
          alt={alt || name || 'User avatar'}
          onError={() => setImgError(true)}
          className={cn('aspect-square h-full w-full object-cover', imgClassName)}
        />
      ) : (
        <AvatarFallback className={fallbackClassName}>
          {initials}
        </AvatarFallback>
      )}
    </Avatar>
  )
}
