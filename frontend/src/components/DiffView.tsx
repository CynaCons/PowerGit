import Box from "@mui/material/Box"
import { codeSx } from "../theme"

// Git Extensions palette (git-coloring mode).
// Source: src/app/GitExtUtils/GitUI/Theming/AppColorDefaults.cs,
// src/app/GitUI/Editor/Diff/DiffHighlightService.cs (forces color.diff.old=red / new=green).
const COLORS = {
  added: "#189100", // AnsiTerminalGreenForeNormal
  removed: "#d3000B", // AnsiTerminalRedForeNormal
  hunk: "#00a89a", // AnsiTerminalCyanForeNormal (color.diff.hunk)
  meta: "#404040", // black fore bold
  context: "#000000",
  gutter: "#8a8a8a", // muted line-number margin, matches GE's FileViewer gutter
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

// Unified diff hunk header, e.g. "@@ -12,7 +12,9 @@ optional heading". The
// leading number of each side is where that side's line numbering restarts.
const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

type GutterLine = { segments: Segment[]; oldNum: number | null; newNum: number | null }

// Walks the unified diff text once, tracking the running old/new line
// counters so each rendered row can show both side's line numbers, like Git
// Extensions' FileViewer margin. Counters reset on every hunk header since a
// diff can contain several hunks, each with its own starting numbers.
function parseGutterLines(text: string): GutterLine[] {
  let oldNum = 0
  let newNum = 0
  let inHunk = false
  return text.split("\n").map((line) => {
    const { segments } = classifyLine(line)
    const hunk = line.startsWith("@@") ? HUNK_HEADER.exec(line) : null
    if (hunk) {
      oldNum = Number(hunk[1])
      newNum = Number(hunk[2])
      inHunk = true
      return { segments, oldNum: null, newNum: null }
    }
    if (!inHunk || line.startsWith("\\")) {
      // Meta lines before the first hunk, and "\ No newline at end of
      // file", carry no line number on either side.
      return { segments, oldNum: null, newNum: null }
    }
    if (line.startsWith("+")) {
      return { segments, oldNum: null, newNum: newNum++ }
    }
    if (line.startsWith("-")) {
      return { segments, oldNum: oldNum++, newNum: null }
    }
    const both = { segments, oldNum, newNum }
    oldNum += 1
    newNum += 1
    return both
  })
}

const GUTTER_COL_WIDTH = 40

export function DiffView({ text }: { text: string }) {
  const lines = parseGutterLines(text)
  return (
    <Box
      data-testid="diff-view"
      sx={{
        ...codeSx,
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: "pre",
        tabSize: 4,
        overflowX: "auto",
        maxWidth: "100%",
      }}
    >
      {lines.map((line, i) => (
        <Box key={i} sx={{ display: "flex", width: "max-content", minWidth: "100%" }}>
          <Box
            data-testid="diff-gutter"
            aria-hidden="true"
            sx={{
              flexShrink: 0,
              position: "sticky",
              left: 0,
              display: "flex",
              bgcolor: "#ffffff",
              color: COLORS.gutter,
              userSelect: "none",
              borderRight: "1px solid #e0e0e0",
            }}
          >
            <Box component="span" sx={{ width: GUTTER_COL_WIDTH, textAlign: "right", pr: 0.5 }}>
              {line.oldNum ?? ""}
            </Box>
            <Box component="span" sx={{ width: GUTTER_COL_WIDTH, textAlign: "right", pr: 0.75 }}>
              {line.newNum ?? ""}
            </Box>
          </Box>
          <Box component="span" sx={{ pl: 1 }}>
            {line.segments.map((s, j) => (
              <span key={j} style={{ color: s.color, fontWeight: s.bold ? 700 : 400 }}>
                {s.text || " "}
              </span>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  )
}
