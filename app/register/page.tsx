import { redirect } from 'next/navigation'
import { loginUrl, safeRedirectPath } from '@/lib/auth-redirect'

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const params = await searchParams
  const next = Array.isArray(params.next) ? params.next[0] : params.next

  redirect(loginUrl(safeRedirectPath(next)))
}