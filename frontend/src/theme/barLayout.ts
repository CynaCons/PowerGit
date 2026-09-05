import { useSyncExternalStore } from "react"

// Where the commands live (v0.13.15). The owner compared three placements
// on the real window and chose the rail:
//   "rail"  (default) the commands sit in the collapsible left rail under a
//           slim title strip that carries the mark, name and window controls
//   "top"   the command bar is the frameless window's title bar (the
//           pre-v0.13.15 layout, kept as an option)
// Persisted under `pg.bar`.

export type BarLayout = "rail" | "top"
export const BAR_STORAGE_KEY = "pg.bar"
const LAYOUTS: readonly BarLayout[] = ["rail", "top"]

function readStored(): BarLayout {
  try {
    const raw = window.localStorage.getItem(BAR_STORAGE_KEY)
    return LAYOUTS.includes(raw as BarLayout) ? (raw as BarLayout) : "rail"
  } catch {
    return "rail"
  }
}

let layout: BarLayout = typeof window === "undefined" ? "rail" : readStored()
const listeners = new Set<() => void>()

export function getBarLayout(): BarLayout {
  return layout
}

export function setBarLayout(next: BarLayout) {
  if (!LAYOUTS.includes(next) || next === layout) return
  layout = next
  try {
    window.localStorage.setItem(BAR_STORAGE_KEY, next)
  } catch {
    // Storage refused: the choice still applies for this window.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useBarLayout(): BarLayout {
  return useSyncExternalStore(subscribe, getBarLayout, () => "rail")
}
