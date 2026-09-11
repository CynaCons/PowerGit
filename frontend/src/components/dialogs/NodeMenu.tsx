import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined"
import BuildIcon from "@mui/icons-material/Build"
import CallMergeIcon from "@mui/icons-material/CallMerge"
import CallSplitIcon from "@mui/icons-material/CallSplit"
import CheckIcon from "@mui/icons-material/Check"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CompareArrowsIcon from "@mui/icons-material/CompareArrows"
import CompareIcon from "@mui/icons-material/Compare"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import ContentPasteGoIcon from "@mui/icons-material/ContentPasteGo"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined"
import EditNoteIcon from "@mui/icons-material/EditNote"
import LowPriorityIcon from "@mui/icons-material/LowPriority"
import OpenInBrowserIcon from "@mui/icons-material/OpenInBrowser"
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck"
import SellOutlinedIcon from "@mui/icons-material/SellOutlined"
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import TuneIcon from "@mui/icons-material/Tune"
import UndoIcon from "@mui/icons-material/Undo"
import Divider from "@mui/material/Divider"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Typography from "@mui/material/Typography"
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import type { MenuIcon, MenuNode } from "./revisionMenuModel"

// The grid menus' renderer (v0.16.0, split out of RevisionContextMenu so
// the file history's own menu draws the same way): an icon on every row, a
// shortcut column, dividers between groups, a check mark on a check item,
// and submenus that open beside their row. What the nodes are is the
// caller's model (revisionMenuModel.ts, fileHistoryMenuModel.ts); this
// only draws them and reports the click.

const ICONS: Record<MenuIcon, ReactNode> = {
  checkout: <SwapHorizIcon fontSize="small" />,
  merge: <CallMergeIcon fontSize="small" />,
  rebase: <BuildIcon fontSize="small" />,
  rebaseInteractive: <LowPriorityIcon fontSize="small" />,
  reset: <UndoIcon fontSize="small" />,
  branch: <CallSplitIcon fontSize="small" />,
  tag: <SellOutlinedIcon fontSize="small" />,
  delete: <DeleteOutlineIcon fontSize="small" />,
  cherryPick: <ContentPasteGoIcon fontSize="small" />,
  revert: <SettingsBackupRestoreIcon fontSize="small" />,
  fixup: <PlaylistAddCheckIcon fontSize="small" />,
  compare: <CompareArrowsIcon fontSize="small" />,
  copy: <ContentCopyIcon fontSize="small" />,
  archive: <ArchiveOutlinedIcon fontSize="small" />,
  browser: <OpenInBrowserIcon fontSize="small" />,
  commit: <EditNoteIcon fontSize="small" />,
  difftool: <CompareIcon fontSize="small" />,
  manipulate: <TuneIcon fontSize="small" />,
}

function Item({
  node,
  submenu,
  itemRef,
  onClick,
  onHover,
}: {
  node: MenuNode
  submenu?: boolean
  itemRef?: (el: HTMLLIElement | null) => void
  onClick: () => void
  onHover?: () => void
}) {
  const checkable = node.checked !== undefined
  return (
    <MenuItem
      ref={itemRef}
      data-testid={node.id}
      disabled={node.disabled}
      title={node.hint}
      role={checkable ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checkable ? node.checked : undefined}
      onClick={onClick}
      onMouseEnter={onHover}
      dense
    >
      <ListItemIcon>
        {checkable ? node.checked ? <CheckIcon fontSize="small" /> : null : node.icon ? ICONS[node.icon] : null}
      </ListItemIcon>
      <ListItemText>{node.label}</ListItemText>
      {submenu ? (
        <ChevronRightIcon fontSize="small" sx={{ ml: 3, color: "text.secondary" }} />
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ pl: 3, minWidth: 40, textAlign: "right" }}>
          {node.shortcut ?? ""}
        </Typography>
      )}
    </MenuItem>
  )
}

export function NodeMenu({
  id,
  position,
  nodes,
  minWidth = 290,
  onRun,
  onClose,
}: {
  /** The menu paper's DOM id; the submenu's is `${id}-sub`. */
  id: string
  /** Where to open; null keeps the menu closed. */
  position: { x: number; y: number } | null
  nodes: MenuNode[]
  minWidth?: number
  /** A leaf item (or a submenu's child) was clicked. Disabled items never reach this. */
  onRun: (node: MenuNode) => void
  onClose: () => void
}) {
  const open = position !== null
  const [openSub, setOpenSub] = useState<string | null>(null)
  // Submenus anchor to their own row, so the parent keeps the elements.
  const itemEls = useRef(new Map<string, HTMLLIElement>())

  // A MUI Menu is a Modal: its root covers the viewport and swallows every
  // pointer event, so a second right-click landed on the modal root instead
  // of the row underneath — the menu just closed and (before App's global
  // handler) the WebView's own menu appeared. Letting pointer events through
  // the root, while keeping them on the paper, makes right-clicking another
  // row re-target the menu in one gesture, the way a desktop app behaves.
  // Click-away then has to be wired up by hand, since it normally rides on
  // the backdrop that no longer receives anything — and a click inside a
  // submenu (v0.15.0) is inside the menu, not outside it.
  useEffect(() => {
    if (!open) return
    const closeIfOutside = (e: Event) => {
      const el = e.target as HTMLElement | null
      if (el?.closest(`#${id}, #${id}-sub`)) return
      onClose()
    }
    document.addEventListener("mousedown", closeIfOutside, true)
    document.addEventListener("contextmenu", closeIfOutside, true)
    return () => {
      document.removeEventListener("mousedown", closeIfOutside, true)
      document.removeEventListener("contextmenu", closeIfOutside, true)
    }
  }, [open, id, onClose])

  useEffect(() => {
    if (!open) setOpenSub(null)
  }, [open])

  const run = (node: MenuNode) => {
    if (!node.disabled) onRun(node)
  }

  const setItemEl = (nodeId: string) => (el: HTMLLIElement | null) => {
    if (el) itemEls.current.set(nodeId, el)
    else itemEls.current.delete(nodeId)
  }

  const renderNode = (node: MenuNode): ReactNode => {
    const item = node.children ? (
      <Item
        node={node}
        submenu
        itemRef={setItemEl(node.id)}
        onClick={() => setOpenSub(node.id)}
        onHover={() => setOpenSub(node.id)}
      />
    ) : (
      <Item node={node} itemRef={setItemEl(node.id)} onClick={() => run(node)} onHover={() => setOpenSub(null)} />
    )
    return (
      <Fragment key={node.id}>
        {node.divider && <Divider />}
        {item}
        {node.children && openSub === node.id && !node.disabled && (
          <Menu
            transitionDuration={0}
            open
            anchorEl={itemEls.current.get(node.id) ?? null}
            onClose={() => setOpenSub(null)}
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            slotProps={{
              root: { sx: { pointerEvents: "none" } },
              paper: { id: `${id}-sub`, sx: { pointerEvents: "auto", minWidth: 200 } },
            }}
          >
            {node.children.map((child) => (
              <Fragment key={child.id}>
                {child.divider && <Divider />}
                <Item node={child} onClick={() => run(child)} />
              </Fragment>
            ))}
          </Menu>
        )}
      </Fragment>
    )
  }

  return (
    <Menu
      transitionDuration={0}
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={position ? { top: position.y, left: position.x } : undefined}
      slotProps={{
        root: { sx: { pointerEvents: "none" } },
        paper: { id, sx: { pointerEvents: "auto", minWidth } },
      }}
    >
      {nodes.map(renderNode)}
    </Menu>
  )
}
