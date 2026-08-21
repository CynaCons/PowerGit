import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogContent from "@mui/material/DialogContent"
import ListItemIcon from "@mui/material/ListItemIcon"
import ListItemText from "@mui/material/ListItemText"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import { useEffect, useRef, useState } from "react"
import {
  addToIgnore,
  deleteFiles,
  fetchWorkTreeDiff,
  stagePaths,
  type DiffDto,
  type DiffOptions,
  type RepoStatus,
  type StatusFile,
} from "../engine"
import { statusColor } from "./CompactFileList"
import { DiffOptionsBar } from "./DiffOptionsBar"
import { DiffView } from "./DiffView"
import { IgnoreDialog } from "./IgnoreDialog"

type Props = {
  open: boolean
  status: RepoStatus | null
  onClose: () => void
  onStatus: (status: RepoStatus) => void
  onCommit: (message: string) => Promise<void>
}

// Layout mirrors Git Extensions FormCommit: unstaged/staged lists stacked on
// the left, selected-file diff on the right, commit message bottom-right.
// Selection follows GE: click selects, ctrl+click toggles, shift+click ranges,
// double-click stages/unstages. Right-click opens the file context menu.
export function CommitDialog({ open, status, onClose, onStatus, onCommit }: Props) {
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null)
  const [selUnstaged, setSelUnstaged] = useState<Set<string>>(new Set())
  const [selStaged, setSelStaged] = useState<Set<string>>(new Set())
  const [diff, setDiff] = useState<DiffDto | null>(null)
  const [diffOpts, setDiffOpts] = useState<DiffOptions>({ context: 3, ws: false, full: false })
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; staged: boolean } | null>(null)
  const [ignoreFor, setIgnoreFor] = useState<string | null>(null)
  const anchorRef = useRef<{ unstaged: number; staged: number }>({ unstaged: -1, staged: -1 })

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setSelUnstaged(new Set())
    setSelStaged(new Set())
    setDiff(null)
    setMessage("")
    setError(null)
    setMenu(null)
  }, [open])

  useEffect(() => {
    if (!selected) {
      setDiff(null)
      return
    }
    let cancelled = false
    fetchWorkTreeDiff(selected.path, selected.staged, diffOpts)
      .then((d) => {
        if (!cancelled) setDiff(d)
      })
      .catch((e: unknown) => {
        if (!cancelled) setDiff({ path: selected.path, text: e instanceof Error ? e.message : "diff failed", binary: false })
      })
    return () => {
      cancelled = true
    }
  }, [selected, diffOpts])

  function clickRow(list: StatusFile[], staged: boolean, index: number, e: React.MouseEvent) {
    const setter = staged ? setSelStaged : setSelUnstaged
    const current = staged ? selStaged : selUnstaged
    if (e.shiftKey && anchorRef.current[staged ? "staged" : "unstaged"] >= 0) {
      const a = anchorRef.current[staged ? "staged" : "unstaged"]
      const [lo, hi] = [Math.min(a, index), Math.max(a, index)]
      const next = new Set(current)
      for (let i = lo; i <= hi; i++) next.add(list[i].path)
      setter(next)
    } else if (e.ctrlKey || e.metaKey) {
      const next = new Set(current)
      if (next.has(list[index].path)) next.delete(list[index].path)
      else next.add(list[index].path)
      setter(next)
      anchorRef.current[staged ? "staged" : "unstaged"] = index
    } else {
      setter(new Set([list[index].path]))
      anchorRef.current[staged ? "staged" : "unstaged"] = index
    }
    setSelected({ path: list[index].path, staged })
  }

  async function toggle(file: StatusFile) {
    try {
      onStatus(await stagePaths([file.path], file.staged))
      setSelected((cur) => (cur?.path === file.path ? null : cur))
    } catch (e) {
      setError(e instanceof Error ? e.message : "stage failed")
    }
  }

  async function stageSelection(staged: boolean) {
    const paths = [...(staged ? selStaged : selUnstaged)]
    if (paths.length === 0) return
    try {
      onStatus(await stagePaths(paths, staged))
      setSelStaged(new Set())
      setSelUnstaged(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : "stage failed")
    }
  }

  async function deleteSelection(staged: boolean) {
    const paths = [...(staged ? selStaged : selUnstaged)]
    if (paths.length === 0) return
    if (!window.confirm(`Delete ${paths.length} file(s)? This cannot be undone.`)) return
    try {
      onStatus(await deleteFiles(paths))
      setSelStaged(new Set())
      setSelUnstaged(new Set())
      setSelected(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed")
    }
  }

  async function ignorePattern(pattern: string) {
    onStatus(await addToIgnore(pattern))
    setIgnoreFor(null)
  }

  const canCommit = Boolean(message.trim()) && (status?.stagedCount ?? 0) > 0

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" data-testid="commit-overlay">
      <DialogContent sx={{ display: "flex", gap: 2, minHeight: 480, p: 2 }}>
        <Box sx={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 1, userSelect: "none" }}>
          <ListHeader
            label={`Unstaged (${status?.unstagedCount ?? 0})`}
            actionLabel="Stage selected"
            onAction={selUnstaged.size > 0 ? () => stageSelection(false) : undefined}
          />
          <FileListBox
            testid="unstaged-list"
            files={status?.unstaged ?? []}
            selected={selUnstaged}
            emptyText="Working tree clean."
            onClick={(_f, i, e) => clickRow(status?.unstaged ?? [], false, i, e)}
            onToggle={toggle}
            onContext={(x, y) => setMenu({ x, y, staged: false })}
          />
          <ListHeader
            label={`Staged (${status?.stagedCount ?? 0})`}
            actionLabel="Unstage selected"
            onAction={selStaged.size > 0 ? () => stageSelection(true) : undefined}
          />
          <FileListBox
            testid="staged-list"
            files={status?.staged ?? []}
            selected={selStaged}
            emptyText="Nothing staged. Double-click an unstaged file to stage it."
            onClick={(_f, i, e) => clickRow(status?.staged ?? [], true, i, e)}
            onToggle={toggle}
            onContext={(x, y) => setMenu({ x, y, staged: true })}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <Box
              data-testid="commit-diff"
              sx={{ flex: 1, minHeight: 0, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}
            >
              {diff ? (
                <DiffView text={diff.text} />
              ) : (
                <Typography color="text.secondary">Select a file to see its diff.</Typography>
              )}
            </Box>
            <DiffOptionsBar options={diffOpts} onChange={setDiffOpts} />
          </Box>
          {error && <Typography color="error">{error}</Typography>}
          <TextField
            data-testid="commit-message"
            fullWidth
            multiline
            minRows={3}
            placeholder="Commit message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              data-testid="commit-submit"
              variant="contained"
              disabled={!canCommit}
              onClick={async () => {
                await onCommit(message.trim())
                setMessage("")
              }}
            >
              Commit
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <Menu
        open={menu !== null}
        onClose={() => setMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
      >
        <MenuItem
          data-testid="ctx-stage-selected"
          onClick={() => {
            if (menu) stageSelection(menu.staged)
            setMenu(null)
          }}
        >
          <ListItemIcon />
          <ListItemText>{menu?.staged ? "Unstage selected" : "Stage selected"}</ListItemText>
        </MenuItem>
        <MenuItem
          data-testid="ctx-delete-file"
          onClick={() => {
            if (menu) deleteSelection(menu.staged)
            setMenu(null)
          }}
        >
          <ListItemText>Delete…</ListItemText>
        </MenuItem>
        <MenuItem
          data-testid="ctx-ignore-file"
          onClick={() => {
            const paths = menu ? [...(menu.staged ? selStaged : selUnstaged)] : []
            if (paths.length > 0) setIgnoreFor(paths[0])
            setMenu(null)
          }}
        >
          <ListItemText>Add to .gitignore…</ListItemText>
        </MenuItem>
      </Menu>

      {ignoreFor !== null && (
        <IgnoreDialog open initialPattern={ignoreFor} onClose={() => setIgnoreFor(null)} onConfirm={ignorePattern} />
      )}
    </Dialog>
  )
}

