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
import { shortcutLabel, useHotkeyLayer } from "../hotkeys"
import {
  addToIgnore,
  deleteFiles,
  describeThrown,
  fetchWorkTreeDiff,
  stagePaths,
  type DiffDto,
  type DiffOptions,
  type RepoStatus,
  type StatusFile,
} from "../engine"
import { CompactFileList } from "./CompactFileList"
import { DiffOptionsBar } from "./DiffOptionsBar"
import { DiffView } from "./DiffView"
import { IgnoreDialog } from "./IgnoreDialog"

type Props = {
  open: boolean
  status: RepoStatus | null
  amend?: boolean
  initialMessage?: string
  onClose: () => void
  onStatus: (status: RepoStatus) => void
  onCommit: (message: string) => Promise<void>
}

// Layout mirrors Git Extensions FormCommit: unstaged/staged lists stacked on
// the left, selected-file diff on the right, commit message bottom-right.
// Selection follows GE: click selects, ctrl+click toggles, shift+click ranges,
// double-click stages/unstages. Right-click opens the file context menu.
export function CommitDialog({ open, status, amend, initialMessage, onClose, onStatus, onCommit }: Props) {
  const [selected, setSelected] = useState<{ path: string; staged: boolean } | null>(null)
  const [selUnstaged, setSelUnstaged] = useState<Set<string>>(new Set())
  const [selStaged, setSelStaged] = useState<Set<string>>(new Set())
  const [diff, setDiff] = useState<DiffDto | null>(null)
  const [diffOpts, setDiffOpts] = useState<DiffOptions>({ context: 3, ws: false, full: false })
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; staged: boolean; path: string } | null>(null)
  const [ignoreFor, setIgnoreFor] = useState<string | null>(null)
  const anchorRef = useRef<{ unstaged: number; staged: number }>({ unstaged: -1, staged: -1 })

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setSelUnstaged(new Set())
    setSelStaged(new Set())
    setDiff(null)
    setMessage(amend ? (initialMessage ?? "") : "")
    setError(null)
    setMenu(null)
  }, [open, amend, initialMessage])

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
        if (!cancelled) setDiff({ path: selected.path, text: `diff failed: ${describeThrown(e)}`, binary: false })
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
      setError(`stage failed: ${describeThrown(e)}`)
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
      setError(`stage failed: ${describeThrown(e)}`)
    }
  }

  async function stageAll(unstage: boolean) {
    const files = unstage ? status?.staged : status?.unstaged
    const paths = (files ?? []).map((f) => f.path)
    if (paths.length === 0) return
    try {
      onStatus(await stagePaths(paths, unstage))
      setSelStaged(new Set())
      setSelUnstaged(new Set())
    } catch (e) {
      setError(`stage failed: ${describeThrown(e)}`)
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
      setError(`delete failed: ${describeThrown(e)}`)
    }
  }

  async function ignorePattern(pattern: string) {
    onStatus(await addToIgnore(pattern))
    setIgnoreFor(null)
  }

  const canCommit = Boolean(message.trim()) && (status?.stagedCount ?? 0) > 0

  useHotkeyLayer(
    "commit",
    {
      "diff.stageSelected": () => {
        const testid = document.activeElement?.closest("[data-hotkey-surface='file-list']")?.getAttribute("data-testid")
        if (testid === "unstaged-list") void stageSelection(false)
      },
      "diff.unstageSelected": () => {
        const testid = document.activeElement?.closest("[data-hotkey-surface='file-list']")?.getAttribute("data-testid")
        if (testid === "staged-list") void stageSelection(true)
      },
    },
    open,
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      data-testid="commit-overlay"
      slotProps={{
        paper: {
          sx: {
            width: "min(96vw, 1100px)",
            height: "min(80vh, 720px)",
            maxHeight: "80vh",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      <DialogContent sx={{ display: "flex", gap: 2, p: 2, flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Box sx={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 1, userSelect: "none", minHeight: 0 }}>
          <ListHeader label={`Unstaged (${status?.unstagedCount ?? 0})`} />
          <FileListBox
            testid="unstaged-list"
            staged={false}
            files={status?.unstaged ?? []}
            selected={selUnstaged}
            emptyText="Working tree clean."
            onClick={(_f, i, e) => clickRow(status?.unstaged ?? [], false, i, e)}
            onToggle={toggle}
            onContext={(f, x, y) => setMenu({ x, y, staged: false, path: f.path })}
          />
          <Box data-testid="commit-stage-bar" sx={{ display: "flex", justifyContent: "space-between", gap: 0.5, flexShrink: 0 }}>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Button
                size="small"
                data-testid="stage-selected"
                disabled={selUnstaged.size === 0}
                onClick={() => void stageSelection(false)}
              >
                Stage
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                  {shortcutLabel("diff.stageSelected")}
                </Typography>
              </Button>
              <Button
                size="small"
                data-testid="stage-all"
                disabled={(status?.unstagedCount ?? 0) === 0}
                onClick={() => void stageAll(false)}
              >
                Stage all
              </Button>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Button
                size="small"
                data-testid="unstage-selected"
                disabled={selStaged.size === 0}
                onClick={() => void stageSelection(true)}
              >
                Unstage
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                  {shortcutLabel("diff.unstageSelected")}
                </Typography>
              </Button>
              <Button
                size="small"
                data-testid="unstage-all"
                disabled={(status?.stagedCount ?? 0) === 0}
                onClick={() => void stageAll(true)}
              >
                Unstage all
              </Button>
            </Box>
          </Box>
          <ListHeader label={`Staged (${status?.stagedCount ?? 0})`} />
          <FileListBox
            testid="staged-list"
            staged={true}
            files={status?.staged ?? []}
            selected={selStaged}
            emptyText="Nothing staged. Double-click an unstaged file or use Stage."
            onClick={(_f, i, e) => clickRow(status?.staged ?? [], true, i, e)}
            onToggle={toggle}
            onContext={(f, x, y) => setMenu({ x, y, staged: true, path: f.path })}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1, minHeight: 0 }}>
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
          <Typography variant="body2" color="error" sx={{ minHeight: 20, flexShrink: 0 }}>
            {error ?? "\u00a0"}
          </Typography>
          <TextField
            data-testid="commit-message"
            fullWidth
            multiline
            minRows={3}
            maxRows={4}
            placeholder="Commit message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            slotProps={{ htmlInput: { "data-testid": "commit-message-input" } }}
            sx={{ flexShrink: 0 }}
          />
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, flexShrink: 0 }}>
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
              {amend ? "Amend" : "Commit"}
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
          <Typography variant="caption" color="text.secondary" sx={{ pl: 2 }}>
            {menu?.staged ? shortcutLabel("diff.unstageSelected") : shortcutLabel("diff.stageSelected")}
          </Typography>
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
            if (menu) setIgnoreFor(menu.path)
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

function ListHeader({ label }: { label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", px: 0.5, flexShrink: 0 }}>
      <Typography variant="subtitle2" sx={{ flex: 1 }}>
        {label}
      </Typography>
    </Box>
  )
}

function FileListBox({
  files,
  staged,
  selected,
  emptyText,
  onClick,
  onToggle,
  onContext,
  testid,
}: {
  files: StatusFile[]
  staged: boolean
  selected: Set<string>
  emptyText: string
  onClick: (f: StatusFile, index: number, e: React.MouseEvent) => void
  onToggle: (f: StatusFile) => void
  onContext: (f: StatusFile, x: number, y: number) => void
  testid: string
}) {
  return (
    <CompactFileList
      testid={testid}
      files={files}
      selectedSet={selected}
      emptyText={emptyText}
      onRowClick={(f, index, e) => {
        const full = files[index]
        if (full) onClick(full, index, e)
        else onClick({ ...f, staged }, index, e)
      }}
      onToggle={(f) => {
        const full = files.find((x) => x.path === f.path)
        onToggle(full ?? { ...f, staged })
      }}
      onRowContext={(f, _index, x, y) => {
        const full = files.find((x) => x.path === f.path)
        onContext(full ?? { ...f, staged }, x, y)
      }}
    />
  )
}
