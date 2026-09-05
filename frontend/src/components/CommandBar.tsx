import MoreHorizIcon from "@mui/icons-material/MoreHoriz"
import AppBar from "@mui/material/AppBar"
import Badge from "@mui/material/Badge"
import Box from "@mui/material/Box"
import Divider from "@mui/material/Divider"
import LinearProgress from "@mui/material/LinearProgress"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Toolbar from "@mui/material/Toolbar"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { memo, useState, type ReactNode, type RefObject } from "react"
import type { ToolbarTier } from "../hooks/useChromeLayout"
import { BrandMark } from "./BrandMark"
import { badgeText, useCommandItems, type CommandDeps, type CommandItem } from "./commandItems"
import { SplitButton, ToolbarButton } from "./ToolbarButtons"
import { WindowControls } from "./WindowControls"

export type CommandBarProps = CommandDeps & {
  toolbarRef: RefObject<HTMLDivElement | null>
  tier: ToolbarTier
  // Thin progress strips under the toolbar: engine reachable but history
  // not yet loaded, and a labelled job in flight.
  booting: boolean
}

// The Git Extensions command bar as the frameless window's title bar
// (barLayout "top", the pre-v0.13.15 default kept as an option): primary
// group (refresh, commit, stash, pull/push/fetch) always visible, secondary
// group (branch, checkout, merge, rebase, tag) collapsing into a "More" menu
// on narrow windows. The tier is measured by useChromeLayout from the
// toolbar element handed in here. Items come from useCommandItems, shared
// with the rail.
function CommandBarImpl({ toolbarRef, tier, booting, ...deps }: CommandBarProps) {
  const items = useCommandItems(deps)
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null)
  const { busy, jobLabel } = deps.jobs
  const iconsOnly = tier !== "full"
  const overflowed = tier === "overflow"
  const secondaryDivider = <Divider orientation="vertical" flexItem sx={{ height: 18, alignSelf: "center", my: 0 }} />
  const primary = items.filter((i) => !i.secondary)
  const secondary = items.filter((i) => i.secondary)

  const render = (item: CommandItem): ReactNode => {
    const button = item.menu ? (
      <SplitButton
        key={item.id}
        label={item.label}
        icon={item.icon}
        testid={item.testid}
        variant={item.primary ? "contained" : "text"}
        compact={item.primary ? false : iconsOnly}
        disabled={item.disabled}
        shortcut={item.shortcut}
        onMainClick={item.onClick}
      >
        {item.menu}
      </SplitButton>
    ) : (
      <ToolbarButton
        key={item.id}
        label={item.label}
        icon={item.icon}
        testid={item.testid}
        compact={iconsOnly}
        disabled={item.disabled}
        shortcut={item.shortcut}
        onClick={item.onClick}
      />
    )
    if (item.badge !== undefined) {
      return (
        <Badge
          key={item.id}
          badgeContent={badgeText(item.badge)}
          invisible={item.badge === 0}
          color="primary"
          overlap="rectangular"
          sx={{ "& .MuiBadge-badge": { fontSize: 10, minWidth: 16, height: 16, px: 0.5 } }}
        >
          {button}
        </Badge>
      )
    }
    if (item.id === "merge") {
      return (
        <Tooltip key={item.id} title="Merge branches (coming soon)">
          <span>{button}</span>
        </Tooltip>
      )
    }
    return button
  }

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
      {/* Frameless window (v0.13.14): the bar is the title bar. Empty space
          drags the window and double-click toggles maximize (Tauri handles
          the attribute); buttons and menus keep their own pointer events.
          The window controls sit outside the overflow-hidden toolbar so a
          narrow or zoomed window can never clip them. */}
      <Box data-tauri-drag-region sx={{ display: "flex", alignItems: "stretch", minWidth: 0 }}>
        <Toolbar
          ref={toolbarRef}
          variant="dense"
          data-testid="toolbar"
          data-tier={tier}
          data-tauri-drag-region
          sx={{
            flex: 1,
            minWidth: 0,
            gap: 0.5,
            minHeight: 32,
            py: 0.25,
            px: 1,
            flexWrap: "nowrap",
            overflow: "hidden",
          }}
        >
          <BrandMark size={18} />
          <Typography variant="subtitle1" sx={{ ml: 0.5, mr: 1, fontWeight: 700 }}>
            PowerGit
          </Typography>
          {render(primary[0])}
          {secondaryDivider}
          {primary.slice(1, 3).map(render)}
          {secondaryDivider}
          {primary.slice(3).map(render)}
          {secondaryDivider}
          {/* Branch/Checkout/Merge/Rebase/Tag are the secondary group: they
              show as buttons while there is room and collapse wholesale into
              the "More" menu below that width, rather than being clipped. */}
          {!overflowed && secondary.map(render)}
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
                {secondary.map((item) => (
                  <MenuItem
                    key={item.id}
                    data-testid={`more-${item.id}`}
                    disabled={item.disabled}
                    onClick={() => {
                      setMoreAnchor(null)
                      item.onClick()
                    }}
                  >
                    {item.id === "merge" ? "Merge… (coming soon)" : `${item.label}…`}
                  </MenuItem>
                ))}
                <MenuItem
                  data-testid="more-branch-delete"
                  disabled={!deps.live}
                  onClick={() => {
                    setMoreAnchor(null)
                    void deps.actions.deleteBranchPrompt()
                  }}
                >
                  Delete branch…
                </MenuItem>
              </Menu>
            </>
          )}
          <Box sx={{ flex: 1, alignSelf: "stretch" }} data-tauri-drag-region />
        </Toolbar>
        <WindowControls />
      </Box>
      {booting && <LinearProgress data-testid="boot-progress" sx={{ height: 2 }} />}
      {busy && jobLabel !== null && <LinearProgress sx={{ height: 2 }} />}
    </AppBar>
  )
}

// Memoised: selection changes must not re-render the toolbar (App passes
// stable callbacks via useStable; `actions` is stabilised the same way).
export const CommandBar = memo(CommandBarImpl)
