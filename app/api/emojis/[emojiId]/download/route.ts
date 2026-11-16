import { apiError } from '@/lib/api-response'
import { isYapmojiId } from '@/lib/emoji-id'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bucketName = 'emoji-submissions'
const extensionByMimeType: Record<string, string> = {
  'image/gif': 'gif',
  'image/png': 'png',
  'image/webp': 'webp',
}

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
    return apiError('SERVICE_UNAVAILABLE', 'Emoji downloads are not configured.', 503)
  }

  const { data: emoji, error: emojiError } = await supabase
    .from('emoji_submissions')
    .select('name, mime_type, storage_path')
    .eq('yapmoji_id', emojiId)
    .eq('status', 'approved')
    .maybeSingle()

  if (emojiError) {
    return apiError('DATA_ACCESS_FAILED', 'The approved emoji could not be loaded.', 503)
  }
  if (!emoji) {
    return apiError('EMOJI_NOT_FOUND', 'This approved emoji could not be found.', 404)
  }

  const extension = extensionByMimeType[emoji.mime_type]
  if (!extension) {
    return apiError('INVALID_FILE_TYPE', 'The approved emoji has an unsupported file type.', 503)
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(bucketName)
    .download(emoji.storage_path)

  if (downloadError || !file) {
    return apiError('STORAGE_FAILED', 'The approved emoji file could not be downloaded.', 503)
  }

  const safeName = emoji.name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'emoji'

  return new Response(file.stream(), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${safeName}.${extension}"`,
      'Content-Length': String(file.size),
      'Content-Type': emoji.mime_type,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
