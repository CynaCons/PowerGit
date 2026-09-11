import Box from "@mui/material/Box"
import { useTheme } from "@mui/material/styles"
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import type { DiffDto } from "../engine"
import { languageForPath, tokenizeLines, type Token } from "../highlight"
import { codeSx } from "../theme"
import { ContentNotice } from "./ContentNotice"
import { parseGutterLines, type GutterLine } from "./diffLines"
import { VirtualLines, type VirtualLinesHandle } from "./VirtualLines"

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

/**
 * Review mode (v0.17.0), supplied by the host that owns the review document
 * (DiffTab / the commit dialog). Absent, the rendered DOM and CSS are
 * exactly the pre-review ones.
 */
export type DiffReviewProps = {
  /** The review line key of parsed row `i` ("+<new>" / "-<old>"); null for context and header rows. */
  keyOf: (i: number) => string | null
  stateOf: (key: string) => "ok" | "rejected" | undefined
  /** Row index under the cursor. */
  cursor: number | null
  /** A click on the text of any row (context included): cursor only; the existing onLineClick still runs. */
  onCursor: (i: number) => void
  /** A click on the mark cell in the gutter: the host cycles the line and sets the cursor. */
  onMarkClick: (i: number) => void
}

/** Imperative surface for the review layer's keys: scroll the cursor row into view, take the focus. */
export type DiffViewHandle = {
  scrollToRow: (i: number) => void
  focus: () => void
}

/**
 * Brings `row` inside the nearest ancestor that scrolls vertically, with
 * the smallest move (align "auto"). Vertical only and by hand:
 * scrollIntoView would also pull the horizontal scroll back to the row's
 * left edge. The ancestor is the diff list in the Diff tab; in the commit
 * dialog the list grows with its content and the dialog's diff box scrolls.
 */
function scrollRowIntoView(row: Element) {
  for (let el = row.parentElement; el; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight) continue
    const { overflowY } = getComputedStyle(el)
    if (overflowY !== "auto" && overflowY !== "scroll") continue
    const r = row.getBoundingClientRect()
    const c = el.getBoundingClientRect()
    if (r.top < c.top) el.scrollTop += r.top - c.top
    else if (r.bottom > c.bottom) el.scrollTop += r.bottom - c.bottom
    return
  }
}

const PLAIN_LINES_SX = { flex: 1, minHeight: 0, overflow: "auto" } as const
// The plain list becomes a focus target only in review mode; the ring
// matches VirtualLines so the two paths look the same with the focus.
const REVIEW_LINES_SX = {
  ...PLAIN_LINES_SX,
  outline: "none",
  "&:focus-visible": { boxShadow: "inset 0 0 0 1px var(--pg-focus-ring, #2563eb)" },
} as const

/** Unified diff with a sticky two-column line-number gutter. v0.13.11:
 *  rows are virtualized (only the visible window is in the DOM), and a
 *  truncated or binary diff carries an explicit notice on top. */
export const DiffView = forwardRef<
  DiffViewHandle,
  {
    diff: DiffDto
    onOpenDifftool?: () => void
    onRetry?: () => void
    /** Line selection (v0.13.14, commit dialog): indices into diff.text.split("\n"). */
    selection?: Set<number>
    /** `moved` (v0.16.0): the pointer travelled since the press, i.e. this click ends a text drag. */
    onLineClick?: (index: number, e: React.MouseEvent, moved: boolean) => void
    onLineContextMenu?: (index: number, e: React.MouseEvent) => void
    /** Review mode (v0.17.0): marks in the gutter, a cursor row, a focusable surface. */
    review?: DiffReviewProps
  }
>(function DiffView({ diff, onOpenDifftool, onRetry, selection, onLineClick, onLineContextMenu, review }, ref) {
  const lines = useMemo(() => parseGutterLines(diff.text), [diff.text])
  const mode = useTheme().palette.mode
  const tokens = useDiffTokens(diff.text, lines, diff.path, mode)
  const selectable = onLineClick !== undefined
  // Where the last press on a row landed, to tell a click from a text drag.
  const press = useRef<Point | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const plainRef = useRef<HTMLDivElement>(null)
  const virtualRef = useRef<VirtualLinesHandle>(null)
  useImperativeHandle(
    ref,
    () => ({
      scrollToRow: (i) => {
        virtualRef.current?.scrollToIndex(i, { align: "auto" })
        // Mounted (always in the plain list; in the virtual one when it
        // already sat in the window): settle whichever ancestor scrolls.
        const row = rootRef.current?.querySelector(`[data-index="${i}"]`)
        if (row) scrollRowIntoView(row)
      },
      focus: () => (virtualRef.current ?? plainRef.current)?.focus(),
    }),
    [],
  )
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
    // Review (v0.17.0): changed rows carry their state as a class and a
    // data attribute, the cursor row its own class; context rows get neither.
    const key = review ? review.keyOf(i) : null
    const state = review && key !== null ? (review.stateOf(key) ?? "todo") : undefined
    const reviewClass = `${state ? ` diff-row-review-${state}` : ""}${review && review.cursor === i ? " diff-row-cursor" : ""}`
    return (
      <div
        className={`diff-row${kindClass}${selectable ? " diff-row-selectable" : ""}${selected ? " diff-row-selected" : ""}${reviewClass}`}
        data-selected={selected ? "true" : undefined}
        data-review={state}
        onMouseDown={
          selectable
            ? (e) => {
                guardShiftClick(e)
                press.current = { x: e.clientX, y: e.clientY }
              }
            : undefined
        }
        onClick={
          selectable || review
            ? (e) => {
                if (onLineClick) onLineClick(i, e, movedSince(press.current, e))
                review?.onCursor(i)
              }
            : undefined
        }
        onContextMenu={onLineContextMenu ? (e) => onLineContextMenu(i, e) : undefined}
      >
        <div data-testid="diff-gutter" aria-hidden="true" className="diff-row-gutter">
          <span className="diff-row-num diff-row-num-old">{line.oldNum ?? ""}</span>
          <span className="diff-row-num diff-row-num-new">{line.newNum ?? ""}</span>
          {review && (
            // Inside the sticky gutter: user-select none, and plainTextOf
            // never reads it. Its click is the mark's, not the row's.
            <span
              className="diff-row-mark"
              onClick={(e) => {
                e.stopPropagation()
                review.onMarkClick(i)
              }}
            />
          )}
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
      ref={rootRef}
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
        <Box
          ref={plainRef}
          data-testid="diff-lines"
          data-hotkey-surface={review ? "review" : undefined}
          tabIndex={review ? 0 : undefined}
          sx={review ? REVIEW_LINES_SX : PLAIN_LINES_SX}
        >
          {lines.map((_, i) => (
            <div key={i} data-index={i}>
              {renderLine(i)}
            </div>
          ))}
        </Box>
      ) : (
        <VirtualLines
          ref={virtualRef}
          count={lines.length}
          ariaLabel={`Diff of ${diff.path}`}
          testid="diff-lines"
          renderLine={renderLine}
          hotkeySurface={review ? "review" : undefined}
          passKeys={review !== undefined}
        />
      )}
    </Box>
  )
})
