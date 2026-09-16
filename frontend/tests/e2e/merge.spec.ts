import { expect, test } from "@playwright/test"

import { pickBranch } from "../dialogHelpers"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.15.0, owner: "integrate merges ... by reintegrating what Git Extensions
// does natively". The whole loop over a real conflicting merge: the merge
// dialog's options, the banner that says the repository is merging, the
// resolve dialog taking a side, and Continue producing the merge commit.
// Also the two other exits — Abort, and a fast-forward-only merge that git
// refuses.

test.describe("merge with conflicts", () => {
  // Each step here is several engine round trips, and every engine call
  // spawns a handful of git processes (the operation, then status, the
  // operation state, the unmerged list). On Windows that is seconds, not
  // milliseconds, so these tests get Playwright's slow budget rather than
  // racing the default one.
  test.slow()

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
    await pickBranch(page, "merge-branch", "topic")
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

  // v0.18.11, owner: the "Merge branch" label of the old floating-label
  // select was cut by DialogContent's overflow. On the A shell the label
  // sits above the field, inside the dialog, and no option row wraps.
  test("the Merge branch label is whole, above its field, and nothing wraps at 600", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await page.getByTestId("merge-button").click()
    const dialog = page.getByTestId("merge-dialog")
    await expect(dialog).toBeVisible()
    const field = dialog.getByTestId("merge-branch-field")
    const label = field.locator(".op-label")
    await expect(label).toHaveText("Merge branch")
    const d = await dialog.boundingBox()
    const l = await label.boundingBox()
    const p = await page.getByTestId("merge-branch").boundingBox()
    expect(d && l && p).toBeTruthy()
    // The label's box is inside the dialog's, and above the picker's.
    expect(l!.x).toBeGreaterThanOrEqual(d!.x)
    expect(l!.y).toBeGreaterThanOrEqual(d!.y)
    expect(l!.x + l!.width).toBeLessThanOrEqual(d!.x + d!.width)
    expect(l!.y + l!.height).toBeLessThanOrEqual(p!.y)
    expect(d!.width).toBe(600)
    // Every option is one line: a wrapped row would be twice as tall.
    for (const row of await dialog.locator(".op-opt").all()) {
      const b = await row.boundingBox()
      expect(b!.height).toBeLessThanOrEqual(28)
    }
    // The two tips are quoted with "into" between them.
    await expect(dialog.getByTestId("quoted-row")).toHaveCount(2)
    await expect(dialog.locator(".op-into")).toHaveText("into")
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
  })

  test("fast-forward only refuses a diverged branch and says so", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await page.getByTestId("merge-button").click()
    // Wait for the branch list before changing options; its initial load
    // initializes the dialog defaults.
    await pickBranch(page, "merge-branch", "topic")
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

// v0.18.9, owner (2026-09-16): "When I performed a merge, the overlay bugged
// at 'Merging' — I had to close it. Then I had an error message at the top:
// merging 'branch' history: fetch is aborted. Don't know what happened.
// Merge worked in the end, but still weird." A clean merge on a repository
// whose first history page takes seconds: the dialog awaited that page,
// and the change stream's echo of the merge started a second reload that
// aborted the first — the banner then read the browser's AbortError under
// the merge's label.
test.describe("merge on a slow history", () => {
  test.slow()

  let repoDir: string
  let previousRepo: string | null = null

  test.beforeEach(async () => {
    previousRepo ??= await currentRepoPath()
    // main and topic touch different files: the merge is clean and, with
    // both sides moved, needs a merge commit.
    repoDir = makeRepo("pg-merge-slow-")
    git(repoDir, "branch", "topic")
    write(repoDir, "a.txt", "main side\n")
    commit(repoDir, "main change")
    git(repoDir, "checkout", "-q", "topic")
    write(repoDir, "b.txt", "topic side\n")
    commit(repoDir, "topic change")
    git(repoDir, "checkout", "-q", "main")
    await openRepoOnEngine(repoDir)
  })

  test.afterEach(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  test("the merge dialog closes as soon as the engine answers, no abort error afterwards", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    await expect(page.getByTestId("status-refreshing")).toHaveCount(0)

    // Every banner text that ever shows, recorded in-page: a "never within
    // the next seconds" is not something a locator assertion can say.
    await page.evaluate(() => {
      const seen: string[] = []
      ;(window as unknown as { __banners: string[] }).__banners = seen
      new MutationObserver(() => {
        const text = document.querySelector('[data-testid="error-banner"]')?.textContent
        if (text) seen.push(text)
      }).observe(document.body, { childList: true, subtree: true, characterData: true })
    })

    // A big repository's first page: every history request after the merge
    // takes 3 s to answer (simulated latency, not a wait in the test).
    let slow = false
    await page.route("**/repos/*/revisions?*", async (route) => {
      if (!slow) return route.continue()
      await new Promise((resolve) => setTimeout(resolve, 3000))
      // The request may have been aborted meanwhile — that is the defect.
      await route.continue().catch(() => undefined)
    })

    await page.getByTestId("merge-button").click()
    await pickBranch(page, "merge-branch", "topic")
    const merged = page.waitForResponse((r) => r.request().method() === "POST" && /\/merge$/.test(r.url()))
    slow = true
    await page.getByTestId("merge-confirm").click()
    expect((await merged).ok()).toBe(true)

    // git has answered: the dialog closes now, while the refresh runs on
    // behind the top bar's indicator.
    await expect(page.getByTestId("merge-dialog")).toHaveCount(0, { timeout: 1500 })
    await expect(page.getByTestId("topbar-progress")).toContainText("Merging topic")

    // The delayed page lands with the merge commit; then the echo's own
    // reload, coalesced behind it, lands too and the bar goes quiet. Both
    // refreshes are over by then: the whole window the abort used to hit.
    await expect(page.getByTestId("grid-row").first()).toContainText("Merge branch 'topic'")
    await expect(page.getByTestId("topbar-progress")).toHaveCount(0)
    await expect(page.getByTestId("status-refreshing")).toHaveCount(0)

    const banners = await page.evaluate(() => (window as unknown as { __banners: string[] }).__banners)
    expect(banners.filter((t) => /abort/i.test(t))).toEqual([])
    await expect(page.getByTestId("error-banner")).toHaveCount(0)
  })
})
