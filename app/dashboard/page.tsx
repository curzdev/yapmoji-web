import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { loginUrl } from '@/lib/auth-redirect'
import { listCreatorSubmissions } from '@/lib/submissions'
import { getCurrentYapinUser } from '@/lib/yapin-session'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await getCurrentYapinUser()
  if (!user) redirect(loginUrl('/dashboard'))

  let submissions: Awaited<ReturnType<typeof listCreatorSubmissions>> = []
  let loadError = false
  try {
    submissions = await listCreatorSubmissions(user.id)
  } catch {
    loadError = true
  }

  const pendingCount = submissions.filter((submission) => submission.status === 'pending').length
  const approvedCount = submissions.filter((submission) => submission.status === 'approved').length
  const rejectedCount = submissions.filter((submission) => submission.status === 'rejected').length

  return (
    <main className="dark mx-auto min-h-screen max-w-5xl bg-[#101114] px-5 py-10 text-white lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border/70 pb-6">
        <div>
          <p className="mb-2 text-sm font-semibold text-[#FC6A39]">Creator dashboard</p>
          <h1 className="text-3xl font-bold tracking-tight">Your submissions</h1>
          <p className="mt-2 text-sm text-muted-foreground">{user.displayName || user.username}</p>
        </div>
        <Link href="/upload" className={buttonVariants({ variant: 'primary' })}>
          Submit an emoji <ArrowRight data-icon="inline-end" />
        </Link>
      </div>

      <section className="mt-7 grid grid-cols-3 gap-3" aria-label="Submission totals">
        {[
          ['Pending', pendingCount],
          ['Approved', approvedCount],
          ['Rejected', rejectedCount],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{count}</p>
          </div>
        ))}
      </section>

      {loadError ? (
        <p className="mt-8 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300" role="alert">
          Your submissions could not be loaded. Check Supabase configuration and try again.
        </p>
      ) : submissions.length === 0 ? (
        <section className="mt-8 border-t border-border/70 py-12 text-center">
          <h2 className="text-lg font-semibold">No submissions yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your review status will appear here after you submit an emoji.</p>
          <Link href="/upload" className={buttonVariants({ variant: 'primary', className: 'mt-5' })}>
            Upload an emoji
          </Link>
        </section>
      ) : (
        <section className="mt-8" aria-label="Your emoji submissions">
          <ul className="divide-y divide-border/70">
            {submissions.map((submission) => (
              <li key={submission.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <h2 className="font-semibold">{submission.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {submission.category} · Submitted {new Date(submission.created_at).toLocaleDateString()}
                  </p>
                  {submission.rejection_reason && (
                    <p className="mt-2 text-sm text-red-300">Reason: {submission.rejection_reason}</p>
                  )}
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs capitalize ${submission.status === 'approved' ? 'border-emerald-500/30 text-emerald-300' : submission.status === 'rejected' ? 'border-red-500/30 text-red-300' : 'border-amber-500/30 text-amber-300'}`}>
                  {submission.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}