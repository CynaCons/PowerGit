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
// single line, minimal height.
export function CompactFileList({
  testid,
  files,
  selectedPath,
  emptyText,
  onSelect,
  onToggle,
}: {
  testid: string
  files: CompactFile[]
  selectedPath: string | null
  emptyText: string
  onSelect: (f: CompactFile) => void
  onToggle?: (f: CompactFile) => void
}) {
  return (
    <Box
      data-testid={testid}
      sx={{ flex: 1, minHeight: 80, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 1 }}
    >
      {files.length === 0 ? (
        <Box sx={{ p: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {emptyText}
          </Typography>
        </Box>
      ) : (
        files.map((f) => (
          <Box
            key={`${testid}:${f.path}`}
            onClick={() => onSelect(f)}
            onDoubleClick={onToggle ? () => onToggle(f) : undefined}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              px: 1,
              py: 0.0625,
              cursor: "pointer",
              bgcolor: selectedPath === f.path ? "action.selected" : "transparent",
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
    </Box>
  )
}
