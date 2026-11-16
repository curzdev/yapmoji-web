'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Compass, Flame, MessageCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FavoriteButton } from '@/components/favorite-button'
import { EmojiSearchBar } from '@/components/emoji-search-bar'
import { SiteHeader, SiteLogo } from '@/components/site-header'

const pageSize = 24
type EmojiOrder = '' | 'newest' | 'oldest' | 'trending'

function isEmojiOrder(value: string): value is EmojiOrder {
  return value === '' || value === 'newest' || value === 'oldest' || value === 'trending'
}

type PublicEmoji = {
  id: string
  emojiId: string
  name: string
  description: string
  category: string
  tags: string[]
  imageUrl: string
  createdAt: string
}

function isPublicEmoji(value: unknown): value is PublicEmoji {
  if (!value || typeof value !== 'object') return false
  return (
    'id' in value && typeof value.id === 'string' &&
    'emojiId' in value && typeof value.emojiId === 'string' &&
    'name' in value && typeof value.name === 'string' &&
    'description' in value && typeof value.description === 'string' &&
    'category' in value && typeof value.category === 'string' &&
    'tags' in value && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string') &&
    'imageUrl' in value && typeof value.imageUrl === 'string' &&
    'createdAt' in value && typeof value.createdAt === 'string'
  )
}

function EmojiCard({
  item,
  isFavorited,
  onFavoriteChange,
}: {
  item: PublicEmoji
  isFavorited: boolean
  onFavoriteChange: (emojiId: string, isFavorited: boolean) => void
}) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-3 transition-all duration-300 hover:-translate-y-1 hover:border-[#FC6A39]/60 hover:shadow-[0_14px_35px_rgba(0,0,0,0.18)]">
      <Link
        href={`/emoji/${encodeURIComponent(item.emojiId)}`}
        aria-label={`View ${item.name}`}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FC6A39]"
      >
        <span className="sr-only">View {item.name}</span>
      </Link>
      <div className="pointer-events-none relative z-10 grid aspect-square place-items-center rounded-xl bg-[#191B20] p-5">
        <img src={item.imageUrl} alt={item.name} className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-110" />
      </div>
      <div className="relative z-10 flex items-end justify-between gap-2 px-1 pt-3">
        <div className="pointer-events-none min-w-0">
          <h3 className="truncate text-sm font-semibold">{item.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{item.category}</p>
        </div>
        <span className="relative z-20">
          <FavoriteButton emojiId={item.id} initiallyFavorited={isFavorited} onChange={onFavoriteChange} />
        </span>
      </div>
    </article>
  )
}

