/**
 * v0.13.11: durable evidence when something goes wrong. A small in-memory
 * ring of timestamped entries (engine transport failures, unhandled errors
 * and rejections, sidecar exits reported by the Tauri shell) that the
 * recovery panel shows and can copy, plus the log file path the shell keeps
 * on disk. Nothing here throws: diagnostics must never take the app down.
 *
 * v0.14.1 (owner: "sometimes after a while the app freezes ... I don't have
 * a way to bring back the logs"): every entry is also streamed to the shell,
 * which appends it to frontend.log beside engine.log, so the evidence exists
 * on disk when the page can no longer show it. Two sensors feed the same
 * log: main-thread tasks over 200 ms (with what the app was doing) and a
 * 60 s sample of memory and state.
 */
import { isTauriShell } from "./shell"
import { invoke } from "@tauri-apps/api/core"

export type DiagnosticLevel = "info" | "warn" | "error"
export type DiagnosticEntry = { at: string; level: DiagnosticLevel; source: string; message: string }
export type LongTask = { at: string; ms: number; activity: string }

const MAX_ENTRIES = 200
const MAX_LONG_TASKS = 40
const FLUSH_MS = 2000
const LONG_TASK_MS = 200
const SAMPLE_MS = 60_000
/** One console argument list, capped: a dumped object must not flush the ring. */
const MAX_CONSOLE_CHARS = 2000

const entries: DiagnosticEntry[] = []
const longTasks: LongTask[] = []
const listeners = new Set<() => void>()
let engineLogPath: string | null = null
let activity = "idle"
let pending: string[] = []
let flushTimer: number | undefined
let sampler: (() => Record<string, unknown>) | null = null

// v0.15.3 (owner: "then I can log the console and stuff", and the WebKitGTK
// inspector would not open on Ubuntu). The ring only ever wrote *to* the
// console; now it also reads *from* it, so the drawer shows what devtools
// would have. `echo` keeps the real methods: report() writes through these,
// never through the replacements, which is what stops the recursion.
type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug"
const CONSOLE_METHODS: readonly ConsoleMethod[] = ["log", "info", "warn", "error", "debug"]
const CONSOLE_LEVEL: Record<ConsoleMethod, DiagnosticLevel> = {
  log: "info",
  info: "info",
  debug: "info",
  warn: "warn",
  error: "error",
}
type ConsoleMethods = Record<ConsoleMethod, (...args: unknown[]) => void>

/**
 * The console methods as they were when capture was installed, or null while
 * nothing is captured. Snapshotting here rather than at module load matters:
 * `report` must echo through whatever `captureConsole` displaced, and undoing
 * capture must put back exactly what it found.
 */
let echoed: ConsoleMethods | null = null

function echoTo(method: ConsoleMethod, message: string): void {
  const target = echoed ? echoed[method] : (console[method] as ConsoleMethods[ConsoleMethod])
  target.call(console, message)
}

