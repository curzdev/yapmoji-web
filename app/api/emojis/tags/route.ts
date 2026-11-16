import { apiError, apiSuccess } from '@/lib/api-response'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const pageSize = 500

export async function GET() {
  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'Emoji tags are not configured.', 503)
  }

  const tags = new Set<string>()
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('emoji_submissions')
      .select('tags')
      .eq('status', 'approved')
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error || !data) {
      return apiError('DATA_ACCESS_FAILED', 'Available emoji tags could not be loaded.', 503)
    }

    for (const submission of data) {
      for (const tag of submission.tags ?? []) {
        const normalizedTag = tag.trim().toLowerCase()
        if (normalizedTag) tags.add(normalizedTag)
      }
    }

    if (data.length < pageSize) break
  }

  return apiSuccess({ tags: [...tags].sort() })
}
