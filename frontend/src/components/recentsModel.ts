// The recent repositories picker's pure parts (v0.18.7, prototype C of
// docs/prototypes/recents.html): the initials on the disc, its colour, the
// path prefix every entry shares, and the filter match with the range the
// highlight paints. RecentsDialog.tsx renders; this file decides.

import { paletteOf, type AuthorPalette } from "../graph/authorIdentity"

export type RecentEntry = { name: string; root: string; branch: string }

/**
 * "PowerGit" → "PG", "gitextensions-ref" → "GR", "powerspawn" → "PO",
 * "api" → "AP", "my_repo.v2" → "MR", "" → "?". Words split on space,
 * hyphen, underscore, dot and a camel-case boundary; the first two words
 * give a letter each, a lone word gives its first two.
 */
export function repoInitials(name: string): string {
  const words = name
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .split(/[\s\-_.]+/)
    .filter((w) => w.length > 0)
  if (words.length === 0) return "?"
  const pick = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)
  return pick.toUpperCase()
}

/**
 * The disc colour: the author discs' stable hash (graph/authorIdentity.ts)
 * over the PATH, not the name, so two repositories called `api` never
 * share a disc. Separators and case are normalised first so one repository
 * keeps its colour however its path was spelled.
 */
export function repoPalette(root: string): AuthorPalette {
  return paletteOf(root.replace(/\\/g, "/").toLowerCase())
}

/**
 * The prefix every listed root shares, cut on a separator boundary and
 * ending with one ("C:\dev\public-repo\"); every root keeps at least its
 * last segment. Empty below two entries or with nothing in common.
 */
export function sharedRoot(roots: string[]): string {
  if (roots.length < 2) return ""
  const parts = roots.map((r) => r.split(/[\\/]/))
  let n = 0
  while (parts.every((p) => p.length > n + 1 && p[n].toLowerCase() === parts[0][n].toLowerCase())) n++
  if (n === 0) return ""
  const sep = /[\\/]/.exec(roots[0])?.[0] ?? "/"
  return parts[0].slice(0, n).join(sep) + sep
}

export type PathParts = { shared: string; mid: string; tail: string }

/** A root cut for the tile: the dimmed shared prefix, the middle, the last segment in ink. */
export function pathParts(root: string, shared: string): PathParts {
  const tailAt = Math.max(root.lastIndexOf("\\"), root.lastIndexOf("/")) + 1
  const dim = shared.length > 0 && shared.length <= tailAt && root.toLowerCase().startsWith(shared.toLowerCase())
  const sharedLen = dim ? shared.length : 0
  return { shared: root.slice(0, sharedLen), mid: root.slice(sharedLen, tailAt), tail: root.slice(tailAt) }
}

export type MatchRange = { start: number; end: number }

/** Where a case-insensitive `query` first occurs in `text`; null when it does not (or is blank). */
export function findMatch(text: string, query: string): MatchRange | null {
  if (query.length === 0) return null
  const i = text.toLowerCase().indexOf(query.toLowerCase())
  return i < 0 ? null : { start: i, end: i + query.length }
}

export type RecentMatch = { name: MatchRange | null; root: MatchRange | null; branch: MatchRange | null }

/**
 * Case-insensitive on name, root and branch. null when the repository is
 * not a match; every range null when the query is blank (everything shows).
 */
export function matchRecent(repo: RecentEntry, query: string): RecentMatch | null {
  const q = query.trim()
  const m = { name: findMatch(repo.name, q), root: findMatch(repo.root, q), branch: findMatch(repo.branch, q) }
  if (q.length > 0 && !m.name && !m.root && !m.branch) return null
  return m
}

/** `range` cut to the slice of the text that starts at `offset` and is `length` long, relative to that slice. */
export function sliceRange(range: MatchRange | null, offset: number, length: number): MatchRange | null {
  if (!range) return null
  const start = Math.max(range.start, offset) - offset
  const end = Math.min(range.end, offset + length) - offset
  return end > start ? { start, end } : null
}
