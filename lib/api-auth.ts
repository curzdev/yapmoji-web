import { apiError } from '@/lib/api-response'
import { getCurrentYapinUser, type YapmojiUser } from '@/lib/yapin-session'

type ApiUserResult =
  | { user: YapmojiUser; response: null }
  | { user: null; response: Response }

export async function requireApiUser(request: Request, checkOrigin = false): Promise<ApiUserResult> {
  if (checkOrigin && request.headers.get('origin') !== new URL(request.url).origin) {
    return { user: null, response: apiError('INVALID_ORIGIN', 'Submit requests must come from this Yapmoji site.', 403) }
  }

  const user = await getCurrentYapinUser()
  if (!user) {
    return { user: null, response: apiError('UNAUTHENTICATED', 'Log in with YapIn to continue.', 401) }
  }

  return { user, response: null }
}
