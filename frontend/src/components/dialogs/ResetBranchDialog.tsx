import Button from "@mui/material/Button"
import FormControlLabel from "@mui/material/FormControlLabel"
import Radio from "@mui/material/Radio"
import RadioGroup from "@mui/material/RadioGroup"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"

export type ResetMode = "soft" | "mixed" | "hard"

export function ResetBranchDialog({
  open,
  commit,
  subject,
  currentBranch,
  dirtyCount,
  onClose,
  onConfirm,
}: {
  open: boolean
  commit: string
  subject?: string
  currentBranch: string
  dirtyCount: number
  onClose: () => void
  onConfirm: (mode: ResetMode) => Promise<void>
}) {
  const [mode, setMode] = useState<ResetMode>("mixed")
  const { error, submit } = useActionDialog({ open, label: "reset", action: () => onConfirm(mode), onClose })

  useEffect(() => {
    if (open) setMode("mixed")
  }, [open])

  return (
    <OpDialog
      open={open}
      title={`Reset branch '${currentBranch}' to ${commit.slice(0, 7)}${subject ? ` (${subject})` : ""}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="contained"
            color={mode === "hard" ? "error" : "primary"}
            onClick={submit}
            data-testid="reset-confirm"
          >
            Reset
          </Button>
        </>
      }
    >
      <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as ResetMode)}>
        <FormControlLabel value="soft" control={<Radio size="small" />} label="Soft — keep all changes staged" />
        <FormControlLabel value="mixed" control={<Radio size="small" />} label="Mixed — keep changes in working tree" />
        <FormControlLabel
          value="hard"
          control={<Radio size="small" />}
          label="Hard — discard all working tree changes"
        />
      </RadioGroup>
      {mode === "hard" && (
        <Typography variant="body2" color="warning.main">
          Warning: hard reset permanently discards{dirtyCount > 0 ? ` ${dirtyCount}` : " all"} uncommitted change(s).
          This cannot be undone.
        </Typography>
      )}
      <OpError error={error} />
    </OpDialog>
  )
}
