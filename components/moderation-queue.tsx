'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ModerationConfirmationDialog } from '@/components/moderation-confirmation-dialog'
import { localDateBoundary } from '@/lib/moderation-filters'

type Submission = {
  id: string
  emojiId: string
  name: string
  description: string
  category: string
  tags: string[]
  createdAt: string
  mimeType: string
  fileSize: number
  previewUrl: string
  submitter: {
    yapinUserId: string | null
    username: string | null
    displayName: string | null
    avatarUrl: string | null
  } | null
}

type QueueResponse = {
  data: Submission[]
  pagination: { count: number; limit: number; offset: number }
}

const pageSize = 20

type Decision = {
  submission: Submission
  action: 'approve' | 'reject'
}

function isSubmission(value: unknown): value is Submission {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const submitter = record.submitter
  return (
    typeof record.id === 'string' &&
    typeof record.emojiId === 'string' &&
    typeof record.name === 'string' &&
    typeof record.description === 'string' &&
    typeof record.category === 'string' &&
    Array.isArray(record.tags) && record.tags.every((tag) => typeof tag === 'string') &&
    typeof record.createdAt === 'string' &&
    typeof record.mimeType === 'string' &&
    typeof record.fileSize === 'number' &&
    typeof record.previewUrl === 'string' &&
    (submitter === null || (
      Boolean(submitter) &&
      typeof submitter === 'object' &&
      'username' in submitter &&
      (typeof submitter.username === 'string' || submitter.username === null)
    ))
  )
}

function isQueueResponse(value: unknown): value is QueueResponse {
  if (!value || typeof value !== 'object' || !('data' in value) || !('pagination' in value)) return false
  const pagination = value.pagination
  return (
    Array.isArray(value.data) &&
    value.data.every(isSubmission) &&
    pagination !== null &&
    typeof pagination === 'object' &&
    'count' in pagination &&
    typeof pagination.count === 'number' &&
    'limit' in pagination &&
    typeof pagination.limit === 'number' &&
    'offset' in pagination &&
    typeof pagination.offset === 'number'
  )
}

async function responseError(response: Response, fallback: string) {
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
    return fallback
  }
  return fallback
}

