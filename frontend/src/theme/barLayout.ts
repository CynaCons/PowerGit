import { useSyncExternalStore } from "react"

// Where the command bar lives (v0.13.15, owner: "have the menu bars from
// the top but as a floating bar at the bottom", an isolated attempt kept
// switchable so both can be compared on the real window):
//   "top"      the bar is the frameless window's title bar (default)
//   "floating" a slim title strip stays at the top; the commands float in a
//              rounded bar over the bottom of the workspace
//   "rail"     the commands live in the left rail, which expands to show
//              labels (owner: "integrate the menu options in the leftside
//              navrail instead, with a collapsable leftside menu")
// Persisted under `pg.bar`.

export type BarLayout = "top" | "floating" | "rail"
export const BAR_STORAGE_KEY = "pg.bar"
const LAYOUTS: readonly BarLayout[] = ["top", "floating", "rail"]

function readStored(): BarLayout {
  try {
    const raw = window.localStorage.getItem(BAR_STORAGE_KEY)
    return LAYOUTS.includes(raw as BarLayout) ? (raw as BarLayout) : "top"
  } catch {
    return "top"
  }
}

let layout: BarLayout = typeof window === "undefined" ? "top" : readStored()
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
  return useSyncExternalStore(subscribe, getBarLayout, () => "top")
}
