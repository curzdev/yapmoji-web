import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import test from 'node:test'
import {
  createYapinCodeChallenge,
  getYapinCallbackUrl,
  matchesYapinOAuthState,
  parseYapinProfile,
  parseYapinTokenResponse,
  yapinClientId,
  yapinProfileEndpoint,
  yapinTokenEndpoint,
} from '../lib/yapin-oauth.ts'
import { safeRedirectPath } from '../lib/auth-redirect.ts'
import { exchangeYapinAuthorizationCode } from '../lib/yapin-oauth-flow.ts'
import {
  createYapinSessionCookieValue,
  readYapinSessionCookieValue,
} from '../lib/yapin-session-core.ts'
import { syncYapinUser } from '../lib/yapin-user-sync.ts'
import { hasSameOrigin } from '../lib/request-origin.ts'

const validToken = {
  access_token: 'yo_test-access-token',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'identify',
}

const validProfile = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  username: 'test-user',
  display_name: null,
  avatar_url: null,
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('state comparison accepts only an exact 43-character match', () => {
  const state = randomBytes(32).toString('base64url')
  assert.equal(matchesYapinOAuthState(state, state), true)
  assert.equal(matchesYapinOAuthState(state, randomBytes(32).toString('base64url')), false)
  assert.equal(matchesYapinOAuthState(state, undefined), false)
  assert.equal(matchesYapinOAuthState('bad-state', state), false)
})

test('logout origin validation supports proxied localhost and rejects foreign origins', () => {
  assert.equal(
    hasSameOrigin(new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3000', host: '127.0.0.1:3000' },
    })),
    true,
  )
  assert.equal(
    hasSameOrigin(new Request('http://internal/api/auth/logout', {
      method: 'POST',
      headers: {
        origin: 'https://yapmoji.netlify.app',
        host: 'yapmoji.netlify.app',
        'x-forwarded-proto': 'https',
      },
    })),
    true,
  )
  assert.equal(
    hasSameOrigin(new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://attacker.example', host: 'localhost:3000' },
    })),
    false,
  )
  assert.equal(
    hasSameOrigin(new Request('http://localhost:3000/api/auth/logout', { method: 'POST' })),
    false,
  )
})

test('PKCE challenge is the base64url S256 digest', () => {
  const verifier = randomBytes(32).toString('base64url')
  const expected = createHash('sha256').update(verifier).digest('base64url')
  assert.equal(createYapinCodeChallenge(verifier), expected)
})

test('callback URL defaults to localhost in development and production URL in production', () => {
  assert.equal(getYapinCallbackUrl(undefined, 'development'), 'http://localhost:3000/auth/yapin/callback')
  assert.equal(getYapinCallbackUrl(undefined, 'production'), 'https://yapmoji.netlify.app/auth/yapin/callback')
  assert.equal(getYapinCallbackUrl('http://localhost:3000/auth/yapin/callback', 'production'), 'http://localhost:3000/auth/yapin/callback')
  assert.throws(() => getYapinCallbackUrl('https://attacker.example/callback', 'development'))
})

test('OAuth defaults to the homepage while preserving explicit protected destinations', () => {
  assert.equal(safeRedirectPath(undefined), '/')
  assert.equal(safeRedirectPath('//attacker.example', '/'), '/')
  assert.equal(safeRedirectPath('/upload'), '/upload')
})

test('token response and profile validation require documented fields', () => {
  assert.deepEqual(parseYapinTokenResponse(validToken), validToken)
  assert.deepEqual(parseYapinTokenResponse({ access_token: validToken.access_token }), {
    access_token: validToken.access_token,
    token_type: 'Bearer',
    expires_in: 30 * 24 * 60 * 60,
    scope: 'identify',
  })
  assert.equal(parseYapinTokenResponse({ ...validToken, scope: 'profile' }), null)
  assert.equal(parseYapinTokenResponse({ ...validToken, expires_in: 0 }), null)
  assert.deepEqual(parseYapinProfile(validProfile), validProfile)
  assert.deepEqual(parseYapinProfile({ id: validProfile.id, username: validProfile.username }), {
    ...validProfile,
    display_name: null,
    avatar_url: null,
  })
  assert.equal(parseYapinProfile({ id: validProfile.id, username: validProfile.username, avatar_url: 42 }), null)
  assert.equal(parseYapinProfile({ ...validProfile, avatar_url: 'http://example.test/a.png' }), null)
  assert.equal(parseYapinProfile({ ...validProfile, id: '' }), null)
})

