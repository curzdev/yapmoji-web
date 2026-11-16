'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

type AddEmojiModalProps = {
  emojiId: string
  inviteUrl: string | null
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()

  if (!copied) throw new Error('Clipboard access is unavailable.')
}

function CopyButton({
  value,
  copied,
  onCopy,
}: {
  value: string
  copied: boolean
  onCopy: (value: string) => void
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => onCopy(value)}
      className="h-9 shrink-0 border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white/80 hover:border-[#FC6A39]/50 hover:bg-white/[0.08] hover:text-white"
      aria-label={copied ? 'Copied to clipboard' : `Copy ${value.startsWith('/add') ? 'command' : 'emoji ID'}`}
    >
      {copied ? <Check className="size-3.5 text-[#FC6A39]" /> : <Copy className="size-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

export function AddEmojiModal({ emojiId, inviteUrl }: AddEmojiModalProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState<'command' | 'id' | null>(null)
  const [copyError, setCopyError] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const command = `/add type:emoji id:${emojiId}`

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  async function copy(value: string, kind: 'command' | 'id') {
    setCopyError('')
    try {
      await copyText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1800)
    } catch {
      setCopyError('Could not copy automatically. Select and copy the text instead.')
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="primary"
        onClick={() => setOpen(true)}
        className="h-11 rounded-xl px-5 shadow-[0_8px_24px_rgba(252,106,57,0.2)]"
      >
        Add using the bot
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onCancel={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}
        aria-labelledby="add-emoji-title"
        className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-white/10 bg-[#181a1f] p-0 text-white shadow-2xl backdrop:bg-black/75"
      >
        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#FC6A39]">YapIn · Yapmoji</p>
              <h2 id="add-emoji-title" className="mt-2 text-2xl font-bold tracking-tight">Add using our bot</h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="size-9 shrink-0 rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Close dialog"
            >
              <X className="size-5" />
            </Button>
          </div>

          <div className="mt-7 space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold">Slash Command</p>
              <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101114] p-3">
                <code className="min-w-0 break-all text-xs leading-6 text-white/80 sm:text-sm">{command}</code>
                <CopyButton value={command} copied={copied === 'command'} onCopy={(value) => void copy(value, 'command')} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Emoji ID</p>
              <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#101114] p-3">
                <code className="min-w-0 break-all text-sm text-white/80">{emojiId}</code>
                <CopyButton value={emojiId} copied={copied === 'id'} onCopy={(value) => void copy(value, 'id')} />
              </div>
            </div>

            {copyError && <p className="text-sm text-red-300" role="alert">{copyError}</p>}

            {inviteUrl ? (
              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({ variant: 'primary', className: 'h-12 w-full whitespace-normal rounded-xl px-5 text-center text-sm font-bold' })}
              >
                Don&apos;t have our bot? Add it now
              </a>
            ) : (
              <div>
                <Button
                  type="button"
                  disabled
                  variant="disabled"
                  className="h-12 w-full whitespace-normal rounded-xl px-5 text-center text-sm font-bold"
                >
                  Don&apos;t have our bot? Add it now
                </Button>
                <p className="mt-2 text-center text-xs text-white/50">
                  The official YapIn invite link will be available after the bot is created and configured.
                </p>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  )
}
