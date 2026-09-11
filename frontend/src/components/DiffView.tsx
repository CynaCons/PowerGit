import Box from "@mui/material/Box"
import { useTheme } from "@mui/material/styles"
import { useEffect, useMemo, useRef, useState } from "react"
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

/** The characters of `node` that lie inside `range`, "" when the range only touches it. */
function selectedWithin(range: Range, node: Node): string {
  const r = document.createRange()
  r.selectNodeContents(node)
  if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0) r.setStart(range.startContainer, range.startOffset)
  if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0) r.setEnd(range.endContainer, range.endOffset)
  return r.collapsed ? "" : r.toString()
}

/**
 * The selected text of the rows under `root` as plain code: each row's
 * selected characters without its "+"/"-"/" " marker (the .diff-row-sign
 * span) and never the line numbers, joined by newlines, with a trailing
 * newline when the selection runs past the last row's text. Header rows
 * (diff --git, @@) have no marker and copy whole. Null when the selection
 * holds none of the rows' text.
 */
function plainTextOf(range: Range, root: HTMLElement): string | null {
  const out: string[] = []
  let last: Element | null = null
  for (const row of root.querySelectorAll(".diff-row")) {
    const text = row.querySelector(".diff-row-text")
    if (!text || !range.intersectsNode(text)) continue
    const part = selectedWithin(range, text)
    if (part === "") continue
    const sign = row.querySelector(".diff-row-sign")
    out.push(sign ? part.slice(selectedWithin(range, sign).length) : part)
    last = text
  }
  if (!last) return null
  const end = document.createRange()
  end.selectNodeContents(last)
  const pastLastRow = range.compareBoundaryPoints(Range.END_TO_END, end) > 0
  return out.join("\n") + (pastLastRow ? "\n" : "")
}

/**
 * Ctrl+C over the diff copies clean code (v0.16.0, owner: "it's missing the
 * ability to select text for copy-paste"). The browser's own copy would
 * paste "+    return x" with the marker; Git Extensions' FileViewer strips
 * the diff prefixes on copy (FileViewer.CopyToolStripMenuItemClick) and
 * this does the same, rebuilding the text from the row elements so the
 * gutter, which sits inside the DOM range even though it is user-select:
 * none, can never leak into the clipboard.
 */
function copyPlainText(e: React.ClipboardEvent<HTMLElement>) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
  const text = plainTextOf(sel.getRangeAt(0), e.currentTarget)
  if (text === null) return
  e.clipboardData.setData("text/plain", text)
  e.preventDefault()
}

/**
 * Shift+mousedown would extend the browser's text selection from the caret
 * the last click left, which the click handler would then read as the end of
 * a drag (useDiffLineSelection.selectionAfterClick). Shift+click is a line
 * range, so the native extension is suppressed and any text selection goes.
 */
function guardShiftClick(e: React.MouseEvent) {
  if (!e.shiftKey) return
  e.preventDefault()
  window.getSelection()?.removeAllRanges()
}

type Point = { x: number; y: number }
/** Pixels a press may travel and still be a click; further is a text drag. */
const DRAG_SLOP = 3
const movedSince = (press: Point | null, e: React.MouseEvent): boolean =>
  press !== null && (Math.abs(e.clientX - press.x) > DRAG_SLOP || Math.abs(e.clientY - press.y) > DRAG_SLOP)

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
  /** `moved` (v0.16.0): the pointer travelled since the press, i.e. this click ends a text drag. */
  onLineClick?: (index: number, e: React.MouseEvent, moved: boolean) => void
  onLineContextMenu?: (index: number, e: React.MouseEvent) => void
}) {
  const lines = useMemo(() => parseGutterLines(diff.text), [diff.text])
  const mode = useTheme().palette.mode
  const tokens = useDiffTokens(diff.text, lines, diff.path, mode)
  const selectable = onLineClick !== undefined
  // Where the last press on a row landed, to tell a click from a text drag.
  const press = useRef<Point | null>(null)
  // Plain elements with classes (app.css .diff-row*), not MUI Box: a row is
  // rendered hundreds of times per diff and per-element emotion styling was
  // most of the render cost (v0.13.14, diff-latency.spec).
  const renderLine = (i: number) => {
    const line = lines[i]
    const selected = selection?.has(i) ?? false
    const highlighted = tokens?.get(i)
    const kindClass = line.kind === "add" ? " diff-row-added" : line.kind === "remove" ? " diff-row-removed" : ""
    // Hunk lines carry their "+"/"-"/" " marker in its own span so the copy
    // handler can leave it out; header rows are copied whole.
    const first = line.segments[0]
    const sign = line.kind === "other" || !first ? null : first.text.charAt(0) || " "
    return (
      <div
        className={`diff-row${kindClass}${selectable ? " diff-row-selectable" : ""}${selected ? " diff-row-selected" : ""}`}
        data-selected={selected ? "true" : undefined}
        onMouseDown={
          selectable
            ? (e) => {
                guardShiftClick(e)
                press.current = { x: e.clientX, y: e.clientY }
              }
            : undefined
        }
        onClick={selectable ? (e) => onLineClick(i, e, movedSince(press.current, e)) : undefined}
        onContextMenu={onLineContextMenu ? (e) => onLineContextMenu(i, e) : undefined}
      >
        <div data-testid="diff-gutter" aria-hidden="true" className="diff-row-gutter">
          <span className="diff-row-num diff-row-num-old">{line.oldNum ?? ""}</span>
          <span className="diff-row-num diff-row-num-new">{line.newNum ?? ""}</span>
        </div>
        <span className="diff-row-text">
          {sign !== null && (
            <span className="diff-row-sign" style={{ color: first?.color }}>
              {sign}
            </span>
          )}
          {highlighted
            ? highlighted.map((t, j) => (
                <span key={j} className="diff-token" style={{ color: t.color }}>
                  {t.content}
                </span>
              ))
            : line.segments.map((s, j) => (
                <span key={j} style={{ color: s.color, fontWeight: s.bold ? 700 : 400 }}>
                  {(j === 0 && sign !== null ? s.text.slice(1) : s.text) || (sign === null ? " " : "")}
                </span>
              ))}
        </span>
      </div>
    )
  }
  return (
    <Box
      data-testid="diff-view"
      onCopy={copyPlainText}
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
        // The diff is selectable text whatever its host says (v0.16.0): a
        // dialog or pane that turns selection off for its own chrome must
        // not take the code with it. The gutter opts out on its own.
        userSelect: "text",
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
