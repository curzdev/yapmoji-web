import { apiSuccess } from '@/lib/api-response'
import { getCurrentModerationIdentity } from '@/lib/moderation-auth'
import { getCurrentYapinUser } from '@/lib/yapin-session'
import { isYapmojiOwner } from '@/lib/moderation-policy'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getCurrentYapinUser()
  let isModerator = false
  if (user) {
    try {
      isModerator = Boolean(await getCurrentModerationIdentity(user))
    } catch (error) {
      console.error('[auth/session] moderator status lookup failed', error)
    }
  }
  const response = apiSuccess({
    user: user
      ? {
          yapinUserId: user.yapinUserId,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          isOwner: isYapmojiOwner(user.yapinUserId),
          isModerator,
        }
      : null,
  })
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}
