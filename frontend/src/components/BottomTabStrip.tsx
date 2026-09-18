import Box from "@mui/material/Box"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import type { RowKeys } from "../hooks/useDiffReview"
import { ReviewBar } from "./ReviewBar"

// The bottom panel's tab strip (v0.19.0): the three tabs and, on the Diff
// tab, the review bar beside them. Split out of BottomPanel.tsx, which
// reached the 400-line lint cap when the review file's load/save hook and
// the export's diff loader moved in.
export function BottomTabStrip({
  tab,
  setTab,
  fileCount,
  reviewKey,
  path,
  rowKeys,
  startOver,
  finish,
  exportDiffs,
}: {
  tab: number
  setTab: (tab: number) => void
  fileCount: number
  reviewKey: string | null
  path: string | null
  rowKeys: RowKeys
  startOver: () => Promise<void>
  finish: () => void
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
          finish={finish}
          exportDiffs={exportDiffs}
        />
      )}
    </Box>
  )
}
