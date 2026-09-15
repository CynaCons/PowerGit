import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react"
import { GraphFilterChip } from "../components/GraphFilterChip"
import type { EngineClient, RefTree, RevisionFilter } from "../engine"
import { graphRefCounts, setGraphRefs, useGraphRefs, type GraphRefs } from "../graph/graphRefs"
import type { History } from "./useHistory"

// The graph's ref filter as App wires it (v0.18.5). Owner: "select which
// branch I see in the graph ... a mode, that when entered, I can activate
// branches on the left side explorer and only these are visible."
// The store (graph/graphRefs.ts) holds the ticks per repository; here they
// become the main history's `filter`. Only the ticks are sent: the engine
// keeps HEAD on the command line, so the checked-out branch is always in
// without naming it (a name would go stale on checkout and be a 400 once
// the branch is deleted). An empty set is an explicit `ref=` — HEAD alone.

export type GraphRefFilter = { graphRefs: GraphRefs; filter: RevisionFilter | undefined }

export function useGraphRefFilter(repoId: string | null): GraphRefFilter {
  const graphRefs = useGraphRefs(repoId)
  // Keyed by content so an equal set is the same object: useHistory's
  // fetchPage (and through it reloadHistory) is memoised on the filter.
  const key = graphRefs.mode ? [...new Set(graphRefs.refs)].sort().join("\n") : null
  const filter = useMemo<RevisionFilter | undefined>(
    () => (key === null ? undefined : { refs: key ? key.split("\n") : [] }),
    [key],
  )
  return { graphRefs, filter }
}

/**
 * The grid header's chip while the mode is on, and the reload behind a
 * filter change: like the file history's (FileHistoryView), a different
 * filter is a different list, so the loaded tail is dropped and page 0
 * reloaded — keeping the selection by SHA, which re-resolves to its row
 * when the commit is still listed (row 0 otherwise). A repository switch
 * is not a filter change: useRepoState loads that one.
 */
export function useGraphFilterChip(
  { graphRefs, filter }: GraphRefFilter,
  {
    client,
    live,
    refs,
    history,
  }: {
    client: EngineClient
    live: boolean
    refs: RefTree | null
    history: Pick<History, "resetHistory" | "reloadHistory">
  },
): ReactNode | undefined {
  const { resetHistory, reloadHistory } = history
  const applied = useRef({ repo: client.repoId, filter })
  useEffect(() => {
    const before = applied.current
    applied.current = { repo: client.repoId, filter }
    if (before.repo !== client.repoId || before.filter === filter) return
    if (!live || !client.hasRepo) return
    resetHistory({ keepSelection: true })
    void reloadHistory()
  }, [client, filter, live, resetHistory, reloadHistory])

  const repoId = client.repoId
  const exit = useCallback(() => setGraphRefs(repoId, { mode: false, refs: [] }), [repoId])
  const counts = useMemo(() => graphRefCounts(refs, graphRefs), [refs, graphRefs])
  return useMemo(
    () => (graphRefs.mode ? <GraphFilterChip shown={counts.shown} total={counts.total} onExit={exit} /> : undefined),
    [graphRefs.mode, counts, exit],
  )
}
