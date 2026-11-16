import { apiError, apiSuccess } from '@/lib/api-response'
import { requireApiUser } from '@/lib/api-auth'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  const auth = await requireApiUser(request)
  if (!auth.user) return auth.response

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('emoji_favorites')
      .select('emoji_id')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) return apiError('DATA_ACCESS_FAILED', 'Favorites could not be loaded.', 503)
    return apiSuccess({ emojiIds: data.map((favorite) => favorite.emoji_id) })
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'Favorites are not configured.', 503)
  }
}

async function updateFavorite(request: Request, remove: boolean) {
  const auth = await requireApiUser(request, true)
  if (!auth.user) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiError('INVALID_REQUEST', 'Send a JSON body with an emojiId.', 400)
  }

  const emojiId = body && typeof body === 'object' && 'emojiId' in body ? body.emojiId : null
  if (typeof emojiId !== 'string' || !uuidPattern.test(emojiId)) {
    return apiError('INVALID_EMOJI_ID', 'A valid emoji ID is required.', 400)
  }

  try {
    const supabase = createSupabaseAdminClient()

    if (!remove) {
      const { data: emoji, error: emojiError } = await supabase
        .from('emoji_submissions')
        .select('id')
        .eq('id', emojiId)
        .eq('status', 'approved')
        .maybeSingle()

      if (emojiError) return apiError('DATA_ACCESS_FAILED', 'The emoji could not be checked.', 503)
      if (!emoji) return apiError('NOT_FOUND', 'Approved emoji not found.', 404)

      const { error } = await supabase
        .from('emoji_favorites')
        .upsert({ user_id: auth.user.id, emoji_id: emojiId }, { onConflict: 'user_id,emoji_id', ignoreDuplicates: true })

      if (error) return apiError('DATA_ACCESS_FAILED', 'The emoji could not be favorited.', 503)
      return apiSuccess({ emojiId, favorited: true })
    }

    const { error } = await supabase
      .from('emoji_favorites')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('emoji_id', emojiId)

    if (error) return apiError('DATA_ACCESS_FAILED', 'The favorite could not be removed.', 503)
    return apiSuccess({ emojiId, favorited: false })
  } catch {
    return apiError('SERVICE_UNAVAILABLE', 'Favorites are not configured.', 503)
  }
}

export function PUT(request: Request) {
  return updateFavorite(request, false)
}

export function DELETE(request: Request) {
  return updateFavorite(request, true)
}