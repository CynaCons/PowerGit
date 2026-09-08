import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined"
import BuildIcon from "@mui/icons-material/Build"
import CallMergeIcon from "@mui/icons-material/CallMerge"
import CallSplitIcon from "@mui/icons-material/CallSplit"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CompareArrowsIcon from "@mui/icons-material/CompareArrows"
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
import UndoIcon from "@mui/icons-material/Undo"
import Divider from "@mui/material/Divider"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Typography from "@mui/material/Typography"
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { useEngine, type RemoteInfo, type RepoOperationState } from "../../engine"
import type { ContextTarget, Dialogs } from "../../hooks/useDialogs"
import type { GitActions } from "../../hooks/useGitActions"
import { copyToClipboard } from "../clipboard"
import { CherryPickDialog } from "./CherryPickDialog"
import { commitWebUrl } from "./gitUrls"
import { buildRevisionMenu, type MenuIcon, type MenuNode } from "./revisionMenuModel"
import { RevertDialog } from "./RevertDialog"

export type { ContextTarget }

// The full Git Extensions commit menu (v0.15.0). What is in it, in which
// order, and when an item is hidden or disabled is decided by
// revisionMenuModel.ts (unit-tested); this file only draws the nodes in the
// CommitFileContextMenu house style — an icon on every row, a shortcut
// column, dividers between groups — and dispatches the clicks.

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
  return (
    <MenuItem
      ref={itemRef}
      data-testid={node.id}
      disabled={node.disabled}
      title={node.hint}
      onClick={onClick}
      onMouseEnter={onHover}
      dense
    >
      <ListItemIcon>{node.icon ? ICONS[node.icon] : null}</ListItemIcon>
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

export function RevisionContextMenu({
  target,
  branches,
  tags,
  currentBranch,
  stagedCount,
  operation,
  actions,
  dialogs,
  onClose,
}: {
  target: ContextTarget | null
  branches: string[]
  tags: string[]
  currentBranch: string
  stagedCount: number
  operation: RepoOperationState
  actions: GitActions
  dialogs: Pick<Dialogs, "open">
  onClose: () => void
}) {
  const engine = useEngine()
  const open = target !== null
  const [openSub, setOpenSub] = useState<string | null>(null)
  // Submenus anchor to their own row, so the parent keeps the elements.
  const itemEls = useRef(new Map<string, HTMLLIElement>())
  const [baseSha, setBaseSha] = useState<string | null>(null)
  const [remotes, setRemotes] = useState<RemoteInfo[] | null>(null)
  // Cherry-pick/revert have no extra options (unlike checkout/reset), so
  // their confirm dialogs are self-contained here rather than threaded
  // through App-level state: the target commit is captured locally when the
  // menu item is clicked, independent of the menu's own open/close lifecycle.
  const [cherryPickTarget, setCherryPickTarget] = useState<ContextTarget["row"] | null>(null)
  const [revertTarget, setRevertTarget] = useState<ContextTarget["row"] | null>(null)

  // "Open in browser" needs the remote URL to know whether it can work at
  // all; one request per menu opening, not per repository refresh.
  useEffect(() => {
    if (!open || remotes !== null || !engine.hasRepo) return
    let cancelled = false
    engine
      .remotes()
      .then((r) => {
        if (!cancelled) setRemotes(r)
      })
      .catch(() => {
        if (!cancelled) setRemotes([])
      })
    return () => {
      cancelled = true
    }
  }, [engine, open, remotes])

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
      if (el?.closest("#revision-context-menu, #revision-context-menu-sub")) return
      onClose()
    }
    document.addEventListener("mousedown", closeIfOutside, true)
    document.addEventListener("contextmenu", closeIfOutside, true)
    return () => {
      document.removeEventListener("mousedown", closeIfOutside, true)
      document.removeEventListener("contextmenu", closeIfOutside, true)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) setOpenSub(null)
  }, [open])

  const row = target?.row
  const sha = row?.rev.id ?? ""
  const remote = remotes?.find((r) => r.name === "origin") ?? remotes?.[0]
  const nodes = row
    ? buildRevisionMenu({
        sha,
        subject: row.rev.message,
        artificial: Boolean(row.artificial),
        refs: row.rev.refs,
        currentBranch,
        localBranches: branches,
        tags,
        stagedCount,
        otherSelectedSha: target?.previousSha && target.previousSha !== sha ? target.previousSha : null,
        baseSha,
        webUrl: remote ? commitWebUrl(remote.url, sha) : null,
        operation,
      })
    : []

  function copy(field: string | undefined) {
    if (!row) return
    const { rev } = row
    const text =
      field === "shortSha"
        ? rev.id.slice(0, 7)
        : field === "message"
          ? rev.message
          : field === "author"
            ? rev.author
            : field === "date"
              ? rev.date
              : field === "all"
                ? `${rev.id}\n${rev.author}\n${rev.date}\n${rev.message}`
                : rev.id
    void copyToClipboard(text)
  }

  function run(node: MenuNode) {
    if (!row || node.disabled) return
    const subject = row.rev.message
    const id = node.id
    // "Select as BASE" only records a commit; it must not close the menu's
    // owner state before the next Compare click can use it.
    if (id === "ctx-compare-set-base") {
      setBaseSha(sha)
      onClose()
      return
    }
    onClose()
    if (id.startsWith("ctx-delete-branch-")) return actions.removeBranch(node.value ?? "")
    if (id.startsWith("ctx-delete-tag-")) return actions.removeTag(node.value ?? "")
    if (id.startsWith("ctx-copy-")) return copy(node.value)
    switch (id) {
      case "ctx-open-commit":
        return actions.openCommit()
      case "ctx-checkout":
        return dialogs.open({
          kind: "checkout",
          branch: row.rev.refs.find((r) => branches.includes(r)) ?? currentBranch,
        })
      case "ctx-merge":
        return actions.openMerge(node.value)
      case "ctx-rebase":
        return dialogs.open({ kind: "rebase", onto: sha, ontoSubject: subject })
      case "ctx-rebase-interactive":
        return dialogs.open({ kind: "rebase", onto: sha, ontoSubject: subject, interactive: true })
      case "ctx-reset-soft":
      case "ctx-reset-mixed":
      case "ctx-reset-hard":
        return dialogs.open({ kind: "reset", row, initialMode: node.value as "soft" | "mixed" | "hard" })
      case "ctx-create-branch":
        return dialogs.open({ kind: "createRef", refKind: "branch", sha, subject })
      case "ctx-create-tag":
        return dialogs.open({ kind: "createRef", refKind: "tag", sha, subject })
      case "ctx-cherry-pick":
        return setCherryPickTarget(row)
      case "ctx-revert":
        return setRevertTarget(row)
      case "ctx-fixup":
        return actions.fixupCommit("fixup", subject)
      case "ctx-squash":
        return actions.fixupCommit("squash", subject)
      case "ctx-compare-head":
        return actions.compare(sha, "HEAD", { toLabel: "HEAD" })
      case "ctx-compare-worktree":
        return actions.compare(sha, null)
      case "ctx-compare-selected":
        return actions.compare(target?.previousSha ?? sha, sha)
      case "ctx-compare-to-base":
        return actions.compare(baseSha ?? sha, sha, { fromLabel: `BASE ${(baseSha ?? sha).slice(0, 7)}` })
      case "ctx-archive":
        return void actions.archive(sha)
      case "ctx-open-browser":
        return void actions.openInBrowser(sha)
    }
  }

  const setItemEl = (id: string) => (el: HTMLLIElement | null) => {
    if (el) itemEls.current.set(id, el)
    else itemEls.current.delete(id)
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
        {node.children && openSub === node.id && (
          <Menu
            transitionDuration={0}
            open
            anchorEl={itemEls.current.get(node.id) ?? null}
            onClose={() => setOpenSub(null)}
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            slotProps={{
              root: { sx: { pointerEvents: "none" } },
              paper: { id: "revision-context-menu-sub", sx: { pointerEvents: "auto", minWidth: 200 } },
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
    <>
      <Menu
        transitionDuration={0}
        open={open}
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={target ? { top: target.y, left: target.x } : undefined}
        slotProps={{
          root: { sx: { pointerEvents: "none" } },
          paper: { id: "revision-context-menu", sx: { pointerEvents: "auto", minWidth: 290 } },
        }}
      >
        {nodes.map(renderNode)}
      </Menu>
      {cherryPickTarget && (
        <CherryPickDialog
          open
          commit={cherryPickTarget.rev.id}
          subject={cherryPickTarget.rev.message}
          onClose={() => setCherryPickTarget(null)}
        />
      )}
      {revertTarget && (
        <RevertDialog
          open
          commit={revertTarget.rev.id}
          subject={revertTarget.rev.message}
          onClose={() => setRevertTarget(null)}
        />
      )}
    </>
  )
}
