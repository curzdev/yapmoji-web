export type ModerationActivityItem = {
  id: number
  action: string
  createdAt: string
  reason: string | null
  submissionId: string | null
  submissionName: string | null
  emojiId: string | null
  previewUrl: string | null
  actor: {
    yapinUserId: string | null
    username: string
    displayName: string | null
    avatarUrl: string | null
  }
  target: {
    yapinUserId: string | null
    username: string
    displayName: string | null
    avatarUrl: string | null
  } | null
}

export function isModerationActivityItem(value: unknown): value is ModerationActivityItem {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const actor = record.actor
  const target = record.target
  return (
    typeof record.id === 'number' &&
    typeof record.action === 'string' &&
    typeof record.createdAt === 'string' &&
    (record.reason === null || typeof record.reason === 'string') &&
    (record.submissionId === null || typeof record.submissionId === 'string') &&
    (record.submissionName === null || typeof record.submissionName === 'string') &&
    (record.emojiId === null || typeof record.emojiId === 'string') &&
    (record.previewUrl === null || typeof record.previewUrl === 'string') &&
    actor !== null &&
    typeof actor === 'object' &&
    'username' in actor &&
    typeof actor.username === 'string' &&
    'yapinUserId' in actor &&
    (typeof actor.yapinUserId === 'string' || actor.yapinUserId === null) &&
    (target === null || (
      target !== null &&
      typeof target === 'object' &&
      'username' in target &&
      typeof target.username === 'string' &&
      'yapinUserId' in target &&
      (typeof target.yapinUserId === 'string' || target.yapinUserId === null)
    ))
  )
}

type ModerationActivityListProps = {
  items: ModerationActivityItem[]
  emptyMessage: string
}

function describeActivity(activity: ModerationActivityItem) {
  switch (activity.action) {
    case 'submission_approved':
      return `approved ${activity.submissionName || 'an emoji submission'}`
    case 'submission_rejected':
      return `rejected ${activity.submissionName || 'an emoji submission'}`
    case 'moderator_added':
      return `added ${activity.target?.username || 'a moderator'} as a moderator`
    case 'moderator_removed':
      return `removed ${activity.target?.username || 'a moderator'} as a moderator`
    default:
      return 'recorded a moderation action'
  }
}

export function ModerationActivityList({ items, emptyMessage }: ModerationActivityListProps) {
  if (items.length === 0) {
    return <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/55">{emptyMessage}</p>
  }

  return (
    <ol className="divide-y divide-white/10 rounded-xl border border-white/10 bg-white/[0.02]">
      {items.map((activity) => (
        <li key={activity.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 gap-3">
            {activity.actor.avatarUrl && (
              <img src={activity.actor.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
            )}
            {activity.previewUrl && (
              <img src={activity.previewUrl} alt="" className="size-10 shrink-0 rounded-lg bg-black/20 object-contain p-1" />
            )}
            <div className="min-w-0">
              <p className="text-sm text-white">
                <span className="font-semibold">{activity.actor.username}</span>{' '}
                {describeActivity(activity)}
              </p>
              <p className="mt-1 break-all text-xs text-white/40">
                {activity.actor.yapinUserId || 'YapIn ID unavailable'}
                {activity.submissionId ? ` · Submission ${activity.submissionId}` : ''}
              </p>
              {activity.target && (
                <p className="mt-1 break-all text-xs text-white/40">
                  Target: @{activity.target.username} · {activity.target.yapinUserId || 'YapIn ID unavailable'}
                </p>
              )}
              {activity.reason && (
                <p className="mt-1 break-words text-xs text-red-200/75">Reason: {activity.reason}</p>
              )}
              {activity.submissionId && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-[#FC6A39] hover:underline">View decision details</summary>
                  <dl className="mt-2 grid gap-1 text-xs text-white/55">
                    <div><dt className="inline">Action: </dt><dd className="inline">{activity.action.replaceAll('_', ' ')}</dd></div>
                    <div><dt className="inline">Emoji: </dt><dd className="inline">{activity.submissionName || 'Unavailable'}</dd></div>
                    <div><dt className="inline">Yapmoji ID: </dt><dd className="inline break-all">{activity.emojiId || 'Unavailable'}</dd></div>
                  </dl>
                </details>
              )}
            </div>
          </div>
          <time className="shrink-0 text-xs text-white/45" dateTime={activity.createdAt}>
            {new Date(activity.createdAt).toLocaleString()}
          </time>
        </li>
      ))}
    </ol>
  )
}
