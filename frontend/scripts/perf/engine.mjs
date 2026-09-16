// Engine side of the perf audit harness (v0.18.10): token, opening a
// repository, the git command log poller and direct /status timing. The
// engine is expected to be running already (frontend/scripts/e2e-harness.ps1
// starts one with its own POWERGIT_DATA_DIR); this module never starts one.
import { spawn } from "node:child_process"
import { readOrCreateToken } from "../engine-token.mjs"

export function engineToken() {
  return readOrCreateToken()
}

export function engineHeaders(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra }
}

export async function engineHealth(engineUrl, token) {
  const res = await fetch(`${engineUrl}/health`, { headers: engineHeaders(token) })
  if (!res.ok) throw new Error(`engine /health answered ${res.status} at ${engineUrl}`)
  return res.json()
}

/** POST /repos/open: returns the session ({id, name, root, branch}). */
export async function openRepo(engineUrl, token, path) {
  const res = await fetch(`${engineUrl}/repos/open`, {
    method: "POST",
    headers: engineHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error(`POST /repos/open ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

/** GET /repos/{id}/status n times; wall time per call from this process. */
export async function timeStatus(engineUrl, token, repoId, times = 5) {
  const samples = []
  let last = null
  for (let i = 0; i < times; i++) {
    const t0 = performance.now()
    const res = await fetch(`${engineUrl}/repos/${repoId}/status`, { headers: engineHeaders(token) })
    const body = await res.json()
    samples.push(Math.round(performance.now() - t0))
    last = body
  }
  return { samples, unstaged: last?.unstagedCount ?? null, staged: last?.stagedCount ?? null }
}

/**
 * Polls GET /repos/{id}/gitlog?after=<id> so that no entry of the engine's
 * 50-entry rolling buffer is lost during a busy scenario. Entries carry the
 * engine's UTC timestamp; a scenario window is cut on that clock, so the
 * poller also records the offset between the engine clock and ours.
 */
export function startGitLogPoller(engineUrl, token, repoId, intervalMs = 250) {
  const entries = []
  let after = 0
  let stopped = false
  let timer = null
  const url = `${engineUrl}/repos/${repoId}/gitlog`
  const tick = async () => {
    if (stopped) return
    try {
      const res = await fetch(`${url}?after=${after}`, { headers: engineHeaders(token) })
      if (res.ok) {
        const page = await res.json()
        for (const e of page) {
          if (e.id > after) after = e.id
          entries.push({ ...e, atMs: Date.parse(e.at) })
        }
      }
    } catch {
      // The engine may be busy; the next tick catches up (ids are monotonic).
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs)
    }
  }
  // Drain what the buffer already holds so the first window starts clean.
  void tick()
  return {
    entries,
    /** Entries whose start (at − duration) falls inside [fromMs, toMs] of wall time. */
    between(fromMs, toMs) {
      return entries.filter((e) => e.atMs - e.durationMs >= fromMs - 50 && e.atMs <= toMs + 50)
    },
    async stop() {
      stopped = true
      clearTimeout(timer)
      await new Promise((r) => setTimeout(r, intervalMs + 50))
      await tick.call(null).catch(() => undefined)
    },
  }
}

/** Groups command-log entries by their git subcommand: count, total and max ms. */
export function summarizeGitCalls(entries) {
  const groups = new Map()
  for (const e of entries) {
    const words = e.command.replace(/^git\s+/, "").split(/\s+/)
    let i = 0
    while (words[i] === "-c" && i + 1 < words.length) i += 2
    const key = [words[i], ...(words.slice(i + 1, i + 3).filter((w) => w?.startsWith("--")) ?? [])].join(" ")
    const g = groups.get(key) ?? { command: key, count: 0, totalMs: 0, maxMs: 0 }
    g.count += 1
    g.totalMs += e.durationMs
    g.maxMs = Math.max(g.maxMs, e.durationMs)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => b.totalMs - a.totalMs)
}

/** Reuses a Vite dev server at uiUrl or starts `npx vite --port <port>`. */
export async function ensureVite(uiUrl, engineUrl, frontendDir, token) {
  const port = Number(new URL(uiUrl).port)
  const alive = async () => {
    try {
      const res = await fetch(uiUrl)
      return res.ok
    } catch {
      return false
    }
  }
  if (await alive()) return { started: false, stop: async () => undefined }
  const child = spawn("npx", ["vite", "--port", String(port), "--strictPort"], {
    cwd: frontendDir,
    shell: true,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, VITE_ENGINE_URL: engineUrl, VITE_ENGINE_TOKEN: token },
  })
  for (let i = 0; i < 60; i++) {
    if (await alive()) return { started: true, stop: async () => stopTree(child) }
    await new Promise((r) => setTimeout(r, 500))
  }
  await stopTree(child)
  throw new Error(`vite did not answer on ${uiUrl} within 30 s`)
}

async function stopTree(child) {
  if (child.exitCode !== null) return
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const k = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })
      k.on("exit", resolve)
      k.on("error", resolve)
    })
  } else child.kill()
}
