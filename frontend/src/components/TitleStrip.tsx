import Box from "@mui/material/Box"
import LinearProgress from "@mui/material/LinearProgress"
import Typography from "@mui/material/Typography"
import { BrandMark } from "./BrandMark"
import { WindowControls } from "./WindowControls"

// The frameless window's title strip for the rail layout (v0.13.15, the
// default): mark, name, repository, drag region and the window controls,
// 32px like the command bar it replaces, plus the thin progress strips the
// bar used to carry (engine reachable but history not loaded; a labelled
// job in flight).
export function TitleStrip({
  repoName,
  booting = false,
  busyLabel = null,
}: {
  repoName?: string
  booting?: boolean
  busyLabel?: string | null
}) {
  return (
    <Box data-testid="title-strip-wrap" sx={{ flexShrink: 0 }}>
      <Box
        data-tauri-drag-region
        data-testid="title-strip"
        sx={{
          display: "flex",
          alignItems: "center",
          height: 32,
          flexShrink: 0,
          pl: 1,
          gap: 0.5,
          bgcolor: "background.paper",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <BrandMark size={18} />
        <Typography variant="subtitle1" sx={{ ml: 0.5, fontWeight: 700 }} data-tauri-drag-region>
          PowerGit
        </Typography>
        {repoName && (
          <Typography variant="body2" color="text.secondary" sx={{ ml: 1.5 }} noWrap data-tauri-drag-region>
            {repoName}
          </Typography>
        )}
        <Box sx={{ flex: 1, alignSelf: "stretch" }} data-tauri-drag-region />
        <WindowControls />
      </Box>
      {booting && <LinearProgress data-testid="boot-progress" sx={{ height: 2 }} />}
      {busyLabel !== null && <LinearProgress sx={{ height: 2 }} />}
    </Box>
  )
}
