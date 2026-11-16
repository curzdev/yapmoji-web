'use client'

import { useEffect, useState } from 'react'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'

type FavoriteButtonProps = {
  emojiId: string
  initiallyFavorited: boolean
  onChange: (emojiId: string, isFavorited: boolean) => void
}

export function FavoriteButton({ emojiId, initiallyFavorited, onChange }: FavoriteButtonProps) {
  const [isFavorited, setIsFavorited] = useState(initiallyFavorited)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    setIsFavorited(initiallyFavorited)
  }, [initiallyFavorited])

  async function toggleFavorite() {
    if (saving) return
    const returnTo = `${window.location.pathname}${window.location.search}`
    setSaving(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/favorites', {
        method: isFavorited ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emojiId }),
      })

      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(returnTo)}`)
        return
      }
      if (!response.ok) {
        setErrorMessage('Favorite could not be saved.')
        return
      }

      const nextState = !isFavorited
      setIsFavorited(nextState)
      onChange(emojiId, nextState)
    } catch {
      setErrorMessage('Favorite could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="relative inline-flex">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={saving}
        aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        aria-pressed={isFavorited}
        onClick={toggleFavorite}
        className={isFavorited ? 'text-[#FC6A39]' : 'text-muted-foreground/60'}
      >
        <Heart className={isFavorited ? 'fill-current' : ''} aria-hidden="true" />
      </Button>
      {errorMessage && <span className="absolute right-0 top-full z-10 whitespace-nowrap text-xs text-red-400" role="alert">{errorMessage}</span>}
    </span>
  )
}