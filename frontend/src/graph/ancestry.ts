import type { GraphRow } from "./types"

// Which loaded commits the checked-out branch reaches (v0.14.0, owner:
// "better highlight all the ancestors of the currently checked-out branch
// ... better see who merged what and when").
//
// Marks: 2 = on the first-parent line (the branch's own commits and the
// merge commits themselves, what `git log --first-parent` lists), 1 =
// reachable only through a second parent (work that was merged in), absent
// = not reachable from HEAD among the loaded rows.
//
// One pass suffices because the engine's --date-order never shows a parent
// before its children (docs/agents/memories/engine-revision-ordering-and-
// worktree-diff.md): by the time a row is visited, every child that could
// have marked it already has. Returns null when HEAD is not among the
// loaded rows — the renderer then changes nothing, rather than dimming a
// history it cannot judge.

export type Mark = 1 | 2
export type Ancestry = { headId: string; marks: Map<string, Mark> }
export type HighlightScope = "all" | "first-parent"

export function markAncestry(rows: readonly GraphRow[]): Ancestry | null {
  const head = rows.find((r) => r.isHead)
  if (!head) return null
  const marks = new Map<string, Mark>()
  marks.set(head.rev.id, 2)
  for (const row of rows) {
    const mark = marks.get(row.rev.id)
    if (!mark) continue
    const parents = row.rev.parents
    for (let i = 0; i < parents.length; i++) {
      const p = parents[i]
      const inherited: Mark = mark === 2 && i === 0 ? 2 : 1
      const current = marks.get(p)
      if (!current || inherited > current) marks.set(p, inherited)
    }
  }
  return { headId: head.rev.id, marks }
}

/** Whether a commit is part of the highlighted history under `scope`. */
export function inScope(ancestry: Ancestry | null, scope: HighlightScope, id: string): boolean {
  if (!ancestry) return false
  const m = ancestry.marks.get(id)
  if (!m) return false
  return scope === "all" || m === 2
}

/** Whether the edge child → parent belongs to the highlighted history. */
export function edgeInScope(
  ancestry: Ancestry | null,
  scope: HighlightScope,
  childId: string,
  parentId: string,
  firstParentId: string | undefined,
): boolean {
  if (!ancestry) return false
  if (!inScope(ancestry, scope, childId) || !inScope(ancestry, scope, parentId)) return false
  return scope === "all" || parentId === firstParentId
}
