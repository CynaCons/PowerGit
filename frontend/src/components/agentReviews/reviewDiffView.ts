import { useSyncExternalStore } from "react"
import type { DiffOptions } from "../../engine"
import { DEFAULT_DIFF_OPTIONS } from "../../engine/commitCache"

// v0.21.9, owner: "I don't like the fact that the settings for the line wrap
// is shared with the other view. I want also the settings to be in the
// agent's review view as well." The review screen's diff options are its
// own: context lines, Full file and Wrap lines, remembered under
// `pg.reviewDiff`, apart from the other diff views' `pg.diffWrap`
// (codeWrap.ts). Wrap is on by default here: a review reads whole lines.
// Same store shape as codeWrap.ts.

export const REVIEW_DIFF_KEY = "pg.reviewDiff"

export type ReviewDiffView = { options: DiffOptions; wrap: boolean }

export const DEFAULT_REVIEW_DIFF: ReviewDiffView = { options: DEFAULT_DIFF_OPTIONS, wrap: true }

/** The stored JSON; a missing or odd field takes its default. */
export function parseReviewDiff(raw: string | null): ReviewDiffView {
  let v: unknown
  try {
    v = raw ? JSON.parse(raw) : null
  } catch {
    v = null
  }
  if (!v || typeof v !== "object") return DEFAULT_REVIEW_DIFF
  const o = v as Record<string, unknown>
  const context =
    typeof o.context === "number" && Number.isInteger(o.context) && o.context >= 0 && o.context <= 100
      ? o.context
      : DEFAULT_DIFF_OPTIONS.context
  return {
    options: { context, ws: false, full: o.full === true },
    wrap: typeof o.wrap === "boolean" ? o.wrap : DEFAULT_REVIEW_DIFF.wrap,
  }
}

function readStored(): ReviewDiffView {
  try {
    return parseReviewDiff(window.localStorage.getItem(REVIEW_DIFF_KEY))
  } catch {
    return DEFAULT_REVIEW_DIFF
  }
}

let view: ReviewDiffView = typeof window === "undefined" ? DEFAULT_REVIEW_DIFF : readStored()
const listeners = new Set<() => void>()

export function getReviewDiff(): ReviewDiffView {
  return view
}

export function setReviewDiff(patch: Partial<ReviewDiffView>) {
  const next = { ...view, ...patch }
  next.options = { ...next.options, ws: false }
  view = next
  try {
    window.localStorage.setItem(
      REVIEW_DIFF_KEY,
      JSON.stringify({ context: next.options.context, full: next.options.full, wrap: next.wrap }),
    )
  } catch {
    // Storage refused: the choice still applies for this window.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useReviewDiff(): ReviewDiffView {
  return useSyncExternalStore(subscribe, getReviewDiff, () => DEFAULT_REVIEW_DIFF)
}
