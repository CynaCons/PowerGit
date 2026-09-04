import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { fetchRevisions, type RevisionDto } from "../engine"
import { createLayouter, layoutGraph, type GraphLayouter } from "../graph/layout"
import { syntheticHistory } from "../graph/synthetic"
import type { GraphRow, Revision } from "../graph/types"

function toRevision(dto: RevisionDto): Revision {
  return {
    id: dto.id,
    parents: dto.parents,
    message: dto.subject,
    author: dto.author,
    date: dto.date.replace("T", " ").slice(0, 16),
    refs: dto.refs,
  }
}

// History pages in from the engine: the first page renders fast, autofill
// keeps loading in the background up to EAGER_CEILING, and scrolling or
// jumping to a ref keeps loading up to HARD_CEILING.
const PAGE = 1000
const EAGER_CEILING = 10_000
const HARD_CEILING = 100_000

type LayoutRequest = { seq: number; reset: boolean; revisions: Revision[] }
type LayoutReply = { seq: number; reset: boolean; from: number; rows: GraphRow[] }

export type HistoryDeps = {
  offline: boolean
  live: boolean
  setLive: (live: boolean) => void
  setEngineError: (message: string | null) => void
}

export type History = ReturnType<typeof useHistory>

// Revision list, paging, lane layout (worker) and the SHA-keyed selection.
// All revision mutations flow through reloadHistory/extendHistory.
export function useHistory({ offline, live, setLive, setEngineError }: HistoryDeps) {
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [historyComplete, setHistoryComplete] = useState(false)
  const [loadingTail, setLoadingTail] = useState(false)
  const [historyNote, setHistoryNote] = useState<string | null>(null)
  const [selectedSha, setSelectedSha] = useState<string | null>(null)

  // History bookkeeping lives in refs so async loaders never read stale
  // state.
  const revisionsRef = useRef<Revision[]>([])
  const historyCompleteRef = useRef(false)
  const histGen = useRef(0)
  const revCount = useRef(0)
  const extendRun = useRef<Promise<void> | null>(null)

  // Lane layout runs in a Web Worker. History pages append to the worker's
  // existing layout; a refresh resets it. Replies older than the last reset
  // are dropped so a slow relayout can never clobber newer state.
  const [liveGraphRows, setLiveGraphRows] = useState<GraphRow[]>([])
  const layoutWorker = useRef<Worker | null>(null)
  const layoutSeq = useRef(0)
  const resetSeq = useRef(0)
  const lastSent = useRef<Revision[]>([])

  // Where layout requests go: the worker, or an in-thread layouter once the
  // worker has failed (module workers over the tauri:// custom scheme have
  // regressed on some WebKitGTK builds; without this the grid stays empty).
  const layoutPost = useRef<((m: LayoutRequest) => void) | null>(null)

  useEffect(() => {
    const handle = ({ seq, reset, from, rows }: LayoutReply) => {
      if (seq < resetSeq.current) return
      setLiveGraphRows((prev) => (reset ? rows : [...prev.slice(0, from), ...rows]))
    }
    const worker = new Worker(new URL("../graph/layout.worker.ts", import.meta.url), { type: "module" })
    worker.onmessage = (e: MessageEvent<LayoutReply>) => handle(e.data)
    layoutPost.current = (m) => worker.postMessage(m)
    worker.onerror = (ev) => {
      console.error("[powergit] layout worker failed, laying out on the main thread:", ev.message)
      worker.terminate()
      let inThread: GraphLayouter = createLayouter()
      layoutPost.current = (m) => {
        if (m.reset) inThread = createLayouter()
        const from = inThread.rowCount()
        handle({ seq: m.seq, reset: m.reset, from, rows: inThread.append(m.revisions) })
      }
      // Whatever the worker swallowed is gone; replay the last full set.
      const seq = ++layoutSeq.current
      resetSeq.current = seq
      layoutPost.current({ seq, reset: true, revisions: lastSent.current })
    }
    layoutWorker.current = worker
    // A fresh worker has no layout state; force the next post to be a reset.
    lastSent.current = []
    return () => {
      worker.terminate()
      layoutWorker.current = null
      layoutPost.current = null
    }
  }, [])

  useEffect(() => {
    if (offline) return
    const post = layoutPost.current
    if (!post) return
    const prev = lastSent.current
    const isAppend =
      prev.length > 0 &&
      revisions.length > prev.length &&
      revisions[0] === prev[0] &&
      revisions[prev.length - 1] === prev[prev.length - 1]
    const seq = ++layoutSeq.current
    if (isAppend) {
      post({ seq, reset: false, revisions: revisions.slice(prev.length) })
    } else {
      resetSeq.current = seq
      post({ seq, reset: true, revisions })
    }
    lastSent.current = revisions
  }, [offline, revisions])

  const syntheticRows = useMemo(
    () => layoutGraph(syntheticHistory(200).map((r) => ({ ...r, id: r.id.length >= 7 ? r.id : r.id.padEnd(7, "0") }))),
    [],
  )
  const rows = offline ? syntheticRows : liveGraphRows

  // Selection is keyed by SHA so it survives refreshes and history appends;
  // the index is derived for the grid.
  const selected = useMemo(() => {
    if (rows.length === 0) return -1
    if (!selectedSha) return 0
    const i = rows.findIndex((r) => r.rev.id === selectedSha)
    return i >= 0 ? i : 0
  }, [rows, selectedSha])
  const current = selected >= 0 ? rows[selected] : undefined

  // Loads further history pages up to targetCount. Single-flight: concurrent
  // callers (scroll, ref jump, autofill) share the in-flight run.
  const extendHistory = useCallback((targetCount: number): Promise<void> => {
    if (extendRun.current) return extendRun.current
    if (historyCompleteRef.current) return Promise.resolve()
    const gen = histGen.current
    const cap = Math.min(targetCount, HARD_CEILING)
    setLoadingTail(true)
    const run = (async () => {
      try {
        while (revCount.current < cap && histGen.current === gen && !historyCompleteRef.current) {
          const page = await fetchRevisions(PAGE, revCount.current)
          if (histGen.current !== gen) return
          if (page.length > 0) {
            revCount.current += page.length
            revisionsRef.current = [...revisionsRef.current, ...page.map(toRevision)]
            setRevisions(revisionsRef.current)
          }
          if (page.length < PAGE) {
            historyCompleteRef.current = true
            setHistoryComplete(true)
            return
          }
        }
      } catch {
        // Tail loading is best-effort; the next scroll or refresh retries.
      } finally {
        extendRun.current = null
        setLoadingTail(false)
      }
    })()
    extendRun.current = run
    return run
  }, [])

  // Refreshes history without shrinking what the user has loaded: refetch
  // page 0 and splice it onto the already-loaded tail where they overlap
  // (the common case after a commit). Anything odd falls back to a fresh
  // first page and lazy reloading.
  const reloadHistory = useCallback(async () => {
    const gen = ++histGen.current
    const page = await fetchRevisions(PAGE, 0)
    if (histGen.current !== gen) return
    const fresh = page.map(toRevision)
    let next = fresh
    let complete = page.length < PAGE
    if (!complete) {
      const old = revisionsRef.current
      const lastId = fresh[fresh.length - 1]?.id
      const k = lastId ? old.findIndex((r) => r.id === lastId) : -1
      if (k >= 0) {
        const seen = new Set(fresh.map((r) => r.id))
        next = [...fresh, ...old.slice(k + 1).filter((r) => !seen.has(r.id))]
        complete = historyCompleteRef.current
      }
    }
    revCount.current = next.length
    revisionsRef.current = next
    historyCompleteRef.current = complete
    setHistoryComplete(complete)
    setRevisions(next)
    setLive(true)
    if (!complete && next.length < EAGER_CEILING) void extendHistory(EAGER_CEILING)
  }, [extendHistory, setLive])

  // A different repo: drop the loaded history instead of splicing.
  const resetHistory = useCallback(() => {
    histGen.current += 1
    revCount.current = 0
    revisionsRef.current = []
    historyCompleteRef.current = false
    setHistoryComplete(false)
    setSelectedSha(null)
  }, [])

  // Owner requirement: with thousands of branches most tips are NOT in the
  // loaded history — jumping to a ref keeps loading pages until its commit
  // appears (or the ceiling is hit) instead of silently doing nothing.
  const jumpToRef = useCallback(
    async (sha: string) => {
      const find = () => revisionsRef.current.find((r) => r.id.startsWith(sha) || sha.startsWith(r.id))
      let hit = find()
      const gen = histGen.current
      while (!hit && !historyCompleteRef.current && revCount.current < HARD_CEILING && histGen.current === gen) {
        const before = revCount.current
        setHistoryNote(`Loading history… ${before.toLocaleString()} commits`)
        await extendHistory(before + 5 * PAGE)
        hit = find()
        if (revCount.current === before) break // fetch failed; don't spin
      }
      setHistoryNote(null)
      if (hit) {
        setSelectedSha(hit.id)
      } else {
        setEngineError(
          `Commit ${sha.slice(0, 10)} is not within the first ${revCount.current.toLocaleString()} commits`,
        )
      }
    },
    [extendHistory, setEngineError],
  )

  const onNearEnd = useCallback(() => {
    if (offline || !live || historyComplete) return
    void extendHistory(revCount.current + PAGE)
  }, [offline, live, historyComplete, extendHistory])

  return {
    rows,
    selected,
    current,
    setSelectedSha,
    loadingTail,
    historyNote,
    reloadHistory,
    resetHistory,
    jumpToRef,
    onNearEnd,
  }
}
