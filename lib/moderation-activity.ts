import 'server-only'

import type { createSupabaseAdminClient } from '@/lib/supabase/admin'

type AdminSupabase = ReturnType<typeof createSupabaseAdminClient>

type ModerationAuditRow = {
  id: number
  action: string
  actor_user_id: string
  target_user_id: string | null
  submission_id: string | null
  reason: string | null
  created_at: string
}

export type ModerationAuditActivityRow = ModerationAuditRow

type ProfileRow = {
  id: string
  yapin_user_id: string | null
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

export async function listModerationActivity(
  supabase: AdminSupabase,
  options: { limit: number; actorUserId?: string; actions?: string[] },
) {
  let query = supabase
    .from('moderation_audit_log')
    .select('id, action, actor_user_id, target_user_id, submission_id, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(options.limit)

  if (options.actorUserId) query = query.eq('actor_user_id', options.actorUserId)
  if (options.actions) query = query.in('action', options.actions)

  const { data: auditRows, error: auditError } = await query
  if (auditError || !auditRows) return null
  return formatModerationActivity(supabase, auditRows as ModerationAuditRow[])
}

export async function formatModerationActivity(
  supabase: AdminSupabase,
  auditRows: ModerationAuditRow[],
) {
  const profileIds = [...new Set(auditRows.flatMap((row) => [
    row.actor_user_id,
    ...(row.target_user_id ? [row.target_user_id] : []),
  ]))]
  const submissionIds = [...new Set(auditRows.flatMap((row) => row.submission_id ? [row.submission_id] : []))]
  let profiles: ProfileRow[] = []
  let submissions: Array<{ id: string; name: string; yapmoji_id: string; storage_path: string }> = []

  if (profileIds.length > 0) {
    const { data, error } = await supabase
      .from('yapin_users')
      .select('id, yapin_user_id, username, display_name, avatar_url')
      .in('id', profileIds)
    if (error || !data) return null
    profiles = data
  }

  if (submissionIds.length > 0) {
    const { data, error } = await supabase
      .from('emoji_submissions')
      .select('id, name, yapmoji_id, storage_path')
      .in('id', submissionIds)
    if (error || !data) return null
    submissions = data
  }

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const submissionById = new Map(submissions.map((submission) => [submission.id, submission]))

  return Promise.all(auditRows.map(async (row) => {
    const actor = profileById.get(row.actor_user_id)
    const target = row.target_user_id ? profileById.get(row.target_user_id) : undefined
    const submission = row.submission_id ? submissionById.get(row.submission_id) : undefined
    let previewUrl: string | null = null
    if (submission) {
      const { data: preview, error } = await supabase.storage
        .from('emoji-submissions')
        .createSignedUrl(submission.storage_path, 5 * 60)
      if (error || !preview) return null
      previewUrl = preview.signedUrl
    }

    return {
      id: row.id,
      action: row.action,
      createdAt: row.created_at,
      reason: row.reason,
      submissionId: row.submission_id,
      submissionName: submission?.name ?? null,
      emojiId: submission?.yapmoji_id ?? null,
      previewUrl,
      actor: {
        yapinUserId: actor?.yapin_user_id ?? null,
        username: actor?.username ?? 'Unknown YapIn user',
        displayName: actor?.display_name ?? null,
        avatarUrl: actor?.avatar_url ?? null,
      },
      target: target ? {
        yapinUserId: target.yapin_user_id,
        username: target.username ?? 'Unknown YapIn user',
        displayName: target.display_name,
        avatarUrl: target.avatar_url,
      } : null,
    }
  })).then((activity) => activity.some((item) => item === null) ? null : activity)
}
