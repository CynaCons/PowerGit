import { useSyncExternalStore } from "react"
import type { RefTree } from "../engine/types"

// Which refs the graph shows (v0.18.5). Owner: "I need to be able to select
// which branch I see in the graph. Like a dynamic filtering. It can be a
// mode, that when entered, I can activate branches on the left side
// explorer and only these are visible." Prototype
// docs/prototypes/branch-visibility.html, tab 4, variant A.
// Per repository, under `pg.graphRefs.<repoId>`:
//   mode  the filter mode is on: the graph lists the checked refs' history
//         plus the checked-out branch, which is always shown and therefore
//         never stored here (it moves with every checkout)
//   refs  the checked full ref names (refs/heads/x, refs/remotes/origin/x,
//         refs/tags/x), the names the tree and the engine both use

export type GraphRefs = { mode: boolean; refs: string[] }
export const GRAPH_REFS_KEY = "pg.graphRefs."
export const DEFAULT_GRAPH_REFS: GraphRefs = { mode: false, refs: [] }

export function parseGraphRefs(raw: string | null): GraphRefs {
  if (!raw) return DEFAULT_GRAPH_REFS
  try {
    const o = JSON.parse(raw) as Partial<GraphRefs>
    const refs = Array.isArray(o.refs)
      ? [...new Set(o.refs.filter((r): r is string => typeof r === "string" && r.startsWith("refs/")))]
      : []
    return { mode: o.mode === true, refs }
  } catch {
    return DEFAULT_GRAPH_REFS
  }
}

const storageKey = (repoId: string) => `${GRAPH_REFS_KEY}${repoId}`

function readStored(repoId: string): GraphRefs {
  try {
    return parseGraphRefs(window.localStorage.getItem(storageKey(repoId)))
  } catch {
    return DEFAULT_GRAPH_REFS
  }
}

// One snapshot per repository so useSyncExternalStore sees a stable
// reference until something changes.
const byRepo = new Map<string, GraphRefs>()
const listeners = new Set<() => void>()

export function getGraphRefs(repoId: string | null): GraphRefs {
  if (!repoId) return DEFAULT_GRAPH_REFS
  let cur = byRepo.get(repoId)
  if (!cur) {
    cur = typeof window === "undefined" ? DEFAULT_GRAPH_REFS : readStored(repoId)
    byRepo.set(repoId, cur)
  }
  return cur
}

const sameRefs = (a: string[], b: string[]) => a.length === b.length && a.every((r, i) => r === b[i])

export function setGraphRefs(repoId: string | null, patch: Partial<GraphRefs>) {
  if (!repoId) return
  const prev = getGraphRefs(repoId)
  const next: GraphRefs = { mode: patch.mode ?? prev.mode, refs: patch.refs ?? prev.refs }
  if (next.mode === prev.mode && sameRefs(next.refs, prev.refs)) return
  byRepo.set(repoId, next)
  try {
    window.localStorage.setItem(storageKey(repoId), JSON.stringify(next))
  } catch {
    // Storage refused: the choice still applies for this window.
  }
  for (const l of listeners) l()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGraphRefs(repoId: string | null): GraphRefs {
  return useSyncExternalStore(
    subscribe,
    () => getGraphRefs(repoId),
    () => DEFAULT_GRAPH_REFS,
  )
}

/** Test seam: forget every cached snapshot (storage is left alone). */
export function resetGraphRefsCache() {
  byRepo.clear()
}

/** What the strip and the header chip say: "n of N refs" — the checked
 *  refs plus the checked-out branch (locked, counted once even when it is
 *  also ticked) over every branch, remote branch and tag of the tree. */
export function graphRefCounts(tree: RefTree | null, refs: GraphRefs): { shown: number; total: number } {
  const current = tree?.branches.find((b) => b.current)?.fullName ?? null
  const shown = refs.refs.filter((r) => r !== current).length + (current ? 1 : 0)
  const total = tree ? tree.branches.length + tree.remotes.length + tree.tags.length : 0
  return { shown, total }
}
