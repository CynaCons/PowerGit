import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { BrandMark } from "./BrandMark"
import { WindowControls } from "./WindowControls"

// The frameless window's title strip when the command bar floats at the
// bottom (v0.13.15, barLayout "floating"): mark, name, repository, drag
// region and the window controls. 32px like the command bar it replaces.
export function TitleStrip({ repoName }: { repoName?: string }) {
  return (
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
  )
}
