import Box from "@mui/material/Box"

// Git Extensions palette (git-coloring mode).
// Source: src/app/GitExtUtils/GitUI/Theming/AppColorDefaults.cs,
// src/app/GitUI/Editor/Diff/DiffHighlightService.cs (forces color.diff.old=red / new=green).
const COLORS = {
  added: "#189100", // AnsiTerminalGreenForeNormal
  removed: "#d3000B", // AnsiTerminalRedForeNormal
  hunk: "#00a89a", // AnsiTerminalCyanForeNormal (color.diff.hunk)
  meta: "#404040", // black fore bold
  context: "#000000",
} as const

type Segment = { text: string; color?: string; bold?: boolean }

function classifyLine(line: string): { segments: Segment[] } {
  if (line.startsWith("@@")) {
    return { segments: [{ text: line, color: COLORS.hunk }] }
  }
  if (
    line.startsWith("diff --git") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("new file mode") ||
    line.startsWith("deleted file mode") ||
    line.startsWith("old mode") ||
    line.startsWith("new mode") ||
    line.startsWith("rename ") ||
    line.startsWith("similarity index") ||
    line.startsWith("Binary files")
  ) {
    return { segments: [{ text: line, color: COLORS.meta, bold: true }] }
  }
  if (line.startsWith("\\")) {
    return { segments: [{ text: line, color: COLORS.meta }] }
  }
  if (line.startsWith("+")) {
    return { segments: [{ text: line, color: COLORS.added }] }
  }
  if (line.startsWith("-")) {
    return { segments: [{ text: line, color: COLORS.removed }] }
  }
  return { segments: [{ text: line, color: COLORS.context }] }
}

export function DiffView({ text }: { text: string }) {
  const lines = text.split("\n")
  return (
    <Box data-testid="diff-view" sx={{ fontFamily: "Fira Code, ui-monospace, monospace", fontSize: 12, lineHeight: 1.5 }}>
      {lines.map((line, i) => {
        const { segments } = classifyLine(line)
        return (
          <Box key={i} sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {segments.map((s, j) => (
              <span key={j} style={{ color: s.color, fontWeight: s.bold ? 700 : 400 }}>
                {s.text || " "}
              </span>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
