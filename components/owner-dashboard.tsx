'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, UserPlus, UserRoundX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  isModerationActivityItem,
  ModerationActivityList,
  type ModerationActivityItem,
} from '@/components/moderation-activity-list'
import { ModerationConfirmationDialog } from '@/components/moderation-confirmation-dialog'
import { isValidYapinUserId } from '@/lib/moderation-policy'

type Overview = {
  moderators: number
  recentActivity: ModerationActivityItem[]
}

type Moderator = {
  yapinUserId: string | null
  username: string
  displayName: string | null
  avatarUrl: string | null
  addedAt: string | null
  addedBy: string | null
  approved: number
  rejected: number
  recentActivity: ModerationActivityItem[]
}

type ProfileCandidate = {
  yapinUserId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  role: string
}

type ModeratorChange =
  | { action: 'add'; account: ProfileCandidate }
  | { action: 'remove'; account: Moderator }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isOverview(value: unknown): value is Overview {
  return isRecord(value) &&
    typeof value.moderators === 'number' &&
    Array.isArray(value.recentActivity) &&
    value.recentActivity.every(isModerationActivityItem)
}

function isModerator(value: unknown): value is Moderator {
  return isRecord(value) &&
    (typeof value.yapinUserId === 'string' || value.yapinUserId === null) &&
    typeof value.username === 'string' &&
    (typeof value.displayName === 'string' || value.displayName === null) &&
    (typeof value.avatarUrl === 'string' || value.avatarUrl === null) &&
    (typeof value.addedAt === 'string' || value.addedAt === null) &&
    (typeof value.addedBy === 'string' || value.addedBy === null) &&
    typeof value.approved === 'number' &&
    typeof value.rejected === 'number' &&
    Array.isArray(value.recentActivity) &&
    value.recentActivity.every(isModerationActivityItem)
}

function isProfileCandidate(value: unknown): value is ProfileCandidate {
  return isRecord(value) &&
    typeof value.yapinUserId === 'string' &&
    typeof value.username === 'string' &&
    (typeof value.displayName === 'string' || value.displayName === null) &&
    (typeof value.avatarUrl === 'string' || value.avatarUrl === null) &&
    typeof value.role === 'string'
}

async function errorMessage(response: Response, fallback: string) {
  try {
    const payload: unknown = await response.json()
    if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string') {
      return payload.error.message
    }
  } catch {
    return fallback
  }
  return fallback
}

function profileInitial(username: string) {
  return username.slice(0, 1).toUpperCase() || '?'
}

