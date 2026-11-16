'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

type EmojiSearchBarProps = {
  value?: string
  onChange?: (value: string) => void
  onSearch?: (value: string) => void
  className?: string
}

export function EmojiSearchBar({ value, onChange, onSearch, className = '' }: EmojiSearchBarProps) {
  const [localValue, setLocalValue] = useState('')
  const searchValue = value ?? localValue

  function updateValue(nextValue: string) {
    if (onChange) onChange(nextValue)
    else setLocalValue(nextValue)
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = searchValue.trim()
    if (onSearch) {
      onSearch(query)
      return
    }

    window.location.assign(query ? `/?q=${encodeURIComponent(query)}` : '/')
  }

  return (
    <form
      role="search"
      onSubmit={submitSearch}
      className={`flex w-full flex-col gap-2 rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-black/10 sm:flex-row ${className}`}
    >
      <div className="flex min-h-12 flex-1 items-center gap-3 px-3">
        <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search emojis"
          maxLength={80}
          value={searchValue}
          onChange={(event) => updateValue(event.target.value)}
          placeholder="Search approved emojis..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
      </div>
      <Button type="submit" variant="primary" className="min-h-12 px-7">
        Search
      </Button>
    </form>
  )
}