export default function Page() {
  const [dark, setDark] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [selectedTag, setSelectedTag] = useState('')
  const [order, setOrder] = useState<EmojiOrder>('')
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [tagError, setTagError] = useState('')
  const [emojis, setEmojis] = useState<PublicEmoji[]>([])
  const [loadingEmojis, setLoadingEmojis] = useState(true)
  const [emojiError, setEmojiError] = useState('')
  const [page, setPage] = useState(0)
  const [totalEmojis, setTotalEmojis] = useState(0)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('q')?.trim() ?? ''
    if (query) {
      setSearchText(query)
      setActiveSearch(query)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/emojis/tags', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Emoji tags are currently unavailable.')
        const payload: unknown = await response.json()
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('data' in payload) ||
          !payload.data ||
          typeof payload.data !== 'object' ||
          !('tags' in payload.data) ||
          !Array.isArray(payload.data.tags) ||
          !payload.data.tags.every((tag) => typeof tag === 'string')
        ) {
          throw new Error('Emoji tags returned an invalid response.')
        }
        setAvailableTags(payload.data.tags)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setTagError(error instanceof Error ? error.message : 'Emoji tags are currently unavailable.')
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
      sort: order || 'newest',
    })
    if (selectedTag) params.set('tag', selectedTag)
    if (activeSearch) params.set('q', activeSearch)

    setLoadingEmojis(true)
    setEmojiError('')
    fetch(`/api/emojis?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Emoji library is currently unavailable.')
        const payload: unknown = await response.json()
        if (!payload || typeof payload !== 'object' || !('data' in payload) || !Array.isArray(payload.data)) {
          throw new Error('Emoji library returned an invalid response.')
        }
        if (!payload.data.every(isPublicEmoji)) throw new Error('Emoji library returned invalid emoji data.')
        if (
          !('pagination' in payload) ||
          !payload.pagination ||
          typeof payload.pagination !== 'object' ||
          !('count' in payload.pagination) ||
          typeof payload.pagination.count !== 'number'
        ) {
          throw new Error('Emoji library returned invalid pagination data.')
        }
        setEmojis(payload.data)
        setTotalEmojis(payload.pagination.count)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setEmojiError(error instanceof Error ? error.message : 'Emoji library is currently unavailable.')
        setEmojis([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingEmojis(false)
      })

    return () => controller.abort()
  }, [activeSearch, order, page, selectedTag])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/favorites', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const payload: unknown = await response.json()
        if (
          payload &&
          typeof payload === 'object' &&
          'data' in payload &&
          payload.data &&
          typeof payload.data === 'object' &&
          'emojiIds' in payload.data &&
          Array.isArray(payload.data.emojiIds) &&
          payload.data.emojiIds.every((id) => typeof id === 'string')
        ) {
          setFavoriteIds(new Set(payload.data.emojiIds))
        }
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [])

  function updateFavorite(emojiId: string, isFavorited: boolean) {
    setFavoriteIds((current) => {
      const next = new Set(current)
      if (isFavorited) next.add(emojiId)
      else next.delete(emojiId)
      return next
    })
  }

  function submitSearch(query: string) {
    setSearchText(query)
    setActiveSearch(query)
    setPage(0)
    window.history.replaceState(null, '', query ? `/?q=${encodeURIComponent(query)}` : '/')
  }

  const totalPages = Math.ceil(totalEmojis / pageSize)

  return (
    <div className={dark ? 'dark min-h-screen bg-[#101114] text-white' : 'min-h-screen bg-[#fafafa] text-[#101114]'}>
      <SiteHeader dark={dark} onToggleTheme={() => setDark((value) => !value)} />

      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="pointer-events-none absolute left-1/2 top-[-220px] size-[520px] -translate-x-1/2 rounded-full bg-[#FC6A39]/10 blur-[110px]" />
          <div className="relative mx-auto max-w-4xl px-5 pb-16 pt-20 text-center lg:pt-24">
            <div className="mx-auto mb-5 flex w-fit items-center gap-2 rounded-full border border-[#FC6A39]/20 bg-[#FC6A39]/10 px-3 py-1.5 text-xs font-medium text-[#FC6A39]"><Sparkles className="size-3.5" aria-hidden="true" /> Built for the chronically online</div>
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-[-0.04em] sm:text-6xl">Say it with an <span className="text-[#FC6A39]">emoji.</span></h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">Discover community-made emojis for YapIn. Open an approved emoji to copy its command for the official Yapmoji bot.</p>
            <EmojiSearchBar
              value={searchText}
              onChange={setSearchText}
              onSearch={submitSearch}
              className="mx-auto mt-9 max-w-2xl"
            />
            {availableTags.length > 0 && (
              <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                Browse tags:
                {availableTags.slice(0, 3).map((tag) => (
                  <Button
                    variant="link"
                    size="sm"
                    key={tag}
                    onClick={() => {
                      setSelectedTag(tag)
                      setPage(0)
                    }}
                    className="h-auto px-0 font-medium"
                  >
                    {tag}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl border border-[#FC6A39]/20 bg-[#191B20] px-6 py-8 sm:px-10 lg:flex lg:items-center lg:justify-between lg:px-14 lg:py-10">
            <div className="pointer-events-none absolute -right-14 -top-20 size-64 rounded-full bg-[#FC6A39]/10 blur-3xl" />
            <div className="relative max-w-xl"><div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#FC6A39]"><span className="grid size-7 place-items-center rounded-lg bg-[#FC6A39]/15"><MessageCircle className="size-4" /></span> YapIn communities</div><h2 className="text-2xl font-bold tracking-tight sm:text-3xl">A shared home for community emojis</h2><p className="mt-3 leading-7 text-[#A1A1AA]">Browse approved creations and use the official YapIn bot to install them in your server.</p></div>
            <div className="relative mt-7 flex items-center gap-5 lg:mt-0"><span className="text-xs text-[#A1A1AA]">Yapmoji bot in development</span></div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
          <div className="flex flex-col gap-6 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between"><div><div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#FC6A39]"><Compass className="size-4" /> Library</div><h2 className="text-3xl font-bold tracking-tight">Explore Emojis</h2><p className="mt-2 text-sm text-muted-foreground">Only approved submissions are shown here.</p></div></div>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                Tags
                <select
                  aria-label="Filter by tag"
                  value={selectedTag}
                  onChange={(event) => {
                    setSelectedTag(event.target.value)
                    setPage(0)
                  }}
                  className="h-10 min-w-44 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-[#FC6A39]/60 focus-visible:ring-2 focus-visible:ring-[#FC6A39]/30"
                >
                  <option value="">All tags</option>
                  {availableTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </label>
              {selectedTag && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedTag(''); setPage(0) }} className="h-10 text-[#FC6A39]">
                  Clear tag
                </Button>
              )}
              <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                Filter
                <select
                  aria-label="Filter emojis"
                  value={order}
                  onChange={(event) => {
                    const nextOrder = event.target.value
                    if (isEmojiOrder(nextOrder)) {
                      setOrder(nextOrder)
                      setPage(0)
                    }
                  }}
                  className="h-10 min-w-44 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:border-[#FC6A39]/60 focus-visible:ring-2 focus-visible:ring-[#FC6A39]/30"
                >
                  <option value="">Filter</option>
                  <option value="animated" disabled>Animated (metadata unavailable)</option>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="non-animated" disabled>Non Animated (metadata unavailable)</option>
                  <option value="trending">Trending</option>
                </select>
              </label>
            </div>
            <p className="max-w-sm text-xs leading-5 text-muted-foreground">
              Trending uses recorded server installations. Animated filters need per-file animation data, which the database does not store.
            </p>
          </div>
          {tagError && <p className="mt-4 text-sm text-red-400" role="alert">{tagError}</p>}
          {loadingEmojis ? (
            <p className="mt-7 py-12 text-center text-sm text-muted-foreground">Loading approved emojis...</p>
          ) : emojiError ? (
            <p className="mt-7 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400" role="alert">{emojiError}</p>
          ) : emojis.length === 0 ? (
            <p className="mt-7 py-12 text-center text-sm text-muted-foreground">No approved emojis match these filters.</p>
          ) : (
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
              {emojis.map((item) => (
                <EmojiCard key={item.id} item={item} isFavorited={favoriteIds.has(item.id)} onFavoriteChange={updateFavorite} />
              ))}
            </div>
          )}
          {!loadingEmojis && !emojiError && totalPages > 1 && (
            <nav aria-label="Emoji pages" className="mt-8 flex items-center justify-center gap-4">
              <Button type="button" variant="secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button type="button" variant="secondary" disabled={page + 1 >= totalPages} onClick={() => setPage((current) => current + 1)}>
                Next
              </Button>
            </nav>
          )}

          {!activeSearch && !selectedTag && page === 0 && (order === '' || order === 'newest') && (
            <>
              <div className="mt-20 flex items-end justify-between"><div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#FC6A39]"><Flame className="size-4" /> Recently approved</div><h2 className="text-2xl font-bold tracking-tight">Fresh from the community</h2></div></div>
              {!loadingEmojis && !emojiError && <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{emojis.slice(0, 4).map((item) => <EmojiCard key={`recent-${item.id}`} item={item} isFavorited={favoriteIds.has(item.id)} onFavoriteChange={updateFavorite} />)}</div>}
            </>
          )}

        </section>
      </main>

      <footer className="border-t border-border/70 bg-card/40"><div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 lg:flex-row lg:items-center lg:justify-between lg:px-8"><div><SiteLogo /><p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">The community-powered emoji library for people who have something to say.</p></div><div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground"><Link href="/about" className="hover:text-foreground">About</Link><Link href="/contact" className="hover:text-foreground">Contact</Link><Link href="/terms" className="hover:text-foreground">Terms of Service</Link><Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link><a href="https://yapin.gg" target="_blank" rel="noreferrer" className="hover:text-[#FC6A39]">YapIn ↗</a></div></div><div className="mx-auto max-w-7xl border-t border-border/70 px-5 py-5 text-xs text-muted-foreground lg:px-8">© 2026 Yapmoji.</div></footer>
    </div>
  )
}
