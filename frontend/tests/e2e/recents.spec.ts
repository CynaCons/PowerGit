import { expect, test } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"

// Owner (2026-09-08): "the recent repositories seem not persistent ... a
// small cross icon on the top right of the cards, to be able to remove
// them". They were persistent on disk; the page only asked for them once
// a repository had loaded. This opens the dialog on a fresh page and
// expects the list, then removes one entry with the cross.

async function openRepoOnEngine(path: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error(`failed to open ${path}: http ${res.status}`)
}

async function currentRepoPath(): Promise<string | null> {
  const res = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  if (!res.ok) return null
  return ((await res.json()) as { root: string }).root
}

test.describe("recent repositories", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    repoDir = mkdtempSync(join(tmpdir(), "pg-recent-"))
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir })
    writeFileSync(join(repoDir, "a.txt"), "a\n")
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "add", "-A"], { cwd: repoDir })
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "first"], {
      cwd: repoDir,
    })
    // Remembered by the engine, then the previous repo is current again, so
    // the fixture is a recent entry and not what the page loads.
    await openRepoOnEngine(repoDir)
    if (previousRepo) await openRepoOnEngine(previousRepo)
  })

  test.afterAll(async () => {
    if (previousRepo) await openRepoOnEngine(previousRepo)
    rmSync(repoDir, { recursive: true, force: true })
  })

  test("the dialog lists recents on a fresh page and the cross removes one", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("grid-row").first().waitFor()

    await page.getByTestId("recents-button").click()
    const cards = page.getByTestId("recent-card")
    const fixture = cards.filter({ hasText: repoDir.split(/[\\/]/).pop()! })
    await expect(fixture).toHaveCount(1)

    await fixture.getByTestId("recent-forget").click()
    await expect(fixture).toHaveCount(0)

    const res = await fetch(`${ENGINE_URL}/repos/recents`, { headers: engineHeaders() })
    const list = (await res.json()) as { root: string }[]
    expect(list.some((r) => r.root.toLowerCase() === repoDir.toLowerCase())).toBe(false)
  })
})
