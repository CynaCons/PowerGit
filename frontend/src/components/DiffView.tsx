import Box from "@mui/material/Box"
import { useTheme } from "@mui/material/styles"
import { useEffect, useMemo, useState } from "react"
import type { DiffDto } from "../engine"
import { languageForPath, tokenizeLines, type Token } from "../highlight"
import { codeSx } from "../theme"
import { ContentNotice } from "./ContentNotice"
import { VirtualLines } from "./VirtualLines"

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

type LineKind = "add" | "remove" | "context" | "other"
type GutterLine = { segments: Segment[]; oldNum: number | null; newNum: number | null; kind: LineKind }

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

/**
 * Syntax colours for the hunk lines (v0.14.3, owner: "the diff view and
 * commit view are showing plaintext ... automatic language recognition and
 * syntax highlighting"). The language comes from the file's path; the hunk
 * content (sign stripped, old and new lines in order) is tokenized as one
 * stream so multi-line constructs keep their state, then mapped back to
 * the diff's line indexes. Plain rendering stays until the tokens arrive
 * and whenever they cannot (unknown language, oversized diff).
 */
function useDiffTokens(
  text: string,
  lines: GutterLine[],
  path: string,
  mode: "light" | "dark",
): Map<number, Token[]> | null {
  const [tokens, setTokens] = useState<{ key: string; map: Map<number, Token[]> } | null>(null)
  const key = `${mode}|${path}|${text}`
  useEffect(() => {
    const lang = languageForPath(path)
    if (!lang) return
    const indexes: number[] = []
    const raw = text.split("\n")
    const code: string[] = []
    lines.forEach((l, i) => {
      if (l.kind === "other") return
      indexes.push(i)
      code.push(raw[i].slice(1))
    })
    if (indexes.length === 0) return
    let cancelled = false
    void tokenizeLines(code.join("\n"), lang, mode).then((result) => {
      if (cancelled || !result) return
      const map = new Map<number, Token[]>()
      result.forEach((line, j) => {
        if (j < indexes.length) map.set(indexes[j], line)
      })
      setTokens({ key, map })
    })
    return () => {
      cancelled = true
    }
  }, [key, text, lines, path, mode])
  return tokens && tokens.key === key ? tokens.map : null
}

/** Diffs up to this many lines render every row (exact DOM text, whole-diff
 *  selection); longer ones are virtualized (v0.13.11). v0.13.14 lowered it
 *  from 2000: an 800-line first diff (PLAN.md) cost a 400 ms render in dev
 *  and its teardown slowed the next click, measured by diff-latency.spec. */
export const VIRTUALIZE_MIN_LINES = 200

/** Unified diff with a sticky two-column line-number gutter. v0.13.11:
 *  rows are virtualized (only the visible window is in the DOM), and a
 *  truncated or binary diff carries an explicit notice on top. */
export function DiffView({
  diff,
  onOpenDifftool,
  onRetry,
  selection,
  onLineClick,
  onLineContextMenu,
}: {
  diff: DiffDto
  onOpenDifftool?: () => void
  onRetry?: () => void
  /** Line selection (v0.13.14, commit dialog): indices into diff.text.split("\n"). */
  selection?: Set<number>
  onLineClick?: (index: number, e: React.MouseEvent) => void
  onLineContextMenu?: (index: number, e: React.MouseEvent) => void
}) {
  const lines = useMemo(() => parseGutterLines(diff.text), [diff.text])
  const mode = useTheme().palette.mode
  const tokens = useDiffTokens(diff.text, lines, diff.path, mode)
  const selectable = onLineClick !== undefined
  // Plain elements with classes (app.css .diff-row*), not MUI Box: a row is
  // rendered hundreds of times per diff and per-element emotion styling was
  // most of the render cost (v0.13.14, diff-latency.spec).
  const renderLine = (i: number) => {
    const line = lines[i]
    const selected = selection?.has(i) ?? false
    const highlighted = tokens?.get(i)
    const kindClass = line.kind === "add" ? " diff-row-added" : line.kind === "remove" ? " diff-row-removed" : ""
    return (
      <div
        className={`diff-row${kindClass}${selectable ? " diff-row-selectable" : ""}${selected ? " diff-row-selected" : ""}`}
        data-selected={selected ? "true" : undefined}
        onClick={selectable ? (e) => onLineClick(i, e) : undefined}
        onContextMenu={onLineContextMenu ? (e) => onLineContextMenu(i, e) : undefined}
      >
        <div data-testid="diff-gutter" aria-hidden="true" className="diff-row-gutter">
          <span className="diff-row-num diff-row-num-old">{line.oldNum ?? ""}</span>
          <span className="diff-row-num diff-row-num-new">{line.newNum ?? ""}</span>
        </div>
        <span className="diff-row-text">
          {highlighted ? (
            <>
              <span style={{ color: line.segments[0]?.color }}>{line.segments[0]?.text.charAt(0) ?? " "}</span>
              {highlighted.map((t, j) => (
                <span key={j} className="diff-token" style={{ color: t.color }}>
                  {t.content}
                </span>
              ))}
            </>
          ) : (
            line.segments.map((s, j) => (
              <span key={j} style={{ color: s.color, fontWeight: s.bold ? 700 : 400 }}>
                {s.text || " "}
              </span>
            ))
          )}
        </span>
      </div>
    )
  }
  return (
    <Box
      data-testid="diff-view"
      sx={{
        ...codeSx,
        fontSize: 12,
        lineHeight: "18px",
        whiteSpace: "pre",
        tabSize: 4,
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        overflowX: "auto",
        maxWidth: "100%",
      }}
    >
      <ContentNotice dto={diff} onOpenDifftool={onOpenDifftool} onRetry={onRetry} />
      {lines.length <= VIRTUALIZE_MIN_LINES ? (
        <Box data-testid="diff-lines" sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {lines.map((_, i) => (
            <div key={i} data-index={i}>
              {renderLine(i)}
            </div>
          ))}
        </Box>
      ) : (
        <VirtualLines
          count={lines.length}
          ariaLabel={`Diff of ${diff.path}`}
          testid="diff-lines"
          renderLine={renderLine}
        />
      )}
    </Box>
  )
}
