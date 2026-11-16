import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { OwnerDashboard } from '@/components/owner-dashboard'
import { SiteHeader } from '@/components/site-header'
import { loginUrl } from '@/lib/auth-redirect'
import { isYapmojiOwner } from '@/lib/moderation-policy'
import { getCurrentYapinUser } from '@/lib/yapin-session'

export const dynamic = 'force-dynamic'

export default async function OwnerPage() {
  const user = await getCurrentYapinUser()
  if (!user) redirect(loginUrl('/owner'))
  if (!isYapmojiOwner(user.yapinUserId)) notFound()

  return (
    <main className="dark min-h-screen bg-[#101114] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-sm font-semibold text-[#FC6A39]">Yapmoji management</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Owner Dashboard</h1>
            <p className="mt-2 text-sm text-white/55">Manage moderators and monitor their moderation activity.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/moderation" className={buttonVariants({ variant: 'primary' })}>Review submissions</Link>
            <Link href="/moderation/logs" className={buttonVariants({ variant: 'outline' })}>All moderation logs</Link>
          </div>
        </header>
        <OwnerDashboard />
      </div>
    </main>
  )
}
