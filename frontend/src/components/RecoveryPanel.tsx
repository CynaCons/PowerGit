import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import DialogTitle from "@mui/material/DialogTitle"
import Typography from "@mui/material/Typography"
import { useSyncExternalStore } from "react"
import { diagnosticsSnapshot, formatDiagnostics, getEngineLogPath, subscribeDiagnostics } from "../diagnostics"
import type { SessionPhase, SessionView } from "../session/state"
import { copyToClipboard } from "./clipboard"

const COPY: Record<SessionPhase["phase"], { title: string; body: string }> = {
  starting: { title: "Connecting to the engine", body: "The git engine is starting. This normally takes a second." },
  demo: { title: "Demo mode", body: "This build shows sample data. Nothing here is a real repository." },
  "no-repository": { title: "No repository open", body: "Open a repository to see its history." },
  ready: { title: "Connected", body: "" },
  busy: { title: "Connected", body: "" },
  recovering: {
    title: "Engine unreachable",
    body: "The git engine stopped answering. PowerGit keeps the last data it loaded and reconnects on its own; your repository is untouched.",
  },
  "engine-failed": {
    title: "The engine stopped",
    body: "The git engine process exited and could not be restarted. The log below has the reason; retry restarts it.",
  },
}

/**
 * v0.13.11: the accessible recovery surface for every non-ready phase.
 * Distinct copy per phase, the one primary action that applies, and the
 * retained diagnostics (recent transport failures, sidecar exit status,
 * unhandled errors) plus the engine log path, all copyable.
 */
export function RecoveryPanel({
  open,
  phase,
  view,
  onClose,
  onRetry,
  onOpenRepository,
}: {
  open: boolean
  phase: SessionPhase
  view: SessionView
  onClose: () => void
  onRetry: () => void
  onOpenRepository: () => void
}) {
  const entries = useSyncExternalStore(subscribeDiagnostics, diagnosticsSnapshot, diagnosticsSnapshot)
  const copy = COPY[phase.phase]
  const logPath = (phase.phase === "engine-failed" && phase.log) || getEngineLogPath()
  const reason = "reason" in phase ? phase.reason : phase.phase === "no-repository" ? phase.lastError : null
  const recent = entries.slice(-12)
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      data-testid="recovery-panel"
      aria-labelledby="recovery-title"
    >
      <DialogTitle id="recovery-title">{copy.title}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Typography variant="body2">{copy.body}</Typography>
        {reason && (
          <Typography variant="body2" color="error" data-testid="recovery-reason" sx={{ wordBreak: "break-word" }}>
            {reason}
          </Typography>
        )}
        {view.repo && (
          <Typography variant="body2" color="text.secondary">
            Last repository: {view.repo.name} ({view.repo.root})
          </Typography>
        )}
        {logPath && (
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
            Engine log: {logPath}
          </Typography>
        )}
        <Box
          data-testid="recovery-diagnostics"
          sx={{
            maxHeight: 200,
            overflow: "auto",
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            p: 1,
            fontFamily: "var(--pg-font-mono)",
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {recent.length === 0
            ? "No diagnostics recorded."
            : recent.map((e, i) => (
                <div key={i}>
                  {e.at.slice(11, 19)} [{e.level}] {e.source}: {e.message}
                </div>
              ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => void copyToClipboard(formatDiagnostics())}>Copy diagnostics</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
        {view.primaryAction === "open-repository" && (
          <Button variant="contained" onClick={onOpenRepository} data-testid="recovery-open-repo">
            Open repository…
          </Button>
        )}
        {(view.primaryAction === "retry" || view.primaryAction === "diagnostics") && (
          <Button variant="contained" onClick={onRetry} data-testid="recovery-retry">
            Retry now
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
