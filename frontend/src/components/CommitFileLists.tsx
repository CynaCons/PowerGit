import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { useLayoutEffect, useMemo } from "react"
import { useEngine, type StatusFile } from "../engine"
import { CompactFileList } from "./CompactFileList"
import { isHiddenEntry } from "./commitFileMenuModel"
import { publishFileList, useHiddenFiles, useHiddenView } from "./commitFileMenuState"

// The staged/unstaged lists of the commit dialog: a header strip and the
// dense file list, resolving the full StatusFile for every row callback.
export function ListHeader({ label }: { label: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", px: 0.5, flexShrink: 0 }}>
      <Typography variant="subtitle2" sx={{ flex: 1 }}>
        {label}
      </Typography>
    </Box>
  )
}

export function FileListBox({
  files,
  staged,
  selected,
  emptyText,
  onClick,
  onToggle,
  onContext,
  testid,
  tree = false,
}: {
  files: StatusFile[]
  /** Directory tree instead of full paths (v0.14.0, the diff view's mode). */
  tree?: boolean
  staged: boolean
  selected: Set<string>
  emptyText: string
  onClick: (f: StatusFile, index: number, e: React.MouseEvent) => void
  onToggle: (f: StatusFile) => void
  onContext: (f: StatusFile, x: number, y: number) => void
  testid: string
}) {
  const engine = useEngine()
  // v0.16.0: Git Extensions' "Show skip-worktree files" / "Show
  // assumed-unchanged files". Git leaves such files out of status, so the
  // Unstaged list appends them itself, with git's ls-files letter ("S", "h",
  // "s") as the status, when a toggle is on. They are not in the dialog's
  // `files`, so a left click on one selects nothing in the dialog (there is
  // no index for it there); the right-click menu, which is what they are
  // listed for, works as on any row.
  const view = useHiddenView()
  const wantHidden = !staged && (view.skipWorktree || view.assumeUnchanged)
  const hidden = useHiddenFiles(engine, wantHidden, files)
  const rows = useMemo(() => {
    if (!wantHidden || hidden.length === 0) return files
    const listed = new Set(files.map((f) => f.path))
    const extra = hidden.filter(
      (h) =>
        !listed.has(h.path) && ((h.skipWorktree && view.skipWorktree) || (h.assumeUnchanged && view.assumeUnchanged)),
    )
    return extra.length === 0 ? files : [...files, ...extra]
  }, [files, hidden, wantHidden, view.skipWorktree, view.assumeUnchanged])

  // The menu reads the rows and the selection from here (see
  // commitFileMenuState.ts). Layout effect: it must be there before the menu
  // that a right-click opens in the same commit gets painted.
  useLayoutEffect(() => {
    publishFileList(staged, { files: rows, selected })
  }, [staged, rows, selected])
  useLayoutEffect(() => () => publishFileList(staged, null), [staged])

  return (
    <CompactFileList
      testid={testid}
      files={rows}
      tree={tree}
      selectedSet={selected}
      emptyText={emptyText}
      onRowClick={(f, index, e) => {
        const full = files[index]
        if (full) onClick(full, index, e)
        else if (!isHiddenEntry(f)) onClick({ ...f, staged }, index, e)
      }}
      onToggle={(f) => {
        const full = files.find((x) => x.path === f.path)
        if (full) onToggle(full)
        else if (!rows.some((x) => x.path === f.path && isHiddenEntry(x))) onToggle({ ...f, staged })
      }}
      onRowContext={(f, _index, x, y) => {
        const full = rows.find((x) => x.path === f.path)
        onContext(full ?? { ...f, staged }, x, y)
      }}
    />
  )
}
