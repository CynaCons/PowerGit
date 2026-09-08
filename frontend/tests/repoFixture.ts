import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ENGINE_URL, engineHeaders } from "./engine"

// Temporary git repositories for the specs that need a shape the checkout
// cannot provide (a conflicting merge, a rebase that stops twice). Same
// pattern as pending-rows.spec.ts, factored out because v0.15.0 needs it in
// four specs: deterministic dates, a git identity that does not depend on
// the machine, and a restore of whatever repository the engine had open.

let tick = 0

export function git(cwd: string, ...args: string[]): string {
  // One minute per call from a fixed start, so the graph order is stable
  // across runs. Minutes must roll into hours: a bare counter produced
  // "11:62" and git refused the date.
  const at = new Date(Date.UTC(2026, 8, 8, 11, 0, 0) + tick++ * 60_000)
  const date = at.toISOString().replace(/\.\d+Z$/, "+00:00")
  return execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
}

export function write(dir: string, name: string, text: string): void {
  writeFileSync(join(dir, name), text)
}

export function commit(dir: string, message: string): void {
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", message)
}

/** A repository with one commit on `main`. */
export function makeRepo(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  git(dir, "init", "-q", "-b", "main")
  write(dir, "a.txt", "base\n")
  commit(dir, "base")
  return dir
}

export async function openRepoOnEngine(path: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error(`failed to open ${path}: http ${res.status}`)
}

export async function currentRepoPath(): Promise<string | null> {
  const res = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  if (!res.ok) return null
  return ((await res.json()) as { root?: string }).root ?? null
}

/** Closes the engine's session for this path, which stops its file watcher. */
export async function closeRepoOnEngine(dir: string): Promise<void> {
  try {
    const res = await fetch(`${ENGINE_URL}/repos`, { headers: engineHeaders() })
    if (!res.ok) return
    const sessions = (await res.json()) as { id: string; root: string }[]
    const norm = (p: string) => p.replace(/[\\/]+$/, "").toLowerCase()
    for (const s of sessions.filter((s) => norm(s.root) === norm(dir))) {
      await fetch(`${ENGINE_URL}/repos/${encodeURIComponent(s.id)}`, { method: "DELETE", headers: engineHeaders() })
    }
  } catch {
    // Best effort: removeRepo still retries.
  }
}

/**
 * Windows keeps handles on a repository the engine watched, so the session
 * is closed first (that disposes the watcher) and the rm still retries: the
 * handle can outlive the request by a moment.
 */
export async function removeRepo(dir: string): Promise<void> {
  await closeRepoOnEngine(dir)
  for (let attempt = 1; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch (e) {
      if (attempt >= 8) throw e
      await new Promise((r) => setTimeout(r, 250 * attempt))
    }
  }
}
