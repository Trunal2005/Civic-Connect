/**
 * Computes up to two uppercase initials from a user's display name.
 *
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function getUserInitials(name) {
  if (!name || typeof name !== 'string') return 'U'

  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'

  return parts
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
