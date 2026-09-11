import { useSyncExternalStore } from "react"

// Appearance → "Author discs" (v0.18.1): the initials disc before each
// author in the graph and the ring on the selected commit's author. On by
// default; off is the pre-v0.18.1 look (the pill's Mark then only bolds
// the name). Persisted under `pg.authorDiscs`; same store pattern as
// barLayout.ts.

export const AUTHOR_DISCS_KEY = "pg.authorDiscs"

/** Anything but an explicit off reads as on, so a stale or odd value keeps the default. */
export function parseAuthorDiscs(raw: string | null): boolean {
  if (raw === null) return true
  const v = raw.trim().toLowerCase()
  return !(v === "0" || v === "false" || v === "off")
}

function readStored(): boolean {
  try {
    return parseAuthorDiscs(window.localStorage.getItem(AUTHOR_DISCS_KEY))
  } catch {
    return true
  }
}

let enabled: boolean = typeof window === "undefined" ? true : readStored()
const listeners = new Set<() => void>()

export function getAuthorDiscs(): boolean {
  return enabled
}

export function setAuthorDiscs(next: boolean) {
  if (next === enabled) return
  enabled = next
  try {
    window.localStorage.setItem(AUTHOR_DISCS_KEY, next ? "1" : "0")
  } catch {
    // Storage refused: the choice still applies for this window.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAuthorDiscs(): boolean {
  return useSyncExternalStore(subscribe, getAuthorDiscs, () => true)
}
