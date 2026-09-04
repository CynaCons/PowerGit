import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { report } from "../diagnostics"
import { changeKindOf, describeThrown, type ChangeKind, type RefTree, type RepoStatus, type StashInfo } from "../engine"
import type { EngineSession } from "./useEngineSession"
import type { History } from "./useHistory"

export type RefreshScope = { revisions?: boolean; refs?: boolean; status?: boolean; stashes?: boolean }

export type RepoStateDeps = {
  session: EngineSession
  history: Pick<History, "reloadHistory" | "resetHistory">
}

export type RepoState = ReturnType<typeof useRepoState>

// Refs, working-tree status and stashes, plus the scoped refresh every
// action funnels through — including the engine's change stream and the
// repository load that follows a session becoming "ready".
export function useRepoState({ session, history }: RepoStateDeps) {
  const { client, view, setEngineError, setRecents, handleFailure, openRepo } = session
  const { live } = view
  const { reloadHistory, resetHistory } = history
  const [refs, setRefs] = useState<RefTree | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [stashes, setStashes] = useState<StashInfo[]>([])
  /** A refresh is running while previous data stays on screen. */
  const [refreshing, setRefreshing] = useState(false)

  // Per-panel refresh: callers name what an action could have changed so a
  // stage/commit never re-runs the full 4-call sweep. Every piece updates
  // the moment its own request lands (stale-while-revalidate).
  const lastRefreshAt = useRef(0)
  const refresh = useCallback(
    async (scope?: RefreshScope) => {
      if (!client.hasRepo) return
      lastRefreshAt.current = Date.now()
      setRefreshing(true)
      const s = scope ?? { revisions: true, refs: true, status: true, stashes: true }
      const jobs: Promise<unknown>[] = []
      let firstError: string | null = null
      const fail = (what: string) => (e: unknown) => {
        const msg = handleFailure(e, what)
        if (!firstError) firstError = `${what}: ${msg}`
      }
      if (s.revisions) jobs.push(reloadHistory().catch(fail("history")))
      if (s.refs) jobs.push(client.refs().then(setRefs).catch(fail("refs")))
      if (s.status) jobs.push(client.status().then(setStatus).catch(fail("status")))
      if (s.stashes)
        jobs.push(
          client
            .stashes()
            .then(setStashes)
            .catch(() => setStashes([])),
        )
      try {
        await Promise.all(jobs)
      } finally {
        setRefreshing(false)
        lastRefreshAt.current = Date.now()
      }
      if (firstError) throw new Error(firstError)
    },
    [client, reloadHistory, handleFailure],
  )

  // Repository load: whenever this window's session changes (boot resolved
  // it, or the user opened another one) drop the old history and load.
  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!client.repoId) {
      // No session at all (closed, evicted): drop the data. A mere loss of
      // the engine (recovering) keeps repoId and therefore the last graph.
      if (loadedFor.current !== null) {
        resetHistory()
        setRefs(null)
        setStatus(null)
        setStashes([])
      }
      loadedFor.current = null
      return
    }
    if (!live) return
    if (loadedFor.current === client.repoId) return
    loadedFor.current = client.repoId
    resetHistory()
    let cancelled = false
    // Note: a successful load never clears engineError here — an action
    // that failed while this load was still in flight (the user is fast)
    // would have its banner wiped by an unrelated success.
    void (async () => {
      try {
        await refresh()
      } catch (e) {
        // One transient failure right after open (cold engine/git) shouldn't
        // leave the app dataless — retry once before surfacing it.
        await new Promise((r) => setTimeout(r, 1500))
        if (cancelled) return
        try {
          await refresh()
        } catch (e2) {
          setEngineError(describeThrown(e2 ?? e))
        }
      }
      if (cancelled) return
      try {
        setRecents(await client.recents())
      } catch (e) {
        report("warn", "recents", describeThrown(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [live, client, refresh, resetHistory, setEngineError, setRecents])

  // Live refresh: the engine streams a change version whenever .git metadata
  // moves (HEAD, refs, index) — external git activity shows up on its own.
  // Debounced so an event burst (e.g. a rebase) refreshes once, and muted
  // right after our own refreshes so in-app actions don't refresh twice.
  // The low bits of the version classify the change (see engine
  // `changeKindOf`): a status-only burst only re-fetches status instead of
  // the full revisions+refs+status sweep. "refs" is the superset for the
  // rare mixed burst, so it always wins over an earlier "status".
  useEffect(() => {
    if (!live || !client.hasRepo) return
    let source: EventSource | null = null
    let timer: number | undefined
    let last: string | null = null
    let pendingKind: ChangeKind = "none"
    try {
      source = new EventSource(client.eventsUrl())
    } catch (e) {
      report("warn", "events", describeThrown(e))
      return
    }
    source.onmessage = (e) => {
      if (last === e.data) return
      const isFirst = last === null
      last = e.data
      if (isFirst) return // initial snapshot, nothing changed
      if (Date.now() - lastRefreshAt.current < 2000) return // our own action
      const kind = changeKindOf(Number(e.data))
      if (pendingKind !== "refs") pendingKind = kind
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const scope: RefreshScope =
          pendingKind === "status" ? { status: true } : { revisions: true, refs: true, status: true }
        pendingKind = "none"
        void refresh(scope).catch(() => undefined)
      }, 400)
    }
    return () => {
      window.clearTimeout(timer)
      source?.close()
    }
  }, [live, client, refresh])

  async function openFolder(path?: string) {
    let target = path
    if (!target) {
      if ("__TAURI_INTERNALS__" in window) {
        const { open } = await import("@tauri-apps/plugin-dialog")
        const picked = await open({ directory: true, multiple: false, title: "Open repository" })
        if (typeof picked !== "string") return
        target = picked
      } else {
        const answer = window.prompt("Open repository path")
        if (!answer) return
        target = answer
      }
    }
    try {
      const info = await openRepo(target)
      setEngineError(null)
      // Same session reopened: the load effect will not fire, refresh here.
      if (loadedFor.current === info.id) await refresh()
    } catch (err) {
      setEngineError(`Open repository: ${handleFailure(err, "open")}`)
    }
  }

  const branchNames = useMemo(() => (refs?.branches ?? []).map((b) => b.name), [refs])
  const remoteNames = useMemo(
    () => [...new Set((refs?.remotes ?? []).map((r) => r.name.split("/")[0]).filter(Boolean))],
    [refs],
  )
  const defaultRemote = remoteNames[0] ?? "origin"
  const dirty = (status?.unstagedCount ?? 0) + (status?.stagedCount ?? 0)

  return {
    refs,
    setRefs,
    status,
    setStatus,
    stashes,
    refreshing,
    refresh,
    openFolder,
    branchNames,
    remoteNames,
    defaultRemote,
    dirty,
  }
}
