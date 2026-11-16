'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity,
  Bot,
  ChevronDown,
  Headset,
  LayoutDashboard,
  LogOut,
  Shield,
  Settings,
  Sparkles,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { getYapinBotInviteUrl } from '@/lib/yapin-invite'

type AuthenticatedProfile = {
  yapinUserId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  isOwner: boolean
  isModerator: boolean
}

function isAuthenticatedProfile(value: unknown): value is AuthenticatedProfile {
  if (!value || typeof value !== 'object') return false
  return (
    'yapinUserId' in value && typeof value.yapinUserId === 'string' &&
    'username' in value && typeof value.username === 'string' &&
    'displayName' in value && (typeof value.displayName === 'string' || value.displayName === null) &&
    'avatarUrl' in value && (typeof value.avatarUrl === 'string' || value.avatarUrl === null) &&
    'isOwner' in value && typeof value.isOwner === 'boolean' &&
    'isModerator' in value && typeof value.isModerator === 'boolean'
  )
}

const menuLinkClass =
  'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FC6A39]'

export function AuthNav() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [user, setUser] = useState<AuthenticatedProfile | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const payload: unknown = await response.json()
        if (
          payload &&
          typeof payload === 'object' &&
          'data' in payload &&
          payload.data &&
          typeof payload.data === 'object' &&
          'user' in payload.data &&
          isAuthenticatedProfile(payload.data.user)
        ) {
          setUser(payload.data.user)
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setUser(null)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!menuOpen) return

    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  async function signOut() {
    setSigningOut(true)
    setSignOutError('')
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) {
        setSignOutError('Could not log out. Please try again.')
        return
      }
      setUser(null)
      setMenuOpen(false)
      router.replace('/login')
      router.refresh()
    } catch {
      setSignOutError('Could not log out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }

  if (!user) {
    return (
      <Link href="/login" className={buttonVariants({ variant: 'primary' })}>
        Log in
      </Link>
    )
  }

  const botInviteUrl = getYapinBotInviteUrl()

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        id="profile-menu-trigger"
        type="button"
        variant="secondary"
        aria-label={`Open profile menu for ${user.username}`}
        aria-controls="profile-menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className="h-10 max-w-[min(15rem,55vw)] gap-2 rounded-xl border border-white bg-black px-2.5 text-white hover:bg-neutral-900 active:bg-neutral-800"
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold text-white">
            {(user.displayName || user.username).slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="truncate">{user.username}</span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
      </Button>

      {menuOpen && (
        <div
          id="profile-menu"
          aria-labelledby="profile-menu-trigger"
          className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/15 bg-[#111214] p-2 text-white shadow-2xl shadow-black/50"
        >
          <div className="mb-2 flex min-w-0 items-center gap-3 border-b border-white/10 px-3 py-3">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 text-sm font-semibold">
                {(user.displayName || user.username).slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{user.displayName || user.username}</span>
              <span className="block truncate text-xs text-white/55">@{user.username}</span>
            </span>
          </div>

          <nav aria-label="Profile menu" className="space-y-1">
            {user.isOwner && (
              <Link href="/owner" onClick={() => setMenuOpen(false)} className={menuLinkClass}>
                <Shield className="size-4 text-[#FC6A39]" aria-hidden="true" />
                Owner Dashboard
              </Link>
            )}
            {user.isModerator && (
              <Link href="/moderation" onClick={() => setMenuOpen(false)} className={menuLinkClass}>
                <Shield className="size-4 text-emerald-300" aria-hidden="true" />
                Moderator Dashboard
              </Link>
            )}
            <Link href="/settings" onClick={() => setMenuOpen(false)} className={menuLinkClass}>
              <Settings className="size-4 text-white/60" aria-hidden="true" />
              Settings
            </Link>
            <Link href="/dashboard" onClick={() => setMenuOpen(false)} className={menuLinkClass}>
              <LayoutDashboard className="size-4 text-white/60" aria-hidden="true" />
              Creator Dashboard
            </Link>
            <Link href="/status" onClick={() => setMenuOpen(false)} className={menuLinkClass}>
              <Activity className="size-4 text-white/60" aria-hidden="true" />
              Status
            </Link>
            <a
              href="https://yapin.gg/invite/gWnPCFvR3a"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className={menuLinkClass}
            >
              <Headset className="size-4 text-white/60" aria-hidden="true" />
              Support Server
            </a>
            <a href={botInviteUrl} target="_blank" rel="noopener noreferrer" className={menuLinkClass}>
              <Bot className="size-4 text-white/60" aria-hidden="true" />
              Add Bot
              <span className="ml-auto text-xs text-white/45">YapIn</span>
            </a>
            <div aria-disabled="true" className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-lg px-3 text-sm text-white/40">
              <Sparkles className="size-4" aria-hidden="true" />
              Premium
              <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                Coming soon
              </span>
            </div>
          </nav>

          <div className="mt-2 border-t border-white/10 pt-2">
            <Button
              type="button"
              variant="danger"
              disabled={signingOut}
              onClick={() => void signOut()}
              className="h-10 w-full justify-start gap-3 rounded-lg px-3"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {signingOut ? 'Signing out…' : 'Log Out'}
            </Button>
          </div>
          {signOutError && <p className="px-2 pt-2 text-xs text-red-300" role="alert">{signOutError}</p>}
        </div>
      )}
    </div>
  )
}
