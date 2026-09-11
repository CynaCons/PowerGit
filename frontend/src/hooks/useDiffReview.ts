import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import type { DiffReviewProps, DiffViewHandle } from "../components/DiffView"
import { parseGutterLines } from "../components/diffLines"
import type { FileChange } from "../engine"
import { useHotkeyLayer } from "../hotkeys"
import {
  cycle,
  fileProgress,
  lineKeyOf,
  nextUnreviewed,
  recount,
  toggleReject,
  withLine,
  type FileReview,
  type LineKey,
  type LineState,
  type ReviewDoc,
} from "../review/reviewModel"
import { setReviewMode, updateReviewDoc, useReviewDoc, useReviewMode } from "../review/reviewState"

// Review mode over one diff (v0.17.0, docs/design/review-mode.md §3): the
// cursor, the marks, the `review` layer of hotkeys and the Enter /
// Shift+Enter walk over the file list. The Diff tab owns it; the commit
// dialog gets the same hook in v0.17.2. The document lives in reviewState
// (in memory this iteration) under the review key the caller derives from
// the selected row; the marks are per key and path, so switching files and
// back keeps them while the cursor starts over.

/** One entry per parsed diff row: its review key, or null for a context, hunk or meta row. */
export type RowKeys = (LineKey | null)[]

export function rowKeysOf(text: string): RowKeys {
  return parseGutterLines(text).map((row) => lineKeyOf(row))
}

export type ReviewProgress = { reviewed: number; changed: number; rejected: number }

/** The current file's progress: the keyed rows against the document's marks for `path`. */
export function progressOf(doc: ReviewDoc | null, path: string | null, rowKeys: RowKeys): ReviewProgress {
  return fileProgress(
    path ? doc?.files[path] : undefined,
    rowKeys.filter((k): k is LineKey => k !== null),
  )
}

/** The gg chord: two g within this many milliseconds go to the top. */
const GG_WINDOW_MS = 500

type Intent = "top" | "unreviewed"

export type DiffReview = {
  /** Review mode is on and the key is known: the layer, the marks and the bar exist. */
  reviewing: boolean
  review: DiffReviewProps | undefined
  /** The button: flips the mode; turning it on moves the focus into the diff. */
  toggle: () => void
}

