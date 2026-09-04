import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import type { StatusFile } from "../engine"
import { CompactFileList } from "./CompactFileList"

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
