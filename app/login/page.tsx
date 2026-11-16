import { AuthForm } from '@/components/auth-form'
import { safeRedirectPath } from '@/lib/auth-redirect'

const yapinOutcomes = [
  'denied',
  'state_error',
  'callback_error',
  'configuration_error',
  'token_error',
  'profile_error',
  'sync_error',
  'database_error',
  'role_error',
  'session_error',
] as const

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; yapin?: string | string[] }>
}) {
  const params = await searchParams
  const next = Array.isArray(params.next) ? params.next[0] : params.next
  const yapin = Array.isArray(params.yapin) ? params.yapin[0] : params.yapin
  const yapinOutcome = yapinOutcomes.find((outcome) => outcome === yapin)

  return (
    <AuthForm
      returnTo={safeRedirectPath(next)}
      yapinOutcome={yapinOutcome}
    />
  )
}