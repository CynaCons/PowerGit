import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ChevronRightIcon from "@mui/icons-material/ChevronRight"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { useMemo, useState } from "react"
import { MONO_FONT } from "../theme"

const STATUS_COLORS: Record<string, string> = {
  A: "var(--pg-file-a, #189100)",
  M: "var(--pg-file-m, #946cd4)",
  D: "var(--pg-file-d, #d3000B)",
  R: "var(--pg-file-r, #00a89a)",
  U: "var(--pg-file-u, #e6a700)",
}

function statusColor(status: string): string {
  return STATUS_COLORS[status.toUpperCase()] ?? "var(--pg-file-other, #737373)"
}

export type CompactFile = { path: string; status: string }

// One visual row: either a file (with its index in `files`) or a directory
// header of the hierarchical mode (v0.13.16, owner: "a directory
// hierarchical structure like in Git Extensions").
type Row =
  | { kind: "file"; file: CompactFile; index: number; depth: number; name: string }
  | { kind: "dir"; path: string; depth: number; name: string }

function flatRows(files: CompactFile[]): Row[] {
  return files.map((file, index) => ({ kind: "file", file, index, depth: 0, name: file.path }))
}

function treeRows(files: CompactFile[], collapsed: Set<string>): Row[] {
  // Sort so a directory's files follow its header; directories before the
  // files that sit beside them, like Git Extensions' file tree.
  const indexed = files.map((file, index) => ({ file, index, parts: file.path.split("/") }))
  indexed.sort((a, b) => {
    const n = Math.min(a.parts.length, b.parts.length) - 1
    for (let i = 0; i < n; i++) {
      const c = a.parts[i].localeCompare(b.parts[i])
      if (c !== 0) return c
    }
    if (a.parts.length !== b.parts.length) return b.parts.length - a.parts.length
    return a.parts[n].localeCompare(b.parts[n])
  })
  const rows: Row[] = []
  let open: string[] = []
  for (const { file, index, parts } of indexed) {
    const dirs = parts.slice(0, -1)
    let common = 0
    while (common < dirs.length && common < open.length && open[common] === dirs[common]) common++
    open = open.slice(0, common)
    for (let d = common; d < dirs.length; d++) {
      open.push(dirs[d])
      const path = open.join("/")
      const hidden = open.slice(0, -1).some((_, i) => collapsed.has(open.slice(0, i + 1).join("/")))
      if (!hidden) rows.push({ kind: "dir", path, depth: d, name: dirs[d] })
    }
    const hiddenFile = dirs.some((_, i) => collapsed.has(dirs.slice(0, i + 1).join("/")))
    if (!hiddenFile) rows.push({ kind: "file", file, index, depth: dirs.length, name: parts[parts.length - 1] })
  }
  return rows
}

// Dense Git Extensions-style change row: colored status letter + path,
// single line, minimal height. One geometry for every consumer. `tree`
// groups files under collapsible directory headers and shows file names.
export function CompactFileList({
  testid,
  files,
  selectedPath,
  selectedSet,
  emptyText,
  tree = false,
  onSelect,
  onRowClick,
  onToggle,
  onRowContext,
  onRowDoubleClick,
}: {
  testid: string
  files: CompactFile[]
  selectedPath?: string | null
  selectedSet?: Set<string>
  emptyText: string
  tree?: boolean
  onSelect?: (f: CompactFile, index: number) => void
  onRowClick?: (f: CompactFile, index: number, e: React.MouseEvent) => void
  onToggle?: (f: CompactFile) => void
  onRowContext?: (f: CompactFile, index: number, x: number, y: number) => void
  onRowDoubleClick?: (f: CompactFile, index: number) => void
}) {
  const isHighlighted = (f: CompactFile) => (selectedSet ? selectedSet.has(f.path) : selectedPath === f.path)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const rows = useMemo(() => (tree ? treeRows(files, collapsed) : flatRows(files)), [files, tree, collapsed])
  const toggleDir = (path: string) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })

  const rowSx = (depth: number) => ({
    display: "flex",
    alignItems: "center",
    gap: 0.75,
    pl: 1 + depth * 1.5,
    pr: 1,
    py: 0.0625,
    cursor: "default",
    "&:hover": { bgcolor: "action.hover" },
    fontFamily: MONO_FONT,
    fontSize: 11.5,
    lineHeight: 1.5,
    whiteSpace: "nowrap",
    userSelect: "none",
  })

  return (
    <Box
      data-testid={testid}
      data-hotkey-surface="file-list"
      data-mode={tree ? "tree" : "flat"}
      tabIndex={0}
      sx={{
        flex: 1,
        minHeight: 80,
        overflow: "auto",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        outline: "none",
        "&:focus-visible": { boxShadow: "inset 0 0 0 1px", borderColor: "primary.main" },
      }}
    >
      {files.length === 0 ? (
        <Box sx={{ p: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {emptyText}
          </Typography>
        </Box>
      ) : (
        rows.map((row) =>
          row.kind === "dir" ? (
            <Box
              key={`${testid}:dir:${row.path}`}
              data-testid={`${testid}-dir`}
              data-path={row.path}
              onClick={() => toggleDir(row.path)}
              sx={{ ...rowSx(row.depth), color: "text.secondary" }}
            >
              {collapsed.has(row.path) ? (
                <ChevronRightIcon sx={{ fontSize: 14, ml: "-3px" }} />
              ) : (
                <ExpandMoreIcon sx={{ fontSize: 14, ml: "-3px" }} />
              )}
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }} title={row.path}>
                {row.name}
              </Box>
            </Box>
          ) : (
            <Box
              key={`${testid}:${row.file.path}`}
              data-testid={`${testid}-row`}
              onClick={(e) => {
                ;(e.currentTarget.parentElement as HTMLElement | null)?.focus()
                if (onRowClick) onRowClick(row.file, row.index, e)
                else onSelect?.(row.file, row.index)
              }}
              onDoubleClick={
                onRowDoubleClick
                  ? () => onRowDoubleClick(row.file, row.index)
                  : onToggle
                    ? () => onToggle(row.file)
                    : undefined
              }
              onContextMenu={
                onRowContext
                  ? (e) => {
                      e.preventDefault()
                      onRowContext(row.file, row.index, e.clientX, e.clientY)
                    }
                  : undefined
              }
              sx={{ ...rowSx(row.depth), bgcolor: isHighlighted(row.file) ? "action.selected" : "transparent" }}
            >
              <Box
                component="span"
                sx={{
                  width: 12,
                  flexShrink: 0,
                  fontWeight: 700,
                  textAlign: "center",
                  color: statusColor(row.file.status),
                }}
              >
                {row.file.status}
              </Box>
              <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }} title={row.file.path}>
                {row.name}
              </Box>
            </Box>
          ),
        )
      )}
    </Box>
  )
}
