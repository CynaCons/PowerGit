import { ROW_HEIGHT } from "../graph/types"

// The revision grid's vertical geometry (v0.18.3): rows are ROW_HEIGHT tall
// except the one the user expanded (variant B of
// docs/prototypes/branch-visibility.html), whose height the virtualizer
// measures. graph/draw.ts takes the real bands so the lanes stay continuous
// through a taller row; at 28 px everywhere the numbers are the old
// `(i - start) * rowHeight` exactly. See docs/agents/memories/ref-chips.md.

/** One row's band in list pixels (the virtualizer's `start`/`size`). */
export type RowBand = { index: number; start: number; size: number }

export type GridGeometry = {
  /** The canvas top, in list pixels: the first visible item's start. */
  top: number
  /** The canvas height: the visible items' sizes summed. */
  height: number
  /** The rows to draw, the visible items plus one neighbour on each side
   *  when it exists (a neighbour's size sets the slope of the lanes that
   *  cross the canvas edge; drawing it costs nothing, the canvas clips). */
  bands: RowBand[]
}

type Item = { index: number; start: number; size: number; end: number }

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

/** The chip budget of a row's message cell: 60 % of what the message column
 *  gets once the graph and the three metadata columns took theirs; the
 *  message keeps at least the other 40 %. `undefined` until the grid is
 *  measured, which RefChips reads as "no folding". */
export function chipBudget(bodyWidth: number, graph: number, author: number, date: number, sha: number): number | undefined {
  if (bodyWidth <= 0) return undefined
  return Math.max(0, Math.round((bodyWidth - graph - author - date - sha) * 0.6))
}
