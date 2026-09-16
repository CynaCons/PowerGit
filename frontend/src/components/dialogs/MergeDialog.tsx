import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import { useEffect, useMemo, useState } from "react"
import type { MergeOptions } from "../../engine"
import { useActionDialog } from "../../hooks/useActionDialog"
import { BranchPicker } from "./BranchPicker"
import { Field, TextArea } from "./Field"
import { OpDialog, OpError } from "./OpDialog"
import { OptionGroup, OptionRow } from "./OptionRow"
import { QuotedRow } from "./QuotedRow"
import { refTarget, useQuote } from "./quoteContext"

// Git Extensions FormMergeBranch on the A shell (v0.18.11, 600 wide so
// nothing wraps): the band quotes the two tips with "into" between them,
// the branch is the picker (label above, the value is the chip — the
// floating MUI label the owner saw clipped is gone), then GE's options in
// the plan's words: the fast-forward radios, Squash, Auto stash, Specify
// merge message; the amber note when the tree is dirty and Auto stash is
// off. `--autostash` is PowerGit's addition, because the engine never
// prompts and a dirty tree would otherwise just fail.

export type MergeFf = MergeOptions["ff"]

export function MergeDialog({
  open,
  currentBranch,
  branch,
  branchOptions,
  dirtyCount,
  onClose,
  onConfirm,
}: {
  open: boolean
  currentBranch: string
  /** Pre-selected branch (the one right-clicked), if any. */
  branch?: string
  branchOptions: string[]
  dirtyCount: number
  onClose: () => void
  onConfirm: (options: MergeOptions) => Promise<void>
}) {
  const { refs } = useQuote()
  const first = branch ?? branchOptions.find((b) => b !== currentBranch) ?? ""
  const [selected, setSelected] = useState(first)
  const [ff, setFf] = useState<MergeFf>("allow")
  const [squash, setSquash] = useState(false)
  const [autostash, setAutostash] = useState(false)
  const [useMessage, setUseMessage] = useState(false)
  const [message, setMessage] = useState("")
  const exclude = useMemo(() => [currentBranch], [currentBranch])

  useEffect(() => {
    if (!open) return
    setSelected(first)
    setFf("allow")
    setSquash(false)
    setAutostash(false)
    setUseMessage(false)
    setMessage("")
  }, [open, first])

  const { busy, error, submit, dirty, retryWithStash } = useActionDialog({
    open,
    label: "merge",
    action: (retryAutostash) =>
      onConfirm({
        branch: selected,
        // GE greys fast-forward out for a squash merge: a squash never
        // creates a merge commit, so "always create one" is meaningless.
        ff: squash ? "allow" : ff,
        squash,
        message: useMessage && message.trim() ? message.trim() : null,
        autostash: retryAutostash || autostash,
        noCommit: false,
      }),
    onClose,
  })

  const from = refTarget(refs, selected)
  const into = refTarget(refs, currentBranch)
  const changes = dirtyCount === 1 ? "1 uncommitted change" : `${dirtyCount} uncommitted changes`

  return (
    <OpDialog
      open={open}
      title="Merge"
      onClose={onClose}
      width={600}
      testid="merge-dialog"
      subject={
        <>
          {from && <QuotedRow sha={from} />}
          <div className="op-into">
            <ArrowDownwardIcon />
            into
          </div>
          {into && <QuotedRow sha={into} />}
        </>
      }
      note={
        dirtyCount > 0 && !autostash
          ? { text: `${changes}; git refuses to merge without Auto stash.`, tone: "amber" }
          : undefined
      }
      busy={busy}
      secondary={dirty ? { label: "Stash and retry", onClick: () => void retryWithStash(), testid: "merge-stash-retry" } : undefined}
      primary={{
        label: squash ? "Squash and stage" : "Merge",
        onClick: () => void submit(),
        disabled: !selected,
        testid: "merge-confirm",
      }}
    >
      <Field label="Merge branch" testid="merge-branch-field">
        <BranchPicker
          value={selected}
          onChange={setSelected}
          exclude={exclude}
          testid="merge-branch"
          ariaLabel="Merge branch"
        />
      </Field>

      <OptionGroup label="Fast forward" testid="merge-ff">
        <OptionRow
          kind="radio"
          name="merge-ff"
          value="allow"
          checked={ff === "allow"}
          disabled={squash}
          onChange={() => setFf("allow")}
          label="Fast-forward when possible"
          testid="merge-ff-allow"
        />
        <OptionRow
          kind="radio"
          name="merge-ff"
          value="no"
          checked={ff === "no"}
          disabled={squash}
          onChange={() => setFf("no")}
          label="Always create a merge commit"
          testid="merge-ff-no"
        />
        <OptionRow
          kind="radio"
          name="merge-ff"
          value="only"
          checked={ff === "only"}
          disabled={squash}
          onChange={() => setFf("only")}
          label="Fast-forward only"
          explain="refuse otherwise"
          testid="merge-ff-only"
        />
      </OptionGroup>

      <OptionGroup>
        <OptionRow
          kind="checkbox"
          checked={squash}
          onChange={setSquash}
          label="Squash"
          explain="stage the result, do not commit"
          testid="merge-squash"
        />
        <OptionRow
          kind="checkbox"
          checked={autostash}
          onChange={setAutostash}
          label={
            dirtyCount > 0
              ? `Auto stash ${changes} and restore ${dirtyCount === 1 ? "it" : "them"} after`
              : "Auto stash uncommitted changes"
          }
          testid="merge-autostash"
        />
        <OptionRow
          kind="checkbox"
          checked={useMessage}
          onChange={setUseMessage}
          label="Specify merge message"
          testid="merge-message-toggle"
        />
      </OptionGroup>
      {useMessage && (
        <Field label="Merge message">
          <TextArea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-label="Merge message"
            data-testid="merge-message"
          />
        </Field>
      )}
      <OpError error={error} />
    </OpDialog>
  )
}
