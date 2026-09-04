import { useSyncExternalStore } from "react"
import type { ThemeMode } from "./tokens"

// Appearance preference (v0.13.13): System / Light / Dark, persisted under
// `pg.theme`. "system" follows prefers-color-scheme live, so a GNOME or
// Windows switch to dark mode is reflected without a restart. Storage and
// matchMedia are both guarded: the packaged WebView can refuse storage in
// some sandboxes, and the no-DOM test environment has neither.

export type ThemePreference = "system" | ThemeMode

export const THEME_STORAGE_KEY = "pg.theme"

const PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"]

type Listener = () => void
const listeners = new Set<Listener>()

function readStored(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return PREFERENCES.includes(raw as ThemePreference) ? (raw as ThemePreference) : "system"
  } catch {
    return "system"
  }
}

function darkQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null
  try {
    return window.matchMedia("(prefers-color-scheme: dark)")
  } catch {
    return null
  }
}

let preference: ThemePreference = typeof window === "undefined" ? "system" : readStored()

export function systemMode(): ThemeMode {
  return darkQuery()?.matches ? "dark" : "light"
}

export function resolveMode(pref: ThemePreference): ThemeMode {
  return pref === "system" ? systemMode() : pref
}

export function getThemePreference(): ThemePreference {
  return preference
}

export function getThemeMode(): ThemeMode {
  return resolveMode(preference)
}

function emit() {
  for (const l of listeners) l()
}

export function setThemePreference(next: ThemePreference) {
  if (!PREFERENCES.includes(next)) return
  preference = next
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    // Storage refused: the choice still applies for this window.
  }
  emit()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  const mq = darkQuery()
  // A system-mode listener also needs to re-render when the OS flips.
  const onChange = () => listener()
  if (mq) {
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange)
    else mq.addListener(onChange)
  }
  return () => {
    listeners.delete(listener)
    if (mq) {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", onChange)
      else mq.removeListener(onChange)
    }
  }
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, getThemePreference, () => "system")
}

/** The mode actually in effect (the preference with "system" resolved). */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getThemeMode, () => "light")
}
