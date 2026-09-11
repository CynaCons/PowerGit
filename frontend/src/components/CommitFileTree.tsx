import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined"
import HistoryIcon from "@mui/icons-material/History"
import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Typography from "@mui/material/Typography"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { describeThrown, isAbort, useEngine, type TreeEntry } from "../engine"
import { isDemoMode } from "../hooks/useEngineSession"
import { shortcutLabel } from "../hotkeys/catalog"
import { copyToClipboard } from "./clipboard"

type Props = {
  commitId: string | null
  onSelectFile?: (path: string) => void
  /** v0.16.0: the tree's right-click menu (GE FileStatusList in file-tree
   *  mode: "File history", the double-click default). A folder's path ends
   *  with "/", which is how the engine tells a prefix from a file. */
  onFileHistory?: (path: string) => void
}

type TreeMenu = { x: number; y: number; path: string }

type Loaded = { entries: TreeEntry[]; error: string | null }

export function CommitFileTree({ commitId, onSelectFile, onFileHistory }: Props) {
  const engine = useEngine()
  const [root, setRoot] = useState<Loaded | null>(null)
  const [dirs, setDirs] = useState<Map<string, Loaded>>(new Map())
  const [menu, setMenu] = useState<TreeMenu | null>(null)
  // The commit the tree shows and the controller of every request made for
  // it, the directory expansions included (v0.16.0 review, finding 4: an
  // expansion answered after a commit switch used to land its entries in
  // the next commit's tree). A switch or unmount aborts them all, and an
  // answer is applied only while its commit is still the one shown.
  const shown = useRef<{ commitId: string; ctrl: AbortController } | null>(null)

  useEffect(() => {
    setRoot(null)
    setDirs(new Map())
    shown.current = null
    if (!commitId) return
    if (isDemoMode()) {
      setRoot({ entries: [], error: null })
      return
    }
    const ctrl = new AbortController()
    shown.current = { commitId, ctrl }
    engine
      .tree(commitId, undefined, ctrl.signal)
      .then((entries) => {
        if (!ctrl.signal.aborted) setRoot({ entries, error: null })
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted && !isAbort(e)) setRoot({ entries: [], error: describeThrown(e) })
      })
    return () => {
      ctrl.abort()
      if (shown.current?.ctrl === ctrl) shown.current = null
    }
  }, [engine, commitId])

  function toggleDir(path: string) {
    const request = shown.current
    if (!commitId || request?.commitId !== commitId) return
    if (dirs.has(path)) {
      setDirs((prev) => {
        const next = new Map(prev)
        next.delete(path)
        return next
      })
      return
    }
    setDirs((prev) => new Map(prev).set(path, { entries: [], error: null }))
    const { ctrl } = request
    const stillShown = () => !ctrl.signal.aborted && shown.current?.commitId === request.commitId
    engine
      .tree(commitId, path, ctrl.signal)
      .then((entries) => {
        if (stillShown()) setDirs((prev) => new Map(prev).set(path, { entries, error: null }))
      })
      .catch((e: unknown) => {
        if (stillShown() && !isAbort(e))
          setDirs((prev) => new Map(prev).set(path, { entries: [], error: describeThrown(e) }))
      })
  }

  if (!commitId) {
    return (
      <Box data-testid="commit-file-tree" sx={{ p: 2 }}>
        <Typography color="text.secondary">Select a revision.</Typography>
      </Box>
    )
  }
  if (!root) {
    return (
      <Box data-testid="commit-file-tree" sx={{ p: 2 }}>
        <CircularProgress size={18} />
      </Box>
    )
  }
  if (isDemoMode()) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          The repository tree at a revision comes from the git engine, which the browser demo runs without. In the app
          this tab lists every file at the selected commit, unchanged ones included.
        </Typography>
      </Box>
    )
  }
  if (root.error) {
    return (
      <Box data-testid="commit-file-tree" sx={{ p: 2 }}>
        <Typography color="error">{root.error}</Typography>
      </Box>
    )
  }

  const menuClick = (action: () => void) => () => {
    setMenu(null)
    action()
  }
  return (
    <Box data-testid="commit-file-tree" sx={{ overflow: "auto", py: 0.5 }}>
      <Level
        commitId={commitId}
        entries={root.entries}
        depth={0}
        prefix=""
        dirs={dirs}
        onToggle={toggleDir}
        onSelectFile={onSelectFile}
        onContext={onFileHistory ? (path, x, y) => setMenu({ x, y, path }) : undefined}
      />
      <Menu
        transitionDuration={0}
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
        slotProps={{ paper: { sx: { minWidth: 240 } } }}
        data-testid="file-tree-menu"
      >
        <MenuItem
          data-testid="ctx-tree-file-history"
          dense
          onClick={menuClick(() => menu && onFileHistory?.(menu.path))}
        >
          <ListItemIcon>
            <HistoryIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText slotProps={{ primary: { sx: { fontWeight: 600 } } }}>View file history</ListItemText>
          <Typography variant="caption" color="text.secondary" sx={{ pl: 3 }}>
            {shortcutLabel("browse.fileHistory")}
          </Typography>
        </MenuItem>
        <MenuItem
          data-testid="ctx-tree-copy-path"
          dense
          onClick={menuClick(() => void copyToClipboard(menu?.path ?? ""))}
        >
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy path</ListItemText>
        </MenuItem>
      </Menu>
    </Box>
  )
}

