import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward"
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward"
import CallMergeIcon from "@mui/icons-material/CallMerge"
import CallSplitIcon from "@mui/icons-material/CallSplit"
import CheckIcon from "@mui/icons-material/Check"
import Inventory2Icon from "@mui/icons-material/Inventory2"
import LowPriorityIcon from "@mui/icons-material/LowPriority"
import MoreHorizIcon from "@mui/icons-material/MoreHoriz"
import RefreshIcon from "@mui/icons-material/Refresh"
import SellIcon from "@mui/icons-material/Sell"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import SyncIcon from "@mui/icons-material/Sync"
import AppBar from "@mui/material/AppBar"
import Badge from "@mui/material/Badge"
import Divider from "@mui/material/Divider"
import LinearProgress from "@mui/material/LinearProgress"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Toolbar from "@mui/material/Toolbar"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { memo, useState, type RefObject } from "react"
import { BrandMark } from "./BrandMark"
import { useEngine } from "../engine"
import { shortcutLabel } from "../hotkeys"
import type { GitActions } from "../hooks/useGitActions"
import type { Jobs } from "../hooks/useJobs"
import type { ToolbarTier } from "../hooks/useChromeLayout"
import { SplitButton, ToolbarButton } from "./ToolbarButtons"

export type CommandBarProps = {
  toolbarRef: RefObject<HTMLDivElement | null>
  tier: ToolbarTier
  live: boolean
  dirty: number
  stashCount: number
  hasCurrent: boolean
  remoteNames: string[]
  defaultRemote: string
  // Thin progress strips under the toolbar: engine reachable but history
  // not yet loaded, and a labelled job in flight.
  booting: boolean
  jobs: Jobs
  actions: GitActions
  refresh: () => Promise<void>
  openStash: () => void
}

