import type { GraphRow } from "./types"

// Which loaded commits the checked-out branch reaches (v0.14.0, owner:
// "better highlight all the ancestors of the currently checked-out branch
// ... better see who merged what and when").
//
// Marks: 2 = on the first-parent line (the branch's own commits and the
// merge commits themselves, what `git log --first-parent` lists), 1 =
// reachable only through a second parent (work that was merged in), absent
// = not reachable from the root among the loaded rows.
//
// One pass suffices because the engine's --date-order never shows a parent
// before its children (docs/agents/memories/engine-revision-ordering-and-
// worktree-diff.md): by the time a row is visited, every child that could
// have marked it already has. Returns null when the root is not among the
// loaded rows — the renderer then changes nothing, rather than dimming a
// history it cannot judge.
//
// v0.18.4 (owner: "right click on a commit and hit Highlight ancestry and
// then temporarily all the ancestry is highlighted like we do for the
// current branch"): the root can be any loaded commit. The walk is the
// same; `temporary` (root ≠ HEAD) tells draw.ts to give the root row HEAD's
// 2 px outline, and the pending rows — HEAD's future — are marked only when
// HEAD is the root.

export type Mark = 1 | 2
export type Ancestry = {
  /** The commit the marks start from: HEAD, or the temporary root. */
  rootId: string
  /** The root is not HEAD (Highlight ancestry, until refresh). */
  temporary: boolean
  marks: Map<string, Mark>
}
export type HighlightScope = "all" | "first-parent"

export function markAncestry(rows: readonly GraphRow[], rootId?: string): Ancestry | null {
  const root = rootId === undefined ? rows.find((r) => r.isHead) : rows.find((r) => r.rev.id === rootId)
  if (!root) return null
  const temporary = !root.isHead
  const marks = new Map<string, Mark>()
  marks.set(root.rev.id, 2)
  // Pending-change rows sit on top of HEAD and are its future: never dimmed.
  if (!temporary) for (const row of rows) if (row.artificial) marks.set(row.rev.id, 2)
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
  return { rootId: root.rev.id, temporary, marks }
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
