import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual"
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react"
import type { GraphRow } from "../graph/types"

/** Keep a reload that prepends commits from moving the row under the reader. */
export function useViewportAnchor(
  rows: GraphRow[],
  selected: number,
  virtualItems: VirtualItem[],
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  parentRef: RefObject<HTMLDivElement | null>,
  lastScrolledSha: RefObject<string | null>,
) {
  const anchor = useRef<{ key: string; start: number } | null>(null)
  const previousRows = useRef(rows)
  const rowIndexBySha = useMemo(() => new Map(rows.map((row, index) => [row.rev.id, index])), [rows])

  // Preserve the first visible SHA's pixel offset (v0.18.18), using measured
  // starts because an expanded row above it is not ROW_HEIGHT tall. Explicit
  // selection/ref jumps remain owned by RevisionGrid's auto-scroll effect.
  useLayoutEffect(() => {
    const parent = parentRef.current
    const previous = anchor.current
    const rowsChanged = previousRows.current !== rows
    previousRows.current = rows
    const selectedSha = selected < 0 ? null : rows[selected]?.rev.id
    if (
      rowsChanged &&
      parent &&
      previous &&
      parent.scrollTop !== 0 &&
      (!selectedSha || selectedSha === lastScrolledSha.current)
    ) {
      const index = rowIndexBySha.get(previous.key)
      const item = index === undefined ? undefined : virtualizer.measurementsCache[index]
      if (item) parent.scrollTop += item.start - previous.start
    }

    if (!parent) {
      anchor.current = null
      return
    }
    const firstVisible = virtualItems.find((item) => item.end > parent.scrollTop)
    const row = firstVisible ? rows[firstVisible.index] : undefined
    anchor.current = row && firstVisible ? { key: row.rev.id, start: firstVisible.start } : null
  }, [lastScrolledSha, parentRef, rowIndexBySha, rows, selected, virtualItems, virtualizer])
}