export function useDiffReview({
  reviewKey,
  path,
  rowKeys,
  files,
  selectedPath,
  onSelect,
  diffRef,
}: {
  reviewKey: string | null
  /** The path of the diff on screen: the previous file's while the next one loads. */
  path: string | null
  rowKeys: RowKeys
  files: FileChange[]
  selectedPath: string | null
  onSelect: (path: string) => void
  diffRef: RefObject<DiffViewHandle | null>
}): DiffReview {
  const mode = useReviewMode()
  const reviewing = mode && reviewKey !== null
  const doc = useReviewDoc(reviewKey)
  const file: FileReview | undefined = path ? doc?.files[path] : undefined
  // The cursor belongs to one (mode, key, path): a file switch, another row
  // or a toggle starts it over at "no row" (the reset-on-change pattern of
  // react.dev's useState reference), while the marks stay in the doc.
  const at = `${mode}|${reviewKey}|${path}`
  const [cur, setCur] = useState<{ at: string; row: number | null }>({ at, row: null })
  if (cur.at !== at) setCur({ at, row: null })
  const cursor = cur.at === at ? cur.row : null
  const setCursor = useCallback((row: number | null) => setCur({ at, row }), [at])
  // The changed rows of this diff and their keys, in row order.
  const changed = useMemo(() => {
    const rows: number[] = []
    const keys: LineKey[] = []
    rowKeys.forEach((k, i) => {
      if (k === null) return
      rows.push(i)
      keys.push(k)
    })
    return { rows, keys }
  }, [rowKeys])
  const lastG = useRef(0)
  const wantFocus = useRef(false)
  // Where the cursor goes once the file Enter or n selected has loaded.
  const intent = useRef<Intent | null>(null)
  // Files opened under this key and how many changed lines each has, so n
  // can tell a finished file from one never opened (v0.17.3 brings numstat
  // and the counts for files not yet shown).
  const known = useRef(new Map<string, number>())
  useEffect(() => {
    if (reviewKey !== null && path !== null) known.current.set(`${reviewKey}|${path}`, changed.keys.length)
  }, [reviewKey, path, changed])

  /** Cursor to `row`, clamped to the diff, scrolled into view. False when there is no row at all. */
  const moveTo = useCallback(
    (row: number): boolean => {
      const last = rowKeys.length - 1
      if (last < 0) return false
      const next = Math.max(0, Math.min(last, row))
      setCursor(next)
      diffRef.current?.scrollToRow(next)
      return true
    },
    [rowKeys.length, setCursor, diffRef],
  )

  const mark = useCallback(
    (row: number, f: (s: LineState | undefined) => LineState | undefined) => {
      const key = rowKeys[row]
      if (reviewKey === null || path === null || !key) return
      updateReviewDoc(reviewKey, (d) =>
        recount({ ...withLine(d, path, key, f(d.files[path]?.lines[key])), changed: changed.keys.length }),
      )
    },
    [rowKeys, reviewKey, path, changed],
  )

  // Space / x with no cursor act on the first unreviewed line (else the
  // first changed one) and put the cursor there; on a context row, nothing.
  const act = (f: (s: LineState | undefined) => LineState | undefined): boolean => {
    let row = cursor
    if (row === null) {
      const idx = nextUnreviewed(changed.keys, file, -1)
      row = idx === null ? (changed.rows[0] ?? null) : changed.rows[idx]
    }
    if (row === null) return true
    if (rowKeys[row] !== null) mark(row, f)
    moveTo(row)
    return true
  }

  const step = (delta: number): boolean => moveTo(cursor === null ? 0 : cursor + delta)

  /** Index into `changed.keys` of the last changed row at or before the cursor; -1 with no cursor. */
  const changedIndexAtCursor = (): number => {
    if (cursor === null) return -1
    let i = -1
    while (i + 1 < changed.rows.length && changed.rows[i + 1] <= cursor) i++
    return i
  }

  /** A file not opened under this key yet counts as work; an opened one, while it has unmarked lines. */
  const hasWork = (p: string): boolean => {
    const count = known.current.get(`${reviewKey}|${p}`)
    if (count === undefined) return true
    return count > Object.keys(doc?.files[p]?.lines ?? {}).length
  }

  const applyIntent = useCallback(() => {
    const kind = intent.current
    if (kind === null || path === null) return
    intent.current = null
    const first = kind === "top" ? null : nextUnreviewed(changed.keys, file, -1)
    moveTo(first === null ? 0 : changed.rows[first])
    diffRef.current?.focus()
  }, [path, changed, file, moveTo, diffRef])
  // The selected file's diff is now the one on screen: place the cursor.
  useEffect(() => {
    if (intent.current !== null && path !== null && path === selectedPath) applyIntent()
  }, [path, selectedPath, applyIntent])

  const jumpNext = (): boolean => {
    const idx = nextUnreviewed(changed.keys, file, changedIndexAtCursor())
    if (idx !== null) {
      moveTo(changed.rows[idx])
      diffRef.current?.focus()
      return true
    }
    // Nothing left here: the next file in the list with work, else stay.
    const n = files.length
    const from = files.findIndex((f) => f.path === selectedPath)
    for (let k = 1; k < n; k++) {
      const candidate = files[(from + k + n) % n].path
      if (!hasWork(candidate)) continue
      intent.current = "unreviewed"
      onSelect(candidate)
      return true
    }
    return true
  }

  const gotoFile = (delta: number): boolean => {
    const n = files.length
    if (n === 0) return true
    const i = files.findIndex((f) => f.path === selectedPath)
    const target = files[i < 0 ? (delta > 0 ? 0 : n - 1) : (i + delta + n) % n].path
    intent.current = "top"
    if (target !== selectedPath) onSelect(target)
    else if (path === target) applyIntent()
    return true
  }

  useHotkeyLayer(
    "review",
    {
      "review.cycle": () => act(cycle),
      "review.reject": () => act(toggleReject),
      "review.down": () => step(1),
      "review.downArrow": () => step(1),
      "review.up": () => step(-1),
      "review.upArrow": () => step(-1),
      "review.home": () => moveTo(0),
      "review.top": () => {
        // gg: the first g only arms the timer and passes through.
        const now = Date.now()
        if (now - lastG.current < GG_WINDOW_MS) {
          lastG.current = 0
          return moveTo(0)
        }
        lastG.current = now
        return false
      },
      "review.bottom": () => moveTo(rowKeys.length - 1),
      "review.end": () => moveTo(rowKeys.length - 1),
      "review.nextUnreviewed": jumpNext,
      "review.nextFile": () => gotoFile(1),
      "review.prevFile": () => gotoFile(-1),
      // The command line arrives in v0.17.4; the chord is reserved.
      "review.command": () => false,
    },
    reviewing,
  )

  const toggle = useCallback(() => {
    const on = !mode
    wantFocus.current = on && reviewKey !== null
    setReviewMode(on)
  }, [mode, reviewKey])
  // The plain list is focusable only once it renders with the review prop,
  // so the focus follows the render that turned the mode on.
  useEffect(() => {
    if (!reviewing || !wantFocus.current) return
    wantFocus.current = false
    diffRef.current?.focus()
  }, [reviewing, diffRef])

  const review = useMemo<DiffReviewProps | undefined>(
    () =>
      reviewing
        ? {
            keyOf: (i) => rowKeys[i] ?? null,
            stateOf: (key) => file?.lines[key],
            cursor,
            onCursor: setCursor,
            onMarkClick: (i) => {
              mark(i, cycle)
              setCursor(i)
            },
          }
        : undefined,
    [reviewing, rowKeys, file, cursor, setCursor, mark],
  )

  return { reviewing, review, toggle }
}
