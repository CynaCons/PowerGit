// Geometry of the commit window (v0.16.0, owner: "The commit window should
// be resizeable ... Also an x on the top right to close it"). Everything
// here is in visual px, what the pointer and getBoundingClientRect report;
// the dialog paper carries the application zoom, so whoever writes these
// numbers into CSS divides by it (theme/zoom.ts). The size survives across
// opens in localStorage; the position lives only as long as the window.

export const COMMIT_DIALOG_SIZE_KEY = "pg.commitDialogSize"
/** Gap kept from the viewport edges, the same 16px the near-full default leaves. */
export const COMMIT_DIALOG_MARGIN = 16
/** Small enough for a laptop at 150% zoom, large enough for both lists and a diff. */
export const MIN_COMMIT_DIALOG_WIDTH = 560
export const MIN_COMMIT_DIALOG_HEIGHT = 400

export type Size = { width: number; height: number }
export type Point = { left: number; top: number }
export type Rect = Size & Point
export type Viewport = Size

/** The eight grips: four edges and four corners, named by compass point. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
export const HANDLES: readonly Handle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"]

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** The size the viewport allows, never below the minimum. */
export function clampSize(size: Size, viewport: Viewport): Size {
  return {
    width: clamp(
      size.width,
      MIN_COMMIT_DIALOG_WIDTH,
      Math.max(MIN_COMMIT_DIALOG_WIDTH, viewport.width - 2 * COMMIT_DIALOG_MARGIN),
    ),
    height: clamp(
      size.height,
      MIN_COMMIT_DIALOG_HEIGHT,
      Math.max(MIN_COMMIT_DIALOG_HEIGHT, viewport.height - 2 * COMMIT_DIALOG_MARGIN),
    ),
  }
}

/** Keeps a positioned window inside the viewport margin after the viewport changed. */
export function clampRect(rect: Rect, viewport: Viewport): Rect {
  const size = clampSize(rect, viewport)
  return {
    ...size,
    left: clamp(
      rect.left,
      COMMIT_DIALOG_MARGIN,
      Math.max(COMMIT_DIALOG_MARGIN, viewport.width - COMMIT_DIALOG_MARGIN - size.width),
    ),
    top: clamp(
      rect.top,
      COMMIT_DIALOG_MARGIN,
      Math.max(COMMIT_DIALOG_MARGIN, viewport.height - COMMIT_DIALOG_MARGIN - size.height),
    ),
  }
}

/**
 * The rect after dragging `handle` by (dx, dy) from `start`: the dragged
 * edge follows the pointer, the opposite edge stays where it was (a window,
 * not a symmetric scale about the centre), within the minimum size and the
 * viewport margin.
 */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, viewport: Viewport): Rect {
  const m = COMMIT_DIALOG_MARGIN
  const next: Rect = { ...start }
  if (handle.includes("e")) {
    next.width = clamp(
      start.width + dx,
      MIN_COMMIT_DIALOG_WIDTH,
      Math.max(MIN_COMMIT_DIALOG_WIDTH, viewport.width - m - start.left),
    )
  }
  if (handle.includes("w")) {
    const right = start.left + start.width
    next.width = clamp(start.width - dx, MIN_COMMIT_DIALOG_WIDTH, Math.max(MIN_COMMIT_DIALOG_WIDTH, right - m))
    next.left = right - next.width
  }
  if (handle.includes("s")) {
    next.height = clamp(
      start.height + dy,
      MIN_COMMIT_DIALOG_HEIGHT,
      Math.max(MIN_COMMIT_DIALOG_HEIGHT, viewport.height - m - start.top),
    )
  }
  if (handle.includes("n")) {
    const bottom = start.top + start.height
    next.height = clamp(start.height - dy, MIN_COMMIT_DIALOG_HEIGHT, Math.max(MIN_COMMIT_DIALOG_HEIGHT, bottom - m))
    next.top = bottom - next.height
  }
  return next
}

/** A stored `{width,height}` or null for anything that is not one. */
export function parseStoredSize(raw: string | null): Size | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Size> | null
    const { width, height } = value ?? {}
    if (typeof width !== "number" || typeof height !== "number") return null
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
    return { width, height }
  } catch {
    return null
  }
}

export function readStoredSize(): Size | null {
  try {
    return parseStoredSize(window.localStorage.getItem(COMMIT_DIALOG_SIZE_KEY))
  } catch {
    return null
  }
}

export function storeSize(size: Size): void {
  try {
    window.localStorage.setItem(
      COMMIT_DIALOG_SIZE_KEY,
      JSON.stringify({ width: Math.round(size.width), height: Math.round(size.height) }),
    )
  } catch {
    // Storage refused: the size still applies for this window.
  }
}
