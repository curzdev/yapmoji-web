import { apiError } from '@/lib/api-response'
import { formatModerationActivity, type ModerationAuditActivityRow } from '@/lib/moderation-activity'
import { requireModerationApiAccess } from '@/lib/moderation-api-auth'
import {
  isModerationLogAction,
  parseDateBoundary,
  quotePostgrestValue,
} from '@/lib/moderation-filters'
import { getModerationLogPolicy } from '@/lib/moderation-policy'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const pageSize = 25

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function GET(request: Request) {
  const authorization = await requireModerationApiAccess(request, 'moderator')
  if (!authorization.identity) return authorization.response

  const params = new URL(request.url).searchParams
  const search = params.get('q')?.trim() ?? ''
  const moderatorSearch = params.get('moderator')?.trim() ?? ''
  const actionValue = params.get('action') ?? ''
  const from = parseDateBoundary(params.get('from'))
  const to = parseDateBoundary(params.get('to'), true)
  const sort = params.get('sort') ?? 'newest'
  const offset = Number(params.get('offset') ?? '0')
  const isOwner = authorization.identity.role === 'owner'
  const logPolicy = getModerationLogPolicy(
    authorization.identity.role,
    authorization.identity.user.id,
  )

  if (
    search.length > 80 ||
    moderatorSearch.length > 80 ||
    (actionValue && !isModerationLogAction(actionValue)) ||
    from === false || to === false ||
    (from && to && from >= to) ||
    (sort !== 'newest' && sort !== 'oldest') ||
    !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000
  ) {
    return apiError('INVALID_QUERY', 'The moderation log filters are invalid.', 400)
  }

  if (actionValue && !logPolicy.actions.includes(actionValue)) {
    return apiError('FORBIDDEN', 'You cannot view moderator management logs.', 403)
  }
  if (!isOwner && moderatorSearch) {
    return apiError('FORBIDDEN', 'Moderators can only view their own moderation history.', 403)
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'Moderation logs are not configured.', 503)
  }

  let moderatorIds: string[] | null = null
  if (moderatorSearch) {
    let moderatorQuery = supabase
      .from('yapin_users')
      .select('id')
      .or(`username.ilike.${quotePostgrestValue(`%${moderatorSearch}%`)},yapin_user_id.ilike.${quotePostgrestValue(`%${moderatorSearch}%`)}`)

    if (isUuid(moderatorSearch)) {
      moderatorQuery = supabase
        .from('yapin_users')
        .select('id')
        .or(`id.eq.${moderatorSearch},yapin_user_id.eq.${moderatorSearch}`)
    }

    const { data, error } = await moderatorQuery
    if (error || !data) return apiError('LOG_SEARCH_FAILED', 'Moderators could not be searched.', 503)
    moderatorIds = data.map((profile) => profile.id)
    if (moderatorIds.length === 0) {
      return Response.json({ data: [], pagination: { count: 0, limit: pageSize, offset } }, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
  }

  let searchableProfileIds: string[] = []
  let searchableSubmissionIds: string[] = []
  if (search) {
    const [{ data: profiles, error: profileError }, { data: submissions, error: submissionError }] = await Promise.all([
      supabase
        .from('yapin_users')
        .select('id')
        .or(`username.ilike.${quotePostgrestValue(`%${search}%`)},yapin_user_id.ilike.${quotePostgrestValue(`%${search}%`)}`),
      supabase
        .from('emoji_submissions')
        .select('id')
        .ilike('name', `%${search}%`),
    ])

    if (profileError || submissionError || !profiles || !submissions) {
      return apiError('LOG_SEARCH_FAILED', 'Moderation logs could not be searched.', 503)
    }
    searchableProfileIds = profiles.map((profile) => profile.id)
    searchableSubmissionIds = submissions.map((submission) => submission.id)

    if (searchableProfileIds.length === 0 && searchableSubmissionIds.length === 0) {
      return Response.json({ data: [], pagination: { count: 0, limit: pageSize, offset } }, {
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
  }

  let query = supabase
    .from('moderation_audit_log')
    .select('id, action, actor_user_id, target_user_id, submission_id, reason, created_at', { count: 'exact' })
    .in('action', logPolicy.actions)
  if (logPolicy.actorUserId) query = query.eq('actor_user_id', logPolicy.actorUserId)
  if (actionValue) query = query.eq('action', actionValue)
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lt('created_at', to)
  if (moderatorIds) {
    query = query.in('actor_user_id', moderatorIds)
  }
  if (search) {
    const clauses: string[] = []
    if (searchableProfileIds.length > 0) {
      const profileClause = `actor_user_id.in.(${searchableProfileIds.join(',')})`
      clauses.push(profileClause)
      if (isOwner) clauses.push(`target_user_id.in.(${searchableProfileIds.join(',')})`)
    }
    if (searchableSubmissionIds.length > 0) {
      clauses.push(`submission_id.in.(${searchableSubmissionIds.join(',')})`)
    }
    query = query.or(clauses.join(','))
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: sort === 'oldest' })
    .order('id', { ascending: sort === 'oldest' })
    .range(offset, offset + pageSize - 1)

  if (error || !data) return apiError('LOG_LOAD_FAILED', 'Moderation logs could not be loaded.', 503)

  const activity = await formatModerationActivity(supabase, data as ModerationAuditActivityRow[])
  if (!activity) return apiError('LOG_LOAD_FAILED', 'Moderation log details could not be loaded.', 503)

  return Response.json(
    { data: activity, pagination: { count: count ?? 0, limit: pageSize, offset } },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
