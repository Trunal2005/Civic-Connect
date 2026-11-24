import { Clock, Share2 } from 'lucide-react'
import { CivicUnassignedCrestIcon } from '@/components/common/DepartmentCrest'
import { getDisplayId } from '@/firebase/complaintId'

const priorityStyles = {
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  high: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  medium: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
  low: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
}

export function PriorityBadge({ priority, label }) {
  const normalized = String(priority || '').trim().toLowerCase()

  if (!priorityStyles[normalized]) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityStyles[normalized]}`}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full bg-current"
      />
      {label || priority}
    </span>
  )
}

export function ComplaintTicket({
  complaint,
  priorityLabel,
  children,
}) {
  return (
    <article className="relative isolate h-full overflow-hidden rounded-xl border-2 border-gray-300 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-20 -z-10 rotate-[-12deg] text-gray-900 opacity-[0.045] dark:text-white dark:opacity-[0.07]"
      >
        <div className="rounded-full border-4 border-double border-current p-4">
          <CivicUnassignedCrestIcon className="h-24 w-24" />
        </div>
      </div>

      <header className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-dashed border-gray-300 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
        <span className="font-mono text-xs font-bold tracking-wider text-gray-700 dark:text-gray-200">
          {getDisplayId(complaint)}
        </span>

        <PriorityBadge
          priority={complaint.priority}
          label={priorityLabel}
        />
      </header>

      {children}
    </article>
  )
}
export function ComplaintProgress({ status, t }) {
  const stages = [
    { status: 'Pending', label: 'statusPending' },
    { status: 'In Progress', label: 'statusInProgress' },
    { status: 'Resolved', label: 'statusResolved' },
  ]

  const currentIndex = stages.findIndex(
    (stage) => stage.status === status
  )

  if (currentIndex === -1) return null

  return (
    <ol className="flex items-start rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-4 dark:border-gray-700 dark:bg-gray-800/40">
      {stages.map((stage, index) => {
        const completed = index < currentIndex
        const active = index === currentIndex

        return (
          <li
            key={stage.status}
            aria-current={active ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-2 text-center"
          >
            {index < stages.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute left-1/2 top-3 h-0.5 w-full ${
                  completed
                    ? 'bg-emerald-500'
                    : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />
            )}

            <span
              aria-hidden="true"
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-bold ${
                completed || (active && status === 'Resolved')
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : active
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-300 bg-white text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {completed || (active && status === 'Resolved')
                ? '✓'
                : index + 1}
            </span>

            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {t(stage.label)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
export function ElapsedTime({ createdAt, language = 'en' }) {
  const date = createdAt?.toDate
    ? createdAt.toDate()
    : createdAt?.seconds != null
      ? new Date(createdAt.seconds * 1000)
      : null

  if (!date || !Number.isFinite(date.getTime())) return null

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 1000)
  )

  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ]

  const [unit, duration] =
    units.find(([, duration]) => seconds >= duration) ||
    ['second', 1]

  const elapsed = new Intl.RelativeTimeFormat(language, {
    numeric: 'auto',
  }).format(-Math.floor(seconds / duration), unit)

  return (
    <span
      title={date.toLocaleString(language)}
      className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
    >
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {elapsed}
    </span>
  )
}

export function ComplaintShareButton({ onShare, label }) {
  return (
    <button
      type="button"
      onClick={onShare}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-blue-400"
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}