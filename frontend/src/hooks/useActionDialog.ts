import { useEffect, useState } from "react"
import { describeThrown } from "../engine"

export type ActionDialogOptions = {
  open: boolean
  // Operation name for the inline error ("checkout failed: …").
  label: string
  action: () => Promise<void>
  onClose: () => void
}

// The busy/error shape every git-operation dialog shares: the error resets
// when the dialog opens, `submit` runs the action, closes on success and
// surfaces a failed/conflicted op inline otherwise. `busy` is exposed for
// dialogs that disable their buttons while the request is in flight.
export function useActionDialog({ open, label, action, onClose }: ActionDialogOptions) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  async function submit() {
    setBusy(true)
    try {
      await action()
      onClose()
    } catch (e) {
      setError(`${label} failed: ${describeThrown(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return { busy, error, setError, submit }
}
