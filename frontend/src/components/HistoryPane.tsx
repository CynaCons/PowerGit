import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import type { ReactNode } from "react"
import type { GraphRow } from "../graph/types"
import type { GraphNav } from "../hooks/useGraphNav"
import type { GridMenus } from "../hooks/useGridMenus"
import type { SessionView } from "../session/state"
import { EmptyState, ErrorState, LoadingState } from "./AsyncState"
import { GraphCompass } from "./GraphCompass"
import { RevisionGrid } from "./RevisionGrid"
import { paneSx } from "../theme/panels"

export type HistoryPaneProps = {
  rows: GraphRow[]
  selected: number
  loadingTail: boolean
  remoteNames?: string[]
  tagNames?: string[]
  /** The checked-out branch: its chip comes first after HEAD (v0.18.3). */
  currentBranch?: string | null
  /** Highlight ancestry (v0.18.4): this history's own root and its setter. */
  highlightRoot?: string | null
  onHighlightRoot?: (sha: string | null) => void
  /** Initial load of this repository (no rows yet); a background refresh keeps the rows. */
  loading: boolean
  engineError: string | null
  view: SessionView
  /** What an empty live list means here (v0.16.0: a path nothing touched). */
  emptyText?: string
  /** v0.18.5: the graph's ref filter chip, at the end of the Message header. */
  headerExtra?: ReactNode
  /** v0.18.12: the compass's targets and actions (useGraphNav); the file history has none. */
  nav?: GraphNav
  onSelect: (index: number) => void
  onNearEnd: () => void
  /** The row and ref-chip menus (v0.16.0, shared with the file history). */
  menus: GridMenus
  /** The selection before a right-click moves it: what "Compare selected commits" compares with. */
  selectedSha: string | null
  onRetry: () => void
  onOpenRepo: () => void
  onRecover: () => void
}

// The revision grid with its empty/error state on top. v0.13.12: the empty
// state names the session phase (starting, no repository, recovering,
// stopped, demo) with its own primary action instead of one generic line.
export function HistoryPane({
  rows,
  remoteNames,
  tagNames,
  currentBranch,
  highlightRoot,
  onHighlightRoot,
  selected,
  loadingTail,
  loading,
  engineError,
  view,
  emptyText,
  headerExtra,
  nav,
  onSelect,
  onNearEnd,
  menus,
  selectedSha,
  onRetry,
  onOpenRepo,
  onRecover,
}: HistoryPaneProps) {
  const empty = rows.length === 0 && !loadingTail
  // Rows while loading are the previous list, kept through a ref-filter
  // reload (useHistory.resetHistory): dimmed, and said so.
  const stale = loading && rows.length > 0
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }} component="div">
      <Box
        sx={{
          ...paneSx,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          "& .grid-body": { opacity: stale ? 0.55 : 1 },
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
              <EmptyState text={emptyText ?? "This repository has no commits yet."} testid="grid-no-commits" />
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
        {stale && (
          <Box
            data-testid="grid-reloading"
            sx={{ position: "absolute", top: 36, right: 16, zIndex: 3, pointerEvents: "none" }}
          >
            <LoadingState label="Filtering history…" testid="grid-reloading-label" />
          </Box>
        )}
        <RevisionGrid
          rows={rows}
          selected={selected}
          onSelect={onSelect}
          loadingTail={loadingTail}
          remoteNames={remoteNames}
          tagNames={tagNames}
          currentBranch={currentBranch}
          highlightRoot={highlightRoot}
          onHighlightRoot={onHighlightRoot}
          onNearEnd={onNearEnd}
          headerExtra={headerExtra}
          compass={nav && <GraphCompass rows={rows} nav={nav} />}
          loadingTarget={nav?.loadingTarget}
          // The right-click has already moved the selection; the previous
          // one (still in `selectedSha` during this event) is the other side
          // of "Compare selected commits".
          onRowContextMenu={(e, index) =>
            menus.rowContextMenu(
              e,
              rows[index],
              selectedSha && selectedSha !== rows[index]?.rev.id ? selectedSha : null,
            )
          }
          onRefContextMenu={(e, name, kind, index) => menus.refContextMenu(e, name, kind, rows[index]?.rev.id ?? null)}
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
        ...paneSx,
        width: 36,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 1,
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
