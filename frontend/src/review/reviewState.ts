import { useSyncExternalStore } from "react"
import { emptyDoc, type ReviewDoc } from "./reviewModel"

// Review mode's window state (v0.17.0): the toggle and the documents. Same
// `useSyncExternalStore` shape as components/gitConsoleState.ts — one
// module-level value, a listener set, and localStorage that may refuse
// without breaking the window.
//
// The toggle is per window and remembered, so a reviewer who turns it on
// finds it on after a restart; it is shared by the Diff tab and the commit
// dialog (v0.19.1). The documents live in memory for this iteration, keyed
// by the review key (a commit sha, or `<HEAD>-worktree` / `-index`); v0.19.0
// loads and saves them through the engine.

export const REVIEW_MODE_KEY = "pg.reviewMode"

export function parseReviewMode(raw: string | null): boolean {
  return raw === "true"
}

function readStoredMode(): boolean {
  try {
    return parseReviewMode(window.localStorage.getItem(REVIEW_MODE_KEY))
  } catch {
    return false
  }
}

let mode: boolean = typeof window === "undefined" ? false : readStoredMode()
const docs = new Map<string, ReviewDoc>()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const l of listeners) l()
}

export function getReviewMode(): boolean {
  return mode
}

export function setReviewMode(on: boolean): void {
  if (on === mode) return
  mode = on
  try {
    window.localStorage.setItem(REVIEW_MODE_KEY, String(on))
  } catch {
    // Storage refused: the choice still applies for this window.
  }
  emit()
}

export function useReviewMode(): boolean {
  return useSyncExternalStore(subscribe, getReviewMode, () => false)
}

/** The session's document for a key; null until something was marked. */
export function getReviewDoc(key: string | null): ReviewDoc | null {
  return key === null ? null : (docs.get(key) ?? null)
}

/**
 * Replaces the document for `key` with `f(current)`, seeding an empty one
 * (`emptyDoc(key)`) the first time. `f` must return a new object for a
 * change — `withLine` does — and may return its argument for a no-op.
 */
export function updateReviewDoc(key: string, f: (d: ReviewDoc) => ReviewDoc): void {
  const before = docs.get(key)
  const after = f(before ?? emptyDoc(key))
  if (before !== undefined && after === before) return
  docs.set(key, after)
  emit()
}

export function useReviewDoc(key: string | null): ReviewDoc | null {
  return useSyncExternalStore(
    subscribe,
    () => getReviewDoc(key),
    () => null,
  )
}
