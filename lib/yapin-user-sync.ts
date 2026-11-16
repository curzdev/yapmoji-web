import type { YapInProfile } from './yapin-oauth.ts'

type DatabaseError = {
  code: string | null
  message: string
  status?: number | null
}

type UpsertResult = {
  id: string | null
  error: DatabaseError | null
}

type RoleResult = {
  role: string | null
  error: DatabaseError | null
}

export type YapinUserSyncAdapter = {
  upsertProfile(profile: YapInProfile): Promise<UpsertResult>
  getRole(userId: string): Promise<RoleResult>
  assignDefaultRole(userId: string): Promise<{ error: DatabaseError | null }>
}

export type YapinUserSyncResult =
  | { ok: true; userId: string }
  | { ok: false; stage: 'profile_upsert' | 'role_lookup' | 'role_assignment' | 'role_verification' }

function safeDiagnosticMessage(message: string) {
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/yo_[A-Za-z0-9._~-]+/g, '[redacted-token]')
    .replace(/\b(client_secret|access_token|code_verifier|authorization_code|code)\s*[:=]\s*[^,\s]+/gi, '$1=[redacted]')
    .slice(0, 240)
}

function logDatabaseOperation(stage: string, error: DatabaseError | null, extra: Record<string, unknown> = {}) {
  const details = {
    stage,
    success: error === null,
    status: error?.status ?? null,
    code: error?.code ?? null,
    message: error ? safeDiagnosticMessage(error.message) : null,
    ...extra,
  }
  if (error) console.error('[yapin-auth]', details)
  else console.info('[yapin-auth]', details)
}

export async function syncYapinUser(
  profile: YapInProfile,
  adapter: YapinUserSyncAdapter,
): Promise<YapinUserSyncResult> {
  let upsert: UpsertResult
  try {
    upsert = await adapter.upsertProfile(profile)
  } catch {
    upsert = { id: null, error: { code: 'NETWORK_ERROR', message: 'Supabase upsert request failed' } }
  }

  logDatabaseOperation('supabase_yapin_users_upsert', upsert.error, {
    success: !upsert.error && typeof upsert.id === 'string' && upsert.id.length > 0,
    expectedFields: {
      yapinUserId: typeof profile.id === 'string' && profile.id.length > 0,
      username: typeof profile.username === 'string' && profile.username.length > 0,
      displayName: profile.display_name === null || typeof profile.display_name === 'string',
      avatarUrl: profile.avatar_url === null || typeof profile.avatar_url === 'string',
      internalUserId: typeof upsert.id === 'string' && upsert.id.length > 0,
    },
  })

  if (upsert.error || !upsert.id) {
    if (!upsert.error) {
      logDatabaseOperation('supabase_yapin_users_upsert_response', {
        code: 'MISSING_USER_ID',
        message: 'Supabase upsert returned no internal user ID',
      })
    }
    return { ok: false, stage: 'profile_upsert' }
  }

  let role = await adapter.getRole(upsert.id).catch(() => ({
    role: null,
    error: { code: 'NETWORK_ERROR', message: 'Supabase role lookup request failed' },
  }))
  logDatabaseOperation('supabase_default_role_lookup', role.error, {
    rolePresent: typeof role.role === 'string' && role.role.length > 0,
  })
  if (role.error) return { ok: false, stage: 'role_lookup' }

  if (!role.role) {
    const assignment = await adapter.assignDefaultRole(upsert.id).catch(() => ({
      error: { code: 'NETWORK_ERROR', message: 'Supabase default role assignment failed' },
    }))
    logDatabaseOperation('supabase_default_role_assignment', assignment.error, { role: 'user' })
    if (assignment.error) return { ok: false, stage: 'role_assignment' }

    role = await adapter.getRole(upsert.id).catch(() => ({
      role: null,
      error: { code: 'NETWORK_ERROR', message: 'Supabase role verification request failed' },
    }))
    logDatabaseOperation('supabase_default_role_verification', role.error, {
      rolePresent: typeof role.role === 'string' && role.role.length > 0,
    })
    if (role.error || !role.role) return { ok: false, stage: 'role_verification' }
  }

  return { ok: true, userId: upsert.id }
}
