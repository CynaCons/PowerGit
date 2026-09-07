import { isTauriShell } from "../shell"
import type { UpdateInfo } from "./updateMachine"

// Where the update flow talks to the outside world (v0.14.0). Three
// backends behind one interface:
//   tauri  — @tauri-apps/plugin-updater + plugin-process in the shipped
//            app (the plugin verifies the manifest's minisign signature
//            against the public key in tauri.conf.json before installing);
//   mock   — `localStorage["pg.updateMock"]` in dev and e2e: a fake newer
//            version with simulated download progress, and relaunch()
//            records itself in `pg.updateMock.relaunched`;
//   none   — the browser and the Pages demo: updates come with the desktop
//            app, so Settings says so instead of offering a button.
// The Tauri modules are imported lazily so the browser bundle never
// evaluates them (same pattern as WindowControls).

export type DownloadEvent =
  { event: "Started"; total: number | null } | { event: "Progress"; chunk: number } | { event: "Finished" }

export type Updater = {
  /** Newer version, or null when up to date. */
  check(): Promise<UpdateInfo | null>
  /** Download + install the update found by the last check, then relaunch. */
  install(onEvent: (e: DownloadEvent) => void): Promise<void>
}

export const MOCK_KEY = "pg.updateMock"
export const MOCK_RELAUNCHED_KEY = "pg.updateMock.relaunched"
export const MOCK_VERSION = "9.9.9"

function readMock(): string | null {
  try {
    return window.localStorage.getItem(MOCK_KEY)
  } catch {
    return null
  }
}

/** Which backend applies: decides both the adapter and the Settings copy. */
export function updaterKind(): "tauri" | "mock" | "none" {
  if (typeof window === "undefined") return "none"
  if (readMock()) return "mock"
  return isTauriShell() ? "tauri" : "none"
}

function mockUpdater(mode: string): Updater {
  return {
    async check() {
      await new Promise((r) => setTimeout(r, 200))
      if (mode === "uptodate") return null
      if (mode === "error") throw new Error("Could not reach github.com")
      return { version: MOCK_VERSION, notes: "Sample release notes for the mock update.", date: "2026-09-08T10:00:00Z" }
    },
    async install(onEvent) {
      const total = 4 * 1_048_576
      onEvent({ event: "Started", total })
      for (let sent = 0; sent < total; sent += total / 8) {
        await new Promise((r) => setTimeout(r, 60))
        onEvent({ event: "Progress", chunk: total / 8 })
      }
      onEvent({ event: "Finished" })
      try {
        window.localStorage.setItem(MOCK_RELAUNCHED_KEY, "1")
      } catch {
        // Storage refused; the flow still completed.
      }
    },
  }
}

function tauriUpdater(): Updater {
  let pending: import("@tauri-apps/plugin-updater").Update | null = null
  return {
    async check() {
      const { check } = await import("@tauri-apps/plugin-updater")
      pending = await check({ timeout: 30_000 })
      if (!pending) return null
      return { version: pending.version, notes: pending.body ?? null, date: pending.date ?? null }
    },
    async install(onEvent) {
      if (!pending) throw new Error("Check for updates first.")
      await pending.downloadAndInstall((e) => {
        if (e.event === "Started") onEvent({ event: "Started", total: e.data.contentLength ?? null })
        else if (e.event === "Progress") onEvent({ event: "Progress", chunk: e.data.chunkLength })
        else onEvent({ event: "Finished" })
      })
      const { relaunch } = await import("@tauri-apps/plugin-process")
      await relaunch()
    },
  }
}

const noUpdater: Updater = {
  check: () => Promise.reject(new Error("Updates come with the desktop app.")),
  install: () => Promise.reject(new Error("Updates come with the desktop app.")),
}

export function createUpdater(): Updater {
  switch (updaterKind()) {
    case "mock":
      return mockUpdater(readMock() ?? "1")
    case "tauri":
      return tauriUpdater()
    default:
      return noUpdater
  }
}