function Level({
  commitId,
  entries,
  depth,
  prefix,
  dirs,
  onToggle,
  onSelectFile,
  onContext,
}: {
  commitId: string
  entries: TreeEntry[]
  depth: number
  prefix: string
  dirs: Map<string, Loaded>
  onToggle: (path: string) => void
  onSelectFile?: (path: string) => void
  onContext?: (path: string, x: number, y: number) => void
}) {
  return (
    <>
      {entries.map((e) => {
        const path = prefix ? `${prefix}/${e.name}` : e.name
        if (e.type === "tree") {
          const open = dirs.has(path)
          const child = dirs.get(path)
          return (
            <Box key={path}>
              <TreeRow
                depth={depth}
                icon={open ? <ExpandMoreIcon sx={{ fontSize: 16 }} /> : <ChevronRightIcon sx={{ fontSize: 16 }} />}
                label={e.name}
                path={path}
                folder
                onClick={() => onToggle(path)}
                onContext={onContext ? (x, y) => onContext(`${path}/`, x, y) : undefined}
              />
              {open && child && child.error && (
                <Typography
                  color="error"
                  variant="body2"
                  sx={{ pl: 2 + (depth + 1) * 1.5, fontSize: 12 }}
                  data-testid="commit-file-tree-error"
                >
                  {child.error}
                </Typography>
              )}
              {open && child && !child.error && (
                <Level
                  commitId={commitId}
                  entries={child.entries}
                  depth={depth + 1}
                  prefix={path}
                  dirs={dirs}
                  onToggle={onToggle}
                  onSelectFile={onSelectFile}
                  onContext={onContext}
                />
              )}
            </Box>
          )
        }
        return (
          <TreeRow
            key={path}
            depth={depth}
            icon={<DescriptionOutlinedIcon sx={{ fontSize: 15 }} />}
            label={e.name}
            path={path}
            onClick={() => onSelectFile?.(path)}
            onContext={
              onContext
                ? (x, y) => {
                    onSelectFile?.(path)
                    onContext(path, x, y)
                  }
                : undefined
            }
          />
        )
      })}
    </>
  )
}

function TreeRow({
  depth,
  icon,
  label,
  path,
  folder,
  onClick,
  onContext,
}: {
  depth: number
  icon: ReactNode
  label: string
  path: string
  folder?: boolean
  onClick: () => void
  onContext?: (x: number, y: number) => void
}) {
  return (
    <Box
      data-testid="commit-file-tree-row"
      data-path={path}
      data-type={folder ? "tree" : "blob"}
      onClick={onClick}
      onContextMenu={
        onContext
          ? (e) => {
              e.preventDefault()
              onContext(e.clientX, e.clientY)
            }
          : undefined
      }
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        pl: 1 + depth * 1.5,
        pr: 1,
        py: 0.25,
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box component="span" sx={{ display: "inline-flex", color: folder ? "text.secondary" : "text.disabled" }}>
        {icon}
      </Box>
      <Typography variant="body2" noWrap sx={{ fontSize: 12.5 }}>
        {label}
      </Typography>
    </Box>
  )
}
