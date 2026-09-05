import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined"
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import CallMergeIcon from "@mui/icons-material/CallMerge"
import CallSplitIcon from "@mui/icons-material/CallSplit"
import CheckIcon from "@mui/icons-material/Check"
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined"
import HistoryIcon from "@mui/icons-material/History"
import Inventory2Icon from "@mui/icons-material/Inventory2"
import LowPriorityIcon from "@mui/icons-material/LowPriority"
import RefreshIcon from "@mui/icons-material/Refresh"
import SellIcon from "@mui/icons-material/Sell"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import SyncIcon from "@mui/icons-material/Sync"
import Box from "@mui/material/Box"
import Divider from "@mui/material/Divider"
import MenuItem from "@mui/material/MenuItem"
import { useState } from "react"
import { useEngine } from "../engine"
import { shortcutLabel } from "../hotkeys"
import type { GitActions } from "../hooks/useGitActions"
import type { Jobs } from "../hooks/useJobs"
import { RailItem, type Item } from "./RailItem"
import { RAIL_STORAGE_KEY, readExpanded } from "./railState"

export type CommandRailProps = {
  repoName?: string
  onOpenRepo: () => void
  onRecents: () => void
  onSettings: () => void
  live: boolean
  dirty: number
  stashCount: number
  hasCurrent: boolean
  remoteNames: string[]
  defaultRemote: string
  jobs: Jobs
  actions: GitActions
  refresh: () => Promise<void>
  openStash: () => void
}

// The commands in the left rail (v0.13.15, barLayout "rail"). Owner:
// "integrate the menu options in the leftside navrail instead, with a
// collapsable leftside menu." Collapsed, the rail is 48px of icons with
// tooltips; expanded, 188px with labels. Items with options show a small
// chevron that opens the same menus the command bar has. The rail owns
// the repository/open/recents/settings entries the plain NavRail had.

