import { Button } from '@/components/ui/button'

type ModerationConfirmationDialogProps = {
  title: string
  description: string
  confirmLabel: string
  confirmVariant?: 'success' | 'danger' | 'primary'
  confirmDisabled?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
  children?: React.ReactNode
}

export function ModerationConfirmationDialog({
  title,
  description,
  confirmLabel,
  confirmVariant = 'primary',
  confirmDisabled = false,
  busy = false,
  onCancel,
  onConfirm,
  children,
}: ModerationConfirmationDialogProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4" role="presentation">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="moderation-confirmation-title"
        aria-describedby="moderation-confirmation-description"
        className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#15171b] p-5 shadow-2xl shadow-black/60"
      >
        <h2 id="moderation-confirmation-title" className="text-xl font-semibold text-white">{title}</h2>
        <p id="moderation-confirmation-description" className="mt-2 text-sm text-white/65">{description}</p>
        {children}
        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={confirmDisabled || busy}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </Button>
        </div>
      </section>
    </div>
  )
}
