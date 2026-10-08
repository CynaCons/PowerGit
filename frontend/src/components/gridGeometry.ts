import type { GridGeometry, RowBand } from "../graph/draw"
import { ROW_HEIGHT } from "../graph/types"

// The revision grid's vertical geometry (v0.18.3): rows are ROW_HEIGHT tall
// except the one the user expanded (variant B of
// docs/prototypes/branch-visibility.html), whose height the virtualizer
// measures. graph/draw.ts takes the real bands so the lanes stay continuous
// through a taller row; at 28 px everywhere the numbers are the old
// `(i - start) * rowHeight` exactly. See docs/agents/memories/ref-chips.md.

export type { GridGeometry, RowBand } from "../graph/draw"

type Item = { index: number; start: number; size: number; end: number }

/** The canvas top and height from the visible items, and the bands to draw:
 *  the visible items plus one neighbour on each side when it exists (its
 *  size sets the slope of the lanes crossing the canvas edge; drawing it
 *  costs nothing, the canvas clips). */
export function gridGeometry(items: readonly Item[], bandOf: (index: number) => RowBand | undefined): GridGeometry {
  if (items.length === 0) return { top: 0, height: ROW_HEIGHT, bands: [] }
  const first = items[0]
  const last = items[items.length - 1]
  const bands: RowBand[] = []
  const before = bandOf(first.index - 1)
  if (before) bands.push(before)
  for (const item of items) bands.push({ index: item.index, start: item.start, size: item.size })
  const after = bandOf(last.index + 1)
  if (after) bands.push(after)
  return { top: first.start, height: Math.max(1, last.end - first.start), bands }
}

/** The rows the canvas covers, as a range of indexes. */
export type DrawWindow = { from: number; to: number }

/** Rows drawn beyond each edge of the rendered range while scrolling. */
export const DRAW_MARGIN = 32

/**
 * The canvas window for a scroll position (v0.20.9). Owner's Ubuntu
 * benchmark on a ~35-lane repository: 26–30 fps while a plain list ran at 60,
 * whatever the number of rows on screen, and the graph was redrawn on every
 * 28 px step. The canvas now covers the rendered rows plus DRAW_MARGIN on each
 * side and keeps that window — so keeps its pixels and does not redraw — until
 * the rendered range leaves it. A jump that lands outside the old window (a
 * scrollbar drag, PageDown) has nothing to keep, so it takes a tight window,
 * the cost of the old behaviour. Returns `previous` itself when it still fits,
 * so a memo keyed on it does not change.
 */
export function nextDrawWindow(
  previous: DrawWindow | null,
  first: number,
  last: number,
  count: number,
  margin = DRAW_MARGIN,
): DrawWindow | null {
  if (count === 0 || first < 0 || last < first) return null
  const max = count - 1
  if (previous && first >= previous.from && last <= Math.min(previous.to, max) && previous.to <= max) return previous
  const continuous = previous !== null && last >= previous.from && first <= previous.to
  const m = continuous ? margin : 2
  return { from: Math.max(0, first - m), to: Math.min(max, last + m) }
}

/** The geometry of a draw window: its bands, and one neighbour on each side. */
export function windowGeometry(
  window: DrawWindow | null,
  bandOf: (index: number) => RowBand | undefined,
): GridGeometry {
  if (!window) return { top: 0, height: ROW_HEIGHT, bands: [] }
  const bands: RowBand[] = []
  for (let i = window.from - 1; i <= window.to + 1; i++) {
    const band = bandOf(i)
    if (band) bands.push(band)
  }
  const first = bandOf(window.from)
  const last = bandOf(window.to)
  if (!first || !last) return { top: 0, height: ROW_HEIGHT, bands: [] }
  return { top: first.start, height: Math.max(1, last.start + last.size - first.start), bands }
}

/** The chip budget of a row's message cell: 60 % of what the message column
 *  gets once the graph and the three metadata columns took theirs; the
 *  message keeps at least the other 40 %. `undefined` until the grid is
 *  measured, which RefChips reads as "no folding". */
export function chipBudget(
  bodyWidth: number,
  graph: number,
  author: number,
  date: number,
  sha: number,
): number | undefined {
  if (bodyWidth <= 0) return undefined
  return Math.max(0, Math.round((bodyWidth - graph - author - date - sha) * 0.6))
}
