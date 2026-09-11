import { expect, test, type Locator, type Page } from "@playwright/test"

import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner, 2026-09-11: "review mode keeps track of every single file and every
// single changed or added line in the diff, and marks them as unreviewed.
// The user has to click on each line of every file and that changes the
// status. Must be line by line." Then: Space cycles unreviewed → ok →
// rejected → unreviewed, x rejects, j/k move, n jumps to the next
// unreviewed line. v0.17.0 is the Diff tab of the main window, in memory.
//
// The proof is what the owner sees: the mark on each row (data-review),
// the cursor row, and the bar in the tab strip counting the file's lines.

async function openInApp(page: Page, dir: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path: dir }),
  })
  const opened = (await res.json()) as { id: string }
  await page.goto(`/?repo=${opened.id}`)
  await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
}

/** A diff row matched on its text cell; the row itself starts with gutter numbers. */
function diffRow(page: Page, text: string): Locator {
  return page
    .getByTestId("diff-pane")
    .locator(".diff-row")
    .filter({
      has: page.locator(".diff-row-text").filter({ hasText: new RegExp(`^${text.replace(/[+]/g, "[+]")}$`) }),
    })
}

/** Presses `key` until `row` carries the cursor, at most once per diff row. */
async function pressUntilCursor(page: Page, key: string, row: Locator): Promise<void> {
  const rows = await page.getByTestId("diff-pane").locator(".diff-row").count()
  for (let i = 0; i < rows; i++) {
    if ((await row.getAttribute("class"))?.includes("diff-row-cursor")) return
    await page.keyboard.press(key)
  }
  await expect(row).toHaveClass(/diff-row-cursor/)
}

test.describe("review mode in the Diff tab", () => {
  // Opening a repository moves the engine's "current" one, which is what
  // every spec that just does page.goto("/") boots from. Put it back.
  let previousRepo: string | null = null
  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
  })

  test("review mode keeps track of every changed or added line in the diff and marks them as unreviewed; the user marks each line, line by line", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    // One committed file, then two lines added on disk in two places.
    const dir = makeRepo("pg-review-")
    const base = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
    write(dir, "f.txt", base.join("\n") + "\n")
    commit(dir, "start")
    const edited = [...base.slice(0, 2), "first", ...base.slice(2, 9), "second", ...base.slice(9)]
    write(dir, "f.txt", edited.join("\n") + "\n")
    try {
      await openInApp(page, dir)
      const row = page.getByTestId("grid-row").filter({ hasText: "Working directory" })
      await expect(row).toHaveCount(1, { timeout: 20_000 })
      await row.first().click()
      await page.getByRole("tab", { name: /Diff/ }).click()
      const first = diffRow(page, "+first")
      const second = diffRow(page, "+second")
      await expect(second).toBeVisible({ timeout: 20_000 })

      // Off: no mark anywhere, no bar.
      const pane = page.getByTestId("diff-pane")
      await expect(pane.locator(".diff-row-mark")).toHaveCount(0)
      await expect(page.getByTestId("diff-review-bar")).toHaveCount(0)

      const toggle = page.getByTestId("diff-review-toggle")
      await expect(toggle).toBeEnabled()
      await toggle.click()
      await expect(toggle).toHaveAttribute("aria-pressed", "true")
      // Every changed line starts unreviewed; context lines carry nothing.
      await expect(first).toHaveAttribute("data-review", "todo")
      await expect(second).toHaveAttribute("data-review", "todo")
      await expect(pane.locator("[data-review]")).toHaveCount(2)
      const label = page.getByTestId("diff-review-label")
      const count = page.getByTestId("diff-review-count")
      await expect(label).toHaveText("Reviewing")
      await expect(count).toHaveText("0 / 2 lines")
      // The toggle put the focus in the diff: Space marks the first change.
      await page.keyboard.press("Space")
      await expect(first).toHaveAttribute("data-review", "ok")
      await expect(first).toHaveClass(/diff-row-cursor/)
      await expect(count).toHaveText("1 / 2 lines")

      // j down to the next change, x rejects it: the file is complete.
      await pressUntilCursor(page, "j", second)
      await page.keyboard.press("x")
      await expect(second).toHaveAttribute("data-review", "rejected")
      await expect(count).toHaveText("2 / 2 lines · 1 rejected")
      await expect(label).toHaveText("Review complete")

      // Space on a rejected line returns it to unreviewed (no Start over
      // yet), and n finds it again from elsewhere.
      await page.keyboard.press("Space")
      await expect(second).toHaveAttribute("data-review", "todo")
      await expect(count).toHaveText("1 / 2 lines")
      await expect(label).toHaveText("Reviewing")
      await page.keyboard.press("k")
      await expect(second).not.toHaveClass(/diff-row-cursor/)
      await page.keyboard.press("n")
      await expect(second).toHaveClass(/diff-row-cursor/)

      // The review layer sits over browse: Ctrl+Space is still the commit dialog.
      await page.keyboard.press("Control+Space")
      await expect(page.getByTestId("commit-overlay")).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(page.getByTestId("commit-overlay")).not.toBeVisible()

      // Off again: the marks leave the DOM, the bar goes.
      await toggle.click()
      await expect(toggle).toHaveAttribute("aria-pressed", "false")
      await expect(pane.locator(".diff-row-mark")).toHaveCount(0)
      await expect(page.getByTestId("diff-review-bar")).toHaveCount(0)
      await expect(first).toBeVisible()
    } finally {
      await removeRepo(dir)
    }
  })
})
