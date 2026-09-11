import BuildIcon from "@mui/icons-material/Build"
import CallMergeIcon from "@mui/icons-material/CallMerge"
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined"
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined"
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import type { ReactNode } from "react"

// One menu for every ref, wherever the user right-clicks it (v0.15.0): the
// chips on a graph row and the rows of the repository tree. The entries are
// Git Extensions' own (checkout, merge into current, rebase current onto,
// delete / fetch), and the tree keeps its historic `tree-*` testids so the
// specs that drive it still hold.

export type RefMenuKind = "local" | "remote" | "tag" | "submodule"

export type RefMenuTarget = {
  x: number
  y: number
  /** Ref name, or the submodule path. */
  name: string
  kind: RefMenuKind
  /** The checked-out branch: no checkout, no delete. */
  current?: boolean
}

export type RefMenuActions = {
  onCheckout: (name: string) => void
  onMerge: (name: string) => void
  onRebaseOnto: (name: string) => void
  onDelete: (name: string, kind: RefMenuKind) => void
  onFetchRemote: (remote: string) => void
  onConfigureRemote?: (remote: string) => void
  onOpenSubmodule?: (path: string) => void
}

type Action = "checkout" | "merge" | "rebase" | "delete" | "fetch" | "configure" | "open-submodule"

type Entry = { action: Action; label: string; icon: ReactNode; disabled?: boolean }

const remoteOf = (name: string) => name.split("/")[0] ?? name

function entries(target: RefMenuTarget, tree: boolean): Entry[] {
  const checkout: Entry = {
    action: "checkout",
    label: target.kind === "tag" ? "Checkout tag" : "Checkout branch",
    icon: <SwapHorizIcon fontSize="small" />,
    disabled: target.current,
  }
  const merge: Entry = {
    action: "merge",
    label: `Merge '${target.name}' into current branch…`,
    icon: <CallMergeIcon fontSize="small" />,
    disabled: target.current,
  }
  const rebase: Entry = {
    action: "rebase",
    label: `Rebase current branch onto '${target.name}'…`,
    icon: <BuildIcon fontSize="small" />,
    disabled: target.current,
  }
  switch (target.kind) {
    case "local":
      return [
        checkout,
        merge,
        rebase,
        {
          action: "delete",
          label: "Delete branch…",
          icon: <DeleteOutlineIcon fontSize="small" />,
          disabled: target.current,
        },
      ]
    case "remote":
      return [
        checkout,
        merge,
        rebase,
        { action: "fetch", label: `Fetch ${remoteOf(target.name)}`, icon: <CloudOutlinedIcon fontSize="small" /> },
        ...(tree
          ? [
              {
                action: "configure" as const,
                label: "Configure remote…",
                icon: <SettingsOutlinedIcon fontSize="small" />,
              },
            ]
          : []),
      ]
    case "tag":
      return [checkout, { action: "delete", label: "Delete tag…", icon: <DeleteOutlineIcon fontSize="small" /> }]
    case "submodule":
      return [{ action: "open-submodule", label: "Open submodule", icon: <FolderOutlinedIcon fontSize="small" /> }]
  }
}

/** Historic tree testids stay; the chips get the `refctx-*` family. */
function testid(action: Action, kind: RefMenuKind, tree: boolean): string {
  if (!tree) return `refctx-${action}`
  switch (action) {
    case "checkout":
      return kind === "tag" ? "tree-checkout-tag" : "tree-checkout"
    case "delete":
      return kind === "tag" ? "tree-delete-tag" : "tree-delete-branch"
    case "fetch":
      return "tree-fetch-remote"
    case "configure":
      return "tree-configure-remote"
    case "open-submodule":
      return "tree-open-submodule"
    default:
      return `tree-${action}`
  }
}

export function RefContextMenu({
  target,
  variant = "chip",
  actions,
  onClose,
}: {
  target: RefMenuTarget | null
  /** "tree" keeps the repository tree's own testids. */
  variant?: "chip" | "tree"
  actions: RefMenuActions
  onClose: () => void
}) {
  const tree = variant === "tree"
  const run = (action: Action) => () => {
    onClose()
    if (!target) return
    switch (action) {
      case "checkout":
        return actions.onCheckout(target.name)
      case "merge":
        return actions.onMerge(target.name)
      case "rebase":
        return actions.onRebaseOnto(target.name)
      case "delete":
        return actions.onDelete(target.name, target.kind)
      case "fetch":
        return actions.onFetchRemote(remoteOf(target.name))
      case "configure":
        return actions.onConfigureRemote?.(remoteOf(target.name))
      case "open-submodule":
        return actions.onOpenSubmodule?.(target.name)
    }
  }

  return (
    <Menu
      transitionDuration={0}
      open={target !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={target ? { top: target.y, left: target.x } : undefined}
      slotProps={{ paper: { id: "ref-context-menu", sx: { minWidth: 240 } } }}
      data-testid={tree ? "tree-context-menu" : "ref-context-menu"}
    >
      {(target ? entries(target, tree) : []).map((entry) => (
        <MenuItem
          key={entry.action}
          data-testid={testid(entry.action, target!.kind, tree)}
          disabled={entry.disabled}
          onClick={run(entry.action)}
          dense
        >
          <ListItemIcon>{entry.icon}</ListItemIcon>
          <ListItemText>{entry.label}</ListItemText>
        </MenuItem>
      ))}
    </Menu>
  )
}
