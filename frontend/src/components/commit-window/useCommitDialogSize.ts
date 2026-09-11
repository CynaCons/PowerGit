import type { SxProps, Theme } from "@mui/material/styles"
import { useMemo, useState, useSyncExternalStore } from "react"
import {
  clampRect,
  clampSize,
  readStoredSize,
  storeSize,
  type Point,
  type Rect,
  type Size,
  type Viewport,
} from "./dialogSize"

/** What the window frame paints: a size, and a position once an edge was dragged. */
export type Geometry = Size & Partial<Point>

/** The paper before anyone resized it: nearly the whole window, like Git
 *  Extensions' FormCommit maximised (v0.14.0, owner: the commit panel "takes
 *  only part of the application space"). Every length divides by the zoom
 *  because the theme zooms the dialog paper itself (theme/index.ts). */
export function commitPaperSx(zoom: number): SxProps<Theme> {
  return {
    width: `calc((100vw - 32px) / ${zoom})`,
    maxWidth: `calc((100vw - 32px) / ${zoom})`,
    height: `calc((100vh - 32px) / ${zoom})`,
    maxHeight: `calc((100vh - 32px) / ${zoom})`,
    margin: `${16 / zoom}px`,
    display: "flex",
    flexDirection: "column",
  }
}

const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange)
  return () => window.removeEventListener("resize", onChange)
}
const viewportKey = () => `${window.innerWidth}x${window.innerHeight}`

/** The visual viewport, re-read on every window resize. */
export function useViewport(): Viewport {
  const key = useSyncExternalStore(subscribeResize, viewportKey, () => "0x0")
  return useMemo(() => {
    const [width, height] = key.split("x").map(Number)
    return { width, height }
  }, [key])
}

/**
 * The commit window's remembered geometry. `geometry` is null until the
 * user resizes for the first time (the near-full default applies); after
 * that it is the stored size clamped to the current viewport, plus the
 * position the last drag left it at. The position is deliberately not
 * stored: a reload opens the window centred at its remembered size.
 */
export function useCommitDialogSize() {
  const [size, setSize] = useState<Size | null>(readStoredSize)
  const [position, setPosition] = useState<Point | null>(null)
  const viewport = useViewport()
  const geometry = useMemo<Geometry | null>(() => {
    if (!size) return null
    return position ? clampRect({ ...size, ...position }, viewport) : clampSize(size, viewport)
  }, [size, position, viewport])
  const commit = (rect: Rect) => {
    const next = { width: rect.width, height: rect.height }
    setSize(next)
    setPosition({ left: rect.left, top: rect.top })
    storeSize(next)
  }
  return { geometry, commit }
}
