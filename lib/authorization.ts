import 'server-only'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCurrentYapinUser, type YapmojiUser } from '@/lib/yapin-session'

export type AppRole = 'user' | 'moderator' | 'admin'

const roleRank: Record<AppRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
}

export async function getCurrentUserWithMinimumRole(
  minimumRole: Exclude<AppRole, 'user'>,
): Promise<YapmojiUser | null> {
  const user = await getCurrentYapinUser()
  if (!user) return null

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw new Error('Authorization could not be verified')

  const role: unknown = data?.role
  if (role !== 'user' && role !== 'moderator' && role !== 'admin') return null
  return roleRank[role] >= roleRank[minimumRole] ? user : null
}