test('authorization exchange uses the documented server-side requests', async () => {
  const requests = []
  const fetcher = async (url, init) => {
    requests.push({ url, init })
    return requests.length === 1 ? jsonResponse(validToken) : jsonResponse(validProfile)
  }

  const result = await exchangeYapinAuthorizationCode('test-code', 'v'.repeat(43), 'server-secret', fetcher)
  assert.equal(result.ok, true)
  assert.equal(result.profile.id, validProfile.id)

  const [tokenRequest, profileRequest] = requests
  assert.equal(tokenRequest.url, yapinTokenEndpoint)
  assert.equal(tokenRequest.init.method, 'POST')
  assert.equal(tokenRequest.init.headers['Content-Type'], 'application/x-www-form-urlencoded')
  assert.equal(tokenRequest.init.redirect, 'error')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(tokenRequest.init.body)), {
    grant_type: 'authorization_code',
    code: 'test-code',
    redirect_uri: getYapinCallbackUrl(),
    client_id: yapinClientId,
    client_secret: 'server-secret',
    code_verifier: 'v'.repeat(43),
  })
  assert.equal(profileRequest.url, yapinProfileEndpoint)
  assert.equal(profileRequest.init.method, 'GET')
  assert.equal(profileRequest.init.headers.Authorization, `Bearer ${validToken.access_token}`)
  assert.equal(profileRequest.init.redirect, 'error')
})

test('public PKCE token exchange omits client_secret', async () => {
  let tokenBody
  const result = await exchangeYapinAuthorizationCode(
    'test-code',
    'v'.repeat(43),
    undefined,
    async (_url, init) => {
      if (!tokenBody) {
        tokenBody = new URLSearchParams(init.body)
        return jsonResponse({ access_token: validToken.access_token })
      }
      return jsonResponse({ id: validProfile.id, username: validProfile.username })
    },
  )

  assert.equal(result.ok, true)
  assert.equal(tokenBody.has('client_secret'), false)
  assert.equal(result.profile.display_name, null)
  assert.equal(result.profile.avatar_url, null)
})

test('YapIn identity upsert preserves an existing role and assigns a default only when missing', async () => {
  const profileWrites = []
  const defaultRoleWrites = []
  const logs = []
  const previousInfo = console.info
  const previousError = console.error
  console.info = (...args) => logs.push(args)
  console.error = (...args) => logs.push(args)
  try {
    const existingRoleResult = await syncYapinUser(validProfile, {
      async upsertProfile(profile) {
        profileWrites.push(profile)
        return { id: '550e8400-e29b-41d4-a716-446655440001', error: null }
      },
      async getRole() {
        return { role: 'moderator', error: null }
      },
      async assignDefaultRole(userId) {
        defaultRoleWrites.push(userId)
        return { error: null }
      },
    })
    assert.deepEqual(existingRoleResult, { ok: true, userId: '550e8400-e29b-41d4-a716-446655440001' })
    assert.deepEqual(defaultRoleWrites, [])

    let roleReadCount = 0
    const newRoleResult = await syncYapinUser(validProfile, {
      async upsertProfile() {
        return { id: '550e8400-e29b-41d4-a716-446655440002', error: null }
      },
      async getRole() {
        roleReadCount += 1
        return { role: roleReadCount === 1 ? null : 'user', error: null }
      },
      async assignDefaultRole(userId) {
        defaultRoleWrites.push(userId)
        return { error: null }
      },
    })
    assert.deepEqual(newRoleResult, { ok: true, userId: '550e8400-e29b-41d4-a716-446655440002' })
    assert.deepEqual(defaultRoleWrites, ['550e8400-e29b-41d4-a716-446655440002'])
    assert.equal(profileWrites[0].id, validProfile.id)
    assert.ok(logs.some(([prefix, entry]) => prefix === '[yapin-auth]' && entry.stage === 'supabase_yapin_users_upsert'))
  } finally {
    console.info = previousInfo
    console.error = previousError
  }
})

test('YapIn identity synchronization reports upsert and role failures by stage', async () => {
  const profileFailure = await syncYapinUser(validProfile, {
    async upsertProfile() {
      return { id: null, error: { code: 'PGRST205', message: 'table missing' } }
    },
    async getRole() {
      throw new Error('should not query role when upsert fails')
    },
    async assignDefaultRole() {
      throw new Error('should not assign role when upsert fails')
    },
  })
  assert.deepEqual(profileFailure, { ok: false, stage: 'profile_upsert' })

  const roleFailure = await syncYapinUser(validProfile, {
    async upsertProfile() {
      return { id: '550e8400-e29b-41d4-a716-446655440003', error: null }
    },
    async getRole() {
      return { role: null, error: { code: '42P01', message: 'roles missing' } }
    },
    async assignDefaultRole() {
      return { error: null }
    },
  })
  assert.deepEqual(roleFailure, { ok: false, stage: 'role_lookup' })
})

test('invalid codes and token endpoint failures do not proceed to profile lookup', async () => {
  for (const fetcher of [
    async () => jsonResponse({ error: 'invalid_grant' }, 400),
    async () => { throw new Error('network failure') },
  ]) {
    let requestCount = 0
    const result = await exchangeYapinAuthorizationCode(
      'invalid-code',
      'v'.repeat(43),
      'server-secret',
      async (...args) => {
        requestCount += 1
        return fetcher(...args)
      },
    )
    assert.deepEqual(result, { ok: false, outcome: 'token_error' })
    assert.equal(requestCount, 1)
  }
})

