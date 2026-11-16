import { apiError } from '@/lib/api-response'
import { isYapmojiId } from '@/lib/emoji-id'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bucketName = 'emoji-submissions'
const imageUrlLifetimeSeconds = 5 * 60

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ emojiId: string }> },
) {
  const { emojiId } = await params
  if (!isYapmojiId(emojiId)) {
    return apiError('EMOJI_NOT_FOUND', 'This approved emoji could not be found.', 404)
  }

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'Emoji details are not configured.', 503)
  }

  const { data: submission, error } = await supabase
    .from('emoji_submissions')
    .select('id, yapmoji_id, name, description, category, tags, storage_path, created_at')
    .eq('yapmoji_id', emojiId)
    .eq('status', 'approved')
    .maybeSingle()

  if (error) {
    return apiError('DATA_ACCESS_FAILED', 'Emoji details could not be loaded.', 503)
  }

  if (!submission) {
    return apiError('EMOJI_NOT_FOUND', 'This approved emoji could not be found.', 404)
  }

  const { data: signedImage, error: signedUrlError } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(submission.storage_path, imageUrlLifetimeSeconds)

  if (signedUrlError || !signedImage) {
    return apiError('STORAGE_FAILED', 'The approved emoji image could not be loaded.', 503)
  }

  return Response.json(
    {
      data: {
        id: submission.id,
        emojiId: submission.yapmoji_id,
        name: submission.name,
        description: submission.description,
        category: submission.category,
        tags: submission.tags,
        imageUrl: signedImage.signedUrl,
        createdAt: submission.created_at,
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