function ListHeader({
  label,
  actionLabel,
  onAction,
}: {
  label: string
  actionLabel: string
  onAction?: () => void
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", px: 0.5 }}>
      <Typography variant="subtitle2" sx={{ flex: 1 }}>
        {label}
      </Typography>
      {onAction && (
        <Button size="small" sx={{ py: 0, fontSize: 11 }} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  )
}

function FileListBox({
  files,
  selected,
  emptyText,
  onClick,
  onToggle,
  onContext,
  testid,
}: {
  files: StatusFile[]
  selected: Set<string>
  emptyText: string
  onClick: (f: StatusFile, index: number, e: React.MouseEvent) => void
  onToggle: (f: StatusFile) => void
  onContext: (x: number, y: number) => void
  testid: string
}) {
  return (
    <CompactFileListShell testid={testid}>
      {files.length === 0 ? (
        <Box sx={{ p: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {emptyText}
          </Typography>
        </Box>
      ) : (
        files.map((f, i) => (
          <Box
            key={`${testid}:${f.path}`}
            onClick={(e) => onClick(f, i, e)}
            onDoubleClick={() => onToggle(f)}
            onContextMenu={(e) => {
              e.preventDefault()
              if (!selected.has(f.path)) onClick(f, i, { ...e, ctrlKey: false, shiftKey: false, metaKey: false } as React.MouseEvent)
              onContext(e.clientX, e.clientY)
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.0625,
              cursor: "default",
              bgcolor: selected.has(f.path) ? "action.selected" : "transparent",
              "&:hover": { bgcolor: "action.hover" },
              fontFamily: "Fira Code, ui-monospace, monospace",
              fontSize: 11.5,
              lineHeight: 1.6,
              whiteSpace: "nowrap",
            }}
          >
            <Box component="span" sx={{ width: 10, flexShrink: 0, fontWeight: 700, color: statusColor(f.status) }}>
              {f.status}
            </Box>
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }} title={f.path}>
              {f.path}
            </Box>
          </Box>
        ))
      )}
    </CompactFileListShell>
  )
}

function CompactFileListShell({ testid, children }: { testid: string; children: React.ReactNode }) {
  return (
    <Box
      data-testid={testid}
      sx={{ flex: 1, minHeight: 80, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}
    >
      {children}
    </Box>
  )
}
