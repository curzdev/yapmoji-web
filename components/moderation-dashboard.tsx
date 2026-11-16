'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ModerationActivityList, isModerationActivityItem, type ModerationActivityItem } from '@/components/moderation-activity-list'
import { ModerationQueue } from '@/components/moderation-queue'

type DashboardActivity = {
  stats: {
    pending: number
    approved: number
    rejected: number
    today: number
    total: number
    mostRecentAt: string | null
  }
  recentActivity: ModerationActivityItem[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isActivityResponse(value: unknown): value is { data: DashboardActivity } {
  if (!isRecord(value) || !isRecord(value.data)) return false
  const data = value.data
  if (!isRecord(data.stats) || !('recentActivity' in data)) {
    return false
  }
  const stats = data.stats
  return ['pending', 'approved', 'rejected', 'today', 'total']
      .every((key) => typeof stats[key] === 'number') &&
    (stats.mostRecentAt === null || typeof stats.mostRecentAt === 'string') &&
    Array.isArray(data.recentActivity) &&
    data.recentActivity.every(isModerationActivityItem)
}

async function activityError(response: Response) {
  try {
    const payload: unknown = await response.json()
    if (
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      payload.error &&
      typeof payload.error === 'object' &&
      'message' in payload.error &&
      typeof payload.error.message === 'string'
    ) {
      return payload.error.message
    }
  } catch {
    return 'Your moderation activity could not be loaded.'
  }
  return 'Your moderation activity could not be loaded.'
}

export function ModerationDashboard() {
  const [dashboard, setDashboard] = useState<DashboardActivity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setInterval(() => setReloadCount((current) => current + 1), 30_000)
    function refreshAfterDecision() {
      setReloadCount((current) => current + 1)
    }
    window.addEventListener('moderation:updated', refreshAfterDecision)
    setRefreshing(true)
    fetch('/api/moderation/activity', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setError(await activityError(response))
          return
        }
        const payload: unknown = await response.json()
        if (!isActivityResponse(payload)) {
          setError('Your moderation activity returned an invalid response.')
          return
        }
        setDashboard(payload.data)
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError('Your moderation activity could not be loaded. Check your connection and try again.')
        }
      })
      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })

    return () => {
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener('moderation:updated', refreshAfterDecision)
    }
  }, [reloadCount])

  return (
    <div className="space-y-10">
      <section aria-labelledby="moderation-overview-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#FC6A39]">Live moderation overview</p>
              <h2 id="moderation-overview-heading" className="mt-1 text-xl font-semibold text-white">Submission statistics</h2>
            </div>
            <Button type="button" variant="outline" onClick={() => setReloadCount((current) => current + 1)} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh statistics'}
            </Button>
          </div>
          {dashboard ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: 'Pending', value: dashboard.stats.pending, tone: 'text-amber-200' },
              { label: 'Your approvals', value: dashboard.stats.approved, tone: 'text-emerald-300' },
              { label: 'Your rejections', value: dashboard.stats.rejected, tone: 'text-red-300' },
              { label: 'Your actions today', value: dashboard.stats.today, tone: 'text-white' },
              { label: 'Your total reviews', value: dashboard.stats.total, tone: 'text-white' },
            ].map((stat) => (
              <article key={stat.label} className="rounded-2xl border border-white/10 bg-[#15171b] p-4">
                <p className="text-xs text-white/55">{stat.label}</p>
                <p className={`mt-2 text-2xl font-semibold ${stat.tone}`}>{stat.value.toLocaleString()}</p>
              </article>
            ))}
          </div> : (
            <div role="status" aria-label="Loading moderation statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} aria-hidden="true" className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
              ))}
              <span className="sr-only">Loading moderation statistics…</span>
            </div>
          )}
      </section>
      <ModerationQueue />
      <section aria-labelledby="moderator-activity-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="moderator-activity-heading" className="text-xl font-semibold text-white">My Activity</h2>
            {dashboard?.stats.mostRecentAt && (
              <p className="mt-1 text-xs text-white/45">
                Most recent action {new Date(dashboard.stats.mostRecentAt).toLocaleString()}
              </p>
            )}
          </div>
          <Link href="/moderation/logs" className="text-sm text-[#FC6A39] hover:underline">View moderation logs</Link>
        </div>
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">{error}</p>
        ) : loading ? (
          <div role="status" aria-label="Loading your moderation activity" className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div key={item} aria-hidden="true" className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="size-10 animate-pulse rounded-full bg-white/10" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
                </div>
              </div>
            ))}
            <span className="sr-only">Loading your activity…</span>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-white/60">
              <span><span className="text-emerald-300">{dashboard?.stats.approved ?? 0}</span> approved</span>
              <span><span className="text-red-300">{dashboard?.stats.rejected ?? 0}</span> rejected</span>
              <span><span className="text-white">{dashboard?.stats.today ?? 0}</span> actions today</span>
            </div>
            <ModerationActivityList items={dashboard?.recentActivity ?? []} emptyMessage="You have not reviewed any submissions yet." />
          </>
        )}
      </section>
    </div>
  )
}
