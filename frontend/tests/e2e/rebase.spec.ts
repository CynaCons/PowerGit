import { expect, test } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.15.0: a rebase that conflicts is no longer auto-aborted (the pre-v0.15
// engine contract). It stops, the banner says which step it is on, and the
// user resolves and continues — or skips the offending commit.

test.describe("rebase with conflicts", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeEach(async () => {
    previousRepo ??= await currentRepoPath()
    // topic carries two commits that both touch a.txt, and main moved the
    // same line: rebasing topic onto main conflicts twice.
    repoDir = makeRepo("pg-rebase-")
    git(repoDir, "checkout", "-q", "-b", "topic")
    write(repoDir, "a.txt", "topic one\n")
    commit(repoDir, "topic one")
    write(repoDir, "a.txt", "topic two\n")
    commit(repoDir, "topic two")
    git(repoDir, "checkout", "-q", "main")
    write(repoDir, "a.txt", "main side\n")
    commit(repoDir, "main change")
    git(repoDir, "checkout", "-q", "topic")
    await openRepoOnEngine(repoDir)
  })

  test.afterEach(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  /** The row carrying the given ref chip. */
  const rowWithRef = (page: import("@playwright/test").Page, ref: string) =>
    page.locator(`[data-testid="grid-row"]:has([data-ref="${ref}"])`).first()

  test("a conflicting rebase stops on step 1 of 2 and Continue finishes it", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await rowWithRef(page, "main").click({ button: "right" })
    await page.getByTestId("ctx-rebase").click()
    await page.getByTestId("rebase-confirm").click()

    const banner = page.getByTestId("op-banner")
    await expect(banner).toHaveAttribute("data-state", "rebasing")
    await expect(banner).toContainText("Rebasing topic")
    await expect(banner).toContainText("step 1 of 2")
    await expect(page.getByTestId("status-operation")).toHaveText("REBASING 1/2")

    // "Ours" during a rebase is the branch being rebased onto; the dialog
    // says so instead of repeating git's wording.
    await page.getByTestId("op-resolve").click()
    const row = page.getByTestId("conflict-row").filter({ hasText: "a.txt" })
    await expect(row.getByTestId("conflict-take-ours")).toContainText("Onto")
    await row.getByTestId("conflict-take-ours").click()
    await expect(page.getByTestId("conflict-row")).toHaveCount(0)
    await page.getByTestId("conflict-continue").click()

    // The second commit conflicts as well: same banner, next step.
    await expect(banner).toContainText("step 2 of 2")
    await page.getByTestId("op-resolve").click()
    await page.getByTestId("conflict-row").first().getByTestId("conflict-take-theirs").click()
    await page.getByTestId("conflict-continue").click()

    await expect(page.getByTestId("op-banner")).toHaveCount(0)
    await expect(rowWithRef(page, "topic")).toContainText("topic two")
  })

  test("Skip drops the commit that will not apply", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await rowWithRef(page, "main").click({ button: "right" })
    await page.getByTestId("ctx-rebase").click()
    await page.getByTestId("rebase-confirm").click()
    await expect(page.getByTestId("op-banner")).toHaveAttribute("data-state", "rebasing")

    await page.getByTestId("op-skip").click()
    // The first commit is gone; the second one stops the rebase in its turn.
    await expect(page.getByTestId("op-banner")).toContainText("step 2 of 2")
    await page.getByTestId("op-abort").click()
    await page.getByTestId("confirm-dialog-confirm").click()
    await expect(page.getByTestId("op-banner")).toHaveCount(0)
  })
})
