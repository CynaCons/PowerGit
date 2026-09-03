import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"

const STATUS_COLORS: Record<string, string> = {
  A: "#189100",
  M: "#946cd4",
  D: "#d3000B",
  R: "#00a89a",
  U: "#e6a700",
}

export function statusColor(status: string): string {
  return STATUS_COLORS[status.toUpperCase()] ?? "#737373"
}

export type CompactFile = { path: string; status: string }

// Dense Git Extensions-style change row: colored status letter + full path,
// single line, minimal height. One geometry for every consumer.
export function CompactFileList({
  testid,
  files,
  selectedPath,
  selectedSet,
  emptyText,
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
  onSelect?: (f: CompactFile, index: number) => void
  onRowClick?: (f: CompactFile, index: number, e: React.MouseEvent) => void
  onToggle?: (f: CompactFile) => void
  onRowContext?: (f: CompactFile, index: number, x: number, y: number) => void
  onRowDoubleClick?: (f: CompactFile, index: number) => void
}) {
  const isHighlighted = (f: CompactFile) =>
    selectedSet ? selectedSet.has(f.path) : selectedPath === f.path

  return (
    <Box
      data-testid={testid}
      data-hotkey-surface="file-list"
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
        files.map((f, index) => (
          <Box
            key={`${testid}:${f.path}`}
            data-testid={`${testid}-row`}
            onClick={(e) => {
              ;(e.currentTarget.parentElement as HTMLElement | null)?.focus()
              if (onRowClick) onRowClick(f, index, e)
              else onSelect?.(f, index)
            }}
            onDoubleClick={
              onRowDoubleClick ? () => onRowDoubleClick(f, index) : onToggle ? () => onToggle(f) : undefined
            }
            onContextMenu={
              onRowContext
                ? (e) => {
                    e.preventDefault()
                    onRowContext(f, index, e.clientX, e.clientY)
                  }
                : undefined
            }
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.0625,
              cursor: "default",
              bgcolor: isHighlighted(f) ? "action.selected" : "transparent",
              "&:hover": { bgcolor: "action.hover" },
              fontFamily: "Fira Code, ui-monospace, monospace",
              fontSize: 11.5,
              lineHeight: 1.5,
              whiteSpace: "nowrap",
              userSelect: "none",
            }}
          >
            <Box component="span" sx={{ width: 12, flexShrink: 0, fontWeight: 700, textAlign: "center", color: statusColor(f.status) }}>
              {f.status}
            </Box>
            <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis" }} title={f.path}>
              {f.path}
            </Box>
          </Box>
        ))
      )}
    </Box>
  )
}
