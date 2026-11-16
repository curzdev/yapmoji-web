import { apiError, apiSuccess } from '@/lib/api-response'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bucketName = 'emoji-submissions'
const imageUrlLifetimeSeconds = 5 * 60
const queryBatchSize = 500
const installationBatchSize = 1000
const emojiIdBatchSize = 100
const emojiFields = 'id, yapmoji_id, name, description, category, tags, storage_path, created_at'

type EmojiSubmission = {
  id: string
  yapmoji_id: string
  name: string
  description: string
  category: string
  tags: string[]
  storage_path: string
  created_at: string
}

export async function GET(request: Request) {
  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'Emoji browsing is not configured.', 503)
  }

  const searchParams = new URL(request.url).searchParams
  const query = searchParams.get('q')?.trim() ?? ''
  const category = searchParams.get('category')?.trim() ?? ''
  const tag = searchParams.get('tag')?.trim().toLowerCase() ?? ''
  const sort = searchParams.get('sort')?.trim() || 'newest'
  const requestedLimit = Number(searchParams.get('limit') ?? '24')
  const offset = Number(searchParams.get('offset') ?? '0')

  if (
    query.length > 80 ||
    category.length > 40 ||
    tag.length > 32 ||
    !['newest', 'oldest', 'trending'].includes(sort) ||
    !Number.isSafeInteger(requestedLimit) ||
    requestedLimit < 1 ||
    !Number.isSafeInteger(offset) ||
    offset < 0
  ) {
    return apiError('INVALID_QUERY', 'The emoji search or pagination options are invalid.', 400)
  }

  const limit = Math.min(requestedLimit, 48)
  let submissions: EmojiSubmission[]
  let count: number

  if (sort === 'trending') {
    submissions = []
    count = 0

    for (let batchOffset = 0; ; batchOffset += queryBatchSize) {
      let dataQuery = supabase
        .from('emoji_submissions')
        .select(emojiFields, { count: 'exact' })
        .eq('status', 'approved')
      if (query) dataQuery = dataQuery.ilike('name', `%${query}%`)
      if (category) dataQuery = dataQuery.eq('category', category)
      if (tag) dataQuery = dataQuery.contains('tags', [tag])
      const { data, count: resultCount, error } = await dataQuery
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(batchOffset, batchOffset + queryBatchSize - 1)

      if (error || !data) {
        return apiError('DATA_ACCESS_FAILED', 'Approved emojis could not be loaded.', 503)
      }

      count = resultCount ?? count
      submissions.push(...data)
      if (data.length < queryBatchSize) break
    }

    const installationCounts = new Map<string, number>()
    for (let idOffset = 0; idOffset < submissions.length; idOffset += emojiIdBatchSize) {
      const emojiIds = submissions
        .slice(idOffset, idOffset + emojiIdBatchSize)
        .map((submission) => submission.yapmoji_id)

      for (let installOffset = 0; ; installOffset += installationBatchSize) {
        const { data, error } = await supabase
          .from('emoji_installations')
          .select('emoji_id')
          .in('emoji_id', emojiIds)
          .order('emoji_id', { ascending: true })
          .order('server_id', { ascending: true })
          .range(installOffset, installOffset + installationBatchSize - 1)

        if (error || !data) {
          return apiError('STATISTICS_FAILED', 'Emoji installation statistics could not be loaded.', 503)
        }

        for (const installation of data) {
          installationCounts.set(
            installation.emoji_id,
            (installationCounts.get(installation.emoji_id) ?? 0) + 1,
          )
        }
        if (data.length < installationBatchSize) break
      }
    }

    submissions.sort((left, right) => {
      const installationDifference =
        (installationCounts.get(right.yapmoji_id) ?? 0) -
        (installationCounts.get(left.yapmoji_id) ?? 0)
      return (
        installationDifference ||
        right.created_at.localeCompare(left.created_at) ||
        left.id.localeCompare(right.id)
      )
    })
    submissions = submissions.slice(offset, offset + limit)
  } else {
    let dataQuery = supabase
      .from('emoji_submissions')
      .select(emojiFields, { count: 'exact' })
      .eq('status', 'approved')
    if (query) dataQuery = dataQuery.ilike('name', `%${query}%`)
    if (category) dataQuery = dataQuery.eq('category', category)
    if (tag) dataQuery = dataQuery.contains('tags', [tag])
    const { data, count: resultCount, error } = await dataQuery
      .order('created_at', { ascending: sort === 'oldest' })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error || !data) {
      return apiError('DATA_ACCESS_FAILED', 'Approved emojis could not be loaded.', 503)
    }
    submissions = data
    count = resultCount ?? 0
  }

  const emojis = await Promise.all(
    submissions.map(async (submission) => {
      const { data: signedImage, error: signedUrlError } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(submission.storage_path, imageUrlLifetimeSeconds)

      if (signedUrlError || !signedImage) return null

      return {
        id: submission.id,
        emojiId: submission.yapmoji_id,
        name: submission.name,
        description: submission.description,
        category: submission.category,
        tags: submission.tags,
        imageUrl: signedImage.signedUrl,
        createdAt: submission.created_at,
      }
    }),
  )

  if (emojis.some((emoji) => emoji === null)) {
    return apiError('STORAGE_FAILED', 'Approved emoji images could not be loaded.', 503)
  }

  return Response.json(
    { data: emojis, pagination: { count, limit, offset } },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
