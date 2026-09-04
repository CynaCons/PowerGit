import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import type { GraphRow } from "../graph/types"
import { RevisionGrid } from "./RevisionGrid"

export type HistoryPaneProps = {
  rows: GraphRow[]
  selected: number
  loadingTail: boolean
  engineError: string | null
  hasRepo: boolean
  onSelect: (index: number) => void
  onNearEnd: () => void
  onRowContextMenu: (e: React.MouseEvent, index: number) => void
  onRetry: () => void
}

// The revision grid with its empty/error state on top.
export function HistoryPane({
  rows,
  selected,
  loadingTail,
  engineError,
  hasRepo,
  onSelect,
  onNearEnd,
  onRowContextMenu,
  onRetry,
}: HistoryPaneProps) {
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
        {rows.length === 0 && !loadingTail && (
          <Box data-testid="grid-empty" sx={{ p: 3, display: "flex", justifyContent: "center" }}>
            {engineError ? (
              <Alert
                severity="error"
                variant="outlined"
                sx={{ maxWidth: 560 }}
                action={
                  <Button size="small" onClick={onRetry}>
                    Retry
                  </Button>
                }
              >
                Could not load history. {engineError}
              </Alert>
            ) : (
              <Typography color="text.secondary" variant="body2">
                {hasRepo ? "This repository has no commits yet." : "Open a repository to see its history."}
              </Typography>
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
