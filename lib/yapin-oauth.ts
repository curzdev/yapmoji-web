import { createHash, timingSafeEqual } from 'node:crypto'

export const yapinAuthorizationEndpoint = 'https://www.yapin.gg/oauth/authorize'
export const yapinTokenEndpoint = 'https://www.yapin.gg/api/oauth/token'
export const yapinProfileEndpoint = 'https://www.yapin.gg/api/oauth/me'
export const yapinClientId = '515e6d9f-cb08-405d-b31c-9648ac7d5d38'
export const yapinProductionCallbackUrl = 'https://yapmoji.vercel.app/auth/yapin/callback'
export const yapinLocalCallbackUrl = 'http://localhost:3000/auth/yapin/callback'
export const yapinStateCookieName = 'yapmoji_yapin_oauth_state'
export const yapinVerifierCookieName = 'yapmoji_yapin_oauth_verifier'
export const yapinReturnToCookieName = 'yapmoji_yapin_return_to'
export const yapinStateCookiePath = '/auth/yapin/callback'
export const yapinStateLifetimeSeconds = 10 * 60
export const yapinMaxTokenLifetimeSeconds = 30 * 24 * 60 * 60

export function getYapinCallbackUrl(
  configuredUrl = process.env.YAPIN_REDIRECT_URI,
  nodeEnv = process.env.NODE_ENV,
) {
  const callbackUrl = configuredUrl?.trim() ||
    (nodeEnv === 'production' ? yapinProductionCallbackUrl : yapinLocalCallbackUrl)

  if (callbackUrl !== yapinLocalCallbackUrl && callbackUrl !== yapinProductionCallbackUrl) {
    throw new Error('YAPIN_REDIRECT_URI must match the registered local or production callback URL')
  }

  return callbackUrl
}

export type YapInTokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

export type YapInProfile = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isSecureAvatarUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function createYapinCodeChallenge(verifier: string) {
  return createHash('sha256').update(verifier).digest('base64url')
}

export function parseYapinTokenResponse(value: unknown): YapInTokenResponse | null {
  if (!isRecord(value)) return null
  const { access_token, token_type, expires_in, scope } = value
  const parsedTokenType = token_type === undefined ? 'Bearer' : token_type
  const parsedExpiresIn = expires_in === undefined ? yapinMaxTokenLifetimeSeconds : expires_in
  const parsedScope = scope === undefined ? 'identify' : scope
  if (
    typeof access_token !== 'string' ||
    access_token.length <= 3 ||
    !access_token.startsWith('yo_') ||
    /\s/.test(access_token) ||
    typeof parsedTokenType !== 'string' ||
    parsedTokenType.toLowerCase() !== 'bearer' ||
    typeof parsedExpiresIn !== 'number' ||
    !Number.isSafeInteger(parsedExpiresIn) ||
    parsedExpiresIn <= 0 ||
    parsedExpiresIn > yapinMaxTokenLifetimeSeconds ||
    typeof parsedScope !== 'string' ||
    !parsedScope.split(/\s+/).includes('identify')
  ) {
    return null
  }

  return {
    access_token,
    token_type: parsedTokenType,
    expires_in: parsedExpiresIn,
    scope: parsedScope,
  }
}

export function parseYapinProfile(value: unknown): YapInProfile | null {
  if (!isRecord(value)) return null
  const { id, username, display_name, avatar_url } = value
  const parsedDisplayName = display_name === undefined ? null : display_name
  const parsedAvatarUrl = avatar_url === undefined ? null : avatar_url
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof username !== 'string' ||
    username.length === 0 ||
    !(parsedDisplayName === null || typeof parsedDisplayName === 'string') ||
    !(parsedAvatarUrl === null || (typeof parsedAvatarUrl === 'string' && isSecureAvatarUrl(parsedAvatarUrl)))
  ) {
    return null
  }

  return { id, username, display_name: parsedDisplayName, avatar_url: parsedAvatarUrl }
}

export function matchesYapinOAuthState(returnedState: string | null, cookieState: string | undefined) {
  if (
    !returnedState ||
    !cookieState ||
    !/^[A-Za-z0-9_-]{43}$/.test(returnedState) ||
    !/^[A-Za-z0-9_-]{43}$/.test(cookieState)
  ) {
    return false
  }

  const returnedBytes = Buffer.from(returnedState)
  const cookieBytes = Buffer.from(cookieState)
  return returnedBytes.length === cookieBytes.length && timingSafeEqual(returnedBytes, cookieBytes)
}
