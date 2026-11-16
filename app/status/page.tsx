import Image from 'next/image'
import Link from 'next/link'
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  Mail,
  ShieldCheck,
  Smile,
  TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getYapinBotInviteUrl } from '@/lib/yapin-invite'
import { getYapinCallbackUrl } from '@/lib/yapin-oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type CheckState = 'available' | 'configured' | 'unavailable' | 'not_configured'

type ServiceCheck = {
  id: string
  label: string
  detail: string
  state: CheckState
}

type GroupState = 'operational' | 'unavailable' | 'not_monitored'

type ServiceGroup = {
  id: string
  name: string
  description: string
  icon: LucideIcon
  checks: ServiceCheck[]
}

async function checkDatabaseTable(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: 'yapin_users' | 'emoji_submissions',
) {
  try {
    const { error } = await supabase.from(table).select('id').limit(0)
    return !error
  } catch {
    return false
  }
}

async function checkStorageBucket(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  try {
    const { data, error } = await supabase.storage.from('emoji-submissions').list('', { limit: 1 })
    return !error && data !== null
  } catch {
    return false
  }
}

async function getServiceChecks(): Promise<ServiceCheck[]> {
  let supabase: ReturnType<typeof createSupabaseAdminClient> | null = null
  try {
    supabase = createSupabaseAdminClient()
  } catch {
    // Failed live checks are displayed as unavailable below.
  }

  const [identityAvailable, libraryAvailable, storageAvailable] = supabase
    ? await Promise.all([
        checkDatabaseTable(supabase, 'yapin_users'),
        checkDatabaseTable(supabase, 'emoji_submissions'),
        checkStorageBucket(supabase),
      ])
    : [false, false, false]

  let authConfigured = false
  try {
    getYapinCallbackUrl()
    authConfigured = Boolean(
      process.env.YAPIN_SESSION_SECRET &&
        Buffer.byteLength(process.env.YAPIN_SESSION_SECRET, 'utf8') >= 32 &&
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  } catch {
    authConfigured = false
  }

  const botInviteUrl = getYapinBotInviteUrl()

  return [
    {
      id: 'account-database',
      label: 'YapIn account records',
      detail: identityAvailable
        ? 'The account table responded to a live read-only query.'
        : 'The account table did not respond to a live read-only query.',
      state: identityAvailable ? 'available' : 'unavailable',
    },
    {
      id: 'yapin-sign-in',
      label: 'YapIn sign-in configuration',
      detail: authConfigured
        ? 'Callback and server-side session settings are present. YapIn provider uptime is not monitored here.'
        : 'Required OAuth callback or server-side session settings are incomplete.',
      state: authConfigured ? 'configured' : 'not_configured',
    },
    {
      id: 'emoji-metadata',
      label: 'Emoji submission metadata',
      detail: libraryAvailable
        ? 'The emoji submissions table responded to a live read-only query.'
        : 'The emoji submissions table did not respond to a live read-only query.',
      state: libraryAvailable ? 'available' : 'unavailable',
    },
    {
      id: 'emoji-storage',
      label: 'Private emoji image storage',
      detail: storageAvailable
        ? 'The private emoji bucket responded to a live request.'
        : 'The private emoji bucket did not respond to a live request.',
      state: storageAvailable ? 'available' : 'unavailable',
    },
    {
      id: 'yapin-bot',
      label: 'YapIn bot invite',
      detail: botInviteUrl
        ? 'An official YapIn invite is configured. Bot runtime health is not monitored.'
        : 'The official YapIn bot invite is not configured.',
      state: botInviteUrl ? 'configured' : 'not_configured',
    },
  ]
}

function getGroupState(checks: ServiceCheck[]): GroupState {
  if (checks.some((check) => check.state === 'unavailable')) return 'unavailable'
  if (checks.some((check) => check.state === 'available')) return 'operational'
  return 'not_monitored'
}

function groupStateLabel(state: GroupState) {
  if (state === 'operational') return 'Operational'
  if (state === 'unavailable') return 'Unavailable'
  return 'Not monitored'
}

function checkStateLabel(state: CheckState) {
  if (state === 'available') return 'Operational'
  if (state === 'unavailable') return 'Unavailable'
  if (state === 'configured') return 'Configured'
  return 'Not configured'
}

function checkStateClass(state: CheckState) {
  if (state === 'available') return 'text-emerald-300'
  if (state === 'unavailable') return 'text-red-300'
  return 'text-white/50'
}

function statusDotClass(state: CheckState | GroupState) {
  if (state === 'available' || state === 'operational') return 'bg-emerald-400'
  if (state === 'unavailable') return 'bg-red-400'
  return 'bg-zinc-500'
}

function groupStatusClass(state: GroupState) {
  if (state === 'operational') return 'text-emerald-300'
  if (state === 'unavailable') return 'text-red-300'
  return 'text-white/50'
}

function getOverallStatus(checks: ServiceCheck[]) {
  if (checks.some((check) => check.state === 'unavailable')) {
    return {
      label: 'One or more live checks are unavailable',
      detail: 'Review the affected components below. These are current checks, not a confirmed incident report.',
      state: 'unavailable' as const,
    }
  }
  if (checks.some((check) => check.state === 'not_configured')) {
    return {
      label: 'Some integrations are not configured',
      detail: 'The available live checks responded, but one or more features are not configured.',
      state: 'not_configured' as const,
    }
  }
  if (checks.some((check) => check.state === 'available')) {
    return {
      label: 'All monitored systems operational',
      detail: 'All live checks completed successfully. Configuration-only checks are identified separately.',
      state: 'available' as const,
    }
  }
  return {
    label: 'No live checks are available',
    detail: 'No monitored component returned a current status.',
    state: 'not_configured' as const,
  }
}

function getOverviewClass(state: 'available' | 'unavailable' | 'not_configured') {
  if (state === 'available') return 'border-emerald-500/25 bg-emerald-500/[0.06]'
  if (state === 'unavailable') return 'border-red-500/30 bg-red-500/[0.06]'
  return 'border-amber-500/25 bg-amber-500/[0.05]'
}

function getOverviewIconClass(state: 'available' | 'unavailable' | 'not_configured') {
  if (state === 'available') return 'text-emerald-300'
  if (state === 'unavailable') return 'text-red-300'
  return 'text-amber-300'
}

export default async function StatusPage() {
  const checks = await getServiceChecks()
  const checkMap = new Map(checks.map((check) => [check.id, check]))
  const groups: ServiceGroup[] = [
    {
      id: 'accounts',
      name: 'Account & Authentication',
      description: 'YapIn identity storage and sign-in configuration',
      icon: ShieldCheck,
      checks: ['account-database', 'yapin-sign-in']
        .map((id) => checkMap.get(id))
        .filter((check): check is ServiceCheck => check !== undefined),
    },
    {
      id: 'emoji-library',
      name: 'Emoji Library',
      description: 'Submission data and private image storage',
      icon: Smile,
      checks: ['emoji-metadata', 'emoji-storage']
        .map((id) => checkMap.get(id))
        .filter((check): check is ServiceCheck => check !== undefined),
    },
    {
      id: 'yapin-bot',
      name: 'YapIn Bot Integration',
      description: 'Official invitation configuration',
      icon: Bot,
      checks: ['yapin-bot']
        .map((id) => checkMap.get(id))
        .filter((check): check is ServiceCheck => check !== undefined),
    },
  ]
  const overallStatus = getOverallStatus(checks)
  const checkedAt = new Date().toISOString()
  const OverviewIcon =
    overallStatus.state === 'available'
      ? CheckCircle2
      : overallStatus.state === 'unavailable'
        ? TriangleAlert
        : Activity

  return (
    <main className="dark min-h-screen bg-[#101114] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <Link href="/" aria-label="Yapmoji home" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-black">
              <Image src="/yapmoji-logo.png" alt="" width={40} height={40} className="size-full object-contain" priority />
            </span>
            <span className="text-lg font-bold tracking-tight">yapmoji</span>
          </Link>
          <div className="sm:text-right">
            <Button
              type="button"
              variant="disabled"
              disabled
              aria-describedby="subscribe-unavailable"
              title="Update subscriptions are not available yet."
              className="h-10 gap-2"
            >
              <Mail aria-hidden="true" />
              Subscribe to Updates
            </Button>
            <p id="subscribe-unavailable" className="mt-1 text-xs text-white/45">
              Notifications are not configured
            </p>
          </div>
        </header>

        <div className="pt-8">
          <p className="text-sm font-medium text-[#FC6A39]">Yapmoji service status</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">System status</h1>
          <p className="mt-2 text-sm text-white/55">
            Current checks only. Historical uptime and incident monitoring are not configured.
          </p>
        </div>

        <section
          aria-labelledby="incident-heading"
          className="mt-6 flex items-start gap-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4 sm:p-5"
        >
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Incidents</p>
            <h2 id="incident-heading" className="mt-1 font-semibold">No active incidents published</h2>
            <p className="mt-1 text-sm leading-6 text-white/55">
              Yapmoji does not yet have an incident-management feed. This page cannot report incidents or updates
              outside the live checks shown below.
            </p>
          </div>
        </section>

        <section className={`mt-4 flex items-start gap-4 rounded-xl border p-4 sm:p-5 ${getOverviewClass(overallStatus.state)}`} aria-live="polite">
          <OverviewIcon className={`mt-0.5 size-5 shrink-0 ${getOverviewIconClass(overallStatus.state)}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{overallStatus.label}</h2>
            <p className="mt-1 text-sm leading-6 text-white/55">{overallStatus.detail}</p>
          </div>
          <p className="hidden shrink-0 text-xs text-white/45 sm:block">
            Checked <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString()}</time>
          </p>
        </section>

        <section className="mt-9" aria-labelledby="components-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="components-heading" className="text-xl font-semibold">System components</h2>
              <p className="mt-1 text-sm text-white/50">Expand a group to view its latest component checks.</p>
            </div>
            <p className="text-xs text-white/45 sm:hidden">
              Checked <time dateTime={checkedAt}>{new Date(checkedAt).toLocaleString()}</time>
            </p>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-[#191B20]">
            {groups.map((group, index) => {
              const groupState = getGroupState(group.checks)
              const GroupIcon = group.icon

              return (
                <details
                  key={group.id}
                  open={index === 0}
                  className={`group ${index > 0 ? 'border-t border-white/10' : ''}`}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#FC6A39] sm:px-5">
                    <GroupIcon className="size-4 shrink-0 text-white/50" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{group.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-white/45">{group.description}</span>
                    </span>
                    <span className="hidden text-xs text-white/45 sm:inline">
                      {group.checks.length} {group.checks.length === 1 ? 'component' : 'components'}
                    </span>
                    <span className={`flex shrink-0 items-center gap-2 text-xs font-medium ${groupStatusClass(groupState)}`}>
                      <span className={`size-2 rounded-full ${statusDotClass(groupState)}`} aria-hidden="true" />
                      <span className="hidden sm:inline">{groupStateLabel(groupState)}</span>
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-white/45 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-open:grid-rows-[1fr]">
                    <div className="overflow-hidden">
                      <div className="border-t border-white/[0.07] px-4 sm:px-5">
                        {group.checks.map((check) => (
                          <div
                            key={check.id}
                            className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-white/[0.06] py-3 last:border-b-0 sm:items-center"
                          >
                            <span
                              className={`mt-1.5 size-2 shrink-0 rounded-full sm:mt-0 ${statusDotClass(check.state)}`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-medium">{check.label}</h3>
                              <p className="mt-0.5 text-xs leading-5 text-white/50">{check.detail}</p>
                            </div>
                            <span className={`ml-5 shrink-0 text-xs font-medium sm:ml-0 ${checkStateClass(check.state)}`}>
                              {checkStateLabel(check.state)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </details>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/45" aria-label="Status legend">
            <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-400" />Operational</span>
            <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-amber-400" />Degraded</span>
            <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-red-400" />Unavailable</span>
            <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-zinc-500" />Not monitored</span>
          </div>
        </section>

        <section className="mt-8 rounded-xl border border-white/10 bg-[#191B20] p-4 sm:p-5" aria-labelledby="history-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="history-heading" className="font-semibold">Status history</h2>
              <p className="mt-1 text-sm text-white/50">Historical monitoring records are not currently stored.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-white/45">
              Date range
              <select
                disabled
                aria-label="Status history date range"
                className="h-9 rounded-lg border border-white/10 bg-[#101114] px-3 text-xs text-white/40 disabled:cursor-not-allowed"
              >
                <option>No history available</option>
              </select>
            </label>
          </div>
          <div className="mt-4 rounded-lg border border-dashed border-white/10 px-4 py-6 text-center">
            <Database className="mx-auto size-5 text-white/35" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-white/70">Only current live checks are available</p>
            <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-white/45">
              Checks are run when this page loads, but their results are not saved as historical intervals. No uptime
              percentages, status bars, date navigation, or incident history are shown without recorded data.
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
