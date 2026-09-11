import { useSyncExternalStore } from "react"

// Whether the Git console panel is open, persisted like the graph options
// (v0.15.1). Same `useSyncExternalStore` shape as src/graph/graphOptions.ts:
// one module-level value, a listener set, and localStorage that is allowed
// to refuse without breaking the window.
//
// The dock line itself is never hidden — it is the resting surface — so the
// only thing stored is the panel.

/**
 * Which log the panel shows (v0.15.3). Owner, after the WebKitGTK inspector
 * would not open on Ubuntu: "give me a button in the settings to open that
 * drawer." A second drawer at the bottom would fight this one for the same
 * edge, so the app log is a tab here instead — one surface, one hotkey, and
 * Settings just opens it on this tab.
 */
export type ConsoleTab = "git" | "app"

/**
 * `showAll` (v0.16.0): the git tab folds the engine's own reads away by
 * default so what the user did stands out; "Show all" flattens the log to
 * every command, and the choice sticks like the tab does.
 */
export type GitConsoleState = { open: boolean; height: number; tab: ConsoleTab; showAll: boolean }

export const GIT_CONSOLE_KEY = "pg.console"
export const DEFAULT_GIT_CONSOLE: GitConsoleState = { open: false, height: 180, tab: "git", showAll: false }

const MIN_HEIGHT = 96
const MAX_HEIGHT = 480

export function parseGitConsoleState(raw: string | null): GitConsoleState {
  if (!raw) return DEFAULT_GIT_CONSOLE
  try {
    const o = JSON.parse(raw) as Partial<GitConsoleState>
    const height = typeof o.height === "number" && Number.isFinite(o.height) ? o.height : DEFAULT_GIT_CONSOLE.height
    return {
      open: typeof o.open === "boolean" ? o.open : DEFAULT_GIT_CONSOLE.open,
      height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.round(height))),
      tab: o.tab === "app" || o.tab === "git" ? o.tab : DEFAULT_GIT_CONSOLE.tab,
      showAll: typeof o.showAll === "boolean" ? o.showAll : DEFAULT_GIT_CONSOLE.showAll,
    }
  } catch {
    return DEFAULT_GIT_CONSOLE
  }
}

function readStored(): GitConsoleState {
  try {
    return parseGitConsoleState(window.localStorage.getItem(GIT_CONSOLE_KEY))
  } catch {
    return DEFAULT_GIT_CONSOLE
  }
}

let state: GitConsoleState = typeof window === "undefined" ? DEFAULT_GIT_CONSOLE : readStored()
const listeners = new Set<() => void>()

export function getGitConsoleState(): GitConsoleState {
  return state
}

export function setGitConsoleState(patch: Partial<GitConsoleState>) {
  const next = { ...state, ...patch }
  if (
    next.open === state.open &&
    next.height === state.height &&
    next.tab === state.tab &&
    next.showAll === state.showAll
  ) {
    return
  }
  state = next
  try {
    window.localStorage.setItem(GIT_CONSOLE_KEY, JSON.stringify(next))
  } catch {
    // Storage refused: the choice still applies for this window.
  }
  for (const l of listeners) l()
}

export function toggleGitConsole() {
  setGitConsoleState({ open: !state.open })
}

/** Settings ▸ Tools ▸ Open app log, and anything else that wants it in view. */
export function openConsoleTab(tab: ConsoleTab) {
  setGitConsoleState({ open: true, tab })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useGitConsoleState(): GitConsoleState {
  return useSyncExternalStore(subscribe, getGitConsoleState, () => DEFAULT_GIT_CONSOLE)
}
