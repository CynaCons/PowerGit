import type { EngineClient } from "./client"
import type { CommitChanges, CommitDetail, DiffOptions } from "./types"

// Per-commit details and changes, requested once and shared (v0.13.14,
// owner: "can we make the diff loading faster?"). A commit's details and
// diff never change for a given SHA and options, so the response can be
// kept and, more importantly, requested the moment a row is clicked —
// before React has rendered the selection — instead of after the bottom
// panel's deferred render. The bottom panel then finds the promise already
// in flight. Bounded LRU so a long browsing session cannot grow without
// limit; failed requests are dropped so a retry really retries.

export const DEFAULT_DIFF_OPTIONS: DiffOptions = { context: 3, ws: false, full: false }

type Entry = { commit: Promise<CommitDetail>; changes: Promise<CommitChanges> }

const MAX_ENTRIES = 64
const cache = new Map<string, Entry>()

function key(engine: EngineClient, id: string, options: DiffOptions): string {
  return `${engine.repoId ?? ""}|${id}|${options.context}|${options.ws ? 1 : 0}|${options.full ? 1 : 0}`
}

function remember(k: string, entry: Entry) {
  cache.delete(k)
  cache.set(k, entry)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** Details + changes of a commit, shared across callers; starts the requests if needed. */
export function commitData(engine: EngineClient, id: string, options: DiffOptions = DEFAULT_DIFF_OPTIONS): Entry {
  const k = key(engine, id, options)
  const hit = cache.get(k)
  if (hit) {
    remember(k, hit)
    return hit
  }
  const drop = () => {
    if (cache.get(k) === entry) cache.delete(k)
  }
  const entry: Entry = {
    commit: engine.commit(id).catch((e: unknown) => {
      drop()
      throw e
    }),
    changes: engine.changes(id, options).catch((e: unknown) => {
      drop()
      throw e
    }),
  }
  remember(k, entry)
  return entry
}

/** Forget a commit so the next request goes to the engine (Retry). */
export function forgetCommit(engine: EngineClient, id: string, options: DiffOptions = DEFAULT_DIFF_OPTIONS) {
  cache.delete(key(engine, id, options))
}

let lastPrefetch = 0

/**
 * Called from the row click handler, synchronously, before React renders:
 * the engine works while the grid repaints. Rapid successive selections
 * (arrow-key repeat) are left to the bottom panel's debounced load so a
 * 17k-row scrub does not turn into thousands of requests.
 */
export function prefetchCommit(engine: EngineClient, id: string | null) {
  if (!id || id.length < 16 || !engine.repoId) return
  const now = performance.now()
  if (now - lastPrefetch < 250) {
    lastPrefetch = now
    return
  }
  lastPrefetch = now
  const entry = commitData(engine, id)
  // Prefetches are best-effort; the panel surfaces errors when it asks.
  entry.commit.catch(() => undefined)
  entry.changes.catch(() => undefined)
}
