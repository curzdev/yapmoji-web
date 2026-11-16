import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ModerationLogs } from '@/components/moderation-logs'
import { SiteHeader } from '@/components/site-header'
import { buttonVariants } from '@/components/ui/button'
import { loginUrl } from '@/lib/auth-redirect'
import { getCurrentModerationIdentity } from '@/lib/moderation-auth'
import { getCurrentYapinUser } from '@/lib/yapin-session'

export const dynamic = 'force-dynamic'

export default async function ModerationLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ moderator?: string }>
}) {
  const user = await getCurrentYapinUser()
  if (!user) redirect(loginUrl('/moderation/logs'))
  const identity = await getCurrentModerationIdentity(user)
  if (!identity) notFound()
  const { moderator } = await searchParams

  return (
    <main className="dark min-h-screen bg-[#101114] text-white">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-sm font-semibold text-[#FC6A39]">Read-only audit history</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Moderation Logs</h1>
            <p className="mt-2 text-sm text-white/55">
              {identity.role === 'owner'
                ? 'Review moderation decisions and moderator access changes.'
                : 'Review emoji approval and rejection activity. Owner access changes are not shown.'}
            </p>
          </div>
          <Link href={identity.role === 'owner' ? '/owner' : '/moderation'} className={buttonVariants({ variant: 'outline' })}>
            Back to dashboard
          </Link>
        </header>
        <ModerationLogs
          isOwner={identity.role === 'owner'}
          initialModerator={identity.role === 'owner' ? moderator?.slice(0, 80) ?? '' : ''}
        />
      </div>
    </main>
  )
}
