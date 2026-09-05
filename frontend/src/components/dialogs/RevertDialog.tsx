import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useEngine } from "../../engine"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"
import { MONO_FONT } from "../../theme"

export function RevertDialog({
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
  const engine = useEngine()
  const { busy, error, submit } = useActionDialog({
    open,
    label: "revert",
    action: () => engine.revert(commit).then(() => undefined),
    onClose,
  })

  return (
    <OpDialog
      open={open}
      title={`Revert ${commit.slice(0, 7)}${subject ? ` (${subject})` : ""}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submit} disabled={busy} data-testid="revert-confirm">
            {busy ? "Reverting…" : "Revert"}
          </Button>
        </>
      }
    >
      <Typography variant="body2">
        Create a new commit that undoes{" "}
        <Box component="span" sx={{ fontFamily: MONO_FONT }}>
          {commit.slice(0, 7)}
        </Box>
        {subject ? ` (${subject})` : ""}.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        If conflicts occur, the revert is aborted and your branch stays untouched.
      </Typography>
      <OpError error={error} />
    </OpDialog>
  )
}
