import { notFound, redirect } from 'next/navigation'
import { isYapmojiId } from '@/lib/emoji-id'

export default async function EmojiDetailPage({
  params,
}: {
  params: Promise<{ emojiId: string }>
}) {
  const { emojiId } = await params
  if (!isYapmojiId(emojiId)) notFound()
  redirect(`/emoji/${encodeURIComponent(emojiId)}`)
}
