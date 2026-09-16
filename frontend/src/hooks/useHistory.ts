import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { report } from "../diagnostics"
import { isAbort, type EngineClient, type RevisionDto, type RevisionFilter } from "../engine"
import { isArtificialId } from "../graph/artificial"
import { createLayouter, layoutGraph, type GraphLayouter } from "../graph/layout"
import { syntheticHistory } from "../graph/synthetic"
import type { GraphRow, Revision } from "../graph/types"
import { mergeReload, toRevision } from "./historyMerge"

// History pages in from the engine: the first page renders fast, autofill
// keeps loading in the background up to EAGER_CEILING, and scrolling or
// jumping to a ref keeps loading up to HARD_CEILING.
const PAGE = 1000
const EAGER_CEILING = 10_000
const HARD_CEILING = 100_000

type LayoutRequest = { seq: number; reset: boolean; revisions: Revision[] }
type LayoutReply = { seq: number; reset: boolean; from: number; rows: GraphRow[] }

export type HistoryDeps = {
  client: EngineClient
  /** Explicit demo mode: synthetic rows instead of an engine (v0.13.12). */
  demo: boolean
  live: boolean
  setEngineError: (message: string | null) => void
  onFailure: (e: unknown, context: string) => string
  /** v0.16.0: a path filter makes this the file history's list (same
   *  paging, layout and selection; the engine rewrites parents so the
   *  filtered commits still form one connected graph). Memoise it: a new
   *  object is a new history. */
  filter?: RevisionFilter
}

export type History = ReturnType<typeof useHistory>

