import { useSyncExternalStore } from "react"
import type { HighlightScope } from "./ancestry"

// How the checked-out branch's history is highlighted in the graph
// (v0.14.0). Always on; the floating bar at the bottom of the graph
// (GraphOptionsBar) switches scope and style. Persisted under `pg.graph`.
//   scope  "all": every commit reachable from HEAD; "first-parent": the
//          branch's mainline only (its commits and the merges into it)
//   ring   thin outline on every highlighted node, HEAD's device
//   dim    everything outside the history in the non-relative grey
//   authorMark  (v0.18.1) ring the selected author's discs and bold the
//          name on every loaded row by that author; off keeps the discs

export type GraphOptions = { scope: HighlightScope; ring: boolean; dim: boolean; authorMark: boolean }
export const GRAPH_OPTIONS_KEY = "pg.graph"
export const DEFAULT_GRAPH_OPTIONS: GraphOptions = { scope: "all", ring: true, dim: true, authorMark: true }

export function parseGraphOptions(raw: string | null): GraphOptions {
  if (!raw) return DEFAULT_GRAPH_OPTIONS
  try {
    const o = JSON.parse(raw) as Partial<GraphOptions>
    return {
      scope: o.scope === "first-parent" ? "first-parent" : "all",
      ring: typeof o.ring === "boolean" ? o.ring : DEFAULT_GRAPH_OPTIONS.ring,
      dim: typeof o.dim === "boolean" ? o.dim : DEFAULT_GRAPH_OPTIONS.dim,
      authorMark: typeof o.authorMark === "boolean" ? o.authorMark : DEFAULT_GRAPH_OPTIONS.authorMark,
    }
  } catch {
    return DEFAULT_GRAPH_OPTIONS
  }
}

function readStored(): GraphOptions {
  try {
    return parseGraphOptions(window.localStorage.getItem(GRAPH_OPTIONS_KEY))
  } catch {
    return DEFAULT_GRAPH_OPTIONS
  }
}

let options: GraphOptions = typeof window === "undefined" ? DEFAULT_GRAPH_OPTIONS : readStored()
const listeners = new Set<() => void>()

export function getGraphOptions(): GraphOptions {
  return options
}

export function setGraphOptions(patch: Partial<GraphOptions>) {
  const next = { ...options, ...patch }
  if (
    next.scope === options.scope &&
    next.ring === options.ring &&
    next.dim === options.dim &&
    next.authorMark === options.authorMark
  )
    return
  options = next
  try {
    window.localStorage.setItem(GRAPH_OPTIONS_KEY, JSON.stringify(next))
  } catch {
    // Storage refused: the choice still applies for this window.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGraphOptions(): GraphOptions {
  return useSyncExternalStore(subscribe, getGraphOptions, () => DEFAULT_GRAPH_OPTIONS)
}
