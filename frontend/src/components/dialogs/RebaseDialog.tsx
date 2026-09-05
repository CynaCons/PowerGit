import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"
import { MONO_FONT } from "../../theme"

export function RebaseDialog({
  open,
  ontoSha,
  ontoSubject,
  currentBranch,
  onClose,
  onConfirm,
}: {
  open: boolean
  ontoSha: string
  ontoSubject?: string
  currentBranch: string
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const { error, submit } = useActionDialog({ open, label: "rebase", action: onConfirm, onClose })

  return (
    <OpDialog
      open={open}
      title={`Rebase '${currentBranch}'`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={submit} data-testid="rebase-confirm">
            Rebase
          </Button>
        </>
      }
    >
      <Typography variant="body2">
        Rebase the current branch <strong>{currentBranch}</strong> onto{" "}
        <Box component="span" sx={{ fontFamily: MONO_FONT }}>
          {ontoSha.slice(0, 7)}
        </Box>
        {ontoSubject ? ` (${ontoSubject})` : ""}.
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Commits unique to {currentBranch} will be replayed. If conflicts occur, the rebase is aborted and your branch
        stays untouched.
      </Typography>
      <OpError error={error} />
    </OpDialog>
  )
}
