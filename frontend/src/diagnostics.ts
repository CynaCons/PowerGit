/**
 * v0.13.11: durable evidence when something goes wrong. A small in-memory
 * ring of timestamped entries (engine transport failures, unhandled errors
 * and rejections, sidecar exits reported by the Tauri shell) that the
 * recovery panel shows and can copy, plus the log file path the shell keeps
 * on disk. Nothing here throws: diagnostics must never take the app down.
 */
export type DiagnosticLevel = "info" | "warn" | "error"
export type DiagnosticEntry = { at: string; level: DiagnosticLevel; source: string; message: string }

const MAX_ENTRIES = 200
const entries: DiagnosticEntry[] = []
const listeners = new Set<() => void>()
let engineLogPath: string | null = null

export function report(level: DiagnosticLevel, source: string, message: string): void {
  entries.push({ at: new Date().toISOString(), level, source, message })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  if (level === "error") console.error(`[powergit] ${source}: ${message}`)
  for (const l of listeners) {
    try {
      l()
    } catch {
      // a broken listener must not stop the others
    }
  }
}

export function diagnosticsSnapshot(): readonly DiagnosticEntry[] {
  return entries
}

export function subscribeDiagnostics(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setEngineLogPath(path: string | null): void {
  engineLogPath = path
}

export function getEngineLogPath(): string | null {
  return engineLogPath
}

export function formatDiagnostics(): string {
  const head = engineLogPath ? `engine log: ${engineLogPath}\n` : ""
  return head + entries.map((e) => `${e.at} [${e.level}] ${e.source}: ${e.message}`).join("\n")
}

let installed = false

/** Global error/rejection capture; idempotent. */
export function installDiagnostics(): void {
  if (installed || typeof window === "undefined") return
  installed = true
  window.addEventListener("error", (ev) => {
    report("error", "window.error", ev.message || String(ev.error ?? "unknown error"))
  })
  window.addEventListener("unhandledrejection", (ev) => {
    const r: unknown = ev.reason
    const msg = r instanceof Error ? `${r.name}: ${r.message}` : typeof r === "string" ? r : JSON.stringify(r)
    report("error", "unhandledrejection", msg)
  })
}
