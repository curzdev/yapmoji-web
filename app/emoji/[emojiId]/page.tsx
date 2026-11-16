import { notFound } from 'next/navigation'
import { Download } from 'lucide-react'
import { AddEmojiModal } from '@/components/add-emoji-modal'
import { EmojiSearchBar } from '@/components/emoji-search-bar'
import { SiteHeader } from '@/components/site-header'
import { buttonVariants } from '@/components/ui/button'
import { isYapmojiId } from '@/lib/emoji-id'
import { getYapinBotInviteUrl } from '@/lib/yapin-invite'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const bucketName = 'emoji-submissions'
const imageUrlLifetimeSeconds = 5 * 60

export default async function EmojiDetailPage({
  params,
}: {
  params: Promise<{ emojiId: string }>
}) {
  const { emojiId } = await params
  if (!isYapmojiId(emojiId)) notFound()

  const supabase = createSupabaseAdminClient()
  const { data: emoji, error } = await supabase
    .from('emoji_submissions')
    .select('id, yapmoji_id, name, description, category, tags, storage_path, created_at, creator_id')
    .eq('yapmoji_id', emojiId)
    .eq('status', 'approved')
    .maybeSingle()

  if (error) throw new Error('Approved emoji details could not be loaded.')
  if (!emoji) notFound()

  let creatorUsername: string | null = null
  if (emoji.creator_id) {
    const { data: creator, error: creatorError } = await supabase
      .from('yapin_users')
      .select('username')
      .eq('id', emoji.creator_id)
      .maybeSingle()

    if (creatorError) throw new Error('The emoji creator could not be loaded.')
    creatorUsername = creator?.username ?? null
  }

  const { data: signedImage, error: signedUrlError } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(emoji.storage_path, imageUrlLifetimeSeconds)

  if (signedUrlError || !signedImage) {
    throw new Error('The approved emoji image could not be loaded.')
  }

  return (
    <div className="dark min-h-screen bg-[#101114] text-white">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-5 pb-16 lg:px-8">
        <EmojiSearchBar className="mx-auto mt-8 max-w-3xl" />

        <aside
          aria-label="Advertisement"
          className="relative mt-6 flex min-h-40 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.035] to-[#191B20] px-5 py-7 text-center sm:min-h-52"
        >
          <span className="absolute left-4 top-4 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
            Advertisement
          </span>
          <p className="text-sm text-white/35">Ad space</p>
        </aside>

        <div className="mt-8">
          <a href="/" className="text-sm font-medium text-white/60 transition hover:text-[#FC6A39]">
            ← Back to emoji library
          </a>
          <article className="mt-5 grid gap-7 rounded-3xl border border-white/10 bg-[#191B20] p-4 sm:p-7 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)] lg:items-center lg:gap-12 lg:p-10">
            <div className="grid aspect-square max-h-[34rem] place-items-center rounded-2xl bg-[#101114] p-8 sm:p-12">
              <img
                src={signedImage.signedUrl}
                alt={emoji.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#FC6A39]">{emoji.category}</p>
              <h1 className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl">{emoji.name}</h1>
              <p className="mt-3 text-sm text-white/55">
                Created by <span className="font-medium text-white/80">{creatorUsername ? `@${creatorUsername}` : 'Creator unavailable'}</span>
              </p>
              {emoji.description && <p className="mt-4 leading-7 text-white/65">{emoji.description}</p>}

              {emoji.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2" aria-label="Emoji tags">
                  {emoji.tags.map((tag: string) => (
                    <span key={tag} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/60">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-5 text-xs text-white/45">
                Added <time dateTime={emoji.created_at}>{new Date(emoji.created_at).toLocaleDateString()}</time>
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a
                  href={`/api/emojis/${encodeURIComponent(emoji.yapmoji_id)}/download`}
                  className={buttonVariants({ variant: 'primary', className: 'h-11 px-5' })}
                >
                  <Download data-icon="inline-start" />
                  Download emoji
                </a>
                <AddEmojiModal emojiId={emoji.yapmoji_id} inviteUrl={getYapinBotInviteUrl()} />
              </div>
            </div>
          </article>
        </div>
      </main>
    </div>
  )
}
