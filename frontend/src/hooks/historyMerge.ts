import type { RevisionDto } from "../engine"
import type { Revision } from "../graph/types"

// Refresh merge for the revision list (v0.13.20, field report from a
// 10k-revision repository): every refresh used to rebuild page 0 through
// toRevision, so no row object kept its identity, the layout effect's
// append check (`revisions[0] === prev[0]`) never held, and the worker got
// a reset with all 10,000 rows — structuredClone + full lane layout on
// every refresh, focus or poll. The engine answered in 300 ms; the freeze
// was ours. Rows that did not change now keep their object, and a refresh
// that changes nothing is reported as such so the caller skips setState.

export function toRevision(dto: RevisionDto): Revision {
  return {
    id: dto.id,
    parents: dto.parents,
    message: dto.subject,
    author: dto.author,
    date: formatDate(dto.date),
    refs: dto.refs,
  }
}

export function formatDate(iso: string): string {
  return iso.replace("T", " ").slice(0, 16)
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** The existing row object when the DTO describes the same commit with the
 *  same refs, else a fresh one. Refs are part of the row (they draw on it),
 *  so a moved branch does produce a new object for its two commits. */
export function reuseRevision(dto: RevisionDto, old: Revision | undefined): Revision {
  if (
    old &&
    old.id === dto.id &&
    old.message === dto.subject &&
    old.author === dto.author &&
    old.date === formatDate(dto.date) &&
    sameList(old.parents, dto.parents) &&
    sameList(old.refs, dto.refs)
  ) {
    return old
  }
  return toRevision(dto)
}

export type Merge = { next: Revision[]; complete: boolean; unchanged: boolean }

/**
 * Splices a refetched first page onto the already loaded history. `page`
 * is the new page 0; `old` what is loaded; `pageSize` tells whether the
 * page was the whole history; `oldComplete` whether the old tail reached
 * the root. Rows keep their identity where nothing changed, and
 * `unchanged` is true when the result is element-for-element the old list.
 */
export function mergeReload(page: RevisionDto[], old: Revision[], pageSize: number, oldComplete: boolean): Merge {
  const byId = new Map<string, Revision>()
  for (const r of old) byId.set(r.id, r)
  const fresh = page.map((dto) => reuseRevision(dto, byId.get(dto.id)))
  let next = fresh
  let complete = page.length < pageSize
  if (!complete) {
    const lastId = fresh[fresh.length - 1]?.id
    const k = lastId ? old.findIndex((r) => r.id === lastId) : -1
    if (k >= 0) {
      const seen = new Set(fresh.map((r) => r.id))
      next = [...fresh, ...old.slice(k + 1).filter((r) => !seen.has(r.id))]
      complete = oldComplete
    }
  }
  const unchanged = next.length === old.length && next.every((r, i) => r === old[i])
  return { next: unchanged ? old : next, complete, unchanged }
}
