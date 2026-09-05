import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined"
import HistoryIcon from "@mui/icons-material/History"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import Box from "@mui/material/Box"
import Divider from "@mui/material/Divider"
import { useState } from "react"
import { shortcutLabel } from "../hotkeys"
import { useCommandItems, type CommandDeps } from "./commandItems"
import { RailItem, type Item } from "./RailItem"
import { RAIL_STORAGE_KEY, readExpanded } from "./railState"

// The commands in the left rail (v0.13.15, the default placement; owner:
// "integrate the menu options in the leftside navrail instead, with a
// collapsable leftside menu"). Collapsed, the rail is 48px of icons with
// tooltips; expanded, 188px with labels. Items with options show a chevron
// that opens the same menus the title-bar toolbar has (right-click opens
// them when collapsed). The rail owns the repository / open / recents /
// settings entries the plain NavRail had.

export type CommandRailProps = CommandDeps & {
  repoName?: string
  onOpenRepo: () => void
  onRecents: () => void
  onSettings: () => void
}

export function CommandRail({ repoName, onOpenRepo, onRecents, onSettings, ...deps }: CommandRailProps) {
  const commands = useCommandItems(deps)
  const [expanded, setExpanded] = useState(readExpanded)
  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    try {
      window.localStorage.setItem(RAIL_STORAGE_KEY, next ? "expanded" : "collapsed")
    } catch {
      // Storage refused: the choice still applies for this window.
    }
  }

  const nav: Item[] = [
    {
      id: "repo",
      label: repoName ?? "PowerGit",
      icon: <AccountTreeOutlinedIcon />,
      testid: "rail-repo",
      onClick: () => {},
    },
    {
      id: "open",
      label: "Open repository…",
      icon: <CreateNewFolderOutlinedIcon />,
      testid: "open-repo-button",
      shortcut: shortcutLabel("browse.openRepo"),
      onClick: onOpenRepo,
    },
    {
      id: "recents",
      label: "Recent repositories",
      icon: <HistoryIcon />,
      testid: "recents-button",
      onClick: onRecents,
    },
  ]

  return (
    <Box
      component="nav"
      data-testid="navrail"
      data-expanded={expanded ? "true" : "false"}
      aria-label="Commands"
      sx={{
        width: expanded ? 188 : 48,
        transition: "width 120ms",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        px: "5px",
        py: 1,
        gap: 0.25,
        bgcolor: "background.paper",
        borderRight: 1,
        borderColor: "divider",
        overflow: "hidden",
      }}
    >
      {nav.map((item) => (
        <RailItem key={item.id} item={item} expanded={expanded} />
      ))}
      <Divider sx={{ my: 0.5 }} />
      {commands.map((item) => (
        <RailItem
          key={item.id}
          item={item.id === "merge" ? { ...item, label: "Merge (coming soon)" } : item}
          expanded={expanded}
        />
      ))}
      <Box sx={{ flex: 1 }} />
      <RailItem
        item={{
          id: "settings",
          label: "Settings",
          icon: <SettingsOutlinedIcon />,
          testid: "settings-button",
          shortcut: shortcutLabel("browse.openSettings"),
          onClick: onSettings,
        }}
        expanded={expanded}
      />
      <RailItem
        item={{
          id: "toggle",
          label: expanded ? "Collapse" : "Expand",
          icon: expanded ? <ChevronLeftIcon /> : <ChevronRightIcon />,
          testid: "rail-toggle",
          onClick: toggle,
        }}
        expanded={expanded}
      />
    </Box>
  )
}
