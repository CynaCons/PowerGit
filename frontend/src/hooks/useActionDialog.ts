import { useEffect, useState } from "react"
import { describeThrown, EngineError } from "../engine"

export type ActionDialogOptions = { open: boolean; label: string; action: (autostash?: boolean) => Promise<void>; onClose: () => void }

/** Keeps an operation error in its dialog; a git dirty-tree response may retry with a tracked-file autostash. */
export function useActionDialog({ open, label, action, onClose }: ActionDialogOptions) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { if (open) { setError(null); setDirty(false) } }, [open])
  async function run(autostash = false) {
    setBusy(true)
    try { await action(autostash); onClose() }
    catch (e) { setDirty(e instanceof EngineError && e.code === "dirty"); setError(`${label} failed: ${describeThrown(e)}`) }
    finally { setBusy(false) }
  }
  return { busy, error, setError, submit: () => run(), dirty, retryWithStash: () => run(true) }
}
