import { useSyncExternalStore } from "react"

// Wrap lines (v0.18.8). Owner: "whenever we display code (e.g. Commit view
// or Diff view): can we have an option to activate line wrapping in the
// floating action menu?" One remembered switch for every code surface (the
// Diff tab, the commit window's diff, the file history's diff, the File tree
// blob), persisted under `pg.diffWrap`, off by default: no-wrap with a
// horizontal scroll and a sticky gutter is what Git Extensions shows.
//
// Deliberately NOT a DiffOptions field: wrapping is presentation. The
// engine request, the commit cache key (context + whitespace) and the diff
// text are the same either way, so the toggle never re-requests a diff.
// Same store shape as graph/graphOptions.ts.

export const CODE_WRAP_KEY = "pg.diffWrap"

/** "1" / "true" (any case) is on; anything else, including null, is off. */
export function parseCodeWrap(raw: string | null): boolean {
  if (!raw) return false
  const v = raw.trim().toLowerCase()
  return v === "1" || v === "true"
}

function readStored(): boolean {
  try {
    return parseCodeWrap(window.localStorage.getItem(CODE_WRAP_KEY))
  } catch {
    return false
  }
}

let wrap: boolean = typeof window === "undefined" ? false : readStored()
const listeners = new Set<() => void>()

export function getCodeWrap(): boolean {
  return wrap
}

export function setCodeWrap(next: boolean) {
  if (next === wrap) return
  wrap = next
  try {
    window.localStorage.setItem(CODE_WRAP_KEY, next ? "1" : "0")
  } catch {
    // Storage refused: the choice still applies for this window.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCodeWrap(): boolean {
  return useSyncExternalStore(subscribe, getCodeWrap, () => false)
}
