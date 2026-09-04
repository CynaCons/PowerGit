import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined"
import HistoryIcon from "@mui/icons-material/History"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import { shortcutLabel } from "../hotkeys"

export type NavRailProps = {
  repoName: string | undefined
  onOpenRepo: () => void
  onRecents: () => void
  onSettings: () => void
}

export function NavRail({ repoName, onOpenRepo, onRecents, onSettings }: NavRailProps) {
  return (
    <Box
      component="nav"
      data-testid="navrail"
      aria-label="Repositories"
      sx={{
        width: 48,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 1.5,
        gap: 0.5,
        bgcolor: "background.paper",
        borderRight: 1,
        borderColor: "divider",
      }}
    >
      <Tooltip title={repoName ?? "PowerGit"} placement="right">
        <IconButton
          color="primary"
          sx={{ borderRadius: 2, bgcolor: "primary.main", color: "#fff", "&:hover": { bgcolor: "primary.dark" } }}
        >
          <AccountTreeOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={`Open repository… (${shortcutLabel("browse.openRepo")})`} placement="right">
        <IconButton
          data-testid="open-repo-button"
          onClick={onOpenRepo}
          sx={{ borderRadius: 2 }}
          aria-label="Open repository"
        >
          <CreateNewFolderOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Recent repositories" placement="right">
        <IconButton onClick={onRecents} sx={{ borderRadius: 2 }} aria-label="Recent repositories">
          <HistoryIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      <Tooltip title={`Settings (${shortcutLabel("browse.openSettings")})`} placement="right">
        <IconButton onClick={onSettings} sx={{ borderRadius: 2 }} data-testid="settings-button" aria-label="Settings">
          <SettingsOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