export function ModerationQueue() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [reloadCount, setReloadCount] = useState(0)
  const [details, setDetails] = useState<Submission | null>(null)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  async function loadQueue(offset: number) {
    setLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        offset: String(offset),
        q: search,
        sort,
      })
      if (from) params.set('from', localDateBoundary(from))
      if (to) params.set('to', localDateBoundary(to, true))
      const response = await fetch(`/api/moderation/submissions?${params}`, { cache: 'no-store' })
      if (!response.ok) {
        setError(await responseError(response, 'Pending submissions could not be loaded.'))
        return false
      }

      const payload: unknown = await response.json()
      if (!isQueueResponse(payload)) {
        setError('The moderation queue returned an invalid response.')
        return false
      }

      setSubmissions(payload.data)
      setCount(payload.pagination.count)
      return true
    } catch {
      setError('Pending submissions could not be loaded. Check your connection and try again.')
      return false
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadQueue((page - 1) * pageSize)
  }, [page, search, from, to, sort, reloadCount])

  function applySearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  function openDecision(submission: Submission, action: Decision['action']) {
    setDetails(null)
    setRejectionReason('')
    setError('')
    setDecision({ submission, action })
  }

  async function submitDecision() {
    if (!decision || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')

    try {
      const response = await fetch(`/api/moderation/submissions/${encodeURIComponent(decision.submission.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: decision.action,
          ...(decision.action === 'reject' ? { reason: rejectionReason.trim() } : {}),
        }),
      })

      if (!response.ok) {
        setError(await responseError(response, 'The submission could not be reviewed.'))
        return
      }

      setDecision(null)
      window.dispatchEvent(new Event('moderation:updated'))
      if (submissions.length === 1 && page > 1) {
        setPage((current) => current - 1)
      } else {
        setReloadCount((current) => current + 1)
      }
    } catch {
      setError('The submission could not be reviewed. Check your connection and try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(count / pageSize))

  return (
    <section aria-labelledby="pending-submissions-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pending-submissions-heading" className="text-xl font-semibold text-white">Pending submissions</h2>
          <p className="mt-1 text-sm text-white/55">{count} {search || from || to ? 'matching' : 'awaiting review'}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setReloadCount((current) => current + 1)} disabled={loading || saving}>
          Refresh queue
        </Button>
      </div>

      <form onSubmit={applySearch} className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-[#15171b] p-4 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_auto_auto_auto_auto]">
        <label className="text-xs text-white/60 sm:col-span-2 lg:col-span-1">
          Search name or submitter
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            maxLength={80}
            className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#FC6A39]"
            placeholder="Emoji name or YapIn username"
          />
        </label>
        <label className="text-xs text-white/60">
          Submitted from
          <input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1) }} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white [color-scheme:dark]" />
        </label>
        <label className="text-xs text-white/60">
          Submitted through
          <input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1) }} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white [color-scheme:dark]" />
        </label>
        <label className="text-xs text-white/60">
          Sort by
          <select value={sort} onChange={(event) => { setSort(event.target.value as 'newest' | 'oldest'); setPage(1) }} className="mt-1 h-10 w-full rounded-lg border border-white/15 bg-[#111214] px-3 text-sm text-white">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <Button type="submit" variant="primary" className="self-end">Search queue</Button>
      </form>

      {error && (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <div role="status" aria-label="Loading pending submissions" className="space-y-4">
          {[0, 1, 2].map((item) => (
            <div key={item} aria-hidden="true" className="flex gap-4 rounded-2xl border border-white/10 bg-[#15171b] p-4">
              <div className="size-24 shrink-0 animate-pulse rounded-xl bg-white/10" />
              <div className="min-w-0 flex-1 space-y-3 py-1">
                <div className="h-5 w-1/3 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-white/5" />
                <div className="h-8 w-40 animate-pulse rounded-lg bg-white/10" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading pending submissions…</span>
        </div>
      ) : error ? null : submissions.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-sm text-white/55">
          There are no pending submissions.
        </p>
      ) : (
        <ul className="space-y-4">
          {submissions.map((submission) => (
            <li key={submission.id} className="rounded-2xl border border-white/10 bg-[#15171b] p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row">
                <img
                  src={submission.previewUrl}
                  alt={`Preview of ${submission.name}`}
                  className="size-24 shrink-0 rounded-xl border border-white/10 bg-black/20 object-contain p-2"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-semibold text-white">{submission.name}</h3>
                      <p className="mt-1 text-xs text-white/50">
                        {submission.category} · Submitted {new Date(submission.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-200">
                      Pending
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-sm text-white/70">
                    {submission.submitter?.avatarUrl ? (
                      <img src={submission.submitter.avatarUrl} alt="" className="size-7 rounded-full object-cover" />
                    ) : (
                      <span className="grid size-7 place-items-center rounded-full bg-white/10 text-xs">
                        {(submission.submitter?.username || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span>{submission.submitter?.username ? `@${submission.submitter.username}` : 'Unknown submitter'}</span>
                  </div>

                  {submission.description && (
                    <p className="mt-3 line-clamp-3 break-words text-sm text-white/65">{submission.description}</p>
                  )}
                  {submission.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {submission.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-white/60">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => setDetails(submission)}>
                      View details
                    </Button>
                    <Button
                      type="button"
                      variant="success"
                      onClick={() => openDecision(submission, 'approve')}
                      disabled={saving}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => openDecision(submission, 'reject')}
                      disabled={saving}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && count > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/50">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
              Previous
            </Button>
            <Button type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      {details && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/75 p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="submission-details-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#15171b] p-5 shadow-2xl"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="submission-details-title" className="text-xl font-semibold text-white">{details.name}</h2>
                <p className="mt-1 text-sm text-white/55">Submission details</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setDetails(null)}>Close</Button>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-[10rem_1fr]">
              <img src={details.previewUrl} alt={`Preview of ${details.name}`} className="w-full rounded-xl bg-black/20 object-contain p-3 sm:size-40" />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-white/45">Yapmoji ID</dt><dd className="break-all text-white/80">{details.emojiId}</dd>
                <dt className="text-white/45">Submission ID</dt><dd className="break-all text-white/80">{details.id}</dd>
                <dt className="text-white/45">Category</dt><dd className="text-white/80">{details.category}</dd>
                <dt className="text-white/45">File type</dt><dd className="text-white/80">{details.mimeType}</dd>
                <dt className="text-white/45">File size</dt><dd className="text-white/80">{(details.fileSize / 1024).toFixed(1)} KB</dd>
                <dt className="text-white/45">Submitted</dt><dd className="text-white/80">{new Date(details.createdAt).toLocaleString()}</dd>
                <dt className="text-white/45">YapIn ID</dt><dd className="break-all text-white/80">{details.submitter?.yapinUserId || 'Unavailable'}</dd>
              </dl>
            </div>
            <div className="mt-5">
              <h3 className="text-sm font-semibold text-white">Description</h3>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-white/65">{details.description || 'No description provided.'}</p>
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-white">Tags</h3>
              <p className="mt-1 text-sm text-white/65">{details.tags.length ? details.tags.join(', ') : 'No tags'}</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="success" onClick={() => openDecision(details, 'approve')}>
                Approve submission
              </Button>
              <Button type="button" variant="danger" onClick={() => openDecision(details, 'reject')}>
                Reject submission
              </Button>
            </div>
          </section>
        </div>
      )}

      {decision && (
        <ModerationConfirmationDialog
          title={decision.action === 'approve' ? 'Approve this emoji?' : 'Reject this emoji?'}
          description={decision.action === 'approve'
            ? `"${decision.submission.name}" will become publicly available after approval.`
            : `"${decision.submission.name}" will be marked rejected. The submitter will see the reason in their dashboard.`}
          confirmLabel={decision.action === 'approve' ? 'Approve emoji' : 'Reject emoji'}
          confirmVariant={decision.action === 'approve' ? 'success' : 'danger'}
          confirmDisabled={decision.action === 'reject' && rejectionReason.trim().length === 0}
          busy={saving}
          onCancel={() => setDecision(null)}
          onConfirm={() => void submitDecision()}
        >
          {error && (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
              {error}
            </p>
          )}
          {decision.action === 'reject' && (
            <label className="mt-4 block text-sm font-medium text-white/80">
              Rejection reason
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                maxLength={500}
                rows={4}
                required
                className="mt-2 w-full resize-y rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-white outline-none focus:border-[#FC6A39]"
                placeholder="Explain what needs to change…"
              />
              <span className="mt-1 block text-right text-xs text-white/45">{rejectionReason.trim().length}/500</span>
            </label>
          )}
        </ModerationConfirmationDialog>
      )}
    </section>
  )
}
