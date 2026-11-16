import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export async function listCreatorSubmissions(creatorId: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('emoji_submissions')
    .select('id, name, category, status, created_at, moderated_at, rejection_reason')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error('Creator submissions could not be loaded')
  return data ?? []
}