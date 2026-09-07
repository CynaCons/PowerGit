import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import LinearProgress from "@mui/material/LinearProgress"
import Typography from "@mui/material/Typography"
import { revealInFolder, type SnapshotResult } from "../diagnostics/snapshot"
import { MONO_FONT } from "../theme"
import { copyToClipboard } from "./clipboard"

export type SnapshotState =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "done"; result: SnapshotResult }
  | { phase: "error"; message: string }

// Result of "Diagnostic snapshot" (v0.14.1). In the shell: where the zip
// went, with Copy path and Show in folder. In the browser: the JSON dump to
// copy. The text is data about this machine (paths, commit subjects, log
// lines), nothing more; the dialog says so.
export function SnapshotDialog({ state, onClose }: { state: SnapshotState; onClose: () => void }) {
  const open = state.phase !== "idle"
  return (
    <Dialog
      open={open}
      onClose={state.phase === "working" ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      data-testid="snapshot-dialog"
    >
      <DialogTitle>Diagnostic snapshot</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {state.phase === "working" && (
          <>
            <Typography variant="body2">Collecting logs and engine state…</Typography>
            <LinearProgress />
          </>
        )}
        {state.phase === "error" && (
          <Typography variant="body2" color="error" data-testid="snapshot-error">
            {state.message}
          </Typography>
        )}
        {state.phase === "done" && state.result.kind === "file" && (
          <>
            <Typography variant="body2">Saved. Attach this file when you report the problem:</Typography>
            <Typography
              variant="body2"
              sx={{ fontFamily: MONO_FONT, wordBreak: "break-all" }}
              data-testid="snapshot-path"
            >
              {state.result.path}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              It holds the app and engine logs, repository paths and commit subjects, and the engine's state. No file
              contents.
            </Typography>
          </>
        )}
        {state.phase === "done" && state.result.kind === "text" && (
          <>
            <Typography variant="body2">
              No desktop shell here, so this is the page's part of the snapshot. Copy it:
            </Typography>
            <Box
              component="pre"
              data-testid="snapshot-dump"
              sx={{
                m: 0,
                p: 1,
                maxHeight: 320,
                overflow: "auto",
                fontFamily: MONO_FONT,
                fontSize: 11.5,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {state.result.text}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {state.phase === "done" && state.result.kind === "file" && (
          <>
            <Button onClick={() => void copyToClipboard((state.result as { path: string }).path)}>Copy path</Button>
            <Button onClick={() => void revealInFolder((state.result as { path: string }).path)}>Show in folder</Button>
          </>
        )}
        {state.phase === "done" && state.result.kind === "text" && (
          <Button onClick={() => void copyToClipboard((state.result as { text: string }).text)}>Copy</Button>
        )}
        <Button onClick={onClose} disabled={state.phase === "working"} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
