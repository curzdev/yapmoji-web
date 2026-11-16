export const MODERATION_LOG_ACTIONS = [
  'submission_approved',
  'submission_rejected',
  'moderator_added',
  'moderator_removed',
] as const

export type ModerationLogAction = typeof MODERATION_LOG_ACTIONS[number]
export type ModerationLogSort = 'newest' | 'oldest'

export type ModerationLogFilters = {
  search: string
  moderator: string
  action: ModerationLogAction | ''
  from: string
  to: string
  sort: ModerationLogSort
  offset: number
}

export function isModerationLogAction(value: string): value is ModerationLogAction {
  return MODERATION_LOG_ACTIONS.some((action) => action === value)
}

export function parseDateBoundary(value: string | null, endOfDay = false): string | null | false {
  if (value === null || value === '') return null
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const instant = new Date(value)
    if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== value) return false
    return instant.toISOString()
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString()
}

export function localDateBoundary(value: string, nextDay = false) {
  const date = new Date(`${value}T00:00:00`)
  if (!Number.isFinite(date.getTime())) return ''
  if (nextDay) date.setDate(date.getDate() + 1)
  return date.toISOString()
}

export function quotePostgrestValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}
