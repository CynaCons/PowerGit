import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Typography from "@mui/material/Typography"
import { useEffect, useState } from "react"
import { useActionDialog } from "../../hooks/useActionDialog"
import { OpDialog, OpError } from "./OpDialog"
import { MONO_FONT } from "../../theme"

/** What the dialog hands back (v0.15.0): GE FormRebase's own checkboxes. */
export type RebaseFormOptions = {
  autostash: boolean
  interactive: boolean
  autosquash: boolean
  rebaseMerges: boolean
}

export function RebaseDialog({
  open,
  ontoSha,
  ontoSubject,
  currentBranch,
  interactive: initialInteractive = false,
  onClose,
  onConfirm,
}: {
  open: boolean
  ontoSha: string
  ontoSubject?: string
  currentBranch: string
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
    setAutostash(false)
    setInteractive(initialInteractive)
    setAutosquash(false)
    setRebaseMerges(false)
  }, [open, initialInteractive])

  const { busy, error, submit } = useActionDialog({
    open,
    label: "rebase",
    action: () => onConfirm({ autostash, interactive, autosquash: interactive && autosquash, rebaseMerges }),
    onClose,
  })

  return (
    <OpDialog
      open={open}
      title={`Rebase '${currentBranch}'`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submit} disabled={busy} data-testid="rebase-confirm">
            {interactive ? "Edit todo…" : "Rebase"}
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
        Commits unique to {currentBranch} will be replayed. If a commit conflicts, the rebase stops and a banner offers
        Resolve / Continue / Skip / Abort.
      </Typography>

      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={autostash}
            data-testid="rebase-autostash"
            onChange={(e) => setAutostash(e.target.checked)}
          />
        }
        label="Auto stash uncommitted changes"
      />
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={interactive}
            data-testid="rebase-interactive"
            onChange={(e) => setInteractive(e.target.checked)}
          />
        }
        label="Interactive — edit the list of commits first"
      />
      <FormControlLabel
        // git only honours --autosquash on an interactive rebase, so GE
        // greys it out with Interactive off rather than hiding it.
        disabled={!interactive}
        control={
          <Checkbox
            size="small"
            checked={autosquash}
            data-testid="rebase-autosquash"
            onChange={(e) => setAutosquash(e.target.checked)}
          />
        }
        label="Autosquash — order fixup!/squash! commits under their target"
      />
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={rebaseMerges}
            data-testid="rebase-merges"
            onChange={(e) => setRebaseMerges(e.target.checked)}
          />
        }
        label="Rebase merges — keep the branch structure"
      />
      <OpError error={error} />
    </OpDialog>
  )
}
