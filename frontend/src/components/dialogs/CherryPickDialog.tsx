import { useEngine } from "../../engine"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"
import { QuotedRow } from "./QuotedRow"

// Cherry-pick and revert act on a single commit with no extra options, so
// unlike Checkout/Reset/Rebase they call the engine directly instead of
// through an App-supplied onConfirm: `busy` disables the actions while the
// request is in flight and `error` surfaces a failed/conflicted op inline.
// v0.18.11: on the A shell — the commit quoted as its row, one line of copy.
export function CherryPickDialog({
  open,
  commit,
  onClose,
}: {
  open: boolean
  commit: string
  /** Kept for callers; the band quotes the row. */
  subject?: string
  onClose: () => void
}) {
  const engine = useEngine()
  const { busy, error, submit, dirty, retryWithStash } = useActionDialog({
    open,
    label: "cherry-pick",
    action: (autostash) => engine.cherryPick(commit, autostash).then(() => undefined),
    onClose,
  })

  return (
    <OpDialog
      open={open}
      title="Cherry-pick"
      onClose={onClose}
      testid="cherry-pick-dialog"
      subject={<QuotedRow sha={commit} />}
      busy={busy}
      secondary={
        dirty
          ? { label: "Stash and retry", onClick: () => void retryWithStash(), testid: "cherry-pick-stash-retry" }
          : undefined
      }
      primary={{ label: "Cherry-pick", onClick: () => void submit(), testid: "cherry-pick-confirm" }}
    >
      <div className="op-text">Applies the commit's changes as a new commit on the current branch.</div>
      <div className="op-meta">
        If it conflicts, the cherry-pick stops and a banner offers Resolve / Continue / Skip / Abort.
      </div>
      <OpError error={error} />
    </OpDialog>
  )
}
