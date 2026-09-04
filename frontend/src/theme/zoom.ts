import { useSyncExternalStore } from "react"

// Application zoom (v0.13.13): Ctrl+= / Ctrl+- / Ctrl+0, persisted under
// `pg.zoom` as a factor (1 = 100%). Applied as CSS `zoom` on #root — not on
// html/body, and not as a rem scale. Both shipping engines (Chromium in
// WebView2, WebKit) were probed: `zoom` on html/body puts MUI's
// fixed-position popovers 1×zoom off their anchors because
// getBoundingClientRect() reports visual px while the popover's `left` is
// re-zoomed; zoom on #root alone leaves the body-level portals unzoomed
// for positioning, and buildTheme() zooms only their *content* (menu list,
// dialog paper, tooltip bubble). Scroll metrics (scrollTop, clientHeight,
// offsetWidth, ResizeObserver) stay in local px inside the zoomed subtree,
// so the virtualizers and the canvas keep working in ROW_HEIGHT units; only
// pointer deltas (clientX/clientY are visual px) need dividing by the zoom.
// See docs/agents/memories/visual-tokens.md.

export const ZOOM_STORAGE_KEY = "pg.zoom"
export const ZOOM_MIN = 0.7
export const ZOOM_MAX = 2
export const ZOOM_DEFAULT = 1
/** The Ctrl+= / Ctrl+- ladder; every stop lands on a familiar percentage. */
export const ZOOM_STEPS: readonly number[] = [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]

type Listener = () => void
const listeners = new Set<Listener>()

export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_DEFAULT
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100))
}

function readStored(): number {
  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY)
    return raw === null ? ZOOM_DEFAULT : clampZoom(Number(raw))
  } catch {
    return ZOOM_DEFAULT
  }
}

let zoom = typeof window === "undefined" ? ZOOM_DEFAULT : readStored()

export function getZoom(): number {
  return zoom
}

export function setZoom(next: number) {
  const clamped = clampZoom(next)
  if (clamped === zoom) return
  zoom = clamped
  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(clamped))
  } catch {
    // Storage refused: the zoom still applies for this window.
  }
  for (const l of listeners) l()
}

/** Next ladder stop above `current` (or the max if already past it). */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((s) => s > current + 1e-9) ?? ZOOM_MAX
  const below = ZOOM_STEPS.filter((s) => s < current - 1e-9)
  return below.length ? below[below.length - 1] : ZOOM_MIN
}

export const zoomIn = () => setZoom(stepZoom(zoom, 1))
export const zoomOut = () => setZoom(stepZoom(zoom, -1))
export const zoomReset = () => setZoom(ZOOM_DEFAULT)

export const zoomPercent = (value: number) => `${Math.round(value * 100)}%`

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useZoom(): number {
  return useSyncExternalStore(subscribe, getZoom, () => ZOOM_DEFAULT)
}