export function CommandRail(props: CommandRailProps) {
  const { repoName, onOpenRepo, onRecents, onSettings } = props
  const { live, dirty, stashCount, hasCurrent, remoteNames, defaultRemote, jobs, actions, refresh, openStash } = props
  const engine = useEngine()
  const { busy, runJob, runJobSequence, openPreview } = jobs
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
  const commands: Item[] = [
    {
      id: "refresh",
      label: "Refresh",
      icon: <RefreshIcon />,
      testid: "refresh-button",
      disabled: !live,
      shortcut: shortcutLabel("browse.refresh"),
      onClick: () => void refresh(),
    },
    {
      id: "commit",
      label: "Commit",
      icon: <CheckIcon sx={{ fontSize: 16 }} />,
      testid: "commit-button",
      primary: true,
      badge: dirty || 0,
      shortcut: shortcutLabel("browse.commit"),
      onClick: actions.openCommit,
      menu: (
        <MenuItem data-testid="commit-amend" onClick={() => void actions.openAmend()}>
          Amend last commit…
        </MenuItem>
      ),
    },
    {
      id: "stash",
      label: stashCount > 0 ? `Stash (${stashCount})` : "Stash",
      icon: <Inventory2Icon />,
      testid: "stash-button",
      disabled: !live,
      shortcut: shortcutLabel("browse.stash"),
      onClick: openStash,
      menu: [
        <MenuItem key="m" data-testid="stash-manage" onClick={openStash}>
          Manage stashes…
        </MenuItem>,
        <MenuItem
          key="a"
          data-testid="stash-apply-latest"
          disabled={stashCount === 0}
          onClick={() => actions.applyLatestStash(false)}
        >
          Apply stash@{"{0}"}
        </MenuItem>,
        <MenuItem
          key="p"
          data-testid="stash-pop-latest"
          disabled={stashCount === 0}
          onClick={() => actions.applyLatestStash(true)}
        >
          Pop stash@{"{0}"} ({shortcutLabel("browse.stashPop")})
        </MenuItem>,
        <MenuItem key="d" data-testid="stash-drop-latest" disabled={stashCount === 0} onClick={actions.dropLatestStash}>
          Drop stash@{"{0}"}
        </MenuItem>,
      ],
    },
    {
      id: "pull",
      label: "Pull",
      icon: <ArrowDownwardIcon />,
      testid: "pull-button",
      disabled: !live || busy,
      shortcut: shortcutLabel("browse.pull"),
      onClick: () => openPreview("pull"),
      menu: [
        <MenuItem
          key="r"
          data-testid="pull-rebase"
          onClick={() => runJob("Pulling (rebase)", () => engine.startPull(true))}
        >
          Pull (rebase onto upstream)
        </MenuItem>,
        <MenuItem key="f" data-testid="pull-ff" onClick={() => runJob("Pulling", () => engine.startPull(false))}>
          Pull (fast-forward only, no preview)
        </MenuItem>,
      ],
    },
    {
      id: "push",
      label: "Push",
      icon: <ArrowUpwardIcon />,
      testid: "push-button",
      disabled: !live || busy,
      shortcut: shortcutLabel("browse.push"),
      onClick: () => openPreview("push"),
      menu: [
        <MenuItem key="l" data-testid="push-force-lease" onClick={() => openPreview("push-force")}>
          Push (force with lease)…
        </MenuItem>,
        <MenuItem key="p" data-testid="push-plain" onClick={() => runJob("Pushing", () => engine.startPush(false))}>
          Push (no preview)
        </MenuItem>,
      ],
    },
    {
      id: "fetch",
      label: "Fetch",
      icon: <SyncIcon />,
      testid: "fetch-button",
      disabled: !live || busy,
      shortcut: shortcutLabel("browse.quickFetch"),
      onClick: () => runJob(`Fetching ${defaultRemote}`, () => engine.startFetch(defaultRemote)),
      menu: [
        <MenuItem
          key="all"
          data-testid="fetch-all"
          disabled={remoteNames.length === 0}
          onClick={() =>
            runJobSequence(
              "Fetching all remotes",
              remoteNames.map((r) => () => engine.startFetch(r)),
            )
          }
        >
          Fetch all remotes
        </MenuItem>,
        <Divider key="d" />,
        ...remoteNames.map((r) => (
          <MenuItem
            key={r}
            data-testid={`fetch-${r}`}
            onClick={() => runJob(`Fetching ${r}`, () => engine.startFetch(r))}
          >
            {`Fetch ${r}`}
          </MenuItem>
        )),
      ],
    },
    {
      id: "branch",
      label: "Branch",
      icon: <CallSplitIcon />,
      testid: "branch-button",
      disabled: !live || !hasCurrent,
      shortcut: shortcutLabel("browse.createBranch"),
      onClick: actions.openCreateBranch,
      menu: (
        <MenuItem data-testid="branch-delete" onClick={() => void actions.deleteBranchPrompt()}>
          Delete branch…
        </MenuItem>
      ),
    },
    {
      id: "checkout",
      label: "Checkout",
      icon: <SwapHorizIcon />,
      testid: "checkout-button",
      disabled: !live,
      shortcut: shortcutLabel("browse.checkoutBranch"),
      onClick: actions.openCheckoutBranch,
    },
    {
      id: "merge",
      label: "Merge (coming soon)",
      icon: <CallMergeIcon />,
      testid: "merge-button",
      disabled: true,
      onClick: () => {},
    },
    {
      id: "rebase",
      label: "Rebase",
      icon: <LowPriorityIcon />,
      testid: "rebase-button",
      disabled: !live || !hasCurrent,
      shortcut: shortcutLabel("browse.rebase"),
      onClick: actions.openRebase,
    },
    {
      id: "tag",
      label: "Tag",
      icon: <SellIcon />,
      testid: "tag-button",
      disabled: !live || !hasCurrent,
      shortcut: shortcutLabel("browse.createTag"),
      onClick: actions.openCreateTag,
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
        <RailItem key={item.id} item={item} expanded={expanded} />
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
