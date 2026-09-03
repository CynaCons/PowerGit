import { expect, test, type Page } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ENGINE_URL, engineHeaders } from "../engine"

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" })
}

async function openRepoOnEngine(path: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error(`failed to open ${path} on the engine: http ${res.status}`)
}

// Whatever repository the engine had open before this spec borrowed it. This
// used to be hardcoded to process.cwd() (the dev checkout), which is wrong
// anywhere the harness deliberately opened something else — in the Linux
// container the engine is pointed at a seeded fixture repo, and restoring
// the "wrong" repo silently changed what EVERY later spec saw. Specs then
// passed or failed by run order rather than by behaviour.
async function currentRepoPath(): Promise<string | null> {
  const res = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  if (!res.ok) return null
  const info = (await res.json()) as { root?: string }
  return info.root ?? null
}

const selectedShaLocator = (page: Page) =>
  page.locator('.grid-row.selected [data-testid="sha-cell"]')

// Covers audit item 26/28 (selection keyed by SHA; live refresh scope) and
// TASK 2: a refresh (of any kind) must not lose the selected commit.
test("selecting a row keeps it selected across a manual refresh", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()

  await rows.nth(2).click()
  await expect(rows.nth(2)).toHaveClass(/selected/)
  const shaBefore = await selectedShaLocator(page).getAttribute("title")

  await page.getByTestId("refresh-button").click()

  await expect.poll(() => selectedShaLocator(page).getAttribute("title")).toBe(shaBefore)
})

// Exercises the real engine watcher end to end: GitHost.Watch.cs classifies
// the filesystem change, GET /events streams it, and App.tsx scopes the
// refresh. Uses a disposable fixture repo (never the shared dev checkout)
// so no history is written to the real PowerGit repo, and restores the
// engine's active repo afterwards so later specs against this same
// long-lived dev engine (shell.spec.ts, other workers' specs) see the real
// checkout again.
test.describe("GET /events change classification", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    repoDir = mkdtempSync(join(tmpdir(), "powergit-live-refresh-"))
    git(repoDir, "init", "-q", "-b", "main")
    git(repoDir, "config", "user.email", "test@example.com")
    git(repoDir, "config", "user.name", "test")
    writeFileSync(join(repoDir, "a.txt"), "a\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "first")
    writeFileSync(join(repoDir, "b.txt"), "b\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "second")
  })

  test.afterAll(async () => {
    // Hand the engine back exactly what it had, so later specs in this
    // serial run see the same repository the harness set up. Falls back to
    // process.cwd() (the frontend/ dir, which resolves to the dev checkout
    // root via `rev-parse --show-toplevel`) only if the engine had nothing
    // open to begin with.
    await openRepoOnEngine(previousRepo ?? process.cwd())
    // FileSystemWatcher.Dispose() (triggered by the Open() above rebuilding
    // the watcher for the real repo) doesn't always release its Windows
    // directory handle instantly, so a same-tick rmdir can race it with
    // EBUSY; retry with backoff instead of failing the whole suite over
    // fixture cleanup.
    for (let attempt = 1; ; attempt++) {
      try {
        rmSync(repoDir, { recursive: true, force: true })
        break
      } catch (e) {
        if (attempt >= 5) throw e
        await new Promise((r) => setTimeout(r, 300 * attempt))
      }
    }
  })

  test("a status-only change refetches status only; a ref move refreshes revisions and keeps the selection", async ({ page }) => {
    await openRepoOnEngine(repoDir)
    await page.goto("/")

    const rows = page.getByTestId("grid-row")
    await expect(rows).toHaveCount(2)

    // Select the OLDER commit: a later commit shifts its row index but must
    // not change which row is highlighted (selection is keyed by SHA).
    await rows.nth(1).click()
    await expect(rows.nth(1)).toHaveClass(/selected/)
    const shaBefore = await selectedShaLocator(page).getAttribute("title")

    const revisionRequests: string[] = []
    const statusRequests: string[] = []
    page.on("request", (req) => {
      const url = req.url()
      if (url.includes("/revisions")) revisionRequests.push(url)
      else if (url.endsWith("/status")) statusRequests.push(url)
    })

    // App.tsx mutes SSE-triggered refreshes for 2s after the app's own last
    // refresh (boot's initial load counts) so an echo of our own action
    // never double-refreshes. That guard has no DOM-observable proxy, and
    // the round trip through a real FileSystemWatcher + the engine's 500ms
    // SSE poll adds its own jitter, so wait with a generous margin past it.
    await page.waitForTimeout(3500)

    // Staging only touches .git/index (GitChangeKind.Status): the engine
    // classifies it and the UI should only re-fetch status, not revisions.
    writeFileSync(join(repoDir, "c.txt"), "c\n")
    git(repoDir, "add", "-A")

    await expect.poll(() => statusRequests.length, { timeout: 15_000 }).toBeGreaterThan(0)
    expect(revisionRequests).toHaveLength(0)
    await expect(page.getByTestId("engine-status")).toContainText("(1 change")

    // The status-only refresh above just ran (it resets the same 2s guard),
    // so wait past it again before the next external change.
    await page.waitForTimeout(3500)

    // A real commit moves HEAD/refs (GitChangeKind.Refs): the UI does the
    // full revisions+refs+status refresh, and the previously selected older
    // commit must still be the one highlighted, just at a new row index.
    git(repoDir, "commit", "-q", "-m", "third")
    await expect(rows).toHaveCount(3, { timeout: 15_000 })
    await expect.poll(() => selectedShaLocator(page).getAttribute("title"), { timeout: 15_000 }).toBe(shaBefore)
  })
})
