// The in-app update flow as a pure state machine (v0.14.0, owner: "an
// update button, that downloads the new appimage, and restarts the app";
// policy: manual only). The hook (useUpdater) and the Tauri adapter
// (updater.ts) stay thin so this file carries every transition and is
// unit-tested in node like session/state.ts.

export type UpdateInfo = { version: string; notes: string | null; date: string | null }

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "upToDate"; current: string }
  | { phase: "available"; update: UpdateInfo }
  | { phase: "downloading"; update: UpdateInfo; received: number; total: number | null }
  | { phase: "ready"; update: UpdateInfo }
  | { phase: "error"; message: string; update: UpdateInfo | null }

export type UpdateEvent =
  | { type: "check" }
  | { type: "none"; current: string }
  | { type: "found"; update: UpdateInfo }
  | { type: "install" }
  | { type: "started"; total: number | null }
  | { type: "progress"; chunk: number }
  | { type: "finished" }
  | { type: "failed"; message: string }

export const initialUpdateState: UpdateState = { phase: "idle" }

function updateOf(s: UpdateState): UpdateInfo | null {
  switch (s.phase) {
    case "available":
    case "downloading":
    case "ready":
      return s.update
    case "error":
      return s.update
    default:
      return null
  }
}

export function updateReducer(s: UpdateState, e: UpdateEvent): UpdateState {
  switch (e.type) {
    case "check":
      // A new check always restarts from scratch, including after an error
      // or a finished download (the user may want a fresh look).
      return s.phase === "downloading" ? s : { phase: "checking" }
    case "none":
      return s.phase === "checking" ? { phase: "upToDate", current: e.current } : s
    case "found":
      return s.phase === "checking" ? { phase: "available", update: e.update } : s
    case "install": {
      const update = updateOf(s)
      if (!update || s.phase === "downloading") return s
      return { phase: "downloading", update, received: 0, total: null }
    }
    case "started":
      return s.phase === "downloading" ? { ...s, received: 0, total: e.total } : s
    case "progress":
      return s.phase === "downloading" ? { ...s, received: s.received + e.chunk } : s
    case "finished":
      return s.phase === "downloading" ? { phase: "ready", update: s.update } : s
    case "failed":
      return { phase: "error", message: e.message, update: updateOf(s) }
  }
}

/** "3.2 MB of 118.9 MB" / "3.2 MB" for the progress line. */
export function progressText(received: number, total: number | null): string {
  const mb = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`
  return total ? `${mb(received)} of ${mb(total)}` : mb(received)
}

/** 0..100 for a determinate bar, or null when the size is unknown. */
export function progressPercent(received: number, total: number | null): number | null {
  if (!total || total <= 0) return null
  return Math.min(100, Math.round((received / total) * 100))
}
