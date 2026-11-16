import { apiError, apiSuccess } from '@/lib/api-response'
import { requireModerationApiAccess } from '@/lib/moderation-api-auth'
import { parseDateBoundary, quotePostgrestValue } from '@/lib/moderation-filters'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bucketName = 'emoji-submissions'
const pageSize = 20
const previewLifetimeSeconds = 5 * 60

export async function GET(request: Request) {
  const authorization = await requireModerationApiAccess(request, 'moderator')
  if (!authorization.identity) return authorization.response

  const searchParams = new URL(request.url).searchParams
  const offset = Number(searchParams.get('offset') ?? '0')
  const search = searchParams.get('q')?.trim() ?? ''
  const sort = searchParams.get('sort') ?? 'newest'
  const from = parseDateBoundary(searchParams.get('from'))
  const to = parseDateBoundary(searchParams.get('to'), true)
  if (
    !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000 ||
    search.length > 80 ||
    (sort !== 'newest' && sort !== 'oldest') ||
    from === false || to === false ||
    (from && to && from >= to)
  ) {
    return apiError('INVALID_QUERY', 'The submission queue page is invalid.', 400)
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'The moderation service is not configured.', 503)
  }

  const { data: matchingCreators, error: matchingCreatorsError } = search
    ? await supabase
        .from('yapin_users')
        .select('id')
        .or(`username.ilike.${quotePostgrestValue(`%${search}%`)},yapin_user_id.ilike.${quotePostgrestValue(`%${search}%`)}`)
    : { data: [], error: null }

  if (matchingCreatorsError || !matchingCreators) {
    return apiError('SUBMITTER_SEARCH_FAILED', 'Submitters could not be searched.', 503)
  }

  let queueQuery = supabase
    .from('emoji_submissions')
    .select(
      'id, yapmoji_id, name, description, category, tags, creator_id, created_at, mime_type, file_size, storage_path',
      { count: 'exact' },
    )
    .eq('status', 'pending')
  if (search) {
    const creatorIds = matchingCreators.map((creator) => creator.id)
    queueQuery = creatorIds.length
      ? queueQuery.or(`name.ilike.${quotePostgrestValue(`%${search}%`)},creator_id.in.(${creatorIds.join(',')})`)
      : queueQuery.ilike('name', `%${search}%`)
  }
  if (from) queueQuery = queueQuery.gte('created_at', from)
  if (to) queueQuery = queueQuery.lt('created_at', to)

  const { data: submissions, count, error } = await queueQuery
    .order('created_at', { ascending: sort === 'oldest' })
    .order('id', { ascending: true })
    .range(offset, offset + pageSize - 1)

  if (error || !submissions) {
    return apiError('QUEUE_LOAD_FAILED', 'Pending submissions could not be loaded.', 503)
  }

  const creatorIds = [...new Set(submissions.flatMap((submission) => submission.creator_id ? [submission.creator_id] : []))]
  let creators: Array<{
    id: string
    yapin_user_id: string | null
    username: string | null
    display_name: string | null
    avatar_url: string | null
  }> = []

  if (creatorIds.length > 0) {
    const { data, error: creatorError } = await supabase
      .from('yapin_users')
      .select('id, yapin_user_id, username, display_name, avatar_url')
      .in('id', creatorIds)

    if (creatorError || !data) {
      return apiError('SUBMITTER_LOAD_FAILED', 'Submission authors could not be loaded.', 503)
    }
    creators = data
  }

  const creatorById = new Map(creators.map((creator) => [creator.id, creator]))
  const queueItems = await Promise.all(submissions.map(async (submission) => {
    const { data: preview, error: previewError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(submission.storage_path, previewLifetimeSeconds)

    if (previewError || !preview) return null

    const creator = submission.creator_id ? creatorById.get(submission.creator_id) : undefined
    return {
      id: submission.id,
      emojiId: submission.yapmoji_id,
      name: submission.name,
      description: submission.description,
      category: submission.category,
      tags: submission.tags,
      createdAt: submission.created_at,
      mimeType: submission.mime_type,
      fileSize: submission.file_size,
      previewUrl: preview.signedUrl,
      submitter: creator ? {
        yapinUserId: creator.yapin_user_id,
        username: creator.username,
        displayName: creator.display_name,
        avatarUrl: creator.avatar_url,
      } : null,
    }
  }))

  if (queueItems.some((item) => item === null)) {
    return apiError('PREVIEW_LOAD_FAILED', 'Submission previews could not be loaded.', 503)
  }

  return Response.json(
    {
      data: queueItems,
      pagination: { count: count ?? 0, limit: pageSize, offset },
      filters: { q: search, from: searchParams.get('from') ?? '', to: searchParams.get('to') ?? '', sort },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
