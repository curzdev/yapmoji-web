import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { loginUrl } from '@/lib/auth-redirect'
import { getCurrentYapinUser } from '@/lib/yapin-session'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await getCurrentYapinUser()
  if (!user) redirect(loginUrl('/settings'))

  return (
    <main className="dark min-h-screen bg-[#101114] px-5 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/60 transition hover:text-white">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Yapmoji
        </Link>

        <header className="mt-8">
          <p className="text-sm font-semibold text-[#FC6A39]">Account</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Settings</h1>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Your account identity comes from YapIn and is synchronized when you authorize Yapmoji.
          </p>
        </header>

        <section className="mt-7 rounded-2xl border border-white/10 bg-[#191B20] p-5 sm:p-7" aria-labelledby="profile-heading">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white/10 text-lg font-semibold">
                  {(user.displayName || user.username).slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <h2 id="profile-heading" className="truncate text-lg font-semibold">{user.displayName || user.username}</h2>
                <p className="truncate text-sm text-white/55">@{user.username}</p>
              </div>
            </div>
            <Link
              href="/auth/yapin/start?next=%2Fsettings"
              prefetch={false}
              className={buttonVariants({ variant: 'primary', className: 'h-10 gap-2' })}
            >
              <RefreshCw aria-hidden="true" />
              Refresh from YapIn
            </Link>
          </div>

          <dl className="mt-6 grid gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-white/45">YapIn username</dt>
              <dd className="mt-1 break-all text-sm">{user.username}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-white/45">YapIn account ID</dt>
              <dd className="mt-1 break-all font-mono text-sm">{user.yapinUserId}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 flex gap-3 rounded-2xl border border-white/10 bg-[#191B20] p-5" aria-label="Profile synchronization details">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" aria-hidden="true" />
          <p className="text-sm leading-6 text-white/65">
            Username and avatar are managed by YapIn. Use “Refresh from YapIn” to authorize again and save the latest
            available profile details to your Yapmoji account.
          </p>
        </section>
      </div>
    </main>
  )
}
