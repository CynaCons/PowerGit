import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import type { RepoStatus } from "../engine"
import { operationHeadline } from "./operationText"

// The strip that says the repository is in the middle of something (v0.15.0).
// Git Extensions puts the same information in FormBrowse's toolbar ("There
// are unresolved merge conflicts", "Continue rebase", "Abort"); PowerGit
// puts it directly under the error banner, above the graph, because a
// stopped merge or rebase is a state the user has to leave, not an error
// that scrolls past. Every button here is one of the operation's exits.

export function OperationBanner({
  status,
  busy,
  onResolve,
  onContinue,
  onSkip,
  onAbort,
}: {
  status: RepoStatus | null
  busy?: boolean
  onResolve: () => void
  onContinue: () => void
  onSkip: () => void
  onAbort: () => void
}) {
  const state = status?.state ?? "none"
  if (!status || state === "none") return null
  const conflicts = status.conflicts ?? []
  const merging = state === "merging"
  // Skip is a sequencer verb: there is nothing to skip in a merge.
  const skippable = state === "rebasing" || state === "cherry-picking" || state === "reverting"
  const unresolved = conflicts.length > 0

  return (
    <Alert
      data-testid="op-banner"
      data-state={state}
      data-conflicts={conflicts.length}
      severity={unresolved ? "warning" : "info"}
      icon={false}
      sx={{ borderRadius: 0, py: 0.25, "& .MuiAlert-message": { width: "100%", py: 0.5 } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", width: "100%" }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {operationHeadline(status)}
        </Typography>
        {unresolved && (
          <Typography data-testid="op-conflict-count" variant="body2" color="text.secondary">
            {`Unresolved conflicts (${conflicts.length} file${conflicts.length === 1 ? "" : "s"})`}
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {unresolved && (
          <Button size="small" variant="contained" data-testid="op-resolve" disabled={busy} onClick={onResolve}>
            Resolve conflicts…
          </Button>
        )}
        <Button
          size="small"
          variant={unresolved ? "text" : "contained"}
          data-testid="op-continue"
          // git refuses to continue with unmerged paths; saying so with a
          // disabled button beats surfacing its error afterwards.
          disabled={busy || unresolved}
          title={unresolved ? "Resolve the conflicts first." : undefined}
          onClick={onContinue}
        >
          {merging ? "Commit merge" : "Continue"}
        </Button>
        {skippable && (
          <Button size="small" data-testid="op-skip" disabled={busy} onClick={onSkip}>
            Skip
          </Button>
        )}
        <Button size="small" color="error" data-testid="op-abort" disabled={busy} onClick={onAbort}>
          Abort
        </Button>
      </Box>
    </Alert>
  )
}
