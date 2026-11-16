import { NextResponse, type NextRequest } from 'next/server'
import { loginUrl, safeRedirectPath } from '@/lib/auth-redirect'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  getYapinCallbackUrl,
  matchesYapinOAuthState,
  yapinReturnToCookieName,
  yapinStateCookieName,
  yapinStateCookiePath,
  yapinVerifierCookieName,
} from '@/lib/yapin-oauth'
import { exchangeYapinAuthorizationCode } from '@/lib/yapin-oauth-flow'
import { syncYapinUser } from '@/lib/yapin-user-sync'
import {
  createYapinSessionCookieValue,
  yapinSessionCookieName,
  yapinSessionCookiePath,
} from '@/lib/yapin-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CallbackOutcome =
  | 'denied'
  | 'state_error'
  | 'callback_error'
  | 'configuration_error'
  | 'token_error'
  | 'profile_error'
  | 'database_error'
  | 'role_error'
  | 'session_error'

function logCallback(stage: string, details: Record<string, unknown> = {}) {
  console.info('[yapin-auth]', { stage, ...details })
}

function safeErrorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : 'Unexpected server error'
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/yo_[A-Za-z0-9._~-]+/g, '[redacted-token]')
    .replace(/\b(client_secret|access_token|code_verifier|authorization_code|code)\s*[:=]\s*[^,\s]+/gi, '$1=[redacted]')
    .slice(0, 240)
}

function toDatabaseError(error: { code?: string; message?: string } | null) {
  return error
    ? {
        code: error.code ?? null,
        message: error.message ?? 'Supabase operation failed',
        status: 'status' in error && typeof error.status === 'number' ? error.status : null,
      }
    : null
}

function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: yapinStateCookiePath,
    maxAge: 0,
  }
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.set(yapinStateCookieName, '', oauthCookieOptions())
  response.cookies.set(yapinVerifierCookieName, '', oauthCookieOptions())
  response.cookies.set(yapinReturnToCookieName, '', oauthCookieOptions())
}

function callbackRedirect(request: NextRequest, outcome: CallbackOutcome, returnTo: string) {
  const destination = new URL(loginUrl(returnTo), request.url)
  destination.searchParams.set('yapin', outcome)
  const response = NextResponse.redirect(destination)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  clearOAuthCookies(response)
  return response
}

function sessionRedirect(
  request: NextRequest,
  sessionValue: string,
  expiresIn: number,
  returnTo: string,
) {
  const response = NextResponse.redirect(new URL(returnTo, request.url))
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  clearOAuthCookies(response)
  response.cookies.set(yapinSessionCookieName, sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: yapinSessionCookiePath,
    maxAge: expiresIn,
  })
  return response
}

