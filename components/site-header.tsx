'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Menu, Moon, Sun, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthNav } from '@/components/auth-nav'

type SiteHeaderProps = {
  dark?: boolean
  onToggleTheme?: () => void
}

export function SiteLogo() {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="Yapmoji home">
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#101114] shadow-[0_6px_20px_rgba(252,106,57,0.24)]">
        <Image src="/yapmoji-logo.png" alt="" width={36} height={36} className="size-full object-contain" priority />
      </span>
      <span className="text-[17px] font-bold tracking-tight">yapmoji</span>
    </Link>
  )
}

export function SiteHeader({ dark = true, onToggleTheme }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const announcementTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (announcementTimer.current !== null) window.clearTimeout(announcementTimer.current)
  }, [])

  function showComingSoon(section: string) {
    setMenuOpen(false)
    setAnnouncement(`${section} - Coming soon.`)
    if (announcementTimer.current !== null) window.clearTimeout(announcementTimer.current)
    announcementTimer.current = window.setTimeout(() => setAnnouncement(''), 3000)
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-5 px-5 lg:px-8">
          <SiteLogo />
          <nav
            className={`${menuOpen ? 'absolute left-0 right-0 top-[72px] flex border-b border-border bg-background p-5' : 'hidden'} flex-col gap-4 lg:static lg:flex lg:flex-row lg:items-center lg:border-0 lg:bg-transparent lg:p-0`}
            aria-label="Main navigation"
          >
            <Link href="/" onClick={() => setMenuOpen(false)} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Emojis
            </Link>
            {['Packs', 'Stickers', 'Marketplace', 'Tools'].map((section) => (
              <button
                type="button"
                key={section}
                onClick={() => showComingSoon(section)}
                className="text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {section}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {onToggleTheme && (
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground"
                onClick={onToggleTheme}
                aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              </Button>
            )}
            <AuthNav />
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
      </header>
      {announcement && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[#FC6A39]/30 bg-[#191B20] px-4 py-3 text-sm text-white shadow-xl"
        >
          {announcement}
        </div>
      )}
    </>
  )
}
