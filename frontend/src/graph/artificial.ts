import type { GraphRow, RowSegment } from "./types"

// Pending changes as rows on top of HEAD (v0.14.1, owner: "show the current
// pending changes as a temporary side commit in the graph ... growing on
// top of the latest commit"), like Git Extensions' artificial commits:
// "Working directory" (unstaged) above "Index" (staged), each only while
// non-empty. Injected AFTER layout so the engine's revision list, the
// worker's append path and every row's identity stay untouched; the rows
// take HEAD's lane (or a free one when a line passes through it) and carry
// exclusive segments down to HEAD, which is what the layouter would have
// produced for a linear child.

export const WORKTREE_ID = "WORKTREE"
export const INDEX_ID = "INDEX"

export type PendingCounts = { unstagedCount: number; stagedCount: number }

export function isArtificialId(id: string): boolean {
  return id === WORKTREE_ID || id === INDEX_ID
}

function files(n: number): string {
  return n === 1 ? "1 file" : `${n} files`
}

/** True when a line on `row` in `lane` continues below it (does not end at `endsAt`). */
function laneBusy(row: GraphRow | undefined, lane: number, endsAt: string): boolean {
  return row !== undefined && row.segments.some((s) => s.lane === lane && s.parentId !== endsAt)
}

function maxLane(rows: (GraphRow | undefined)[]): number {
  let max = -1
  for (const r of rows) {
    if (!r) continue
    max = Math.max(max, r.lane)
    for (const s of r.segments) max = Math.max(max, s.lane)
  }
  return max
}

export function withArtificialRows(rows: GraphRow[], counts: PendingCounts | null): GraphRow[] {
  if (!counts || (counts.unstagedCount <= 0 && counts.stagedCount <= 0)) return rows
  const headIndex = rows.findIndex((r) => r.isHead)
  if (headIndex < 0) return rows
  const head = rows[headIndex]
  const above = rows[headIndex - 1]
  const lane = laneBusy(above, head.lane, head.rev.id) ? maxLane([above, head]) + 1 : head.lane

  const specs: { id: string; artificial: "worktree" | "index"; message: string }[] = []
  if (counts.unstagedCount > 0)
    specs.push({ id: WORKTREE_ID, artificial: "worktree", message: `Working directory (${files(counts.unstagedCount)})` })
  if (counts.stagedCount > 0)
    specs.push({ id: INDEX_ID, artificial: "index", message: `Index (${files(counts.stagedCount)})` })

  // Chain: WORKTREE -> INDEX -> HEAD (or straight to HEAD when one is absent).
  const artificial: GraphRow[] = []
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const parentId = i + 1 < specs.length ? specs[i + 1].id : head.rev.id
    const segment: RowSegment = {
      id: `${spec.id}:${parentId}`,
      childId: spec.id,
      parentId,
      lane,
      color: head.color,
      sharing: "exclusive",
    }
    artificial.push({
      rev: { id: spec.id, parents: [parentId], message: spec.message, author: "", date: "", refs: [] },
      lane,
      color: head.color,
      hasRefs: false,
      isHead: false,
      segments: [segment],
      artificial: spec.artificial,
    })
  }
  // Every parent end carries the incoming segment so the line reaches its node.
  for (let i = 1; i < artificial.length; i++) {
    artificial[i] = { ...artificial[i], segments: [...artificial[i].segments, artificial[i - 1].segments[0]] }
  }
  const headCopy: GraphRow = {
    ...head,
    segments: [...head.segments, artificial[artificial.length - 1].segments[0]],
  }
  return [...rows.slice(0, headIndex), ...artificial, headCopy, ...rows.slice(headIndex + 1)]
}
