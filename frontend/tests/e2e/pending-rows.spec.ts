import { expect, test } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ENGINE_URL, engineHeaders } from "../engine"

// Owner (2026-09-07): "GitExtension has a way to show the current pending
// changes as a temporary side commit in the graph, growing on top of the
// latest commit, showing the currently pending changes so that they can be
// reviewed with the diff view directly from the main view without opening
// the commit view." Two rows like Git Extensions: "Working directory"
// (unstaged) above "Index" (staged), each only while non-empty.

let tick = 0
function git(cwd: string, ...args: string[]): void {
  const date = `2026-09-07T11:${String(tick++).padStart(2, "0")}:00+00:00`
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    stdio: "pipe",
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
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

test.describe("pending changes as rows on top of HEAD", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    repoDir = mkdtempSync(join(tmpdir(), "pg-pending-"))
    git(repoDir, "init", "-q", "-b", "main")
    writeFileSync(join(repoDir, "a.txt"), "a\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "first")
    writeFileSync(join(repoDir, "b.txt"), "b\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "second")
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

  test("an edit shows a Working directory row whose Diff tab shows the worktree hunk; staging adds Index; a commit removes both", async ({
    page,
  }) => {
    await openRepoOnEngine(repoDir)
    await page.goto("/")
    const rows = page.getByTestId("grid-row")
    await expect(rows).toHaveCount(2)

    // Edit a tracked file: no git command, the status poll picks it up.
    writeFileSync(join(repoDir, "a.txt"), "a\nedited in the working tree\n")
    const wd = rows.filter({ hasText: "Working directory" })
    await expect(wd).toHaveCount(1, { timeout: 20_000 })
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText("Working directory")
    await expect(rows.nth(0).getByTestId("sha-cell")).toHaveText("")

    await wd.click()
    await page.getByRole("tab", { name: /Diff/ }).click()
    await expect(page.getByRole("tab", { name: /Diff \(1\)/ })).toBeVisible()
    await expect(page.getByTestId("file-list-row").first()).toContainText("a.txt")
    await expect(page.locator(".diff-row").filter({ hasText: "edited in the working tree" }).first()).toBeVisible()

    // Stage it: an Index row appears between Working directory and HEAD ...
    git(repoDir, "add", "a.txt")
    writeFileSync(join(repoDir, "c.txt"), "new\n")
    await expect(rows.filter({ hasText: "Index" })).toHaveCount(1, { timeout: 20_000 })
    await expect(rows).toHaveCount(4)
    await expect(rows.nth(0)).toContainText("Working directory")
    await expect(rows.nth(1)).toContainText("Index")

    // ... and the Index row's diff is the staged change.
    await rows.nth(1).click()
    await expect(page.getByRole("tab", { name: /Diff \(1\)/ })).toBeVisible()
    await expect(page.locator(".diff-row").filter({ hasText: "edited in the working tree" }).first()).toBeVisible()

    // Commit everything: the rows are gone.
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "third")
    await expect(rows.filter({ hasText: "Working directory" })).toHaveCount(0, { timeout: 20_000 })
    await expect(rows.filter({ hasText: "Index" })).toHaveCount(0)
    await expect(rows).toHaveCount(3)
  })
})
