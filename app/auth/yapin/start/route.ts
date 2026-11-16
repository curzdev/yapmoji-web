import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { loginUrl, safeRedirectPath } from '@/lib/auth-redirect'
import {
  createYapinCodeChallenge,
  getYapinCallbackUrl,
  yapinAuthorizationEndpoint,
  yapinClientId,
  yapinReturnToCookieName,
  yapinStateCookieName,
  yapinStateCookiePath,
  yapinStateLifetimeSeconds,
  yapinVerifierCookieName,
} from '@/lib/yapin-oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isConfigured() {
  return Boolean(
    process.env.YAPIN_SESSION_SECRET &&
      Buffer.byteLength(process.env.YAPIN_SESSION_SECRET, 'utf8') >= 32 &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const returnTo = safeRedirectPath(requestUrl.searchParams.get('next'), '/')
  if (!isConfigured()) {
    const login = new URL(loginUrl(returnTo), request.url)
    login.searchParams.set('yapin', 'configuration_error')
    return NextResponse.redirect(login)
  }

  const state = randomBytes(32).toString('base64url')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createYapinCodeChallenge(verifier)
  let callbackUrl: string
  try {
    callbackUrl = getYapinCallbackUrl()
  } catch {
    const login = new URL(loginUrl(returnTo), request.url)
    login.searchParams.set('yapin', 'configuration_error')
    return NextResponse.redirect(login)
  }

  const authorizationUrl = new URL(yapinAuthorizationEndpoint)
  authorizationUrl.searchParams.set('client_id', yapinClientId)
  authorizationUrl.searchParams.set('redirect_uri', callbackUrl)
  authorizationUrl.searchParams.set('response_type', 'code')
  authorizationUrl.searchParams.set('scope', 'identify')
  authorizationUrl.searchParams.set('state', state)
  authorizationUrl.searchParams.set('code_challenge', challenge)
  authorizationUrl.searchParams.set('code_challenge_method', 'S256')

  const response = NextResponse.redirect(authorizationUrl)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: yapinStateCookiePath,
    maxAge: yapinStateLifetimeSeconds,
  }
  response.cookies.set(yapinStateCookieName, state, cookieOptions)
  response.cookies.set(yapinVerifierCookieName, verifier, cookieOptions)
  response.cookies.set(yapinReturnToCookieName, returnTo, cookieOptions)

  return response
}
