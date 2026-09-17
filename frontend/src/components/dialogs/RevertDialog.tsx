import { useEngine } from "../../engine"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"
import { QuotedRow } from "./QuotedRow"

// Revert on the A shell (v0.18.11): the commit quoted as its row, one line
// of copy; the engine is called directly like the cherry-pick.
export function RevertDialog({
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
    label: "revert",
    action: (autostash) => engine.revert(commit, autostash).then(() => undefined),
    onClose,
  })

  return (
    <OpDialog
      open={open}
      title="Revert"
      onClose={onClose}
      testid="revert-dialog"
      subject={<QuotedRow sha={commit} />}
      busy={busy}
      secondary={
        dirty
          ? { label: "Stash and retry", onClick: () => void retryWithStash(), testid: "revert-stash-retry" }
          : undefined
      }
      primary={{ label: "Revert", onClick: () => void submit(), testid: "revert-confirm" }}
    >
      <div className="op-text">Creates a new commit that undoes the commit's changes on the current branch.</div>
      <div className="op-meta">
        If it conflicts, the revert stops and a banner offers Resolve / Continue / Skip / Abort.
      </div>
      <OpError error={error} />
    </OpDialog>
  )
}
