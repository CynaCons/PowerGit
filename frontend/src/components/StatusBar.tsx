import Box from "@mui/material/Box"
import ButtonBase from "@mui/material/ButtonBase"
import CircularProgress from "@mui/material/CircularProgress"
import Typography from "@mui/material/Typography"
import type { RepoStatus } from "../engine"
import type { SessionView } from "../session/state"

export type StatusBarProps = {
  view: SessionView
  status: RepoStatus | null
  dirty: number
  /** Background refresh in progress while the last valid data stays visible. */
  refreshing: boolean
  progressLabel: string | null
  /** Opens the operation detail (v0.13.12). */
  onOpenJobs: () => void
  /** Opens the recovery panel when the session is not ready. */
  onOpenRecovery: () => void
}

// Git Extensions status strip: branch, ahead/behind vs upstream, dirty
// count; engine build info stays muted at the far right. The dirty count is
// always parenthesized (even "(0 changes)") so `engine-status` keeps a "("
// once a repo is live, which several e2e specs use as a "real repo data has
// loaded" signal regardless of upstream/dirty state.
//
// v0.13.12: what the bar says comes from the session state machine, one
// phrase per phase (connecting / no repository / recovering / stopped /
// demo), announced through a polite live region; job progress is a button
// that opens the operation detail instead of an anonymous spinner.
export function StatusBar({
  view,
  status,
  dirty,
  refreshing,
  progressLabel,
  onOpenJobs,
  onOpenRecovery,
}: StatusBarProps) {
  const { live, repo, health, statusText, primaryAction } = view
  const showRepo = live && repo
  return (
    <Box
      data-testid="engine-status"
      data-phase={
        view.demo ? "demo" : view.offline ? "offline" : live ? "live" : view.booting ? "starting" : "no-repository"
      }
      component="footer"
      sx={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        height: 24,
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      {showRepo ? (
        <>
          <Typography data-testid="status-branch" variant="caption" noWrap sx={{ fontWeight: 700, flexShrink: 0 }}>
            {repo.branch}
          </Typography>
          {status?.ahead != null && status?.behind != null && (
            <Typography
              variant="caption"
              color="text.secondary"
              noWrap
              sx={{ flexShrink: 0 }}
              title={status.upstream ? `vs ${status.upstream}` : undefined}
            >
              {`↑${status.ahead} ↓${status.behind}`}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
            {`(${dirty} change${dirty === 1 ? "" : "s"})`}
          </Typography>
          {refreshing && (
            <Typography
              data-testid="status-refreshing"
              variant="caption"
              color="text.disabled"
              noWrap
              sx={{ flexShrink: 0 }}
            >
              refreshing…
            </Typography>
          )}
        </>
      ) : primaryAction ? (
        <ButtonBase
          data-testid="status-session"
          onClick={onOpenRecovery}
          sx={{
            font: "inherit",
            color: view.offline ? "error.main" : "text.secondary",
            fontSize: 12,
            borderRadius: 0.5,
            px: 0.5,
          }}
          aria-label={`${statusText}. Open connection details`}
        >
          {statusText}
        </ButtonBase>
      ) : (
        <Typography data-testid="status-session" variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
          {statusText}
        </Typography>
      )}
      {/* Screen readers hear connection changes without focus moving. */}
      <Box
        role="status"
        aria-live="polite"
        sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}
      >
        {showRepo ? `Repository ${repo.name} on ${repo.branch}` : statusText}
        {progressLabel ? `. ${progressLabel}` : ""}
      </Box>
      {/* Long-running work reports here, the way VS Code does, rather than
          floating over the toolbar buttons. Clicking opens the detail. */}
      {progressLabel !== null && (
        <ButtonBase
          data-testid="topbar-progress"
          onClick={onOpenJobs}
          aria-label={`${progressLabel} — open operation details`}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            minWidth: 0,
            font: "inherit",
            borderRadius: 0.5,
            px: 0.5,
          }}
        >
          <CircularProgress size={12} thickness={5} />
          <Typography variant="caption" color="text.secondary" noWrap>
            {progressLabel}
          </Typography>
        </ButtonBase>
      )}
      {health && (
        <Typography
          data-testid="status-build"
          variant="caption"
          color="text.disabled"
          noWrap
          sx={{ ml: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {`${health.gitVersion} · engine ${health.engine}`}
        </Typography>
      )}
    </Box>
  )
}
