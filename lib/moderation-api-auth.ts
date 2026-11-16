import 'server-only'

import { apiError } from '@/lib/api-response'
import { getCurrentYapinUser } from '@/lib/yapin-session'
import { canAccessModeratorDashboard, isYapmojiOwner } from '@/lib/moderation-policy'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { ModerationIdentity } from '@/lib/moderation-auth'
import { hasSameOrigin } from '@/lib/request-origin'

type AuthorizationResult =
  | { identity: ModerationIdentity; response: null }
  | { identity: null; response: Response }

export async function requireModerationApiAccess(
  request: Request,
  scope: 'moderator' | 'owner',
  checkOrigin = false,
): Promise<AuthorizationResult> {
  if (checkOrigin && !hasSameOrigin(request)) {
    return {
      identity: null,
      response: apiError('INVALID_ORIGIN', 'Requests must come from this Yapmoji site.', 403),
    }
  }

  const user = await getCurrentYapinUser()
  if (!user) {
    return { identity: null, response: apiError('UNAUTHENTICATED', 'Log in with YapIn to continue.', 401) }
  }

  if (isYapmojiOwner(user.yapinUserId)) {
    return { identity: { user, role: 'owner' }, response: null }
  }

  if (scope === 'owner') {
    return { identity: null, response: apiError('FORBIDDEN', 'Owner access is required.', 403) }
  }

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) throw error
    if (canAccessModeratorDashboard(user.yapinUserId, data?.role)) {
      return { identity: { user, role: 'moderator' }, response: null }
    }
  } catch (error) {
    console.error('[moderation] role lookup failed', error)
    return {
      identity: null,
      response: apiError('AUTHORIZATION_UNAVAILABLE', 'Moderation access could not be verified.', 503),
    }
  }

  return { identity: null, response: apiError('FORBIDDEN', 'Moderator access is required.', 403) }
}
