import Link from 'next/link'
import Image from 'next/image'
import { MessageCircle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export type YapInOutcome =
  | 'denied'
  | 'state_error'
  | 'callback_error'
  | 'configuration_error'
  | 'token_error'
  | 'profile_error'
  | 'sync_error'
  | 'database_error'
  | 'role_error'
  | 'session_error'

type AuthFormProps = {
  returnTo: string
  yapinOutcome?: YapInOutcome
}

const outcomeMessages: Record<YapInOutcome, string> = {
  denied: 'YapIn authorization was denied. You can try again.',
  state_error: 'YapIn sign-in could not be verified. Start a new attempt.',
  callback_error: 'YapIn returned an incomplete or invalid authorization response. Try again.',
  configuration_error: 'YapIn sign-in is not configured for this deployment. Please try again later.',
  token_error: 'YapIn could not complete sign-in. Please try again.',
  profile_error: 'YapIn did not return a valid user profile. Please try again.',
  sync_error: 'Your YapIn profile could not be synchronized. Please try again.',
  database_error: 'YapIn verified your profile, but Yapmoji could not access account storage. Please try again later.',
  role_error: 'Your YapIn profile synced, but Yapmoji could not finish setting up account access. Please try again.',
  session_error: 'Your YapIn profile synced, but Yapmoji could not start a secure session. Please try again.',
}

export function AuthForm({ returnTo, yapinOutcome }: AuthFormProps) {
  const authorizeHref = `/auth/yapin/start?next=${encodeURIComponent(returnTo)}`

  return (
    <main className="dark mx-auto flex min-h-screen max-w-lg flex-col justify-center bg-[#101114] px-5 py-12 text-white">
      <Link href="/" className="mb-8 flex w-fit items-center gap-2 text-sm font-bold text-foreground">
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#101114]">
          <Image src="/yapmoji-logo.png" alt="" width={36} height={36} className="size-full object-contain" />
        </span>
        yapmoji
      </Link>
      <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="mb-2 text-sm font-semibold text-[#FC6A39]">Welcome to Yapmoji</p>
        <h1 className="text-2xl font-bold">Continue with YapIn</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Use your YapIn account to sign in and manage your emoji submissions.
        </p>

        {yapinOutcome && (
          <p
            className={`mt-5 rounded-lg border p-3 text-sm ${yapinOutcome === 'sync_error' ? 'border-red-500/30 bg-red-500/5 text-red-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-300'}`}
            role="alert"
          >
            {outcomeMessages[yapinOutcome]}
          </p>
        )}

        <Link
          href={authorizeHref}
          prefetch={false}
          className={buttonVariants({ variant: 'primary', className: 'mt-6 h-12 w-full gap-2 px-4' })}
        >
          <MessageCircle aria-hidden="true" />
          Continue with YapIn
        </Link>
      </section>
    </main>
  )
}
