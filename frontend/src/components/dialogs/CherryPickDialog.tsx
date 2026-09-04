import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { cherryPickCommit } from "../../engine"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"

// Cherry-pick and revert act on a single commit with no extra options, so
// unlike Checkout/Reset/Rebase they call the engine directly instead of
// through an App-supplied onConfirm: `busy` disables the actions while the
// request is in flight and `error` surfaces a failed/conflicted op inline.
export function CherryPickDialog({
  open,
  commit,
  subject,
  onClose,
}: {
  open: boolean
  commit: string
  subject?: string
  onClose: () => void
}) {
  const { busy, error, submit } = useActionDialog({
    open,
    label: "cherry-pick",
    action: () => cherryPickCommit(commit).then(() => undefined),
    onClose,
  })

  return (
    <OpDialog
      open={open}
      title={`Cherry-pick ${commit.slice(0, 7)}${subject ? ` (${subject})` : ""}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submit} disabled={busy} data-testid="cherry-pick-confirm">
            {busy ? "Cherry-picking…" : "Cherry-pick"}
          </Button>
        </>
      }
    >
      <Typography variant="body2">
        Apply commit{" "}
        <Box component="span" sx={{ fontFamily: "Fira Code, ui-monospace, monospace" }}>
          {commit.slice(0, 7)}
        </Box>
        {subject ? ` (${subject})` : ""} onto the current branch.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        If conflicts occur, the cherry-pick is aborted and your branch stays untouched.
      </Typography>
      <OpError error={error} />
    </OpDialog>
  )
}
