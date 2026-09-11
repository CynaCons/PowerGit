import AddIcon from "@mui/icons-material/Add"
import BlockIcon from "@mui/icons-material/Block"
import CheckIcon from "@mui/icons-material/Check"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import CompareIcon from "@mui/icons-material/Compare"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined"
import DoNotDisturbIcon from "@mui/icons-material/DoNotDisturb"
import DoneAllIcon from "@mui/icons-material/DoneAll"
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline"
import EditOutlinedIcon from "@mui/icons-material/EditOutlined"
import FileOpenOutlinedIcon from "@mui/icons-material/FileOpenOutlined"
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined"
import HistoryIcon from "@mui/icons-material/History"
import LaunchIcon from "@mui/icons-material/Launch"
import LinkOffIcon from "@mui/icons-material/LinkOff"
import RemoveIcon from "@mui/icons-material/Remove"
import SettingsBackupRestoreIcon from "@mui/icons-material/SettingsBackupRestore"
import SyncDisabledIcon from "@mui/icons-material/SyncDisabled"
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined"
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined"
import Alert from "@mui/material/Alert"
import Divider from "@mui/material/Divider"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Snackbar from "@mui/material/Snackbar"
import Typography from "@mui/material/Typography"
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react"
import { describeThrown, useEngine, type RepoStatus, type StatusFile } from "../engine"
import { isTauriShell } from "../shell"
import { revealInFolder } from "../diagnostics/snapshot"
import { copyToClipboard } from "./clipboard"
import { CommitFileMenuDialogs } from "./CommitFileMenuDialogs"
import { runFileMenuAction, type FilePending } from "./commitFileMenuActions"
import { buildFileMenu, fullPath, type FileMenuIcon, type FileMenuNode } from "./commitFileMenuModel"
import { setHiddenView, useFileList, useHiddenView } from "./commitFileMenuState"

// Context menu of a file in the commit dialog. v0.13.14 (owner: "the right
// click menu on the unstaged files is not professional. Very poor.") gave it
// the RevisionContextMenu house style: an icon on every row, a shortcut
// column, separators between groups. v0.16.0 (owner: "we need functional
// parity with what GE has, right click on my files and do operations on
// them") makes it Git Extensions' FileStatusList menu: what is in it and
// when is decided by commitFileMenuModel.ts (unit-tested); this file draws
// the nodes and dispatches the clicks. The dialog's own callbacks (`actions`)
// keep serving the items that existed before; everything new runs from here
// against the engine (commitFileMenuActions.ts), the dialog learning of the
// result through `onStatus` when it passes one, else through the engine's
// change stream.

export type CommitFileMenuTarget = { x: number; y: number; staged: boolean; path: string; count: number }

export type CommitFileMenuActions = {
  onStage: () => void
  onReset: () => void
  onDelete: () => void
  onDifftool: () => void
  onCopyPath: () => void
  onIgnore: () => void
  /** v0.16.0: GE "File history". Absent, the item stays hidden. */
  onFileHistory?: (path: string) => void
}

const ICONS: Record<FileMenuIcon, ReactNode> = {
  stage: <AddIcon fontSize="small" />,
  unstage: <RemoveIcon fontSize="small" />,
  stageAll: <DoneAllIcon fontSize="small" />,
  reset: <SettingsBackupRestoreIcon fontSize="small" />,
  difftool: <CompareIcon fontSize="small" />,
  open: <FileOpenOutlinedIcon fontSize="small" />,
  openWith: <LaunchIcon fontSize="small" />,
  edit: <EditOutlinedIcon fontSize="small" />,
  move: <DriveFileRenameOutlineIcon fontSize="small" />,
  delete: <DeleteOutlineIcon fontSize="small" />,
  copy: <ContentCopyIcon fontSize="small" />,
  folder: <FolderOpenOutlinedIcon fontSize="small" />,
  ignore: <BlockIcon fontSize="small" />,
  exclude: <VisibilityOffOutlinedIcon fontSize="small" />,
  skip: <SyncDisabledIcon fontSize="small" />,
  assume: <DoNotDisturbIcon fontSize="small" />,
  untrack: <LinkOffIcon fontSize="small" />,
  show: <VisibilityOutlinedIcon fontSize="small" />,
  history: <HistoryIcon fontSize="small" />,
}