// The Git Extensions command bar: primary group (refresh, commit, stash,
// pull/push/fetch) always visible, secondary group (branch, checkout, merge,
// rebase, tag) collapsing into a "More" menu on narrow windows. The tier is
// measured by useChromeLayout from the toolbar element handed in here.
function CommandBarImpl({
  toolbarRef,
  tier,
  live,
  dirty,
  stashCount,
  hasCurrent,
  remoteNames,
  defaultRemote,
  booting,
  jobs,
  actions,
  refresh,
  openStash,
}: CommandBarProps) {
  const engine = useEngine()
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  const { busy, jobLabel, runJob, runJobSequence, openPreview } = jobs
  const iconsOnly = tier !== "full"
  const overflowed = tier === "overflow"
  const secondaryDivider = <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: "center", my: 0 }} />

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
      <Toolbar
        ref={toolbarRef}
        variant="dense"
        data-testid="toolbar"
        data-tier={tier}
        sx={{ gap: 0.5, minHeight: 32, py: 0.25, px: 1, flexWrap: "nowrap", overflow: "hidden" }}
      >
        <BrandMark size={18} />
        <Typography variant="subtitle1" sx={{ ml: 0.5, mr: 1, fontWeight: 700 }}>
          PowerGit
        </Typography>
        <ToolbarButton
          label="Refresh"
          icon={<RefreshIcon fontSize="small" />}
          testid="refresh-button"
          compact={iconsOnly}
          disabled={!live}
          shortcut={shortcutLabel("browse.refresh")}
          onClick={() => void refresh()}
        />
        {secondaryDivider}
        <Badge
          badgeContent={dirty || 0}
          color="primary"
          overlap="rectangular"
          sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16, px: 0.5 } }}
        >
          <SplitButton
            label="Commit"
            icon={<CheckIcon fontSize="small" />}
            testid="commit-button"
            variant="contained"
            shortcut={shortcutLabel("browse.commit")}
            onMainClick={actions.openCommit}
          >
            <MenuItem data-testid="commit-amend" onClick={() => void actions.openAmend()}>
              Amend last commit…
            </MenuItem>
          </SplitButton>
        </Badge>
        <SplitButton
          label={stashCount > 0 ? `Stash (${stashCount})` : "Stash"}
          icon={<Inventory2Icon fontSize="small" />}
          testid="stash-button"
          compact={iconsOnly}
          disabled={!live}
          shortcut={shortcutLabel("browse.stash")}
          onMainClick={openStash}
        >
          <MenuItem data-testid="stash-manage" onClick={openStash}>
            Manage stashes…
          </MenuItem>
          <MenuItem
            data-testid="stash-apply-latest"
            disabled={stashCount === 0}
            onClick={() => actions.applyLatestStash(false)}
          >
            Apply stash@{"{0}"}
          </MenuItem>
          <MenuItem
            data-testid="stash-pop-latest"
            disabled={stashCount === 0}
            onClick={() => actions.applyLatestStash(true)}
          >
            Pop stash@{"{0}"} ({shortcutLabel("browse.stashPop")})
          </MenuItem>
          <MenuItem data-testid="stash-drop-latest" disabled={stashCount === 0} onClick={actions.dropLatestStash}>
            Drop stash@{"{0}"}
          </MenuItem>
        </SplitButton>
        {secondaryDivider}
        <SplitButton
          label="Pull"
          icon={<ArrowDownwardIcon fontSize="small" />}
          testid="pull-button"
          compact={iconsOnly}
          disabled={!live || busy}
          shortcut={shortcutLabel("browse.pull")}
          onMainClick={() => openPreview("pull")}
        >
          <MenuItem data-testid="pull-rebase" onClick={() => runJob("Pulling (rebase)", () => engine.startPull(true))}>
            Pull (rebase onto upstream)
          </MenuItem>
          <MenuItem data-testid="pull-ff" onClick={() => runJob("Pulling", () => engine.startPull(false))}>
            Pull (fast-forward only, no preview)
          </MenuItem>
        </SplitButton>
        <SplitButton
          label="Push"
          icon={<ArrowUpwardIcon fontSize="small" />}
          testid="push-button"
          compact={iconsOnly}
          disabled={!live || busy}
          shortcut={shortcutLabel("browse.push")}
          onMainClick={() => openPreview("push")}
        >
          <MenuItem data-testid="push-force-lease" onClick={() => openPreview("push-force")}>
            Push (force with lease)…
          </MenuItem>
          <MenuItem data-testid="push-plain" onClick={() => runJob("Pushing", () => engine.startPush(false))}>
            Push (no preview)
          </MenuItem>
        </SplitButton>
        <SplitButton
          label="Fetch"
          icon={<SyncIcon fontSize="small" />}
          testid="fetch-button"
          compact={iconsOnly}
          disabled={!live || busy}
          shortcut={shortcutLabel("browse.quickFetch")}
          onMainClick={() => runJob(`Fetching ${defaultRemote}`, () => engine.startFetch(defaultRemote))}
        >
          {/* "Fetch all" is a first-class Git Extensions action, so it is
              always listed (disabled with no remotes) rather than appearing
              only once a second remote exists. */}
          <MenuItem
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
          </MenuItem>
          <Divider />
          {remoteNames.map((r) => (
            <MenuItem
              key={r}
              data-testid={`fetch-${r}`}
              onClick={() => runJob(`Fetching ${r}`, () => engine.startFetch(r))}
            >
              {`Fetch ${r}`}
            </MenuItem>
          ))}
        </SplitButton>
        {secondaryDivider}
        {/* Branch/Checkout/Merge/Rebase/Tag are the secondary group: they
            show as buttons while there is room and collapse wholesale into
            the "More" menu below that width, rather than being clipped. */}
        {!overflowed && (
          <>
            <SplitButton
              label="Branch"
              icon={<CallSplitIcon fontSize="small" />}
              testid="branch-button"
              disabled={!live || !hasCurrent}
              shortcut={shortcutLabel("browse.createBranch")}
              compact={iconsOnly}
              onMainClick={actions.openCreateBranch}
            >
              <MenuItem data-testid="branch-delete" onClick={() => void actions.deleteBranchPrompt()}>
                Delete branch…
              </MenuItem>
            </SplitButton>
            <ToolbarButton
              label="Checkout"
              icon={<SwapHorizIcon fontSize="small" />}
              testid="checkout-button"
              disabled={!live}
              shortcut={shortcutLabel("browse.checkoutBranch")}
              compact={iconsOnly}
              onClick={actions.openCheckoutBranch}
            />
            <Tooltip title="Merge branches (coming soon)">
              <span>
                <ToolbarButton
                  label="Merge"
                  icon={<CallMergeIcon fontSize="small" />}
                  testid="merge-button"
                  disabled
                  compact={iconsOnly}
                  onClick={() => {}}
                />
              </span>
            </Tooltip>
            <ToolbarButton
              label="Rebase"
              icon={<LowPriorityIcon fontSize="small" />}
              testid="rebase-button"
              disabled={!live || !hasCurrent}
              shortcut={shortcutLabel("browse.rebase")}
              compact={iconsOnly}
              onClick={actions.openRebase}
            />
            <ToolbarButton
              label="Tag"
              icon={<SellIcon fontSize="small" />}
              testid="tag-button"
              disabled={!live || !hasCurrent}
              shortcut={shortcutLabel("browse.createTag")}
              compact={iconsOnly}
              onClick={actions.openCreateTag}
            />
          </>
        )}
        {overflowed && (
          <>
            <ToolbarButton
              label="More actions"
              icon={<MoreHorizIcon fontSize="small" />}
              testid="toolbar-more"
              compact
              onClick={(e) => setMoreAnchor(e.currentTarget)}
            />
            <Menu open={moreAnchor !== null} anchorEl={moreAnchor} onClose={() => setMoreAnchor(null)}>
              <MenuItem
                data-testid="more-branch"
                disabled={!live || !hasCurrent}
                onClick={() => {
                  setMoreAnchor(null)
                  actions.openCreateBranch()
                }}
              >
                Create branch…
              </MenuItem>
              <MenuItem
                data-testid="more-branch-delete"
                disabled={!live}
                onClick={() => {
                  setMoreAnchor(null)
                  void actions.deleteBranchPrompt()
                }}
              >
                Delete branch…
              </MenuItem>
              <MenuItem
                data-testid="more-checkout"
                disabled={!live}
                onClick={() => {
                  setMoreAnchor(null)
                  actions.openCheckoutBranch()
                }}
              >
                Checkout branch…
              </MenuItem>
              <MenuItem data-testid="more-merge" disabled>
                Merge… (coming soon)
              </MenuItem>
              <MenuItem
                data-testid="more-rebase"
                disabled={!live || !hasCurrent}
                onClick={() => {
                  setMoreAnchor(null)
                  actions.openRebase()
                }}
              >
                Rebase…
              </MenuItem>
              <MenuItem
                data-testid="more-tag"
                disabled={!live || !hasCurrent}
                onClick={() => {
                  setMoreAnchor(null)
                  actions.openCreateTag()
                }}
              >
                Create tag…
              </MenuItem>
            </Menu>
          </>
        )}
      </Toolbar>
      {booting && <LinearProgress data-testid="boot-progress" sx={{ height: 2 }} />}
      {busy && jobLabel !== null && <LinearProgress sx={{ height: 2 }} />}
    </AppBar>
  )
}

// Memoised: selection changes must not re-render the toolbar (App passes
// stable callbacks via useStable; `actions` is stabilised the same way).
export const CommandBar = memo(CommandBarImpl)
