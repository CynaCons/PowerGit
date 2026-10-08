import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual"
import { useMemo, useState } from "react"
import {
  nextDrawWindow,
  windowGeometry,
  type DrawWindow,
  type GridGeometry,
  type RowBand,
} from "../components/gridGeometry"

/**
 * The revision grid's canvas geometry (v0.20.9): a window of rows around the
 * rendered ones, kept — with its pixels — until the rendered range leaves it.
 * The graph used to be redrawn on every 28 px scroll step; the owner's Ubuntu
 * benchmark on a ~35-lane repository measured 26–30 fps where a plain list ran
 * at 60 (gridGeometry.ts nextDrawWindow). The virtualizer's total size stands
 * for "a row changed height" (an expanded row), which moves every band below.
 */
export function useCanvasWindow(
  virtualItems: VirtualItem[],
  rowCount: number,
  virtualizer: Virtualizer<HTMLDivElement, Element>,
): GridGeometry {
  const [drawWindow, setDrawWindow] = useState<DrawWindow | null>(null)
  const first = virtualItems[0]?.index ?? -1
  const last = virtualItems[virtualItems.length - 1]?.index ?? -1
  const next = nextDrawWindow(drawWindow, first, last, rowCount)
  // Derived state, the React way: a render that finds the window outgrown
  // stores the new one; `next` is used for this render already.
  if (next !== drawWindow) setDrawWindow(next)
  const totalSize = virtualizer.getTotalSize()
  return useMemo(() => {
    const bandOf = (index: number): RowBand | undefined => {
      const m = virtualizer.measurementsCache[index]
      return m ? { index: m.index, start: m.start, size: m.size } : undefined
    }
    return windowGeometry(next, bandOf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- totalSize: a row's height changed
  }, [next, virtualizer, totalSize])
}
