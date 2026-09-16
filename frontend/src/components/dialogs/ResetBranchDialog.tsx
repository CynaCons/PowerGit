import { useEffect, useState } from "react"
import { useEngine } from "../../engine"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"
import { OptionGroup, OptionRow } from "./OptionRow"
import { QuotedRef } from "./QuotedRef"
import { refTarget, useQuote } from "./quoteContext"

export type ResetMode = "soft" | "mixed" | "hard"

// Reset on the A shell (v0.18.11): the band says "<branch> moves from
// <head> to" and quotes the target's row; Soft / Mixed / Hard carry their
// consequence after the dash (the commit count from the engine's
// divergence); Hard turns the primary red and puts the discarded change
// count in it.
export function ResetBranchDialog({
  open,
  commit,
  currentBranch,
  dirtyCount,
  initialMode = "mixed",
  onClose,
  onConfirm,
}: {
  open: boolean
  commit: string
  /** Kept for callers; the band quotes the row. */
  subject?: string
  currentBranch: string
  dirtyCount: number
  /** Preselected mode when the menu already said which one (v0.15.0). */
  initialMode?: ResetMode
  onClose: () => void
  onConfirm: (mode: ResetMode) => Promise<void>
}) {
  const engine = useEngine()
  const { refs } = useQuote()
  const [mode, setMode] = useState<ResetMode>(initialMode)
  const [behind, setBehind] = useState<number | null>(null)
  const { busy, error, submit } = useActionDialog({ open, label: "reset", action: () => onConfirm(mode), onClose })
  const head = refTarget(refs, currentBranch)

  useEffect(() => {
    if (open) setMode(initialMode)
  }, [open, initialMode])

  // How many commits the branch leaves behind: HEAD's commits the target does not reach.
  useEffect(() => {
    if (!open || !currentBranch) return
    let cancelled = false
    setBehind(null)
    engine
      .divergence(currentBranch, commit)
      .then((d) => !cancelled && setBehind(d.ahead))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [engine, open, currentBranch, commit])

  const sha = commit.slice(0, 7)
  const n = behind ?? 0
  const commits = n === 1 ? "the commit's" : n > 1 ? `the ${n} commits'` : "the"
  const hard = mode === "hard"
  const label = hard
    ? dirtyCount > 0
      ? `Reset and discard ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`
      : "Reset hard"
    : "Reset branch"

  return (
    <OpDialog
      open={open}
      title="Reset branch"
      onClose={onClose}
      testid="reset-dialog"
      subject={
        <QuotedRef
          name={currentBranch}
          kind="local"
          caption={
            <>
              moves from <span className="mono">{head ? head.slice(0, 7) : "HEAD"}</span> to
            </>
          }
          tip={commit}
        />
      }
      busy={busy}
      primary={{ label, onClick: () => void submit(), danger: hard, testid: "reset-confirm" }}
    >
      <OptionGroup testid="reset-mode">
        <OptionRow
          kind="radio"
          name="reset-mode"
          value="soft"
          checked={mode === "soft"}
          onChange={() => setMode("soft")}
          label="Soft"
          explain={`${commits} changes stay staged`}
          testid="reset-mode-soft"
        />
        <OptionRow
          kind="radio"
          name="reset-mode"
          value="mixed"
          checked={mode === "mixed"}
          onChange={() => setMode("mixed")}
          label="Mixed"
          explain={`${n > 0 ? "their" : "the"} changes stay in the working tree, unstaged`}
          testid="reset-mode-mixed"
        />
        <OptionRow
          kind="radio"
          name="reset-mode"
          value="hard"
          checked={hard}
          onChange={() => setMode("hard")}
          label="Hard"
          explain={`the working tree matches ${sha}; uncommitted changes are discarded`}
          testid="reset-mode-hard"
        />
      </OptionGroup>
      <OpError error={error} />
    </OpDialog>
  )
}