function Item({
  node,
  submenu,
  itemRef,
  onClick,
  onHover,
}: {
  node: FileMenuNode
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

export function CommitFileContextMenu({
  target,
  onClose,
  actions,
  onStatus,
}: {
  target: CommitFileMenuTarget | null
  onClose: () => void
  actions: CommitFileMenuActions
  /** v0.16.0, optional: hands the dialog the status an engine call answered with. Without it the dialog refreshes from the engine's change stream. */
  onStatus?: (status: RepoStatus) => void
}) {
  const engine = useEngine()
  const open = target !== null
  const staged = target?.staged ?? false
  const [shell] = useState(isTauriShell)
  const [openSub, setOpenSub] = useState<string | null>(null)
  const itemEls = useRef(new Map<string, HTMLLIElement>())
  const list = useFileList(staged)
  const view = useHiddenView()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<FilePending | null>(null)
  const [root, setRoot] = useState<{ engine: string; root: string } | null>(null)
  // The request behind `root` while it is in flight, so a click that comes
  // before the answer waits for it instead of asking again or doing without.
  const rootRequest = useRef<{ engine: string; promise: Promise<string> } | null>(null)

  // "Copy full path" and "Show in folder" need the working tree's root; one
  // request the first time the menu opens on this repository.
  useEffect(() => {
    if (!open || !engine.repoId || root?.engine === engine.repoId) return
    let cancelled = false
    const id = engine.repoId
    const promise = engine.repoInfo(id).then((info) => {
      if (!info) throw new Error("no repository open")
      if (!cancelled) setRoot({ engine: id, root: info.root })
      return info.root
    })
    rootRequest.current = { engine: id, promise }
    promise.catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [engine, open, root])

  useEffect(() => {
    if (!open) setOpenSub(null)
  }, [open])

  // The rows the action applies to: the selection when the right-clicked row
  // is in it, else that row alone (useCommitFiles.openMenu makes it the
  // selection in the same gesture; the store may be one paint behind).
  const files: StatusFile[] = (() => {
    if (!target) return []
    const rows = list?.files ?? []
    if (list?.selected.has(target.path) && target.count > 1) {
      const picked = rows.filter((f) => list.selected.has(f.path))
      if (picked.length > 0) return picked
    }
    return [rows.find((f) => f.path === target.path) ?? { path: target.path, status: "?", staged }]
  })()
  const nodes = target
    ? buildFileMenu({ staged, files, listCount: list?.files.length ?? 0, shell, view }).filter(
        (n) => n.id !== "ctx-file-history" || actions.onFileHistory !== undefined,
      )
    : []

  const fail = (what: string) => (e: unknown) => setError(`${what}: ${describeThrown(e)}`)
  const done = (status: RepoStatus) => onStatus?.(status)
  const knownRoot = root?.engine === engine.repoId ? root.root : null
  const resolveRoot = async (): Promise<string> => {
    if (knownRoot) return knownRoot
    if (rootRequest.current?.engine === engine.repoId) return rootRequest.current.promise
    const info = engine.repoId ? await engine.repoInfo(engine.repoId) : null
    if (!info) throw new Error("no repository open")
    return info.root
  }

  function click(node: FileMenuNode) {
    if (!target || node.disabled) return
    onClose()
    switch (node.id) {
      case "ctx-copy-relative":
        return actions.onCopyPath()
      case "ctx-copy-full": {
        // The clipboard write stays in the click's gesture when the root is
        // already known (fetched as the menu opened). When it is not yet,
        // the click waits for that fetch: a relative path in place of the
        // full one was the v0.16.0 review's finding 3, and an unknown root
        // is an error the user sees, never a silent fallback.
        const paths = files.map((f) => f.path)
        const copyFull = (r: string) => copyToClipboard(paths.map((p) => fullPath(r, p)).join("\n"))
        if (knownRoot) return void copyFull(knownRoot)
        return void resolveRoot().then(copyFull).catch(fail("copy full path"))
      }
      case "ctx-show-in-folder":
        return void resolveRoot()
          .then((r) => Promise.all(files.map((f) => revealInFolder(fullPath(r, f.path)))))
          .catch(fail("show in folder"))
      case "ctx-show-skip-worktree":
        return setHiddenView({ skipWorktree: !view.skipWorktree })
      case "ctx-show-assume-unchanged":
        return setHiddenView({ assumeUnchanged: !view.assumeUnchanged })
      default:
        return runFileMenuAction(node, { engine, files, staged, list, actions, fail, done, setPending })
    }
  }

  const setItemEl = (id: string) => (el: HTMLLIElement | null) => {
    if (el) itemEls.current.set(id, el)
    else itemEls.current.delete(id)
  }

  const renderNode = (node: FileMenuNode): ReactNode => {
    const item = node.children ? (
      <Item
        node={node}
        submenu
        itemRef={setItemEl(node.id)}
        onClick={() => setOpenSub(node.id)}
        onHover={() => setOpenSub(node.id)}
      />
    ) : (
      <Item node={node} itemRef={setItemEl(node.id)} onClick={() => click(node)} onHover={() => setOpenSub(null)} />
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
              paper: { id: "commit-file-context-menu-sub", sx: { pointerEvents: "auto", minWidth: 220 } },
            }}
          >
            {node.children.map((child) => (
              <Fragment key={child.id}>
                {child.divider && <Divider />}
                <Item node={child} onClick={() => click(child)} />
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
        slotProps={{ paper: { id: "commit-file-context-menu", sx: { minWidth: 280 } } }}
        data-testid="commit-file-menu"
      >
        {nodes.map(renderNode)}
      </Menu>
      <CommitFileMenuDialogs pending={pending} onClose={() => setPending(null)} onStatus={done} onError={fail} />
      <Snackbar
        open={error !== null}
        autoHideDuration={8000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="error" variant="filled" onClose={() => setError(null)} data-testid="commit-file-menu-error">
          {error}
        </Alert>
      </Snackbar>
    </>
  )
}
