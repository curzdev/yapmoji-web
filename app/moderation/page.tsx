import { notFound, redirect } from 'next/navigation'
import { ModerationDashboard } from '@/components/moderation-dashboard'
import { SiteHeader } from '@/components/site-header'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { loginUrl } from '@/lib/auth-redirect'
import { getCurrentModerationIdentity } from '@/lib/moderation-auth'
import { getCurrentYapinUser } from '@/lib/yapin-session'

export const dynamic = 'force-dynamic'

export default async function ModerationPage() {
  const user = await getCurrentYapinUser()
  if (!user) redirect(loginUrl('/moderation'))
  const identity = await getCurrentModerationIdentity(user)
  if (!identity) notFound()

  return (
    <main className="dark min-h-screen bg-[#101114] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-sm font-semibold text-[#FC6A39]">Yapmoji review tools</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Moderation Dashboard</h1>
            <p className="mt-2 text-sm text-white/55">Review pending emoji submissions and track your moderation activity.</p>
          </div>
          <Link
            href="/moderation/logs"
            className={buttonVariants({ variant: 'outline' })}
          >
            Moderation logs
          </Link>
        </header>
        <ModerationDashboard />
      </div>
    </main>
  )
}