function isConfigurationReady() {
  try {
    getYapinCallbackUrl()
    return Boolean(
      process.env.YAPIN_SESSION_SECRET &&
        Buffer.byteLength(process.env.YAPIN_SESSION_SECRET, 'utf8') >= 32 &&
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const returnTo = safeRedirectPath(request.cookies.get(yapinReturnToCookieName)?.value, '/')
  const returnedStates = searchParams.getAll('state')
  const cookieState = request.cookies.get(yapinStateCookieName)?.value
  const stateMatches =
    returnedStates.length === 1 && matchesYapinOAuthState(returnedStates[0], cookieState)

  logCallback('oauth_state_validation', {
    success: stateMatches,
    returnedStateCount: returnedStates.length,
    cookieStatePresent: Boolean(cookieState),
  })

  if (!stateMatches) return callbackRedirect(request, 'state_error', returnTo)

  const errors = searchParams.getAll('error')
  if (errors.length > 0) {
    const outcome = errors.length === 1 && errors[0] === 'access_denied' ? 'denied' : 'callback_error'
    logCallback('authorization_response', {
      success: false,
      outcome,
      providerErrorPresent: true,
      providerErrorCount: errors.length,
    })
    return callbackRedirect(request, outcome, returnTo)
  }

  const codes = searchParams.getAll('code')
  const verifier = request.cookies.get(yapinVerifierCookieName)?.value
  const validCodeAndVerifier =
    codes.length === 1 &&
    Boolean(codes[0]) &&
    Boolean(verifier) &&
    /^[A-Za-z0-9_-]{43}$/.test(verifier ?? '')
  logCallback('authorization_response_validation', {
    success: validCodeAndVerifier,
    authorizationCodeCount: codes.length,
    authorizationCodePresent: Boolean(codes[0]),
    verifierPresent: Boolean(verifier),
    verifierFormatValid: Boolean(verifier && /^[A-Za-z0-9_-]{43}$/.test(verifier)),
  })
  if (!validCodeAndVerifier || !verifier) {
    return callbackRedirect(request, 'callback_error', returnTo)
  }

  if (!isConfigurationReady()) {
    logCallback('server_configuration', {
      success: false,
      callbackConfigured: (() => {
        try {
          getYapinCallbackUrl()
          return true
        } catch {
          return false
        }
      })(),
      sessionSecretConfigured: Boolean(process.env.YAPIN_SESSION_SECRET),
      supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      serviceRoleKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    })
    return callbackRedirect(request, 'configuration_error', returnTo)
  }

  const oauthResult = await exchangeYapinAuthorizationCode(
    codes[0],
    verifier,
    process.env.YAPIN_CLIENT_SECRET || undefined,
  )
  if (!oauthResult.ok) return callbackRedirect(request, oauthResult.outcome, returnTo)
  const { token, profile } = oauthResult

  let supabase: ReturnType<typeof createSupabaseAdminClient>
  try {
    supabase = createSupabaseAdminClient()
    logCallback('supabase_client_creation', {
      success: true,
      supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      serviceRoleKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    })
  } catch (error) {
    console.error('[yapin-auth]', {
      stage: 'supabase_client_creation',
      success: false,
      message: safeErrorMessage(error),
      supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      serviceRoleKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    })
    return callbackRedirect(request, 'database_error', returnTo)
  }

  try {
    const { error, status } = await supabase.from('yapin_users').select('id').limit(0)
    if (error) {
      const schemaIssue = ['PGRST204', 'PGRST205', '42P01', '42703'].includes(error.code ?? '')
      console.error('[yapin-auth]', {
        stage: schemaIssue ? 'supabase_yapin_users_table_lookup' : 'supabase_connection',
        success: false,
        status,
        code: error.code ?? null,
        message: safeErrorMessage(error),
        expectedFields: { idColumnAvailable: false },
      })
      return callbackRedirect(request, 'database_error', returnTo)
    }

    logCallback('supabase_connection', { success: true, status })
    logCallback('supabase_yapin_users_table_lookup', {
      success: true,
      status,
      expectedFields: { idColumnAvailable: true },
    })
  } catch (error) {
    console.error('[yapin-auth]', {
      stage: 'supabase_connection',
      success: false,
      message: safeErrorMessage(error),
      expectedFields: { idColumnAvailable: false },
    })
    return callbackRedirect(request, 'database_error', returnTo)
  }

  const syncResult = await syncYapinUser(profile, {
    async upsertProfile(yapinProfile) {
      try {
        const { data, error } = await supabase
          .from('yapin_users')
          .upsert(
            {
              yapin_user_id: yapinProfile.id,
              username: yapinProfile.username,
              display_name: yapinProfile.display_name,
              avatar_url: yapinProfile.avatar_url,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'yapin_user_id' },
          )
          .select('id')
          .single()

        return {
          id: data && typeof data.id === 'string' ? data.id : null,
          error: toDatabaseError(error),
        }
      } catch {
        return {
          id: null,
          error: { code: 'NETWORK_ERROR', message: 'Supabase profile upsert request failed' },
        }
      }
    },
    async getRole(userId) {
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle()

        return {
          role: data && typeof data.role === 'string' ? data.role : null,
          error: toDatabaseError(error),
        }
      } catch {
        return {
          role: null,
          error: { code: 'NETWORK_ERROR', message: 'Supabase role lookup request failed' },
        }
      }
    },
    async assignDefaultRole(userId) {
      try {
        const { error } = await supabase
          .from('user_roles')
          .upsert(
            { user_id: userId, role: 'user' },
            { onConflict: 'user_id', ignoreDuplicates: true },
          )
        return { error: toDatabaseError(error) }
      } catch {
        return {
          error: { code: 'NETWORK_ERROR', message: 'Supabase default role assignment failed' },
        }
      }
    },
  })

  if (!syncResult.ok) {
    return callbackRedirect(
      request,
      syncResult.stage === 'profile_upsert' ? 'database_error' : 'role_error',
      returnTo,
    )
  }

  let sessionValue: string
  try {
    sessionValue = createYapinSessionCookieValue(
      {
        id: syncResult.userId,
        yapinUserId: profile.id,
        username: profile.username,
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
      },
      Date.now() + token.expires_in * 1000,
    )
    logCallback('session_creation', { success: true, expiresIn: token.expires_in })
  } catch (error) {
    console.error('[yapin-auth]', {
      stage: 'session_creation',
      success: false,
      message: safeErrorMessage(error),
      sessionSecretConfigured: Boolean(process.env.YAPIN_SESSION_SECRET),
    })
    return callbackRedirect(request, 'session_error', returnTo)
  }

  return sessionRedirect(request, sessionValue, token.expires_in, returnTo)
}
