'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ModerationActivityList, isModerationActivityItem, type ModerationActivityItem } from '@/components/moderation-activity-list'
import { localDateBoundary } from '@/lib/moderation-filters'

const pageSize = 25

type LogsResponse = {
  data: ModerationActivityItem[]
  pagination: { count: number; limit: number; offset: number }
}

function isLogsResponse(value: unknown): value is LogsResponse {
  if (value === null || typeof value !== 'object' || !('data' in value) || !('pagination' in value)) return false
  const pagination = value.pagination
  return (
    Array.isArray(value.data) &&
    value.data.every(isModerationActivityItem) &&
    pagination !== null &&
    typeof pagination === 'object' &&
    'count' in pagination && typeof pagination.count === 'number' &&
    'limit' in pagination && typeof pagination.limit === 'number' &&
    'offset' in pagination && typeof pagination.offset === 'number'
  )
}

async function getError(response: Response) {
  try {
    const payload: unknown = await response.json()
    if (
      payload && typeof payload === 'object' &&
      'error' in payload && payload.error && typeof payload.error === 'object' &&
      'message' in payload.error && typeof payload.error.message === 'string'
    ) return payload.error.message
  } catch {
    return 'Moderation logs could not be loaded.'
  }
  return 'Moderation logs could not be loaded.'
}

type ModerationLogsProps = {
  isOwner: boolean
  initialModerator: string
}

export function ModerationLogs({ isOwner, initialModerator }: ModerationLogsProps) {
  const [items, setItems] = useState<ModerationActivityItem[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [moderatorInput, setModeratorInput] = useState(initialModerator)
  const [moderator, setModerator] = useState(initialModerator)
  const [actionInput, setActionInput] = useState('')
  const [action, setAction] = useState('')
  const [fromInput, setFromInput] = useState('')
  const [from, setFrom] = useState('')
  const [toInput, setToInput] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      offset: String((page - 1) * pageSize),
      q: search,
      moderator,
      action,
      sort,
    })
    if (from) params.set('from', localDateBoundary(from))
    if (to) params.set('to', localDateBoundary(to, true))

    setLoading(true)
    setError('')
    fetch(`/api/moderation/logs?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setError(await getError(response))
          return
        }
        const payload: unknown = await response.json()
        if (!isLogsResponse(payload)) {
          setError('Moderation logs returned an invalid response.')
          return
        }
        setItems(payload.data)
        setCount(payload.pagination.count)
      })
      .catch((cause: unknown) => {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError('Moderation logs could not be loaded. Check your connection and try again.')
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [page, search, moderator, action, from, to, sort, reloadCount])

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
    setModerator(moderatorInput.trim())
    setAction(actionInput)
    setFrom(fromInput)
    setTo(toInput)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize))

  return (
    <div>
      <form onSubmit={applyFilters} className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-[#15171b] p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-white/60">
          Search emoji or moderator
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={80}
            className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#FC6A39]"
            placeholder="Emoji name, username, or YapIn ID"
          />
        </label>
        {isOwner && (
          <label className="text-xs text-white/60">
            Moderator username or ID
            <input
              value={moderatorInput}
              onChange={(event) => setModeratorInput(event.target.value)}
              maxLength={80}
              className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#FC6A39]"
              placeholder="All moderators"
            />
          </label>
        )}
        <label className="text-xs text-white/60">
          Action
          <select value={actionInput} onChange={(event) => setActionInput(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-[#111214] px-3 text-sm text-white">
            <option value="">All actions</option>
            <option value="submission_approved">Emoji approved</option>
            <option value="submission_rejected">Emoji rejected</option>
            {isOwner && (
              <>
                <option value="moderator_added">Moderator added</option>
                <option value="moderator_removed">Moderator removed</option>
              </>
            )}
          </select>
        </label>
        <label className="text-xs text-white/60">
          From date
          <input type="date" value={fromInput} max={toInput || undefined} onChange={(event) => setFromInput(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white [color-scheme:dark]" />
        </label>
        <label className="text-xs text-white/60">
          Through date
          <input type="date" value={toInput} min={fromInput || undefined} onChange={(event) => setToInput(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white [color-scheme:dark]" />
        </label>
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs text-white/60">
            Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as 'newest' | 'oldest')} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-[#111214] px-3 text-sm text-white">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <Button type="submit" variant="primary">Apply filters</Button>
        </div>
      </form>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-white/55">{count.toLocaleString()} moderation log entries</p>
        <Button type="button" variant="outline" disabled={loading} onClick={() => setReloadCount((current) => current + 1)}>
          {loading ? 'Refreshing…' : 'Refresh logs'}
        </Button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200" role="alert">{error}</p>
      ) : loading ? (
        <div role="status" aria-label="Loading moderation logs" className="space-y-2">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} aria-hidden="true" className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="size-10 animate-pulse rounded-full bg-white/10" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-white/5" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading moderation logs…</span>
        </div>
      ) : (
        <ModerationActivityList
          items={items}
          emptyMessage="No moderation logs match the selected filters."
        />
      )}

      {!loading && count > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/50">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Previous</Button>
            <Button type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
