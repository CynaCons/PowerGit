import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined"
import HistoryIcon from "@mui/icons-material/History"
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined"
import Badge from "@mui/material/Badge"
import Box from "@mui/material/Box"
import { paneSx } from "../theme/panels"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import { shortcutLabel } from "../hotkeys"

export type NavRailProps = {
  repoName: string | undefined
  onOpenRepo: () => void
  onRecents: () => void
  onSettings: () => void
  /** The settings page is open: the gear shows it (v0.18.2). */
  settingsOpen: boolean
  onSnapshot: () => void
  onAgentReviews: () => void
  agentReviewsOpen: boolean
  agentReviewsBadge: number
}

export function NavRail({
  repoName,
  onOpenRepo,
  onRecents,
  onSettings,
  settingsOpen,
  onSnapshot,
  onAgentReviews,
  agentReviewsOpen,
  agentReviewsBadge,
}: NavRailProps) {
  return (
    <Box
      component="nav"
      data-testid="navrail"
      aria-label="Repositories"
      sx={{
        ...paneSx,
        width: 48,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        py: 1.5,
        gap: 0.5,
      }}
    >
      <Tooltip title={repoName ?? "PowerGit"} placement="right">
        <IconButton
          onClick={onRecents}
          aria-label="Switch repository"
          color="primary"
          sx={{
            borderRadius: 2,
            bgcolor: "primary.main",
            color: "primary.contrastText",
            "&:hover": { bgcolor: "primary.dark" },
          }}
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
      <Tooltip title="Agent reviews" placement="right">
        <Badge
          badgeContent={agentReviewsBadge}
          color="error"
          invisible={agentReviewsBadge === 0}
          slotProps={{ badge: { "data-testid": "agent-reviews-badge" } as object }}
        >
          <IconButton
            data-testid="agent-reviews-button"
            aria-label="Agent reviews"
            aria-pressed={agentReviewsOpen}
            onClick={onAgentReviews}
            sx={{ borderRadius: 2, ...(agentReviewsOpen && { bgcolor: "action.selected", color: "primary.main" }) }}
          >
            <RateReviewOutlinedIcon fontSize="small" />
          </IconButton>
        </Badge>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      <Tooltip title="Diagnostic snapshot" placement="right">
        <IconButton
          onClick={onSnapshot}
          sx={{ borderRadius: 2 }}
          data-testid="snapshot-button"
          aria-label="Diagnostic snapshot"
        >
          <BugReportOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={`Settings (${shortcutLabel("browse.openSettings")})`} placement="right">
        <IconButton
          onClick={onSettings}
          aria-pressed={settingsOpen}
          sx={{ borderRadius: 2, ...(settingsOpen && { bgcolor: "action.selected", color: "primary.main" }) }}
          data-testid="settings-button"
          aria-label="Settings"
        >
          <SettingsOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  )
}
