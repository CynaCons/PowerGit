import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Radio from "@mui/material/Radio"
import RadioGroup from "@mui/material/RadioGroup"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import type { MergeOptions } from "../../engine"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"

// Git Extensions FormMergeBranch, option for option: the branch to merge,
// the three fast-forward choices in GE's own words, squash, and the message
// override. `--autostash` is PowerGit's addition, because the engine never
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
  const first = branch ?? branchOptions.find((b) => b !== currentBranch) ?? ""
  const [selected, setSelected] = useState(first)
  const [ff, setFf] = useState<MergeFf>("allow")
  const [squash, setSquash] = useState(false)
  const [autostash, setAutostash] = useState(false)
  const [useMessage, setUseMessage] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!open) return
    setSelected(first)
    setFf("allow")
    setSquash(false)
    setAutostash(false)
    setUseMessage(false)
    setMessage("")
  }, [open, first])

  const { busy, error, submit } = useActionDialog({
    open,
    label: "merge",
    action: () =>
      onConfirm({
        branch: selected,
        // GE greys fast-forward out for a squash merge: a squash never
        // creates a merge commit, so "always create one" is meaningless.
        ff: squash ? "allow" : ff,
        squash,
        message: useMessage && message.trim() ? message.trim() : null,
        autostash,
        noCommit: false,
      }),
    onClose,
  })

  return (
    <OpDialog
      open={open}
      title={`Merge into '${currentBranch}'`}
      onClose={onClose}
      testid="merge-dialog"
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submit} disabled={busy || !selected} data-testid="merge-confirm">
            {busy ? "Merging…" : "Merge"}
          </Button>
        </>
      }
    >
      {/* A native select: it is the one control a person and a test can
          both operate without a portal in the way. */}
      <TextField
        select
        size="small"
        label="Merge branch"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        slotProps={{
          select: { native: true },
          htmlInput: { "data-testid": "merge-branch" },
          inputLabel: { shrink: true },
        }}
      >
        {branchOptions
          .filter((b) => b !== currentBranch)
          .map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
      </TextField>

      <RadioGroup data-testid="merge-ff" value={ff} onChange={(e) => setFf(e.target.value as MergeFf)}>
        <FormControlLabel
          value="allow"
          disabled={squash}
          control={<Radio size="small" data-testid="merge-ff-allow" />}
          label="Keep a single branch line if possible (fast forward)"
        />
        <FormControlLabel
          value="no"
          disabled={squash}
          control={<Radio size="small" data-testid="merge-ff-no" />}
          label="Always create a new merge commit"
        />
        <FormControlLabel
          value="only"
          disabled={squash}
          control={<Radio size="small" data-testid="merge-ff-only" />}
          label="Only fast forward — refuse if a merge commit would be needed"
        />
      </RadioGroup>

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={squash}
            data-testid="merge-squash"
            onChange={(e) => setSquash(e.target.checked)}
          />
        }
        label="Squash commits (stage the result, do not commit)"
      />
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={autostash}
            data-testid="merge-autostash"
            onChange={(e) => setAutostash(e.target.checked)}
          />
        }
        label={
          dirtyCount > 0
            ? `Auto stash — set aside ${dirtyCount} uncommitted change(s) and restore them after`
            : "Auto stash uncommitted changes"
        }
      />
      {dirtyCount > 0 && !autostash && (
        <Typography variant="body2" color="warning.main">
          The working tree has {dirtyCount} uncommitted change(s); git refuses to merge over them without auto stash.
        </Typography>
      )}

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={useMessage}
            data-testid="merge-message-toggle"
            onChange={(e) => setUseMessage(e.target.checked)}
          />
        }
        label="Specify merge message"
      />
      {useMessage && (
        <TextField
          size="small"
          multiline
          minRows={2}
          label="Merge message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          slotProps={{ htmlInput: { "data-testid": "merge-message" } }}
        />
      )}
      <OpError error={error} />
    </OpDialog>
  )
}