// Revision list, paging, lane layout (worker) and the SHA-keyed selection.
// All revision mutations flow through reloadHistory/extendHistory.
export function useHistory({ client, demo, live, setEngineError, onFailure, filter }: HistoryDeps) {
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [historyComplete, setHistoryComplete] = useState(false)
  const [loadingTail, setLoadingTail] = useState(false)
  const [historyNote, setHistoryNote] = useState<string | null>(null)
  const [selectedSha, setSelectedSha] = useState<string | null>(null)
  // Highlight ancestry (v0.18.4, GE "Highlight selected branch (until
  // refresh)"): the commit whose history the grid highlights instead of
  // HEAD's, or null. One per history, so the file history's grid never
  // inherits the main grid's; a repository switch resets it and the grid
  // clears it when a refresh drops the row. A look, not a setting: never
  // persisted.
  const [highlightRoot, setHighlightRoot] = useState<string | null>(null)
  /** True from the first successful page of the current repo. */
  const [loaded, setLoaded] = useState(false)

  // History bookkeeping lives in refs so async loaders never read stale
  // state.
  const revisionsRef = useRef<Revision[]>([])
  const historyCompleteRef = useRef(false)
  const histGen = useRef(0)
  const revCount = useRef(0)
  // The tail run in flight, keyed by the generation it loads for: a reset
  // or reload bumps the generation, and a run of an older one is never
  // handed out again (v0.16.0 review, finding 5: the file history's eager
  // extension after a filter change used to attach to the previous
  // filter's aborted run and load nothing).
  const extendRun = useRef<{ gen: number; run: Promise<void> } | null>(null)
  // The latest in-flight page request; a repo switch or a filter change
  // aborts it so the engine kills the corresponding git log.
  const inflight = useRef<AbortController | null>(null)
  // The reload in flight, keyed by generation like extendRun, and the one
  // follow-up queued behind it (v0.18.9, see reloadHistory).
  const reloadRun = useRef<{ gen: number; run: Promise<void> } | null>(null)
  const reloadQueued = useRef<Promise<void> | null>(null)

  const abortInflight = () => {
    inflight.current?.abort()
    inflight.current = null
  }

  // Lane layout runs in a Web Worker. History pages append to the worker's
  // existing layout; a refresh resets it. Replies older than the last reset
  // are dropped so a slow relayout can never clobber newer state.
  const [liveGraphRows, setLiveGraphRows] = useState<GraphRow[]>([])
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
    const fallbackToMainThread = (why: string) => {
      report("warn", "layout", `worker unavailable, laying out on the main thread: ${why}`)
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
    // v0.13.11: constructing a module Worker can throw synchronously (a CSP
    // without worker-src, a scheme that refuses module workers) — that used
    // to escape the effect and leave the grid empty with no fallback.
    let worker: Worker | null = null
    try {
      worker = new Worker(new URL("../graph/layout.worker.ts", import.meta.url), { type: "module" })
      worker.onmessage = (e: MessageEvent<LayoutReply>) => handle(e.data)
      worker.onerror = (ev) => {
        worker?.terminate()
        worker = null
        fallbackToMainThread(ev.message || "worker error")
      }
      layoutPost.current = (m) => worker?.postMessage(m)
    } catch (e) {
      fallbackToMainThread(e instanceof Error ? e.message : String(e))
    }
    // A fresh worker has no layout state; force the next post to be a reset.
    lastSent.current = []
    return () => {
      worker?.terminate()
      layoutPost.current = null
    }
  }, [])

  useEffect(() => {
    if (demo) return
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
      // Only the new tail crosses the worker boundary (no full-history clone).
      post({ seq, reset: false, revisions: revisions.slice(prev.length) })
    } else {
      resetSeq.current = seq
      post({ seq, reset: true, revisions })
    }
    lastSent.current = revisions
  }, [demo, revisions])

  const syntheticRows = useMemo(
    () =>
      demo
        ? layoutGraph(syntheticHistory(200).map((r) => ({ ...r, id: r.id.length >= 7 ? r.id : r.id.padEnd(7, "0") })))
        : [],
    [demo],
  )
  const rows = demo ? syntheticRows : liveGraphRows

  // Selection is keyed by SHA so it survives refreshes and history appends;
  // the index is derived for the grid.
  const selected = useMemo(() => {
    if (rows.length === 0) return -1
    if (!selectedSha) return 0
    const i = rows.findIndex((r) => r.rev.id === selectedSha)
    return i >= 0 ? i : 0
  }, [rows, selectedSha])
  const current = selected >= 0 ? rows[selected] : undefined

  const fetchPage = useCallback(
    (skip: number) => {
      const ctrl = new AbortController()
      inflight.current = ctrl
      return client.revisions(PAGE, skip, ctrl.signal, filter).finally(() => {
        if (inflight.current === ctrl) inflight.current = null
      })
    },
    [client, filter],
  )

  // Loads further history pages up to targetCount. Single-flight: concurrent
  // callers (scroll, ref jump, autofill) share the in-flight run.
  const extendHistory = useCallback(
    (targetCount: number): Promise<void> => {
      const gen = histGen.current
      if (extendRun.current?.gen === gen) return extendRun.current.run
      if (historyCompleteRef.current) return Promise.resolve()
      const cap = Math.min(targetCount, HARD_CEILING)
      setLoadingTail(true)
      // The slot is taken before the run starts: with nothing left to load
      // below the cap the run ends synchronously, and its finally must find
      // its own entry to clear.
      const entry = { gen, run: Promise.resolve() }
      extendRun.current = entry
      entry.run = (async () => {
        try {
          while (revCount.current < cap && histGen.current === gen && !historyCompleteRef.current) {
            const skip = revCount.current
            const page = await fetchPage(skip)
            if (histGen.current !== gen) return
            // A reload landed meanwhile and replaced the list (v0.16.0: seen
            // when the file history's filter changed while its old rows
            // were still on screen — the grid's near-end request and the
            // reload both fetched page 0, and the second answer was
            // appended to the first). Only an answer to the current tail
            // extends it.
            if (revCount.current !== skip) return
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
        } catch (e) {
          // Tail loading is best-effort; the next scroll or refresh retries.
          if (!isAbort(e)) onFailure(e, "history tail")
        } finally {
          // Only the run that is still current clears the slot: a superseded
          // one must not drop the run that replaced it, nor its spinner.
          if (extendRun.current === entry) {
            extendRun.current = null
            setLoadingTail(false)
          }
        }
      })()
      return entry.run
    },
    [fetchPage, onFailure],
  )

  // Refreshes history without shrinking what the user has loaded: refetch
  // page 0 and splice it onto the already-loaded tail where they overlap
  // (the common case after a commit). Anything odd falls back to a fresh
  // first page and lazy reloading. The last valid graph stays on screen
  // until the new first page is in.
  //
  // v0.18.9 (owner: the merge overlay stuck at "Merging", then "history:
  // fetch is aborted" at the top): a reload used to abort the page 0 in
  // flight, so the change stream's echo of an action killed that action's
  // own refresh and it failed with the browser's AbortError. Now a reload
  // requested while one is in flight waits for it and runs once more after
  // it — one follow-up, shared by every caller that arrives meanwhile — so
  // a change that landed during the first is picked up and nothing is
  // aborted. Only resetHistory aborts (a different repository or filter:
  // the old page is stale for good); a reload it superseded resolves
  // silently and says so in the app log.
  const runReload = useCallback(
    async (gen: number) => {
      let page: RevisionDto[]
      try {
        page = await fetchPage(0)
      } catch (e) {
        if (!isAbort(e) && histGen.current === gen) throw e
        report("info", "history", "history reload superseded")
        return
      }
      if (histGen.current !== gen) {
        report("info", "history", "history reload superseded")
        return
      }
      // Rows keep their identity where nothing changed (historyMerge.ts), so
      // the layout effect sees an append or nothing at all instead of a
      // 10k-row reset on every refresh; a no-op refresh skips setState.
      const { next, complete, unchanged } = mergeReload(page, revisionsRef.current, PAGE, historyCompleteRef.current)
      if (unchanged) {
        setLoaded(true)
        return
      }
      revCount.current = next.length
      revisionsRef.current = next
      historyCompleteRef.current = complete
      setHistoryComplete(complete)
      setRevisions(next)
      setLoaded(true)
      if (!complete && next.length < EAGER_CEILING) void extendHistory(EAGER_CEILING)
    },
    [fetchPage, extendHistory],
  )

  const reloadHistory = useCallback((): Promise<void> => {
    const start = () => {
      const gen = ++histGen.current
      const entry = { gen, run: Promise.resolve() }
      entry.run = runReload(gen).catch((e) => {
        if (!isAbort(e) && histGen.current === gen) {
          setEngineError(`History: ${onFailure(e, "history")}`)
        }
      }).finally(() => {
        if (reloadRun.current === entry) reloadRun.current = null
      })
      reloadRun.current = entry
      return entry.run
    }
    const current = reloadRun.current
    if (!current || current.gen !== histGen.current) return start()
    if (!reloadQueued.current) {
      const next = () => {
        // A reset dropped this follow-up meanwhile: the reset's own reload
        // is the one that matters, and this closure's filter may be stale.
        if (reloadQueued.current !== queued) return
        reloadQueued.current = null
        return start()
      }
      const queued: Promise<void> = current.run.then(next, next)
      reloadQueued.current = queued
    }
    return reloadQueued.current
  }, [runReload, onFailure, setEngineError])

  // A different repo: drop the loaded history instead of splicing. A
  // different filter on the same repo (v0.18.5, the graph's ref filter)
  // keeps the selection: the SHA re-resolves to its row when the commit is
  // still listed and falls back to row 0 otherwise.
  const resetHistory = useCallback((opts?: { keepSelection?: boolean }) => {
    histGen.current += 1
    abortInflight()
    extendRun.current = null
    // A follow-up reload queued for the old list would fetch with the old
    // filter; the caller's own reload for the new list replaces it.
    reloadQueued.current = null
    setLoadingTail(false)
    revCount.current = 0
    revisionsRef.current = []
    historyCompleteRef.current = false
    setHistoryComplete(false)
    // A ref-filter change keeps the selection (v0.18.5) and, with it, a
    // temporary highlight root (v0.18.4): the grid drops the root itself if
    // the reloaded rows no longer list it. A repository switch clears both.
    if (!opts?.keepSelection) {
      setSelectedSha(null)
      setHighlightRoot(null)
    }
    setLoaded(false)
    setRevisions([])
  }, [])

  /** Ctrl+Shift+B: the row becomes the root; the same row again exits.
   *  A pending row is not a commit and never a root. */
  const toggleHighlightRoot = useCallback((sha: string | undefined) => {
    if (sha && !isArtificialId(sha)) setHighlightRoot((root) => (root === sha ? null : sha))
  }, [])

  // Owner requirement: with thousands of branches most tips are NOT in the
  // loaded history — jumping to a ref keeps loading pages until its commit
  // appears (or the ceiling is hit) instead of silently doing nothing.
  const loadUntil = useCallback(
    async (sha: string): Promise<Revision | undefined> => {
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
      return hit
    },
    [extendHistory],
  )

  const jumpToRef = useCallback(
    async (sha: string) => {
      const hit = await loadUntil(sha)
      if (hit) {
        setSelectedSha(hit.id)
      } else {
        setEngineError(
          `Commit ${sha.slice(0, 10)} is not within the first ${revCount.current.toLocaleString()} commits`,
        )
      }
    },
    [loadUntil, setEngineError],
  )

  // The compass (v0.18.12): a parent or HEAD below the loaded window pages
  // the same way, the grid's tail names the target while it does
  // ("Loading history to febf4ba…"), and a miss is the caller's to say —
  // "Not in the loaded history" is a note, not an error banner.
  const [loadingTarget, setLoadingTarget] = useState<string | null>(null)
  const jumpToCommit = useCallback(
    async (sha: string): Promise<boolean> => {
      setLoadingTarget(sha)
      try {
        const hit = await loadUntil(sha)
        if (hit) setSelectedSha(hit.id)
        return hit !== undefined
      } finally {
        setLoadingTarget(null)
      }
    },
    [loadUntil],
  )

  const onNearEnd = useCallback(() => {
    // Not before the first page of this list is in: right after a reset the
    // grid still shows the previous rows, and their end is not this list's.
    if (demo || !live || !loaded || historyComplete) return
    void extendHistory(revCount.current + PAGE)
  }, [demo, live, loaded, historyComplete, extendHistory])

  return {
    rows,
    selected,
    current,
    selectedSha,
    setSelectedSha,
    highlightRoot,
    setHighlightRoot,
    toggleHighlightRoot,
    loadingTail,
    loadingTarget,
    historyComplete,
    loaded,
    historyNote,
    reloadHistory,
    resetHistory,
    jumpToRef,
    jumpToCommit,
    onNearEnd,
  }
}
