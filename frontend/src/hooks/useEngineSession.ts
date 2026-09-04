import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react"
import { getEngineLogPath, report, setEngineLogPath } from "../diagnostics"
import {
  EngineError,
  describeThrown,
  pinnedRepoId,
  rememberPinnedRepo,
  type EngineClient,
  type RepoInfo,
} from "../engine"
import { initialSession, sessionReducer, sessionView, type SessionEvent, type SessionPhase } from "../session/state"

export type EngineSession = ReturnType<typeof useEngineSession>

/** Explicit demo mode only: a build flag or `?demo=1`. */
export function isDemoMode(search: string = typeof window === "undefined" ? "" : window.location.search): boolean {
  if (import.meta.env.VITE_DEMO === "1") return true
  return new URLSearchParams(search).get("demo") === "1"
}

const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000, 8000]

// Engine connection + repository identity for this window, driven by the
// session state machine (src/session/state.ts). The boot/recovery loop
// probes /health with backoff while the phase says the engine is not
// reachable, resolves which repository this window shows (the ?repo pin,
// else the engine's last-opened one), and listens for the Tauri shell's
// sidecar exit/restart events. Everything else (history, refs, status) is
// loaded by useRepoState once the phase is "ready".
export function useEngineSession(base: EngineClient) {
  const [state, dispatch] = useReducer(sessionReducer, initialSession)
  const [repoId, setRepoId] = useState<string | null>(() => pinnedRepoId())
  const client = useMemo(() => base.withRepo(repoId), [base, repoId])
  const [recents, setRecents] = useState<RepoInfo[]>([])
  const [engineError, setEngineError] = useState<string | null>(null)
  const view = useMemo(() => sessionView(state), [state])
  const phase = state.phase
  const attempt = "attempt" in state ? state.attempt : 0
  const demo = useMemo(() => isDemoMode(), [])

  // Resolves the repository once the engine answered: pinned id first
  // (this window's), the engine-global current one only as a fallback.
  const resolveRepo = useCallback(
    async (pinned: string | null): Promise<RepoInfo | null> => {
      if (pinned) {
        const info = await base.repoInfo(pinned)
        if (info) return info
        report("warn", "session", `pinned repository ${pinned} is no longer open on the engine`)
        rememberPinnedRepo(null)
        return null
      }
      return base.currentRepo()
    },
    [base],
  )

  const repoIdRef = useRef(repoId)
  repoIdRef.current = repoId

  useEffect(() => {
    if (demo) {
      dispatch({ type: "demo" })
      return
    }
    if (phase !== "starting" && phase !== "recovering") return
    const ctrl = new AbortController()
    const delay = attempt === 0 ? 0 : RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)]
    const timer = setTimeout(async () => {
      try {
        const health = await base.health(ctrl.signal)
        // Fresh contact (not a reconnect with a known repo): resolve the repo
        // BEFORE dispatching anything — a dispatch changes `phase`, which
        // re-runs this effect and aborts the in-flight resolution.
        const info = phase === "starting" ? await resolveRepo(repoIdRef.current) : null
        if (ctrl.signal.aborted) return
        dispatch({ type: "health-ok", health })
        if (phase === "starting") {
          if (info) {
            setRepoId(info.id)
            rememberPinnedRepo(info.id)
            dispatch({ type: "repo-opened", repo: info })
          } else {
            setRepoId(null)
          }
        }
      } catch (e) {
        if (ctrl.signal.aborted) return
        const reason = describeThrown(e)
        report("warn", "engine.health", reason)
        dispatch({ type: "health-failed", reason })
      }
    }, delay)
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [base, demo, phase, attempt, resolveRepo])

  // Sidecar lifecycle from the Tauri shell (lib.rs): exit with status +
  // log path, and a supervised restart which re-arms recovery.
  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return
    let unlisten: Array<() => void> = []
    let cancelled = false
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event")
        const { invoke } = await import("@tauri-apps/api/core")
        try {
          setEngineLogPath(await invoke<string | null>("engine_log_path"))
        } catch {
          // older shell without the command
        }
        if (cancelled) return
        unlisten.push(
          await listen<{ status: string; restarting: boolean }>("engine-exited", (ev) => {
            report(
              "error",
              "engine",
              `sidecar exited: ${ev.payload.status}${ev.payload.restarting ? " (restarting)" : ""}`,
            )
            if (ev.payload.restarting)
              dispatch({ type: "engine-lost", reason: `engine exited (${ev.payload.status}), restarting` })
            else dispatch({ type: "engine-exited", reason: ev.payload.status, log: getEngineLogPath() })
          }),
        )
        unlisten.push(
          await listen<{ baseUrl: string }>("engine-restarted", () => {
            report("info", "engine", "sidecar restarted")
            dispatch({ type: "retry" })
          }),
        )
      } catch (e) {
        report("warn", "engine", `shell events unavailable: ${describeThrown(e)}`)
      }
    })()
    return () => {
      cancelled = true
      for (const u of unlisten) u()
      unlisten = []
    }
  }, [])

  /** Transport-level failure on any request: the engine is gone. */
  const reportEngineLost = useCallback((e: unknown) => {
    const reason = describeThrown(e)
    report("error", "engine", `unreachable: ${reason}`)
    dispatch({ type: "engine-lost", reason })
  }, [])

  /** Classifies a failed request: transport failures re-arm recovery, an
   *  evicted session drops to no-repository, anything else is a normal error. */
  const handleFailure = useCallback(
    (e: unknown, context: string): string => {
      if (e instanceof EngineError) {
        if (e.status === 404 && e.message.includes("unknown repository session")) {
          rememberPinnedRepo(null)
          setRepoId(null)
          dispatch({ type: "repo-unknown", reason: "the engine no longer has this repository open" })
          return e.message
        }
        return e.message
      }
      const msg = describeThrown(e)
      if (e instanceof TypeError || /Failed to fetch|Load failed|NetworkError|timed out/i.test(msg)) {
        reportEngineLost(e)
      } else {
        report("error", context, msg)
      }
      return msg
    },
    [reportEngineLost],
  )

  const openRepo = useCallback(
    async (path: string): Promise<RepoInfo> => {
      const previous = repoIdRef.current
      const { info } = await base.openRepo(path)
      setRepoId(info.id)
      rememberPinnedRepo(info.id)
      dispatch({ type: "repo-opened", repo: info })
      // Single-window UI: the session we just left is not needed any more
      // (its watcher and jobs go with it). Best effort — another client may
      // have reopened it, in which case the engine answers 404.
      if (previous && previous !== info.id) {
        void base.closeRepo(previous).catch(() => undefined)
      }
      return info
    },
    [base],
  )

  const retry = useCallback(() => dispatch({ type: "retry" }), [])

  return {
    state,
    view,
    dispatch: dispatch as (e: SessionEvent) => void,
    phase: state.phase as SessionPhase["phase"],
    client,
    repoId,
    recents,
    setRecents,
    engineError,
    setEngineError,
    openRepo,
    retry,
    reportEngineLost,
    handleFailure,
    demo,
  }
}
