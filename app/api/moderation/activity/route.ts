import { apiError } from '@/lib/api-response'
import { requireModerationApiAccess } from '@/lib/moderation-api-auth'
import { listModerationActivity } from '@/lib/moderation-activity'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authorization = await requireModerationApiAccess(request, 'moderator')
  if (!authorization.identity) return authorization.response

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'The moderation service is not configured.', 503)
  }

  const actorUserId = authorization.identity.user.id
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const [pendingSubmissions, approved, rejected, today, total, activity] = await Promise.all([
    supabase.from('emoji_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase.from('moderation_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('actor_user_id', actorUserId)
      .eq('action', 'submission_approved'),
    supabase.from('moderation_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('actor_user_id', actorUserId)
      .eq('action', 'submission_rejected'),
    supabase.from('moderation_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('actor_user_id', actorUserId)
      .in('action', ['submission_approved', 'submission_rejected'])
      .gte('created_at', todayStart.toISOString()),
    supabase.from('moderation_audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('actor_user_id', actorUserId)
      .in('action', ['submission_approved', 'submission_rejected']),
    listModerationActivity(supabase, {
      limit: 10,
      actorUserId,
      actions: ['submission_approved', 'submission_rejected'],
    }),
  ])
  if (
    pendingSubmissions.error || approved.error || rejected.error || today.error || total.error || !activity
  ) {
    return apiError('ACTIVITY_LOAD_FAILED', 'Your moderation activity could not be loaded.', 503)
  }

  return Response.json({
    data: {
      stats: {
        pending: pendingSubmissions.count ?? 0,
        approved: approved.count ?? 0,
        rejected: rejected.count ?? 0,
        today: today.count ?? 0,
        total: total.count ?? 0,
        mostRecentAt: activity[0]?.createdAt ?? null,
      },
      recentActivity: activity,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
