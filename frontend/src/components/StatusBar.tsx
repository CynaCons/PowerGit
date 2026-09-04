import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import Typography from "@mui/material/Typography"
import type { Health, RepoInfo, RepoStatus } from "../engine"

export type StatusBarProps = {
  live: boolean
  offline: boolean
  repo: RepoInfo | null
  status: RepoStatus | null
  health: Health | null
  dirty: number
  progressLabel: string | null
}

// Status bar. This used to be squeezed into the right-hand end of the
// toolbar, where it was truncated to unreadable stubs ("powe... 0...
// (14 chan... git version 2.38.1...") at every window size, and it stole the
// width the buttons needed. A dedicated bottom bar is what Git
// Extensions and every IDE does, and it gives the repo state a place
// that cannot run out of room: branch and dirty count are pinned left,
// the build info is the only thing allowed to be elided.
//
// Git Extensions status strip: branch, ahead/behind vs upstream, dirty
// count; engine build info stays muted at the far right. The dirty count is
// always parenthesized (even "(0 changes)") so `engine-status` keeps a "("
// once a repo is live, which several e2e specs use as a "real repo data has
// loaded" signal regardless of upstream/dirty state.
export function StatusBar({ live, offline, repo, status, health, dirty, progressLabel }: StatusBarProps) {
  return (
    <Box
      data-testid="engine-status"
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
      {live && repo ? (
        <>
          <Typography data-testid="status-branch" variant="caption" noWrap sx={{ fontWeight: 700, flexShrink: 0 }}>
            {repo.branch}
          </Typography>
          {status?.ahead != null && status?.behind != null && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
              {`↑${status.ahead} ↓${status.behind}`}
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
            {`(${dirty} change${dirty === 1 ? "" : "s"})`}
          </Typography>
        </>
      ) : (
        <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0 }}>
          {health ? "no repository" : offline ? "sample data — connect an engine for real repositories" : "connecting…"}
        </Typography>
      )}
      {/* Long-running work reports here, the way VS Code does, rather than
          floating over the toolbar buttons. */}
      {progressLabel !== null && (
        <Box
          data-testid="topbar-progress"
          sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, pointerEvents: "none" }}
        >
          <CircularProgress size={12} thickness={5} />
          <Typography variant="caption" color="text.secondary" noWrap>
            {progressLabel}
          </Typography>
        </Box>
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
