// The repository cards' pure parts (v0.20.10, option E of
// docs/prototypes/recents-v4.html). Owner (2026-10-13): "would be better able
// to handle work trees … I would like to more easily find my work trees".
// One card per repository, its worktrees inside; the filter matches the
// repository name, a worktree's folder name, branch and path. StartPane.tsx
// renders; this file decides.

import type { RecentInfo, WorkspaceInfo, WorktreeInfo } from "../engine"
import { findMatch, type MatchRange } from "./recentsModel"

export type CardSort = "recent" | "az"

export type RowMatch = { name: MatchRange | null; branch: MatchRange | null; root: MatchRange | null }

export type CardRow = { repo: WorkspaceInfo; tree: WorktreeInfo; match: RowMatch }

export type Card = { repo: WorkspaceInfo; rows: CardRow[]; hidden: number }

/** Rows a card shows before "+ n more" (none folded while filtering). */
export const FOLD_AT = 6

/** An engine without GET /repos/workspaces: each recent repository is a card of one. */
export function fallbackWorkspaces(recents: RecentInfo[]): WorkspaceInfo[] {
  return recents.map((r) => ({
    name: r.name,
    mainRoot: r.root,
    lastOpened: r.lastOpened ?? null,
    pinned: r.pinned ?? false,
    worktrees: [
      {
        root: r.root,
        name: r.name,
        branch: r.branch || null,
        main: true,
        detached: false,
        lastOpened: r.lastOpened ?? null,
        pinned: r.pinned ?? false,
        id: r.id,
      },
    ],
  }))
}

const time = (value: string | null) => (value ? Date.parse(value) || 0 : 0)

/** Main first, then the most recently opened, then never-opened ones by name. */
export function orderTrees(trees: WorktreeInfo[]): WorktreeInfo[] {
  return [...trees].sort(
    (a, b) =>
      Number(b.main) - Number(a.main) ||
      Number(b.pinned) - Number(a.pinned) ||
      time(b.lastOpened) - time(a.lastOpened) ||
      a.name.localeCompare(b.name),
  )
}

/** Where `query` hits a worktree; null when nothing does. A hit on the
 *  repository's name keeps all its worktrees, unmarked. */
export function matchTree(repo: WorkspaceInfo, tree: WorktreeInfo, query: string): RowMatch | null {
  const q = query.trim()
  const m = { name: findMatch(tree.name, q), branch: findMatch(tree.branch ?? "", q), root: findMatch(tree.root, q) }
  if (q.length > 0 && !m.name && !m.branch && !m.root && !findMatch(repo.name, q)) return null
  return m
}

/**
 * The cards to draw and, in reading order, the rows the keyboard walks.
 * `hide` takes a root out (a Remove waiting for its Undo).
 */
export function buildCards(
  workspaces: WorkspaceInfo[],
  query: string,
  sort: CardSort,
  expanded: ReadonlySet<string>,
  hide: string | null = null,
): { cards: Card[]; rows: CardRow[]; total: number } {
  const filtering = query.trim().length > 0
  const ordered =
    sort === "az"
      ? [...workspaces].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      : workspaces
  const cards: Card[] = []
  let total = 0
  for (const repo of ordered) {
    const trees = orderTrees(repo.worktrees).filter((t) => t.root !== hide)
    total += trees.length
    const hits = trees.flatMap((tree) => {
      const match = matchTree(repo, tree, query)
      return match ? [{ repo, tree, match }] : []
    })
    if (hits.length === 0) continue
    const key = repo.mainRoot ?? repo.name
    const open = filtering || expanded.has(key) || hits.length <= FOLD_AT
    cards.push({ repo, rows: open ? hits : hits.slice(0, FOLD_AT), hidden: open ? 0 : hits.length - FOLD_AT })
  }
  return { cards, rows: cards.flatMap((c) => c.rows), total }
}

/** The key a card is folded and unfolded under. */
export const cardKey = (repo: WorkspaceInfo) => repo.mainRoot ?? repo.name
