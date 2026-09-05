import Box from "@mui/material/Box"
import type { DiffDto, DiffOptions } from "../engine"
import { EmptyState, ErrorState, LoadingState } from "./AsyncState"
import { DiffOptionsBar } from "./DiffOptionsBar"
import { DiffView } from "./DiffView"
import type { Loadable } from "./loadable"

// The Diff tab's right half (split out of BottomPanel.tsx for the lint size limit).
export function DiffPane({
  diff,
  busy,
  file,
  options,
  onOptions,
  onRetry,
  onOpenDifftool,
}: {
  diff: Loadable<DiffDto>
  busy: boolean
  file: string | null
  options: DiffOptions
  onOptions: (o: DiffOptions) => void
  onRetry: () => void
  onOpenDifftool?: () => void
}) {
  return (
    <Box sx={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <Box
        data-testid="diff-pane"
        sx={{
          m: 0,
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          bgcolor: "background.paper",
        }}
      >
        {diff.kind === "ready" ? (
          <DiffView diff={diff.value} onRetry={onRetry} onOpenDifftool={onOpenDifftool} />
        ) : diff.kind === "error" ? (
          <ErrorState message={diff.message} onRetry={onRetry} testid="diff-error" />
        ) : (diff.kind === "loading" || file) && busy ? (
          <LoadingState label="Loading diff…" testid="diff-loading" />
        ) : diff.kind === "loading" || file ? null : (
          <EmptyState text="Select a file." testid="diff-empty" />
        )}
      </Box>
      <DiffOptionsBar options={options} onChange={onOptions} />
    </Box>
  )
}
