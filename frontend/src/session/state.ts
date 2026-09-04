import type { Health, RepoInfo } from "../engine"

/**
 * v0.13.12: the UI's connection/repository state as ONE discriminated union
 * instead of the old five loosely related booleans (offline/live/health/
 * repo/engineError). Every phase names exactly what the interface is
 * showing and what the primary recovery action is; the reducer below is the
 * only place transitions happen, so illegal combinations ("offline but
 * live", "engine failed but sample rows") cannot be expressed.
 *
 *   starting ──health ok──▶ no-repository ──open──▶ ready ⇄ busy
 *      │                        ▲                    │
 *      │ health failed          │ close/unknown      │ engine lost
 *      ▼                        │                    ▼
 *   engine-failed ◀──give up── recovering ◀──────────┘
 *
 *   demo: only entered explicitly (VITE_DEMO / ?demo=1), never as a
 *   fallback when the engine is unreachable.
 */
export type SessionPhase =
  | { phase: "starting"; attempt: number }
  | { phase: "demo" }
  | { phase: "no-repository"; health: Health; lastError: string | null }
  | { phase: "ready"; health: Health; repo: RepoInfo }
  | { phase: "busy"; health: Health; repo: RepoInfo; label: string }
  | { phase: "recovering"; health: Health | null; repo: RepoInfo | null; reason: string; attempt: number }
  | { phase: "engine-failed"; reason: string; repo: RepoInfo | null; log: string | null }

export type SessionEvent =
  | { type: "demo" }
  | { type: "health-ok"; health: Health }
  | { type: "health-failed"; reason: string }
  | { type: "repo-opened"; repo: RepoInfo }
  | { type: "repo-closed"; reason?: string }
  | { type: "repo-unknown"; reason: string }
  | { type: "job-started"; label: string }
  | { type: "job-finished" }
  | { type: "engine-lost"; reason: string }
  | { type: "engine-exited"; reason: string; log: string | null }
  | { type: "retry" }

export const initialSession: SessionPhase = { phase: "starting", attempt: 0 }

/** After this many failed health probes in a row the UI stops retrying on its own. */
export const MAX_RECOVERY_ATTEMPTS = 5

export function sessionReducer(state: SessionPhase, event: SessionEvent): SessionPhase {
  switch (event.type) {
    case "demo":
      return { phase: "demo" }

    case "health-ok": {
      if (state.phase === "demo") return state
      if (state.phase === "ready" || state.phase === "busy") return { ...state, health: event.health }
      if (state.phase === "recovering" && state.repo) return { phase: "ready", health: event.health, repo: state.repo }
      return { phase: "no-repository", health: event.health, lastError: null }
    }

    case "health-failed": {
      if (state.phase === "demo") return state
      if (state.phase === "starting") {
        // First contact never happened: keep trying for a while, then give up loudly.
        return state.attempt + 1 >= MAX_RECOVERY_ATTEMPTS
          ? { phase: "engine-failed", reason: event.reason, repo: null, log: null }
          : { phase: "starting", attempt: state.attempt + 1 }
      }
      if (state.phase === "recovering") {
        return state.attempt + 1 >= MAX_RECOVERY_ATTEMPTS
          ? { phase: "engine-failed", reason: event.reason, repo: state.repo, log: null }
          : { ...state, reason: event.reason, attempt: state.attempt + 1 }
      }
      if (state.phase === "engine-failed") return state
      const repo = "repo" in state ? state.repo : null
      const health = "health" in state ? state.health : null
      return { phase: "recovering", health, repo, reason: event.reason, attempt: 1 }
    }

    case "repo-opened": {
      if (state.phase === "demo") return state
      const health = "health" in state && state.health ? state.health : null
      if (!health) return state // cannot be ready without a healthy engine
      return { phase: "ready", health, repo: event.repo }
    }

    case "repo-closed":
    case "repo-unknown": {
      if (state.phase === "demo" || state.phase === "starting" || state.phase === "engine-failed") return state
      if (state.phase === "recovering") return { ...state, repo: null }
      return { phase: "no-repository", health: state.health, lastError: event.reason ?? null }
    }

    case "job-started":
      return state.phase === "ready"
        ? { phase: "busy", health: state.health, repo: state.repo, label: event.label }
        : state

    case "job-finished":
      return state.phase === "busy" ? { phase: "ready", health: state.health, repo: state.repo } : state

    case "engine-lost": {
      if (state.phase === "demo" || state.phase === "engine-failed") return state
      const repo = "repo" in state ? state.repo : null
      const health = "health" in state ? state.health : null
      return { phase: "recovering", health, repo, reason: event.reason, attempt: 1 }
    }

    case "engine-exited": {
      if (state.phase === "demo") return state
      const repo = "repo" in state ? state.repo : null
      return { phase: "engine-failed", reason: event.reason, repo, log: event.log }
    }

    case "retry": {
      if (state.phase === "engine-failed")
        return { phase: "recovering", health: null, repo: state.repo, reason: state.reason, attempt: 0 }
      if (state.phase === "recovering") return { ...state, attempt: 0 }
      return state
    }
  }
}

