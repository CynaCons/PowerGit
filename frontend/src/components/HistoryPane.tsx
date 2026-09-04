import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import type { GraphRow } from "../graph/types"
import type { SessionView } from "../session/state"
import { EmptyState, ErrorState, LoadingState } from "./AsyncState"
import { RevisionGrid } from "./RevisionGrid"

export type HistoryPaneProps = {
  rows: GraphRow[]
  selected: number
  loadingTail: boolean
  /** Initial load of this repository (no rows yet); a background refresh keeps the rows. */
  loading: boolean
  engineError: string | null
  view: SessionView
  onSelect: (index: number) => void
  onNearEnd: () => void
  onRowContextMenu: (e: React.MouseEvent, index: number) => void
  onRetry: () => void
  onOpenRepo: () => void
  onRecover: () => void
}

// The revision grid with its empty/error state on top. v0.13.12: the empty
// state names the session phase (starting, no repository, recovering,
// stopped, demo) with its own primary action instead of one generic line.
export function HistoryPane({
  rows,
  selected,
  loadingTail,
  loading,
  engineError,
  view,
  onSelect,
  onNearEnd,
  onRowContextMenu,
  onRetry,
  onOpenRepo,
  onRecover,
}: HistoryPaneProps) {
  const empty = rows.length === 0 && !loadingTail
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }} component="div">
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        {empty && (
          <Box data-testid="grid-empty" sx={{ p: 3, display: "flex", justifyContent: "center" }}>
            {engineError && view.live ? (
              <ErrorState message={`Could not load history. ${engineError}`} onRetry={onRetry} testid="grid-error" />
            ) : loading ? (
              <LoadingState label="Loading history…" testid="grid-loading" />
            ) : view.booting ? (
              <LoadingState label={view.statusText} testid="grid-starting" />
            ) : view.offline ? (
              <ErrorState
                message={view.statusText}
                onRetry={onRecover}
                retryLabel="Connection details…"
                testid="grid-offline"
              />
            ) : view.live ? (
              <EmptyState text="This repository has no commits yet." testid="grid-no-commits" />
            ) : (
              <EmptyState
                text="Open a repository to see its history."
                testid="grid-no-repo"
                action={
                  <Button size="small" variant="outlined" onClick={onOpenRepo} data-testid="grid-open-repo">
                    Open repository…
                  </Button>
                }
              />
            )}
          </Box>
        )}
        <RevisionGrid
          rows={rows}
          selected={selected}
          onSelect={onSelect}
          loadingTail={loadingTail}
          onNearEnd={onNearEnd}
          onRowContextMenu={onRowContextMenu}
        />
      </Box>
    </Box>
  )
}

// Placeholder strip shown where the ref panel was, with a handle to bring it
// back.
export function CollapsedLeftPanel({ onExpand }: { onExpand: () => void }) {
  return (
    <Box
      data-testid="left-panel-collapsed"
      sx={{
        width: 36,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 1,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
      }}
    >
      <IconButton size="small" data-testid="left-panel-expand" onClick={onExpand} aria-label="Expand panel">
        <ChevronRightIcon />
      </IconButton>
      <Typography
        variant="caption"
        sx={{ writingMode: "vertical-rl", mt: 1, color: "text.secondary", letterSpacing: 1, userSelect: "none" }}
      >
        Repository
      </Typography>
    </Box>
  )
}
