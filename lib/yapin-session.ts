import 'server-only'

import { cookies } from 'next/headers'
import {
  readYapinSessionCookieValue,
  yapinSessionCookieName,
  yapinSessionCookiePath,
  type YapmojiUser,
} from './yapin-session-core'

export { createYapinSessionCookieValue, readYapinSessionCookieValue } from './yapin-session-core'
export { yapinSessionCookieName, yapinSessionCookiePath }
export type { YapmojiUser }

export async function getCurrentYapinUser() {
  const cookieStore = await cookies()
  return readYapinSessionCookieValue(cookieStore.get(yapinSessionCookieName)?.value)
}