/** Derived view props: what the chrome needs, computed once from the phase. */
export type SessionView = {
  /** A repository is open and its data may be shown. */
  live: boolean
  /** Sample data mode (explicit demo only). */
  demo: boolean
  /** The engine is unreachable (starting retries, recovering, failed). */
  offline: boolean
  booting: boolean
  busy: boolean
  busyLabel: string | null
  repo: RepoInfo | null
  health: Health | null
  /** Short status-bar copy for the current phase. */
  statusText: string
  /** The one thing the user can do about the current phase, if anything. */
  primaryAction: "retry" | "open-repository" | "diagnostics" | null
}

export function sessionView(s: SessionPhase): SessionView {
  switch (s.phase) {
    case "starting":
      return {
        live: false,
        demo: false,
        offline: false,
        booting: true,
        busy: false,
        busyLabel: null,
        repo: null,
        health: null,
        statusText:
          s.attempt === 0 ? "connecting to the engine…" : `connecting to the engine… (attempt ${s.attempt + 1})`,
        primaryAction: null,
      }
    case "demo":
      return {
        live: true,
        demo: true,
        offline: false,
        booting: false,
        busy: false,
        busyLabel: null,
        repo: null,
        health: null,
        statusText: "sample data — demo mode",
        primaryAction: null,
      }
    case "no-repository":
      return {
        live: false,
        demo: false,
        offline: false,
        booting: false,
        busy: false,
        busyLabel: null,
        repo: null,
        health: s.health,
        statusText: s.lastError ? `no repository — ${s.lastError}` : "no repository",
        primaryAction: "open-repository",
      }
    case "ready":
      return {
        live: true,
        demo: false,
        offline: false,
        booting: false,
        busy: false,
        busyLabel: null,
        repo: s.repo,
        health: s.health,
        statusText: "",
        primaryAction: null,
      }
    case "busy":
      return {
        live: true,
        demo: false,
        offline: false,
        booting: false,
        busy: true,
        busyLabel: s.label,
        repo: s.repo,
        health: s.health,
        statusText: "",
        primaryAction: null,
      }
    case "recovering":
      return {
        live: false,
        demo: false,
        offline: true,
        booting: false,
        busy: false,
        busyLabel: null,
        repo: s.repo,
        health: s.health,
        statusText: `engine unreachable — reconnecting (attempt ${s.attempt}/${MAX_RECOVERY_ATTEMPTS}): ${s.reason}`,
        primaryAction: "retry",
      }
    case "engine-failed":
      return {
        live: false,
        demo: false,
        offline: true,
        booting: false,
        busy: false,
        busyLabel: null,
        repo: s.repo,
        health: null,
        statusText: `engine stopped: ${s.reason}`,
        primaryAction: "diagnostics",
      }
  }
}
