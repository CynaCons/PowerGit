import { expect, test } from "@playwright/test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner (2026-09-11), on the v0.15 console: "there's always tons of stuff in
// that window, I can't even see my push when I push. Hard to understand
// where my stuff is." And, on the failure card: "one of the files is new, I
// see 'git failed - exit 1' with a diff of the new file."
//
// The fixture has a bare repository as `origin`, so `git push` is a real
// push git completes; the engine adds `-u origin HEAD` when there is no
// upstream yet. Every assertion is on what the panel shows at the moment
// the owner would look: the row order from the top, without scrolling.

test.describe("git console readability", () => {
  let repoDir: string
  let remoteDir: string
  let previousRepo: string | null = null

  test.beforeEach(async () => {
    previousRepo ??= await currentRepoPath()
    repoDir = makeRepo("pg-console-push-")
    remoteDir = mkdtempSync(join(tmpdir(), "pg-console-remote-"))
    git(remoteDir, "init", "-q", "--bare", "-b", "main")
    git(repoDir, "remote", "add", "origin", remoteDir)
    write(repoDir, "a.txt", "to push\n")
    commit(repoDir, "something to push")
    await openRepoOnEngine(repoDir)
  })

  test.afterEach(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
    rmSync(remoteDir, { recursive: true, force: true })
  })

  test("after a push, the console shows the push within the first three rows without scrolling", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await page.getByTestId("git-console-dock").click()
    const list = page.getByTestId("git-console-list")
    await expect(list).toBeVisible()
    // Default view: the reads that loading the repository ran are folded
    // into one thin row, not listed one by one.
    await expect(list).toHaveAttribute("data-flat", "false")
    await expect(page.getByTestId("git-console-gap").first()).toBeVisible()
    const backgroundRows = list.locator('[data-testid="git-console-entry"][data-kind="background"]')
    await expect(backgroundRows).toHaveCount(0)

    await page.getByTestId("push-button").click()
    await expect(page.getByTestId("push-preview")).toBeVisible()
    await page.getByTestId("preview-confirm").click()

    // The push lands in the panel (the open panel polls every 2 s)...
    const pushRow = list
      .getByTestId("git-console-entry")
      .filter({ has: page.getByTestId("git-console-command").filter({ hasText: /^git push/ }) })
    await expect(pushRow).toHaveCount(1, { timeout: 15_000 })
    await expect(pushRow).toHaveAttribute("data-kind", "action")
    await expect(pushRow).toHaveAttribute("data-exit", "0")
    // ...and the dock line names it, not the `git status` the refresh ran after it.
    await expect(page.getByTestId("git-console-last")).toContainText("git push")
    // A first push has no upstream yet; the engine asked (`rev-parse @{u}`,
    // exit 128) before pushing, and asking is not a failure: no card.
    await expect(page.getByTestId("git-failure-card")).toHaveCount(0)
    await expect(page.getByTestId("git-console-count")).toHaveAttribute("data-failures", "0")

    // "I can't even see my push when I push": within the first three rows,
    // counted from the top, with the panel not scrolled at all.
    const rows = list.locator('[data-testid="git-console-entry"], [data-testid="git-console-gap"]')
    const index = await rows.evaluateAll((els) =>
      els.findIndex(
        (el) =>
          el.getAttribute("data-kind") === "action" &&
          (el.querySelector('[data-testid="git-console-command"]')?.textContent ?? "").startsWith("git push"),
      ),
    )
    expect(index).toBeGreaterThanOrEqual(0)
    expect(index).toBeLessThan(3)
    expect(await list.evaluate((el) => el.scrollTop)).toBe(0)
    const listBox = await list.boundingBox()
    const commandBox = await pushRow.getByTestId("git-console-command").boundingBox()
    expect(listBox).not.toBeNull()
    expect(commandBox).not.toBeNull()
    expect(commandBox!.y).toBeGreaterThanOrEqual(listBox!.y - 1)
    expect(commandBox!.y + commandBox!.height).toBeLessThanOrEqual(listBox!.y + listBox!.height + 1)

    // The newest action shows its whole output: git's own words about the push.
    await expect(pushRow).toHaveAttribute("data-expanded", "true")
    await expect(pushRow.getByTestId("git-console-output")).toContainText(/new branch|-> main/)
    // The reads around it stay folded.
    await expect(backgroundRows).toHaveCount(0)

    // A gap opens on click and shows its reads, and closes again.
    const gap = page.getByTestId("git-console-gap").first()
    await gap.click()
    await expect(gap).toHaveAttribute("aria-expanded", "true")
    await expect(backgroundRows.first()).toBeVisible()
    await gap.click()
    await expect(backgroundRows).toHaveCount(0)

    // "Show all" flattens the log to every command, and is remembered.
    await page.getByTestId("git-console-show-all").click()
    await expect(list).toHaveAttribute("data-flat", "true")
    await expect(page.getByTestId("git-console-gap")).toHaveCount(0)
    await expect(backgroundRows.first()).toBeVisible()
    await page.reload()
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    await expect(page.getByTestId("git-console-list")).toHaveAttribute("data-flat", "true")
    await page.getByTestId("git-console-show-all").click()
    await expect(page.getByTestId("git-console-list")).toHaveAttribute("data-flat", "false")

    // The filter works in the folded view too: a hit is never hidden in a gap.
    await page.getByTestId("git-console-filter").fill("status --porcelain")
    await expect(page.getByTestId("git-console-entry").first().getByTestId("git-console-command")).toContainText(
      "status --porcelain",
    )
    await expect(page.getByTestId("git-console-gap")).toHaveCount(0)
    await page.getByTestId("git-console-filter").fill("")
    await expect(page.getByTestId("git-console-gap").first()).toBeVisible()
  })

  test("opening a new file's diff raises no 'git failed' card", async ({ page }) => {
    write(repoDir, "brand-new.txt", "never committed\n")
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    // Open the panel first: its 2 s poll is what feeds the card as well.
    await page.getByTestId("git-console-dock").click()
    await expect(page.getByTestId("git-console-list")).toBeVisible()

    const row = page.getByTestId("grid-row").filter({ hasText: "Working directory" })
    await expect(row).toHaveCount(1, { timeout: 20_000 })
    await row.first().click()
    await page.getByRole("tab", { name: /Diff/ }).click()
    await page.getByTestId("file-list-row").filter({ hasText: "brand-new.txt" }).click()
    await expect(page.getByTestId("diff-pane")).toContainText("never committed", { timeout: 20_000 })

    // `git diff --no-index` exits 1 because the sides differ; the engine
    // says that is fine, so the entry is not a failure and nothing pops.
    await page.getByTestId("git-console-filter").fill("no-index")
    const entry = page.getByTestId("git-console-entry").first()
    await expect(entry).toBeVisible({ timeout: 15_000 })
    await expect(entry).toHaveAttribute("data-exit", "1")
    await expect(entry).toHaveAttribute("data-failed", "false")
    await expect(entry).toHaveAttribute("data-kind", "background")
    await expect(page.getByTestId("git-failure-card")).toHaveCount(0)
    await expect(page.getByTestId("git-console-count")).toHaveAttribute("data-failures", "0")
  })
})
