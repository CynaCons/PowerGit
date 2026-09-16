import { useVirtualizer } from "@tanstack/react-virtual"
import { useEffect, useMemo, useRef, useState } from "react"

const ROW_HEIGHT = 20
const STATUS_COLORS: Record<string, string> = { A: "var(--pg-file-a, #189100)", M: "var(--pg-file-m, #946cd4)", D: "var(--pg-file-d, #d3000B)", R: "var(--pg-file-r, #00a89a)", U: "var(--pg-file-u, #e6a700)", C: "var(--pg-file-c, #c2410c)" }
const statusColor = (status: string) => STATUS_COLORS[status.toUpperCase()] ?? "var(--pg-file-other, #737373)"
export type CompactFile = { path: string; status: string }
type Row = { kind: "file"; file: CompactFile; index: number; depth: number; name: string } | { kind: "dir"; path: string; depth: number; name: string }
const flatRows = (files: CompactFile[]): Row[] => files.map((file, index) => ({ kind: "file", file, index, depth: 0, name: file.path }))

function treeRows(files: CompactFile[], collapsed: Set<string>): Row[] {
  const indexed = files.map((file, index) => ({ file, index, parts: file.path.split("/") })).sort((a, b) => a.file.path.localeCompare(b.file.path))
  const rows: Row[] = []; let open: string[] = []
  for (const { file, index, parts } of indexed) {
    const dirs = parts.slice(0, -1); let common = 0
    while (common < dirs.length && common < open.length && open[common] === dirs[common]) common++
    open = open.slice(0, common)
    for (let d = common; d < dirs.length; d++) { open.push(dirs[d]); const path = open.join("/"); if (!open.slice(0, -1).some((_, i) => collapsed.has(open.slice(0, i + 1).join("/")))) rows.push({ kind: "dir", path, depth: d, name: dirs[d] }) }
    if (!dirs.some((_, i) => collapsed.has(dirs.slice(0, i + 1).join("/")))) rows.push({ kind: "file", file, index, depth: dirs.length, name: parts.at(-1) ?? file.path })
  }
  return rows
}

export function CompactFileList({ testid, files, selectedPath, selectedSet, emptyText, tree = false, onSelect, onRowClick, onToggle, onRowContext, onRowDoubleClick }: {
  testid: string; files: CompactFile[]; selectedPath?: string | null; selectedSet?: Set<string>; emptyText: string; tree?: boolean
  onSelect?: (f: CompactFile, index: number) => void; onRowClick?: (f: CompactFile, index: number, e: React.MouseEvent) => void; onToggle?: (f: CompactFile) => void; onRowContext?: (f: CompactFile, index: number, x: number, y: number) => void; onRowDoubleClick?: (f: CompactFile, index: number) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null); const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const rows = useMemo(() => tree ? treeRows(files, collapsed) : flatRows(files), [files, tree, collapsed])
  const selectedIndex = rows.findIndex((r) => r.kind === "file" && (selectedSet ? selectedSet.has(r.file.path) : selectedPath === r.file.path)); const cursor = useRef(Math.max(0, selectedIndex))
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => ROW_HEIGHT, getItemKey: (i) => { const row = rows[i]; return row.kind === "file" ? `f:${row.file.path}` : `d:${row.path}` }, overscan: 12 })
  useEffect(() => { if (selectedIndex >= 0) { cursor.current = selectedIndex; virtualizer.scrollToIndex(selectedIndex, { align: "auto" }) } }, [selectedIndex, virtualizer])
  const activate = (row: Row, event?: React.MouseEvent) => { if (row.kind !== "file") return; if (event && onRowClick) onRowClick(row.file, row.index, event); else onSelect?.(row.file, row.index) }
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => { if (!rows.length) return; if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); cursor.current = Math.max(0, Math.min(rows.length - 1, cursor.current + (e.key === "ArrowDown" ? 1 : -1))); virtualizer.scrollToIndex(cursor.current, { align: "auto" }); return }; const row = rows[cursor.current]; if ((e.key === "Enter" || e.key === " ") && row?.kind === "file") { e.preventDefault(); if (e.key === " ") onToggle?.(row.file); else activate(row) } }
  return <div ref={parentRef} data-testid={testid} data-hotkey-surface="file-list" data-mode={tree ? "tree" : "flat"} tabIndex={0} onKeyDown={onKeyDown} className="compact-file-list">
    {files.length === 0 ? <div className="compact-file-empty">{emptyText}</div> : <div className="compact-file-track" style={{ height: virtualizer.getTotalSize() }}>{virtualizer.getVirtualItems().map((item) => { const row = rows[item.index]; const style = { transform: `translateY(${item.start}px)`, height: item.size, paddingLeft: `${8 + row.depth * 12}px` }
      if (row.kind === "dir") return <div key={item.key} style={style} className="compact-file-row compact-file-dir" data-testid={`${testid}-dir`} data-path={row.path} onClick={() => setCollapsed((old) => { const next = new Set(old); if (next.has(row.path)) next.delete(row.path); else next.add(row.path); return next })}><span className="compact-file-chevron">{collapsed.has(row.path) ? "›" : "⌄"}</span><span title={row.path}>{row.name}</span></div>
      const selected = selectedSet ? selectedSet.has(row.file.path) : selectedPath === row.file.path; const slash = row.name.lastIndexOf("/"); const dir = tree ? "" : row.name.slice(0, slash + 1); const name = tree ? row.name : row.name.slice(slash + 1)
      return <div key={item.key} style={style} className={`compact-file-row${selected ? " compact-file-selected" : ""}`} data-testid={`${testid}-row`} onClick={(event) => { parentRef.current?.focus(); cursor.current = item.index; activate(row, event) }} onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row.file, row.index) : onToggle ? () => onToggle(row.file) : undefined} onContextMenu={onRowContext ? (event) => { event.preventDefault(); cursor.current = item.index; onRowContext(row.file, row.index, event.clientX, event.clientY) } : undefined}><span className="compact-file-status" style={{ color: statusColor(row.file.status) }}>{row.file.status}</span><span className="compact-file-path" title={row.file.path}><span className="compact-file-dirname">{dir}</span>{name}</span></div>
    })}</div>}
  </div>
}
