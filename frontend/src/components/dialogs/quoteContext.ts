import { createContext, useContext, useMemo } from "react"
import type { RefTree } from "../../engine"
import type { GraphRow } from "../../graph/types"

// What a dialog needs to quote the graph (v0.18.11): the loaded rows (a
// commit's lane colour, refs, author and date come from its row when it is
// loaded), the ref tree (tips, the tag and remote names the chips need) and
// the checked-out branch. AppDialogs provides it once; QuotedRow, QuotedRef
// and BranchPicker read it, so no dialog threads five props through.

export type QuoteContextValue = {
  rows: GraphRow[]
  refs: RefTree | null
  currentBranch: string
  tagSet: Set<string>
  remoteNames: string[]
}

const EMPTY: QuoteContextValue = { rows: [], refs: null, currentBranch: "", tagSet: new Set(), remoteNames: [] }

export const QuoteContext = createContext<QuoteContextValue>(EMPTY)

export function useQuote(): QuoteContextValue {
  return useContext(QuoteContext)
}

/** The loaded row of a commit, by full or abbreviated SHA. */
export function findRow(rows: GraphRow[], sha: string | null | undefined): GraphRow | undefined {
  if (!sha) return undefined
  return rows.find((r) => !r.artificial && (r.rev.id === sha || (sha.length >= 7 && r.rev.id.startsWith(sha))))
}

/** The commit a ref points at, from the ref tree. */
export function refTarget(refs: RefTree | null, name: string): string | null {
  if (!refs) return null
  for (const list of [refs.branches, refs.remotes, refs.tags]) {
    const hit = list.find((r) => r.name === name)
    if (hit) return hit.target
  }
  return null
}

/** The rows' tag and remote sets from a ref tree, memoised by the tree. */
export function useQuoteValue(rows: GraphRow[], refs: RefTree | null, currentBranch: string): QuoteContextValue {
  return useMemo(() => {
    const tagSet = new Set((refs?.tags ?? []).map((t) => t.name))
    const remoteNames = Array.from(new Set((refs?.remotes ?? []).map((r) => r.name.split("/")[0] ?? "")))
    return { rows, refs, currentBranch, tagSet, remoteNames }
  }, [rows, refs, currentBranch])
}
