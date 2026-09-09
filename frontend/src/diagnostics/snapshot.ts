import { diagnosticsSnapshot, getEngineLogPath, recentLongTasks } from "../diagnostics"
import type { EngineClient, RepoInfo } from "../engine"
import { isTauriShell } from "../shell"

// The webview's half of the diagnostic snapshot (v0.14.1, owner: "dump all
// the information that we need in a file or package, and I'll bring it
// back to you"). In the shell the JSON goes into snapshot-<time>.zip next
// to the logs (lib.rs adds the shell facts, both logs and the engine's
// answers); in the browser the dialog shows the JSON to copy.

export type DumpContext = {
  client: EngineClient
  version: string | null
  phase: string
  repo: RepoInfo | null
  rows: number
  selected: string | null
  zoom: number
  theme: string
}

async function tryCall<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn()
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function buildFrontendDump(ctx: DumpContext): Promise<string> {
  const { client } = ctx
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
  const engine = {
    baseUrl: client.baseUrl,
    repoId: client.repoId,
    health: await tryCall(() => client.health()),
    sessions: await tryCall(() => client.sessions()),
    recents: await tryCall(() => client.recents()),
    jobs: client.hasRepo ? await tryCall(() => client.jobs()) : null,
  }
  const dump = {
    version: ctx.version,
    takenAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    shell: isTauriShell(),
    phase: ctx.phase,
    repo: ctx.repo,
    rows: ctx.rows,
    selected: ctx.selected,
    zoom: ctx.zoom,
    theme: ctx.theme,
    memory: memory
      ? { usedMB: Math.round(memory.usedJSHeapSize / 1048576), totalMB: Math.round(memory.totalJSHeapSize / 1048576) }
      : null,
    engineLog: getEngineLogPath(),
    longTasks: recentLongTasks(),
    diagnostics: diagnosticsSnapshot(),
    engine,
  }
  return JSON.stringify(dump, null, 2)
}

export type SnapshotResult = { kind: "file"; path: string } | { kind: "text"; text: string }

export async function takeSnapshot(dump: string): Promise<SnapshotResult> {
  if (!isTauriShell()) return { kind: "text", text: dump }
  const { invoke } = await import("@tauri-apps/api/core")
  const path = await invoke<string>("diagnostic_snapshot", { frontend: dump })
  return { kind: "file", path }
}

/** Shows the file in the OS file manager (shell only). */
export async function revealInFolder(path: string): Promise<void> {
  if (!isTauriShell()) return
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener")
  await revealItemInDir(path)
}

/** Open the platform inspector in a release or development shell. */
export async function openDeveloperTools(): Promise<void> {
  if (!isTauriShell()) return
  const { invoke } = await import("@tauri-apps/api/core")
  await invoke("open_devtools")
}

/** The log directory (shell only), for Settings → Open logs folder. */
export async function openLogsFolder(): Promise<void> {
  if (!isTauriShell()) return
  const { invoke } = await import("@tauri-apps/api/core")
  const dir = await invoke<string | null>("log_dir")
  if (!dir) return
  const { openPath } = await import("@tauri-apps/plugin-opener")
  await openPath(dir)
}

/** `kind`: "script" (no heartbeat), "paint" (beats but no frames), "crash" (web process died); "" from v0.14.1 files. */
export type Incident = { at: string; snapshot: string; kind?: string }

export function describeIncident(kind: string | undefined): string {
  switch (kind) {
    case "paint":
      return "PowerGit's window stopped updating"
    case "crash":
      return "PowerGit's page process crashed"
    default:
      return "PowerGit stopped responding"
  }
}

/** The incident the watchdog recorded during the previous run, once. */
export async function lastIncident(): Promise<Incident | null> {
  if (!isTauriShell()) return null
  try {
    const { invoke } = await import("@tauri-apps/api/core")
    return (await invoke<Incident | null>("last_incident")) ?? null
  } catch {
    return null
  }
}
