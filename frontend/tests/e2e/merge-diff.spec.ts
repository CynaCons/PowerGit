import { expect, test } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ENGINE_URL, engineHeaders } from "../engine"

// Owner report (2026-09-07): "merge commits are not showing a diff in the
// diff view". Symptom first: a repository with one merge, click the merge
// row, and the Diff tab must list changed files and show hunks — Git
// Extensions shows a merge's diff against its first parent.

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, stdio: "pipe" })
}

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
  return ((await res.json()) as { root?: string }).root ?? null
}

test.describe("merge commit diff", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    // The engine is shared by every spec: remember what it had open BEFORE
    // the first test swaps in the fixture, so afterAll hands it back.
    previousRepo = await currentRepoPath()
    repoDir = mkdtempSync(join(tmpdir(), "pg-merge-"))
    git(repoDir, "init", "-q", "-b", "main")
    writeFileSync(join(repoDir, "a.txt"), "a\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "first")
    git(repoDir, "checkout", "-q", "-b", "topic")
    writeFileSync(join(repoDir, "topic.txt"), "topic work\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "topic change")
    git(repoDir, "checkout", "-q", "main")
    writeFileSync(join(repoDir, "a.txt"), "a\nmain work\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "main change")
    git(repoDir, "merge", "-q", "--no-ff", "-m", "Merge branch 'topic'", "topic")
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
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

  test("the merge row lists its changed files and shows a diff", async ({ page }) => {
    await openRepoOnEngine(repoDir)
    await page.goto("/")
    const rows = page.getByTestId("grid-row")
    await expect(rows).toHaveCount(4)
    // Newest first: the merge is row 0 and carries HEAD.
    await expect(rows.nth(0)).toContainText("Merge branch 'topic'")
    await rows.nth(0).click()
    await page.getByRole("tab", { name: /Diff/ }).click()

    // The merge brought topic.txt onto main: one changed file against the
    // first parent, and its hunk in the pane.
    await expect(page.getByRole("tab", { name: /Diff \(1\)/ })).toBeVisible()
    await expect(page.getByTestId("file-list-row")).toHaveCount(1)
    await expect(page.getByTestId("file-list-row").first()).toContainText("topic.txt")
    await expect(page.locator(".diff-row").filter({ hasText: "topic work" }).first()).toBeVisible()
  })
})
