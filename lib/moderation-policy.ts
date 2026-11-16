export const YAPMOJI_OWNER_YAPIN_ID = 'f01324b0-1d14-4e84-85f3-d402bda301ec'

const yapinUserIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isYapmojiOwner(yapinUserId: string) {
  return yapinUserId.toLowerCase() === YAPMOJI_OWNER_YAPIN_ID
}

export function hasModeratorRole(role: unknown): role is 'moderator' {
  return role === 'moderator'
}

export function canAccessModeratorDashboard(yapinUserId: string, role: unknown) {
  return isYapmojiOwner(yapinUserId) || hasModeratorRole(role)
}

export function getModerationLogPolicy(role: 'owner' | 'moderator', userId: string) {
  return role === 'owner'
    ? {
        actorUserId: null,
        actions: ['submission_approved', 'submission_rejected', 'moderator_added', 'moderator_removed'],
      }
    : {
        actorUserId: userId,
        actions: ['submission_approved', 'submission_rejected'],
      }
}

export function isValidYapinUserId(value: unknown): value is string {
  return typeof value === 'string' && yapinUserIdPattern.test(value)
}

export function isModerationAction(value: unknown): value is 'approve' | 'reject' {
  return value === 'approve' || value === 'reject'
}

export function normalizeRejectionReason(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const reason = value.trim()
  return reason.length > 0 && reason.length <= 500 ? reason : null
}
