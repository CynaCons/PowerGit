import { useEffect, useState } from "react"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"
import { OptionGroup, OptionRow } from "./OptionRow"
import { QuotedRef } from "./QuotedRef"

/** What the dialog hands back (v0.15.0): GE FormRebase's own checkboxes. */
export type RebaseFormOptions = {
  autostash: boolean
  interactive: boolean
  autosquash: boolean
  rebaseMerges: boolean
}

// Rebase on the A shell (v0.18.11): the band says "<branch> onto" and
// quotes the target's row; GE FormRebase's four checkboxes keep their
// meaning, the explanation after the dash.
export function RebaseDialog({
  open,
  ontoSha,
  currentBranch,
  dirtyCount,
  interactive: initialInteractive = false,
  onClose,
  onConfirm,
}: {
  open: boolean
  ontoSha: string
  /** Kept for callers; the band quotes the row. */
  ontoSubject?: string
  currentBranch: string
  dirtyCount: number
  /** Opened from "Rebase interactively from here…". */
  interactive?: boolean
  onClose: () => void
  onConfirm: (options: RebaseFormOptions) => Promise<void>
}) {
  const [autostash, setAutostash] = useState(false)
  const [interactive, setInteractive] = useState(initialInteractive)
  const [autosquash, setAutosquash] = useState(false)
  const [rebaseMerges, setRebaseMerges] = useState(false)

  useEffect(() => {
    if (!open) return
    // Git refuses every rebase with tracked local changes, unlike merge.
    setAutostash(dirtyCount > 0)
    setInteractive(initialInteractive)
    setAutosquash(false)
    setRebaseMerges(false)
  }, [open, initialInteractive, dirtyCount])

  const { busy, error, submit, dirty, retryWithStash } = useActionDialog({
    open,
    label: "rebase",
    action: (retryAutostash) =>
      onConfirm({
        autostash: retryAutostash || autostash,
        interactive,
        autosquash: interactive && autosquash,
        rebaseMerges,
      }),
    onClose,
  })

  return (
    <OpDialog
      open={open}
      title="Rebase"
      onClose={onClose}
      testid="rebase-dialog"
      subject={<QuotedRef name={currentBranch} kind="local" caption="onto" tip={ontoSha} />}
      busy={busy}
      secondary={
        dirty
          ? { label: "Stash and retry", onClick: () => void retryWithStash(), testid: "rebase-stash-retry" }
          : undefined
      }
      primary={{
        label: interactive ? "Edit todo…" : "Rebase",
        onClick: () => void submit(),
        testid: "rebase-confirm",
      }}
    >
      <div className="op-meta">
        Commits unique to {currentBranch} are replayed. If one conflicts, the rebase stops and a banner offers Resolve /
        Continue / Skip / Abort.
      </div>
      <OptionGroup>
        <OptionRow
          kind="checkbox"
          checked={autostash}
          onChange={setAutostash}
          label="Auto stash"
          explain={
            dirtyCount > 0
              ? "required while local changes are present; restore them after"
              : "set uncommitted changes aside, restore them after"
          }
          testid="rebase-autostash"
        />
        <OptionRow
          kind="checkbox"
          checked={interactive}
          onChange={setInteractive}
          label="Interactive"
          explain="edit the list of commits first"
          testid="rebase-interactive"
        />
        <OptionRow
          // git only honours --autosquash on an interactive rebase, so GE
          // greys it out with Interactive off rather than hiding it.
          kind="checkbox"
          checked={autosquash}
          disabled={!interactive}
          onChange={setAutosquash}
          label="Autosquash"
          explain="order fixup!/squash! commits under their target"
          testid="rebase-autosquash"
        />
        <OptionRow
          kind="checkbox"
          checked={rebaseMerges}
          onChange={setRebaseMerges}
          label="Rebase merges"
          explain="keep the branch structure"
          testid="rebase-merges"
        />
      </OptionGroup>
      <OpError error={error} />
    </OpDialog>
  )
}
