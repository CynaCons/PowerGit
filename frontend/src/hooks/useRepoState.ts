import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  changeKindOf,
  engineEventsUrl,
  fetchCurrent,
  fetchHealth,
  fetchRecents,
  fetchRefs,
  fetchStashes,
  fetchStatus,
  openRepo,
  type ChangeKind,
  type RefTree,
  type RepoStatus,
  type StashInfo,
} from "../engine"
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
// boot sequence (the very first refresh).
export function useRepoState({ session, history }: RepoStateDeps) {
  const { offline, live, setLive, setOffline, setHealth, setRepo, setEngineError, setRecents } = session
  const { reloadHistory, resetHistory } = history
  const [refs, setRefs] = useState<RefTree | null>(null)
  const [status, setStatus] = useState<RepoStatus | null>(null)
  const [stashes, setStashes] = useState<StashInfo[]>([])

  // Per-panel refresh: callers name what an action could have changed so a
  // stage/commit never re-runs the full 4-call sweep. Every piece updates
  // the moment its own request lands (stale-while-revalidate).
  const lastRefreshAt = useRef(0)
  const refresh = useCallback(
    async (scope?: RefreshScope) => {
      lastRefreshAt.current = Date.now()
      const s = scope ?? { revisions: true, refs: true, status: true, stashes: true }
      const jobs: Promise<unknown>[] = []
      if (s.revisions) jobs.push(reloadHistory().catch(() => undefined))
      if (s.refs)
        jobs.push(
          fetchRefs()
            .then(setRefs)
            .catch(() => undefined),
        )
      if (s.status)
        jobs.push(
          fetchStatus()
            .then(setStatus)
            .catch(() => undefined),
        )
      if (s.stashes)
        jobs.push(
          fetchStashes()
            .then(setStashes)
            .catch(() => setStashes([])),
        )
      await Promise.all(jobs)
      lastRefreshAt.current = Date.now()
    },
    [reloadHistory],
  )

  // Live refresh: the engine streams a change version whenever .git metadata
  // moves (HEAD, refs, index) — external git activity shows up on its own.
  // Debounced so an event burst (e.g. a rebase) refreshes once, and muted
  // right after our own refreshes so in-app actions don't refresh twice.
  // The low bits of the version classify the change (see engine.ts
  // `changeKindOf`): a status-only burst (e.g. repeated `git status` index
  // touches) only re-fetches status instead of the full revisions+refs+
  // status sweep. "refs" is the superset for the rare mixed burst, so it
  // always wins over an earlier "status" seen in the same debounce window.
  useEffect(() => {
    if (offline || !live) return
    // The URL carries the engine token (EventSource cannot send headers) and
    // is only known once the Tauri port/token handshake resolved.
    let source: EventSource | null = null
    let cancelled = false
    let timer: number | undefined
    let last: string | null = null
    let pendingKind: ChangeKind = "none"
    // engineEventsUrl rejects while no repository is open (v0.13.6 sessions):
    // nothing to watch yet, the next repo change re-runs this effect.
    void engineEventsUrl()
      .catch(() => null)
      .then((url) => {
        if (cancelled || !url) return
        source = new EventSource(url)
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
            void refresh(scope)
          }, 400)
        }
      })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      source?.close()
    }
  }, [offline, live, refresh])

  // Boot: health probe, then the first full refresh (retried once).
  useEffect(() => {
    const ctrl = new AbortController()
    fetchHealth(ctrl.signal)
      .then(async (h) => {
        setHealth(h)
        setEngineError(null)
        setOffline(false)
        const currentRepo = await fetchCurrent()
        if (currentRepo) setRepo(currentRepo)
        try {
          await refresh()
          setRecents(await fetchRecents())
        } catch {
          // One transient failure at boot (cold engine/git) shouldn't leave
          // the app dataless — retry once before giving up.
          await new Promise((r) => setTimeout(r, 1500))
          try {
            await refresh()
            setRecents(await fetchRecents())
          } catch {
            setLive(false)
          }
        }
      })
      .catch(() => {
        // StrictMode remounts abort the first run; that is not "engine down".
        if (ctrl.signal.aborted) return
        setHealth(null)
        setEngineError(null)
        setOffline(true)
      })
    return () => ctrl.abort()
  }, [refresh, setHealth, setEngineError, setOffline, setRepo, setRecents, setLive])

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
      setRepo(info)
      setEngineError(null)
      resetHistory()
      await refresh()
      setRecents(await fetchRecents())
    } catch (err) {
      setEngineError(err instanceof Error ? err.message : "open failed")
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
    refresh,
    openFolder,
    branchNames,
    remoteNames,
    defaultRemote,
    dirty,
  }
}
