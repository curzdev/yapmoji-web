import { apiError } from '@/lib/api-response'
import { requireModerationApiAccess } from '@/lib/moderation-api-auth'
import { listModerationActivity } from '@/lib/moderation-activity'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authorization = await requireModerationApiAccess(request, 'owner')
  if (!authorization.identity) return authorization.response

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'The owner dashboard is not configured.', 503)
  }

  const moderators = await supabase.from('user_roles')
    .select('user_id', { count: 'exact', head: true })
    .eq('role', 'moderator')
    .neq('user_id', authorization.identity.user.id)

  if (moderators.error) {
    return apiError('OVERVIEW_LOAD_FAILED', 'Dashboard statistics could not be loaded.', 503)
  }

  const recentActivity = await listModerationActivity(supabase, { limit: 10 })
  if (!recentActivity) {
    return apiError('ACTIVITY_LOAD_FAILED', 'Recent moderation activity could not be loaded.', 503)
  }

  return Response.json(
    {
      data: {
        moderators: moderators.count ?? 0,
        recentActivity,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
