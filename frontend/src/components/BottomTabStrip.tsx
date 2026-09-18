import Box from "@mui/material/Box"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import type { RowKeys } from "../hooks/useDiffReview"
import { ReviewBar } from "./ReviewBar"

export const DEFAULT_FILES_WIDTH = 340
export const MIN_FILES_WIDTH = 180
export const MAX_FILES_WIDTH_RATIO = 0.7
export function BottomTabStrip({
  tab,
  setTab,
  fileCount,
  reviewKey,
  path,
  rowKeys,
  startOver,
  exportDiffs,
}: {
  tab: number
  setTab: (tab: number) => void
  fileCount: number
  reviewKey: string | null
  path: string | null
  rowKeys: RowKeys
  startOver: () => Promise<void>
  exportDiffs: () => Promise<Map<string, string>>
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider", flexShrink: 0 }}>
      <Tabs
        value={tab}
        onChange={(_, value: number) => setTab(value)}
        sx={{ px: 0.5, minHeight: 34, minWidth: 0, "& .MuiTab-root": { minHeight: 34, py: 0.5 } }}
      >
        <Tab label="Commit" />
        <Tab label={`Diff${fileCount ? ` (${fileCount})` : ""}`} />
        <Tab label="File tree" />
      </Tabs>
      {tab === 1 && (
        <ReviewBar
          reviewKey={reviewKey}
          path={path}
          rowKeys={rowKeys}
          startOver={startOver}
          exportDiffs={exportDiffs}
        />
      )}
    </Box>
  )
}
