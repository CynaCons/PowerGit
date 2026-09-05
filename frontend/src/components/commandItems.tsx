import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import CallMergeIcon from "@mui/icons-material/CallMerge"
import CallSplitIcon from "@mui/icons-material/CallSplit"
import CheckIcon from "@mui/icons-material/Check"
import Inventory2Icon from "@mui/icons-material/Inventory2"
import LowPriorityIcon from "@mui/icons-material/LowPriority"
import RefreshIcon from "@mui/icons-material/Refresh"
import SellIcon from "@mui/icons-material/Sell"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import SyncIcon from "@mui/icons-material/Sync"
import Divider from "@mui/material/Divider"
import MenuItem from "@mui/material/MenuItem"
import type { ReactNode } from "react"
import { useEngine } from "../engine"
import { shortcutLabel } from "../hotkeys"
import type { GitActions } from "../hooks/useGitActions"
import type { Jobs } from "../hooks/useJobs"

// The one list of commands (v0.13.15): the command rail (default) and the
// title-bar toolbar render the same items, so labels, shortcuts, enabled
// states and option menus cannot drift between the two placements.

export type CommandItem = {
  id: string
  label: string
  icon: ReactNode
  testid: string
  disabled?: boolean
  shortcut?: string
  /** The single filled action (Commit). */
  primary?: boolean
  /** Count shown as a pill (Commit: files changed). */
  badge?: number
  onClick: () => void
  /** Option menu entries (MenuItem elements); the toolbar shows a caret, the rail a chevron. */
  menu?: ReactNode
  /** Secondary group: collapses into the toolbar's "More" menu on narrow windows. */
  secondary?: boolean
}

export type CommandDeps = {
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

export function useCommandItems(d: CommandDeps): CommandItem[] {
  const engine = useEngine()
  const { live, dirty, stashCount, hasCurrent, remoteNames, defaultRemote, jobs, actions, refresh, openStash } = d
  const { busy, runJob, runJobSequence, openPreview } = jobs
  return [
    {
      id: "refresh",
      label: "Refresh",
      icon: <RefreshIcon fontSize="small" />,
      testid: "refresh-button",
      disabled: !live,
      shortcut: shortcutLabel("browse.refresh"),
      onClick: () => void refresh(),
    },
    {
      id: "commit",
      label: "Commit",
      icon: <CheckIcon fontSize="small" />,
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
      icon: <Inventory2Icon fontSize="small" />,
      testid: "stash-button",
      disabled: !live,
      shortcut: shortcutLabel("browse.stash"),
      onClick: openStash,
      menu: [
        <MenuItem key="manage" data-testid="stash-manage" onClick={openStash}>
          Manage stashes…
        </MenuItem>,
        <MenuItem
          key="apply"
          data-testid="stash-apply-latest"
          disabled={stashCount === 0}
          onClick={() => actions.applyLatestStash(false)}
        >
          Apply stash@{"{0}"}
        </MenuItem>,
        <MenuItem
          key="pop"
          data-testid="stash-pop-latest"
          disabled={stashCount === 0}
          onClick={() => actions.applyLatestStash(true)}
        >
          Pop stash@{"{0}"} ({shortcutLabel("browse.stashPop")})
        </MenuItem>,
        <MenuItem
          key="drop"
          data-testid="stash-drop-latest"
          disabled={stashCount === 0}
          onClick={actions.dropLatestStash}
        >
          Drop stash@{"{0}"}
        </MenuItem>,
      ],
    },
    {
      id: "pull",
      label: "Pull",
      icon: <ArrowDownwardIcon fontSize="small" />,
      testid: "pull-button",
      disabled: !live || busy,
      shortcut: shortcutLabel("browse.pull"),
      onClick: () => openPreview("pull"),
      menu: [
        <MenuItem
          key="rebase"
          data-testid="pull-rebase"
          onClick={() => runJob("Pulling (rebase)", () => engine.startPull(true))}
        >
          Pull (rebase onto upstream)
        </MenuItem>,
        <MenuItem key="ff" data-testid="pull-ff" onClick={() => runJob("Pulling", () => engine.startPull(false))}>
          Pull (fast-forward only, no preview)
        </MenuItem>,
      ],
    },
    {
      id: "push",
      label: "Push",
      icon: <ArrowUpwardIcon fontSize="small" />,
      testid: "push-button",
      disabled: !live || busy,
      shortcut: shortcutLabel("browse.push"),
      onClick: () => openPreview("push"),
      menu: [
        <MenuItem key="lease" data-testid="push-force-lease" onClick={() => openPreview("push-force")}>
          Push (force with lease)…
        </MenuItem>,
        <MenuItem key="plain" data-testid="push-plain" onClick={() => runJob("Pushing", () => engine.startPush(false))}>
          Push (no preview)
        </MenuItem>,
      ],
    },
    {
      id: "fetch",
      label: "Fetch",
      icon: <SyncIcon fontSize="small" />,
      testid: "fetch-button",
      disabled: !live || busy,
      shortcut: shortcutLabel("browse.quickFetch"),
      onClick: () => runJob(`Fetching ${defaultRemote}`, () => engine.startFetch(defaultRemote)),
      // "Fetch all" is a first-class Git Extensions action, so it is always
      // listed (disabled with no remotes) rather than appearing only once a
      // second remote exists.
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
        <Divider key="divider" />,
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
      icon: <CallSplitIcon fontSize="small" />,
      testid: "branch-button",
      disabled: !live || !hasCurrent,
      shortcut: shortcutLabel("browse.createBranch"),
      onClick: actions.openCreateBranch,
      secondary: true,
      menu: (
        <MenuItem data-testid="branch-delete" onClick={() => void actions.deleteBranchPrompt()}>
          Delete branch…
        </MenuItem>
      ),
    },
    {
      id: "checkout",
      label: "Checkout",
      icon: <SwapHorizIcon fontSize="small" />,
      testid: "checkout-button",
      disabled: !live,
      shortcut: shortcutLabel("browse.checkoutBranch"),
      onClick: actions.openCheckoutBranch,
      secondary: true,
    },
    {
      id: "merge",
      label: "Merge (coming soon)",
      icon: <CallMergeIcon fontSize="small" />,
      testid: "merge-button",
      disabled: true,
      onClick: () => {},
      secondary: true,
    },
    {
      id: "rebase",
      label: "Rebase",
      icon: <LowPriorityIcon fontSize="small" />,
      testid: "rebase-button",
      disabled: !live || !hasCurrent,
      shortcut: shortcutLabel("browse.rebase"),
      onClick: actions.openRebase,
      secondary: true,
    },
    {
      id: "tag",
      label: "Tag",
      icon: <SellIcon fontSize="small" />,
      testid: "tag-button",
      disabled: !live || !hasCurrent,
      shortcut: shortcutLabel("browse.createTag"),
      onClick: actions.openCreateTag,
      secondary: true,
    },
  ]
}

/** Shown as a pill: three digits, then "999+" so the pill never grows past the column. */
export function badgeText(n: number): string {
  return n > 999 ? "999+" : String(n)
}
