import { NextResponse } from 'next/server'
import { hasSameOrigin } from '@/lib/request-origin'
import { yapinSessionCookieName, yapinSessionCookiePath } from '@/lib/yapin-session'

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return Response.json({ error: { code: 'INVALID_ORIGIN', message: 'Logout must come from this Yapmoji site.' } }, { status: 403 })
  }

  const response = NextResponse.json({ data: { loggedOut: true } })
  response.headers.set('Cache-Control', 'no-store')
  response.cookies.set(yapinSessionCookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: yapinSessionCookiePath,
    maxAge: 0,
  })
  return response
}
