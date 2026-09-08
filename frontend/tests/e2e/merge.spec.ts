import { expect, test } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.15.0, owner: "integrate merges ... by reintegrating what Git Extensions
// does natively". The whole loop over a real conflicting merge: the merge
// dialog's options, the banner that says the repository is merging, the
// resolve dialog taking a side, and Continue producing the merge commit.
// Also the two other exits — Abort, and a fast-forward-only merge that git
// refuses.

test.describe("merge with conflicts", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeEach(async () => {
    previousRepo ??= await currentRepoPath()
    // main and topic both change a.txt from the same base: any merge of the
    // two conflicts, and a fast-forward is impossible.
    repoDir = makeRepo("pg-merge-")
    git(repoDir, "branch", "topic")
    write(repoDir, "a.txt", "main side\n")
    commit(repoDir, "main change")
    git(repoDir, "checkout", "-q", "topic")
    write(repoDir, "a.txt", "topic side\n")
    commit(repoDir, "topic change")
    git(repoDir, "checkout", "-q", "main")
    await openRepoOnEngine(repoDir)
  })

  test.afterEach(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  test("merge stops on a conflict, the banner resolves it, and Continue commits the merge", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await page.getByTestId("merge-button").click()
    await expect(page.getByTestId("merge-branch")).toBeVisible()
    await page.getByTestId("merge-branch").selectOption("topic")
    await page.getByTestId("merge-confirm").click()

    // A stopped merge is a state, not an error: the banner appears instead.
    const banner = page.getByTestId("op-banner")
    await expect(banner).toHaveAttribute("data-state", "merging")
    await expect(banner).toContainText("Merging 'topic' into main")
    await expect(page.getByTestId("op-conflict-count")).toContainText("1 file")
    await expect(page.getByTestId("op-continue")).toBeDisabled()
    await expect(page.getByTestId("status-operation")).toHaveText("MERGING")

    await page.getByTestId("op-resolve").click()
    const row = page.getByTestId("conflict-row").filter({ hasText: "a.txt" })
    await expect(row).toHaveCount(1)
    await expect(row).toHaveAttribute("data-kind", "both-modified")
    await row.getByTestId("conflict-take-theirs").click()

    await expect(page.getByTestId("conflict-row")).toHaveCount(0)
    const continueButton = page.getByTestId("conflict-continue")
    await expect(continueButton).toBeEnabled()
    await continueButton.click()

    await expect(page.getByTestId("op-banner")).toHaveCount(0)
    await expect(page.getByTestId("status-operation")).toHaveCount(0)
    // The merge commit git wrote is the new tip.
    await expect(page.getByTestId("grid-row").first()).toContainText("Merge branch 'topic'")
  })

  test("Abort asks first and leaves the branch where it was", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    const tip = await page.getByTestId("grid-row").first().textContent()

    await page.getByTestId("merge-button").click()
    await page.getByTestId("merge-confirm").click()
    await expect(page.getByTestId("op-banner")).toHaveAttribute("data-state", "merging")

    await page.getByTestId("op-abort").click()
    await expect(page.getByTestId("confirm-dialog")).toBeVisible()
    await page.getByTestId("confirm-dialog-confirm").click()

    await expect(page.getByTestId("op-banner")).toHaveCount(0)
    await expect(page.getByTestId("grid-row").first()).toHaveText(tip ?? "")
  })

  test("fast-forward only refuses a diverged branch and says so", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await page.getByTestId("merge-button").click()
    await page.getByTestId("merge-ff-only").click()
    await page.getByTestId("merge-confirm").click()

    // The dialog keeps its own failure, like cherry-pick and revert do: the
    // user is still in the flow and can pick another mode.
    await expect(page.getByTestId("merge-dialog")).toBeVisible()
    await expect(page.getByTestId("merge-dialog")).toContainText(/fast[- ]forward/i)
    // Refusing is not starting: nothing to continue or abort.
    await expect(page.getByTestId("op-banner")).toHaveCount(0)
  })
})