/** One console argument as text; an object that will not stringify still says something. */
function describeArg(arg: unknown): string {
  if (typeof arg === "string") return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`
  if (arg === null || arg === undefined || typeof arg !== "object") return String(arg)
  try {
    return JSON.stringify(arg) ?? String(arg)
  } catch {
    return Object.prototype.toString.call(arg)
  }
}

export function formatConsoleArgs(args: readonly unknown[]): string {
  const text = args.map(describeArg).join(" ")
  return text.length > MAX_CONSOLE_CHARS ? `${text.slice(0, MAX_CONSOLE_CHARS)}…` : text
}

let capturing = false
let inCapture = false

/** Mirrors console.* into the ring. Idempotent; returns the undo for tests. */
export function captureConsole(): () => void {
  if (capturing || typeof console === "undefined") return () => undefined
  capturing = true
  // The raw methods, not bound copies: undo must put back the very functions
  // it found, or a spy installed around us cannot recognise its own.
  const originals = {} as ConsoleMethods
  for (const method of CONSOLE_METHODS) {
    originals[method] = console[method] as ConsoleMethods[ConsoleMethod]
  }
  echoed = originals
  for (const method of CONSOLE_METHODS) {
    console[method] = (...args: unknown[]) => {
      originals[method].apply(console, args)
      // `report` echoes errors through `echoed`, so it cannot land back here;
      // the guard covers anything else that logs while we are reporting.
      if (inCapture) return
      inCapture = true
      try {
        report(CONSOLE_LEVEL[method], "console", formatConsoleArgs(args))
      } finally {
        inCapture = false
      }
    }
  }
  return () => {
    for (const method of CONSOLE_METHODS) console[method] = originals[method]
    echoed = null
    capturing = false
  }
}

function queueLine(line: string): void {
  if (!isTauriShell()) return
  pending.push(line)
  if (flushTimer === undefined) flushTimer = window.setTimeout(() => void flush(), FLUSH_MS)
}

async function flush(): Promise<void> {
  flushTimer = undefined
  const lines = pending
  pending = []
  if (lines.length === 0) return
  try {
    await invoke("log_frontend", { lines })
  } catch {
    // An older shell or a dying one: the in-memory ring still has them.
  }
}

export function report(level: DiagnosticLevel, source: string, message: string): void {
  const at = new Date().toISOString()
  entries.push({ at, level, source, message })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  snapshot = [...entries]
  // The echo goes to the *original* console: once captureConsole() has
  // replaced console.error, echoing through the replacement would re-enter
  // report() for every entry it makes.
  if (level === "error") echoTo("error", `[powergit] ${source}: ${message}`)
  queueLine(`${at} [${level}] ${source}: ${message}`)
  for (const l of listeners) {
    try {
      l()
    } catch {
      // a broken listener must not stop the others
    }
  }
}

/** Persist transition evidence without waiting for a background timer. */
export function reportTransition(source: string, message: string): void {
  report("info", source, message)
  echoTo("info", `[powergit] ${source}: ${message}`)
  window.clearTimeout(flushTimer)
  void flush()
}

/** What the app is doing right now, named in long-task reports. */
export function setActivity(label: string): void {
  activity = label
}

export function recentLongTasks(): readonly LongTask[] {
  return longTasks
}

/** Registered by App: what the 60 s sample should include (rows, phase…). */
export function setStateSampler(fn: (() => Record<string, unknown>) | null): void {
  sampler = fn
}

/**
 * A new array each time the ring changes, and the *same* one in between.
 *
 * v0.15.3: this used to return the live `entries`, which is mutated in place.
 * `useSyncExternalStore` compares snapshots by reference, so the app log
 * rendered once and then froze — four entries in the ring, one on screen.
 * Reassigning here is what makes the view live.
 */
let snapshot: readonly DiagnosticEntry[] = []

export function diagnosticsSnapshot(): readonly DiagnosticEntry[] {
  return snapshot
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
  const body = entries.map((e) => `${e.at} [${e.level}] ${e.source}: ${e.message}`).join("\n")
  // The long tasks live in their own buffer; a copied dump that omitted them
  // would lose the one sensor that says the page was busy rather than dead.
  if (longTasks.length === 0) return head + body
  const tasks = longTasks.map((t) => `${t.at} [perf] long task ${t.ms} ms during ${t.activity}`).join("\n")
  return `${head}${body}\n\nlong tasks:\n${tasks}`
}

let installed = false

/** Global error/rejection capture plus the two sensors; idempotent. */
export function installDiagnostics(): void {
  if (installed || typeof window === "undefined") return
  installed = true
  captureConsole()
  window.addEventListener("error", (ev) => {
    report("error", "window.error", ev.message || String(ev.error ?? "unknown error"))
  })
  window.addEventListener("unhandledrejection", (ev) => {
    const r: unknown = ev.reason
    const msg = r instanceof Error ? `${r.name}: ${r.message}` : typeof r === "string" ? r : JSON.stringify(r)
    report("error", "unhandledrejection", msg)
  })
  report("info", "session", `started ${navigator.userAgent}`)
  const transition = (event: Event) =>
    reportTransition("window", `${event.type} focused=${document.hasFocus()} visibility=${document.visibilityState}`)
  window.addEventListener("focus", transition)
  window.addEventListener("blur", transition)
  document.addEventListener("visibilitychange", transition)
  // Long tasks: Chromium (WebView2) supports the entry type; WebKitGTK does
  // not, and observe() then throws, which is fine.
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < LONG_TASK_MS) continue
        const task = { at: new Date().toISOString(), ms: Math.round(entry.duration), activity }
        longTasks.push(task)
        if (longTasks.length > MAX_LONG_TASKS) longTasks.splice(0, longTasks.length - MAX_LONG_TASKS)
        queueLine(`${task.at} [perf] long task ${task.ms} ms during ${activity}`)
      }
    })
    observer.observe({ type: "longtask", buffered: true })
  } catch {
    // no long-task support here
  }
  window.setInterval(() => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    const state = sampler ? sampler() : {}
    const mem = memory ? ` heap ${Math.round(memory.usedJSHeapSize / 1048576)} MB` : ""
    queueLine(`${new Date().toISOString()} [sample]${mem} ${JSON.stringify(state)} activity=${activity}`)
  }, SAMPLE_MS)
  window.addEventListener("pagehide", () => void flush())
}
