import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { YapmojiUser } from '@/lib/yapin-session'
import { canAccessModeratorDashboard, isYapmojiOwner } from '@/lib/moderation-policy'

export type ModerationIdentity = {
  user: YapmojiUser
  role: 'owner' | 'moderator'
}

export async function getCurrentModerationIdentity(
  user: YapmojiUser | null,
): Promise<ModerationIdentity | null> {
  if (!user) return null
  if (isYapmojiOwner(user.yapinUserId)) return { user, role: 'owner' }

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw new Error('Moderation access could not be verified')
  if (!canAccessModeratorDashboard(user.yapinUserId, data?.role)) return null

  return { user, role: 'moderator' }
}
