import { apiError, apiSuccess } from '@/lib/api-response'
import { requireModerationApiAccess } from '@/lib/moderation-api-auth'
import { listModerationActivity } from '@/lib/moderation-activity'
import { isValidYapinUserId, isYapmojiOwner } from '@/lib/moderation-policy'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mapManagementError(error: { code?: string; message?: string }) {
  if (error.code === '42501') return apiError('OWNER_ONLY', 'Only the Yapmoji owner can manage moderators.', 403)
  if (error.code === 'P0002' && error.message === 'yapin_user_not_found') {
    return apiError('YAPIN_USER_NOT_FOUND', 'This YapIn user has not signed in to Yapmoji yet.', 404)
  }
  if (error.code === 'P0001') {
    if (error.message === 'moderator_already_exists') {
      return apiError('ALREADY_MODERATOR', 'This user is already a moderator.', 409)
    }
    if (error.message === 'moderator_not_found') {
      return apiError('NOT_A_MODERATOR', 'This user is not a moderator.', 409)
    }
    if (error.message === 'target_has_protected_role') {
      return apiError('PROTECTED_ROLE', 'This YapIn account has a protected role and cannot be changed here.', 409)
    }
  }
  if (error.code === '22023') {
    return apiError('INVALID_MODERATOR', 'The YapIn user ID or moderator action is invalid.', 400)
  }
  return null
}

export async function GET(request: Request) {
  const authorization = await requireModerationApiAccess(request, 'owner')
  if (!authorization.identity) return authorization.response

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'Moderator management is not configured.', 503)
  }

  const requestedYapinUserId = new URL(request.url).searchParams.get('yapinUserId')
  if (requestedYapinUserId !== null) {
    if (!isValidYapinUserId(requestedYapinUserId) || isYapmojiOwner(requestedYapinUserId)) {
      return apiError('INVALID_YAPIN_USER_ID', 'Enter a valid YapIn user ID.', 400)
    }

    const { data: account, error } = await supabase
      .from('yapin_users')
      .select('id, yapin_user_id, username, display_name, avatar_url')
      .ilike('yapin_user_id', requestedYapinUserId)
      .maybeSingle()

    if (error) return apiError('PROFILE_LOOKUP_FAILED', 'The YapIn profile could not be verified.', 503)
    if (!account || !account.yapin_user_id || !account.username) {
      return apiError('YAPIN_USER_NOT_FOUND', 'This user has not signed in to Yapmoji with YapIn yet.', 404)
    }

    const { data: role, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', account.id)
      .maybeSingle()

    if (roleError) return apiError('PROFILE_LOOKUP_FAILED', 'The YapIn profile could not be verified.', 503)

    return Response.json({
      data: {
        yapinUserId: account.yapin_user_id,
        username: account.username,
        displayName: account.display_name,
        avatarUrl: account.avatar_url,
        role: role?.role ?? 'user',
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  const { data: moderatorRows, error } = await supabase
    .from('user_roles')
    .select('user_id, moderator_added_at, moderator_added_by')
    .eq('role', 'moderator')
    .neq('user_id', authorization.identity.user.id)
    .order('moderator_added_at', { ascending: false })

  if (error || !moderatorRows) {
    return apiError('MODERATORS_LOAD_FAILED', 'The moderator list could not be loaded.', 503)
  }

  const profileIds = [...new Set(moderatorRows.flatMap((row) => [
    row.user_id,
    ...(row.moderator_added_by ? [row.moderator_added_by] : []),
  ]))]
  let profiles: Array<{
    id: string
    yapin_user_id: string | null
    username: string | null
    display_name: string | null
    avatar_url: string | null
  }> = []

  if (profileIds.length > 0) {
    const { data, error: profilesError } = await supabase
      .from('yapin_users')
      .select('id, yapin_user_id, username, display_name, avatar_url')
      .in('id', profileIds)
    if (profilesError || !data) {
      return apiError('MODERATORS_LOAD_FAILED', 'The moderator profiles could not be loaded.', 503)
    }
    profiles = data
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const moderators = await Promise.all(moderatorRows.map(async (row) => {
    const account = profileById.get(row.user_id)
    const addedBy = row.moderator_added_by ? profileById.get(row.moderator_added_by) : undefined
    const [approved, rejected, recentActivity] = await Promise.all([
      supabase.from('moderation_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('actor_user_id', row.user_id)
        .eq('action', 'submission_approved'),
      supabase.from('moderation_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('actor_user_id', row.user_id)
        .eq('action', 'submission_rejected'),
      listModerationActivity(supabase, { limit: 5, actorUserId: row.user_id }),
    ])
    if (approved.error || rejected.error || !recentActivity) return null
    return {
      yapinUserId: account?.yapin_user_id ?? null,
      username: account?.username ?? 'Unknown YapIn user',
      displayName: account?.display_name ?? null,
      avatarUrl: account?.avatar_url ?? null,
      addedAt: row.moderator_added_at,
      addedBy: addedBy?.username ?? null,
      approved: approved.count ?? 0,
      rejected: rejected.count ?? 0,
      recentActivity: recentActivity ?? [],
    }
  }))
  if (moderators.some((moderator) => moderator === null)) {
    return apiError('MODERATOR_ACTIVITY_FAILED', 'Moderator activity could not be loaded.', 503)
  }

  return Response.json({ data: moderators }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  const authorization = await requireModerationApiAccess(request, 'owner', true)
  if (!authorization.identity) return authorization.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('INVALID_REQUEST', 'Send the moderator action as JSON.', 400)
  }
  if (!isRecord(body) || (body.action !== 'add' && body.action !== 'remove') || !isValidYapinUserId(body.yapinUserId)) {
    return apiError('INVALID_REQUEST', 'Provide a valid YapIn user ID and moderator action.', 400)
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'Moderator management is not configured.', 503)
  }

  const { error } = await supabase.rpc('manage_emoji_moderator', {
    p_actor_user_id: authorization.identity.user.id,
    p_target_yapin_user_id: body.yapinUserId,
    p_action: body.action,
  })

  if (error) {
    const mappedError = mapManagementError(error)
    if (mappedError) return mappedError
    console.error('[moderation] moderator update failed', error)
    return apiError('MODERATOR_UPDATE_FAILED', 'The moderator list could not be updated.', 503)
  }

  return apiSuccess({ action: body.action })
}
