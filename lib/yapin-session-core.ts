import { createHmac, timingSafeEqual } from 'node:crypto'

export const yapinSessionCookieName = 'yapmoji_session'
export const yapinSessionCookiePath = '/'

export type YapmojiUser = {
  id: string
  yapinUserId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
}

type SessionPayload = {
  user: YapmojiUser
  expiresAt: number
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getSessionSecret() {
  const secret = process.env.YAPIN_SESSION_SECRET
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('YAPIN_SESSION_SECRET must contain at least 32 bytes')
  }
  return secret
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function parseSessionPayload(value: unknown): SessionPayload | null {
  if (!value || typeof value !== 'object') return null
  const payload = value as Partial<SessionPayload>
  const user = payload.user
  if (
    !user ||
    typeof user !== 'object' ||
    !uuidPattern.test(user.id) ||
    typeof user.yapinUserId !== 'string' ||
    user.yapinUserId.length === 0 ||
    typeof user.username !== 'string' ||
    user.username.length === 0 ||
    !(user.displayName === null || typeof user.displayName === 'string') ||
    !(user.avatarUrl === null || typeof user.avatarUrl === 'string') ||
    typeof payload.expiresAt !== 'number' ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.expiresAt <= Date.now()
  ) {
    return null
  }

  return { user, expiresAt: payload.expiresAt }
}

export function createYapinSessionCookieValue(user: YapmojiUser, expiresAt: number) {
  const secret = getSessionSecret()
  const payload = Buffer.from(JSON.stringify({ user, expiresAt } satisfies SessionPayload)).toString('base64url')
  return `${payload}.${signPayload(payload, secret)}`
}

export function readYapinSessionCookieValue(value: string | undefined): YapmojiUser | null {
  if (!value || value.length > 4096) return null
  const [payload, signature, ...rest] = value.split('.')
  if (!payload || !signature || rest.length > 0) return null

  let secret: string
  try {
    secret = getSessionSecret()
  } catch {
    return null
  }

  const expected = Buffer.from(signPayload(payload, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return parseSessionPayload(parsed)?.user ?? null
  } catch {
    return null
  }
}
