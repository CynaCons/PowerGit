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
  const date = `2026-09-08T11:${String(tick++).padStart(2, "0")}:00+00:00`
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

/** Windows keeps handles on a repository the engine watched; retry the rm. */
export async function removeRepo(dir: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true })
      return
    } catch (e) {
      if (attempt >= 5) throw e
      await new Promise((r) => setTimeout(r, 300 * attempt))
    }
  }
}