export function OwnerDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [moderators, setModerators] = useState<Moderator[]>([])
  const [overviewError, setOverviewError] = useState('')
  const [moderatorsError, setModeratorsError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [yapinUserId, setYapinUserId] = useState('')
  const [candidate, setCandidate] = useState<ProfileCandidate | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [managerError, setManagerError] = useState('')
  const [pendingChange, setPendingChange] = useState<ModeratorChange | null>(null)
  const [savingChange, setSavingChange] = useState(false)

  async function loadOverview() {
    setOverviewError('')
    try {
      const response = await fetch('/api/owner/overview', { cache: 'no-store' })
      if (!response.ok) {
        setOverviewError(await errorMessage(response, 'Dashboard information could not be loaded.'))
        return
      }
      const payload: unknown = await response.json()
      if (!isRecord(payload) || !isOverview(payload.data)) {
        setOverviewError('The dashboard returned an invalid response.')
        return
      }
      setOverview(payload.data)
    } catch {
      setOverviewError('Dashboard information could not be loaded. Check your connection and try again.')
    }
  }

  async function loadModerators() {
    setModeratorsError('')
    try {
      const response = await fetch('/api/owner/moderators', { cache: 'no-store' })
      if (!response.ok) {
        setModeratorsError(await errorMessage(response, 'The moderator list could not be loaded.'))
        return
      }
      const payload: unknown = await response.json()
      if (!isRecord(payload) || !Array.isArray(payload.data) || !payload.data.every(isModerator)) {
        setModeratorsError('The moderator list returned an invalid response.')
        return
      }
      setModerators(payload.data)
    } catch {
      setModeratorsError('The moderator list could not be loaded. Check your connection and try again.')
    }
  }

  async function refreshDashboard() {
    setRefreshing(true)
    await Promise.all([loadOverview(), loadModerators()])
    setRefreshing(false)
  }

  useEffect(() => {
    void refreshDashboard()
    const timer = window.setInterval(() => void refreshDashboard(), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  async function lookupUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCandidate(null)
    setLookupError('')
    setManagerError('')

    const normalizedId = yapinUserId.trim()
    if (!isValidYapinUserId(normalizedId)) {
      setLookupError('Enter a valid YapIn user ID.')
      return
    }

    setLookingUp(true)
    try {
      const response = await fetch(`/api/owner/moderators?yapinUserId=${encodeURIComponent(normalizedId)}`, {
        cache: 'no-store',
      })
      if (!response.ok) {
        setLookupError(await errorMessage(response, 'The YapIn profile could not be verified.'))
        return
      }
      const payload: unknown = await response.json()
      if (!isRecord(payload) || !isProfileCandidate(payload.data)) {
        setLookupError('The YapIn profile returned an invalid response.')
        return
      }
      setCandidate(payload.data)
    } catch {
      setLookupError('The YapIn profile could not be verified. Check your connection and try again.')
    } finally {
      setLookingUp(false)
    }
  }

  async function confirmChange() {
    if (!pendingChange || savingChange) return
    setSavingChange(true)
    setManagerError('')

    try {
      const response = await fetch('/api/owner/moderators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: pendingChange.action,
          yapinUserId: pendingChange.account.yapinUserId,
        }),
      })

      if (!response.ok) {
        setManagerError(await errorMessage(response, 'The moderator list could not be updated.'))
        return
      }

      setPendingChange(null)
      setCandidate(null)
      setYapinUserId('')
      await refreshDashboard()
    } catch {
      setManagerError('The moderator list could not be updated. Check your connection and try again.')
    } finally {
      setSavingChange(false)
    }
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="owner-overview-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#FC6A39]">Owner tools</p>
            <h2 id="owner-overview-heading" className="mt-1 text-2xl font-bold text-white">Overview</h2>
          </div>
          <Button type="button" variant="outline" onClick={() => void refreshDashboard()} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {overviewError && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{overviewError}</p>}
        {overview ? (
          <>
            <article className="max-w-sm rounded-2xl border border-white/10 bg-[#15171b] p-4 sm:p-5">
              <p className="text-xs text-white/55">Current moderators</p>
              <p className="mt-2 text-3xl font-semibold text-white">{overview.moderators.toLocaleString()}</p>
            </article>
            <div className="mt-7">
              <h3 className="mb-3 text-lg font-semibold text-white">Recent moderation activity</h3>
              <ModerationActivityList items={overview.recentActivity} emptyMessage="No moderation activity has been recorded." />
            </div>
          </>
        ) : !overviewError ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55" role="status">Loading dashboard information…</p>
        ) : null}
      </section>

      <section aria-labelledby="owner-moderators-heading">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[#FC6A39]/10 text-[#FC6A39]">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="owner-moderators-heading" className="text-2xl font-bold text-white">Moderators</h2>
            <p className="mt-1 text-sm text-white/55">Manage access using verified YapIn user IDs.</p>
          </div>
        </div>

        <form onSubmit={(event) => void lookupUser(event)} className="rounded-2xl border border-white/10 bg-[#15171b] p-4 sm:p-5">
          <label htmlFor="moderator-yapin-id" className="block text-sm font-medium text-white/80">YapIn user ID</label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="moderator-yapin-id"
              value={yapinUserId}
              onChange={(event) => setYapinUserId(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#FC6A39]"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
            />
            <Button type="submit" variant="primary" disabled={lookingUp || !yapinUserId.trim()}>
              {lookingUp ? 'Verifying…' : 'Verify YapIn user'}
            </Button>
          </div>
          {lookupError && <p className="mt-3 text-sm text-red-200" role="alert">{lookupError}</p>}

          {candidate && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex min-w-0 items-center gap-3">
                {candidate.avatarUrl ? (
                  <img src={candidate.avatarUrl} alt="" className="size-11 rounded-full object-cover" />
                ) : (
                  <span className="grid size-11 place-items-center rounded-full bg-white/10 font-semibold text-white">
                    {profileInitial(candidate.username)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-white">{candidate.displayName || candidate.username}</p>
                  <p className="truncate text-sm text-white/55">@{candidate.username}</p>
                  <p className="break-all text-xs text-white/40">{candidate.yapinUserId}</p>
                </div>
              </div>
              {candidate.role === 'user' ? (
                <Button type="button" variant="success" onClick={() => setPendingChange({ action: 'add', account: candidate })}>
                  <UserPlus data-icon="inline-start" /> Add moderator
                </Button>
              ) : (
                <p className="text-sm text-amber-200">
                  {candidate.role === 'moderator' ? 'Already a moderator.' : 'This account has a protected role.'}
                </p>
              )}
            </div>
          )}
        </form>

        {managerError && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{managerError}</p>}
        {moderatorsError && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">{moderatorsError}</p>}

        <div className="mt-5">
          <h3 className="mb-3 text-lg font-semibold text-white">Current moderators</h3>
          {moderators.length === 0 && !moderatorsError ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">
              {refreshing ? 'Loading moderators…' : 'No moderators have been added.'}
            </p>
          ) : moderators.length > 0 ? (
            <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-[#15171b]">
              {moderators.map((moderator, index) => (
                <li key={moderator.yapinUserId || `${moderator.username}-${index}`} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    {moderator.avatarUrl ? (
                      <img src={moderator.avatarUrl} alt="" className="size-10 rounded-full object-cover" />
                    ) : (
                      <span className="grid size-10 place-items-center rounded-full bg-white/10 text-sm font-semibold">
                        {profileInitial(moderator.username)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{moderator.displayName || moderator.username}</p>
                      <p className="truncate text-sm text-white/55">@{moderator.username}</p>
                      <p className="break-all text-xs text-white/40">{moderator.yapinUserId || 'YapIn ID unavailable'}</p>
                      <p className="mt-1 text-xs text-white/40">
                        Added {moderator.addedAt ? new Date(moderator.addedAt).toLocaleDateString() : 'before audit tracking'}
                        {moderator.addedBy ? ` by @${moderator.addedBy}` : ''}
                      </p>
                      <p className="mt-2 text-xs text-white/60">
                        <span className="text-emerald-300">{moderator.approved} approved</span>
                        {' · '}
                        <span className="text-red-300">{moderator.rejected} rejected</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/moderation/logs?moderator=${encodeURIComponent(moderator.yapinUserId || moderator.username)}`}
                      className="inline-flex h-9 items-center rounded-lg border border-white/15 px-3 text-xs text-white/75 transition-colors hover:bg-white/10"
                    >
                      View activity
                    </Link>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={!moderator.yapinUserId}
                      onClick={() => setPendingChange({ action: 'remove', account: moderator })}
                    >
                      <UserRoundX data-icon="inline-start" /> Remove
                    </Button>
                  </div>
                  <details className="basis-full">
                    <summary className="cursor-pointer text-sm text-white/60 hover:text-white">Recent activity</summary>
                    <div className="mt-3">
                      <ModerationActivityList
                        items={moderator.recentActivity}
                        emptyMessage="This moderator has no recorded moderation activity."
                      />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {pendingChange && (
        <ModerationConfirmationDialog
          title={pendingChange.action === 'add' ? 'Add this moderator?' : 'Remove this moderator?'}
          description={pendingChange.action === 'add'
            ? `@${pendingChange.account.username} will be able to review pending submissions.`
            : `@${pendingChange.account.username} will immediately lose access to moderation tools.`}
          confirmLabel={pendingChange.action === 'add' ? 'Add moderator' : 'Remove moderator'}
          confirmVariant={pendingChange.action === 'add' ? 'success' : 'danger'}
          busy={savingChange}
          onCancel={() => setPendingChange(null)}
          onConfirm={() => void confirmChange()}
        >
          {managerError && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
              {managerError}
            </p>
          )}
        </ModerationConfirmationDialog>
      )}
    </div>
  )
}
