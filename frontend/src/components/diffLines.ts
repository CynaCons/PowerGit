// The unified-diff row parser DiffView renders from, in its own module
// since v0.17.0 so review mode can key the same rows without a second
// parser: `lineKeyOf` (review/reviewModel.ts) over these rows is the
// review line key.

// Git Extensions palette (git-coloring mode).
// Source: src/app/GitExtUtils/GitUI/Theming/AppColorDefaults.cs,
// src/app/GitUI/Editor/Diff/DiffHighlightService.cs (forces color.diff.old=red / new=green).
const COLORS = {
  added: "var(--pg-diff-added, #189100)", // AnsiTerminalGreenForeNormal
  removed: "var(--pg-diff-removed, #d3000B)", // AnsiTerminalRedForeNormal
  hunk: "var(--pg-diff-hunk, #00a89a)", // AnsiTerminalCyanForeNormal (color.diff.hunk)
  meta: "var(--pg-diff-meta, #404040)", // black fore bold
  context: "var(--pg-diff-context, #000000)",
  gutter: "var(--pg-diff-gutter, #8a8a8a)", // muted line-number margin, matches GE's FileViewer gutter
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

export type LineKind = "add" | "remove" | "context" | "other"
export type GutterLine = { segments: Segment[]; oldNum: number | null; newNum: number | null; kind: LineKind }

// Walks the unified diff text once, tracking the running old/new line
// counters so each rendered row can show both side's line numbers, like Git
// Extensions' FileViewer margin. Counters reset on every hunk header since a
// diff can contain several hunks, each with its own starting numbers.
export function parseGutterLines(text: string): GutterLine[] {
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
      return { segments, oldNum: null, newNum: null, kind: "other" as const }
    }
    if (!inHunk || line.startsWith("\\")) {
      // Meta lines before the first hunk, and "\ No newline at end of
      // file", carry no line number on either side.
      return { segments, oldNum: null, newNum: null, kind: "other" as const }
    }
    if (line.startsWith("+")) {
      return { segments, oldNum: null, newNum: newNum++, kind: "add" as const }
    }
    if (line.startsWith("-")) {
      return { segments, oldNum: oldNum++, newNum: null, kind: "remove" as const }
    }
    const both = { segments, oldNum, newNum, kind: "context" as const }
    oldNum += 1
    newNum += 1
    return both
  })
}
