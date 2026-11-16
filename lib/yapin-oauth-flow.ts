import {
  getYapinCallbackUrl,
  parseYapinProfile,
  parseYapinTokenResponse,
  yapinClientId,
  yapinProfileEndpoint,
  yapinTokenEndpoint,
  type YapInProfile,
  type YapInTokenResponse,
} from './yapin-oauth.ts'

type YapInOAuthFailure = {
  ok: false
  outcome: 'token_error' | 'profile_error'
}

type YapInOAuthSuccess = {
  ok: true
  token: YapInTokenResponse
  profile: YapInProfile
}

export type YapInOAuthResult = YapInOAuthFailure | YapInOAuthSuccess

type JsonFetchResult =
  | { ok: true; status: number; payload: unknown }
  | { ok: false; status: number | null; failure: 'http_error' | 'invalid_json' | 'network_error' | 'timeout' }

function logOAuthDiagnostic(details: Record<string, unknown>) {
  console.info('[yapin-auth]', details)
}

async function fetchJson(fetcher: typeof fetch, url: string, init: RequestInit): Promise<JsonFetchResult> {
  let response: Response
  try {
    response = await fetcher(url, init)
  } catch (error) {
    const failure =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
        ? 'timeout'
        : 'network_error'
    return { ok: false, status: null, failure }
  }

  if (!response.ok) return { ok: false, status: response.status, failure: 'http_error' }

  try {
    return { ok: true, status: response.status, payload: await response.json() as unknown }
  } catch {
    return { ok: false, status: response.status, failure: 'invalid_json' }
  }
}

function hasFields(value: unknown, fields: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return Object.fromEntries(fields.map((field) => [field, false]))
  }

  return Object.fromEntries(fields.map((field) => [field, field in value]))
}

export async function exchangeYapinAuthorizationCode(
  code: string,
  codeVerifier: string,
  clientSecret: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<YapInOAuthResult> {
  const tokenParameters = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getYapinCallbackUrl(),
    client_id: yapinClientId,
    code_verifier: codeVerifier,
  })
  if (clientSecret) tokenParameters.set('client_secret', clientSecret)

  const tokenResponse = await fetchJson(fetcher, yapinTokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenParameters,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })

  if (!tokenResponse.ok) {
    logOAuthDiagnostic({
      stage: 'token_exchange',
      success: false,
      status: tokenResponse.status,
      failure: tokenResponse.failure,
      expectedFields: { access_token: false, token_type: false, expires_in: false, scope: false },
    })
    return { ok: false, outcome: 'token_error' }
  }

  const token = parseYapinTokenResponse(tokenResponse.payload)
  if (!token) {
    logOAuthDiagnostic({
      stage: 'token_response_validation',
      success: false,
      status: tokenResponse.status,
      failure: 'invalid_response',
      expectedFields: hasFields(tokenResponse.payload, ['access_token', 'token_type', 'expires_in', 'scope']),
    })
    return { ok: false, outcome: 'token_error' }
  }

  logOAuthDiagnostic({
    stage: 'token_exchange',
    success: true,
    status: tokenResponse.status,
    expectedFields: hasFields(tokenResponse.payload, ['access_token', 'token_type', 'expires_in', 'scope']),
  })

  const profileResponse = await fetchJson(fetcher, yapinProfileEndpoint, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.access_token}` },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  })

  if (!profileResponse.ok) {
    logOAuthDiagnostic({
      stage: 'profile_request',
      success: false,
      status: profileResponse.status,
      failure: profileResponse.failure,
      expectedFields: { id: false, username: false, display_name: false, avatar_url: false },
    })
    return { ok: false, outcome: 'profile_error' }
  }

  const profileFields = hasFields(profileResponse.payload, ['id', 'username', 'display_name', 'avatar_url'])
  const profile = parseYapinProfile(profileResponse.payload)
  if (!profile) {
    logOAuthDiagnostic({
      stage: 'profile_response_validation',
      success: false,
      status: profileResponse.status,
      failure: 'invalid_response',
      expectedFields: profileFields,
    })
    return { ok: false, outcome: 'profile_error' }
  }

  logOAuthDiagnostic({
    stage: 'profile_validation',
    success: true,
    status: profileResponse.status,
    expectedFields: profileFields,
  })
  return { ok: true, token, profile }
}