test('invalid token and profile JSON responses fail at their own stages', async () => {
  const invalidJson = () => new Response('not json', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

  const tokenFailure = await exchangeYapinAuthorizationCode(
    'private-auth-code',
    'v'.repeat(43),
    'private-client-secret',
    async () => invalidJson(),
  )
  assert.deepEqual(tokenFailure, { ok: false, outcome: 'token_error' })

  let requestCount = 0
  const profileFailure = await exchangeYapinAuthorizationCode(
    'private-auth-code',
    'v'.repeat(43),
    'private-client-secret',
    async () => {
      requestCount += 1
      return requestCount === 1 ? jsonResponse(validToken) : invalidJson()
    },
  )
  assert.deepEqual(profileFailure, { ok: false, outcome: 'profile_error' })
})

test('OAuth diagnostics do not include codes, client secrets, or access tokens', async () => {
  const logs = []
  const previousInfo = console.info
  const previousError = console.error
  console.info = (...args) => logs.push(args)
  console.error = (...args) => logs.push(args)
  try {
    await exchangeYapinAuthorizationCode(
      'private-auth-code',
      'v'.repeat(43),
      'private-client-secret',
      async (_url, init) => init.method === 'POST'
        ? jsonResponse(validToken)
        : jsonResponse(validProfile),
    )
    const serializedLogs = JSON.stringify(logs)
    assert.equal(serializedLogs.includes('private-auth-code'), false)
    assert.equal(serializedLogs.includes('private-client-secret'), false)
    assert.equal(serializedLogs.includes(validToken.access_token), false)
  } finally {
    console.info = previousInfo
    console.error = previousError
  }
})

test('profile failures never produce an authenticated result', async () => {
  for (const profileResponse of [
    jsonResponse({ error: 'invalid_token' }, 401),
    jsonResponse({ ...validProfile, avatar_url: 'http://example.test/avatar.png' }),
  ]) {
    let requestCount = 0
    const result = await exchangeYapinAuthorizationCode(
      'valid-code',
      'v'.repeat(43),
      'server-secret',
      async () => {
        requestCount += 1
        return requestCount === 1 ? jsonResponse(validToken) : profileResponse
      },
    )
    assert.deepEqual(result, { ok: false, outcome: 'profile_error' })
    assert.equal(requestCount, 2)
  }
})

test('mocked OAuth, database sync, and session complete as one authenticated flow', async () => {
  const previousSecret = process.env.YAPIN_SESSION_SECRET
  process.env.YAPIN_SESSION_SECRET = 'test-session-secret-with-at-least-32-bytes'
  try {
    const oauth = await exchangeYapinAuthorizationCode(
      'mocked-code',
      'v'.repeat(43),
      'mocked-client-secret',
      async (_url, init) => init.method === 'POST' ? jsonResponse(validToken) : jsonResponse({
        id: validProfile.id,
        username: validProfile.username,
      }),
    )
    assert.equal(oauth.ok, true)

    const synchronized = await syncYapinUser(oauth.profile, {
      async upsertProfile(profile) {
        assert.equal(profile.id, validProfile.id)
        assert.equal(profile.display_name, null)
        return { id: '550e8400-e29b-41d4-a716-446655440004', error: null }
      },
      async getRole() {
        return { role: 'user', error: null }
      },
      async assignDefaultRole() {
        throw new Error('existing role should be preserved')
      },
    })
    assert.equal(synchronized.ok, true)

    const user = {
      id: synchronized.userId,
      yapinUserId: oauth.profile.id,
      username: oauth.profile.username,
      displayName: oauth.profile.display_name,
      avatarUrl: oauth.profile.avatar_url,
    }
    const session = createYapinSessionCookieValue(user, Date.now() + oauth.token.expires_in * 1000)
    assert.deepEqual(readYapinSessionCookieValue(session), user)
  } finally {
    if (previousSecret === undefined) delete process.env.YAPIN_SESSION_SECRET
    else process.env.YAPIN_SESSION_SECRET = previousSecret
  }
})

test('signed sessions reject tampering and expired sessions', () => {
  const previousSecret = process.env.YAPIN_SESSION_SECRET
  process.env.YAPIN_SESSION_SECRET = 'test-session-secret-with-at-least-32-bytes'
  try {
    const user = {
      id: validProfile.id,
      yapinUserId: validProfile.id,
      username: validProfile.username,
      displayName: validProfile.display_name,
      avatarUrl: validProfile.avatar_url,
    }
    const validSession = createYapinSessionCookieValue(user, Date.now() + 60_000)
    assert.deepEqual(readYapinSessionCookieValue(validSession), user)

    const [payload, signature] = validSession.split('.')
    const tamperedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
    assert.equal(readYapinSessionCookieValue(`${payload}.${tamperedSignature}`), null)
    assert.equal(readYapinSessionCookieValue(createYapinSessionCookieValue(user, Date.now() - 1)), null)
  } finally {
    if (previousSecret === undefined) delete process.env.YAPIN_SESSION_SECRET
    else process.env.YAPIN_SESSION_SECRET = previousSecret
  }
})
