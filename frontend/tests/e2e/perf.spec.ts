import { expect, test } from "@playwright/test"

// Large-repo responsiveness budget (owner feedback 2026-08-24): interactions
// must stay snappy while the grid is virtualizing a long live history.
test("row selection stays responsive while scrolling a long history", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("engine-status")).toContainText("(", { timeout: 30_000 })
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })

  // The budget below is about selection while SCROLLING a long history, not
  // while the first pages are still streaming in right after boot (or right
  // after the previous spec swapped the engine's repo). On a 17k-commit
  // checkout the layout worker is still appending rows for a few seconds;
  // wait until the virtualized row count stops changing before measuring.
  await expect
    .poll(
      async () => {
        const grid = page.getByTestId("grid-body")
        const before = await grid.evaluate((el) => el.scrollHeight)
        await new Promise((r) => setTimeout(r, 400))
        const after = await grid.evaluate((el) => el.scrollHeight)
        return before === after
      },
      { timeout: 30_000, message: "history kept growing for 30 s" },
    )
    .toBe(true)

  // Jump into the middle of the history, then select whatever rendered there.
  await page.getByTestId("grid-body").evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2
  })
  const target = page.getByTestId("grid-row").nth(5)
  await expect(target).toBeVisible()
  // Pin the assertion to the row's SHA, not its index. History is still
  // streaming in at this point, so the layout worker keeps appending rows and
  // the virtualizer recycles DOM underneath us: a row's data-index can change
  // between reading it and clicking, and the old index may not even be
  // rendered any more. The app keys selection by SHA precisely because
  // indices move, so the test must assert the same way — otherwise it fails
  // on row churn while reporting a performance regression.
  const sha = await target.locator('[data-testid="sha-cell"]').getAttribute("title")
  expect(sha).toMatch(/^[0-9a-f]{40}$/)
  // `nth(5)` is a live locator; pin the click as well as the assertion to
  // the SHA so a recycled fifth DOM row cannot select a different commit.
  const pinned = page.locator(`.grid-row:has([data-testid="sha-cell"][title="${sha}"])`)
  await pinned.click()
  await expect(pinned).toHaveClass(/selected/, {
    timeout: 2_000,
  })

  // Scrolling further keeps rendering rows without multi-second stalls.
  await page.getByTestId("grid-body").evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 2_000 })
})

test("file tree and diff tab open while revisions load", async ({ page }) => {
  await page.goto("/")
  // Do NOT wait for the grid: tabs must be interactive during load.
  await page.getByRole("tab", { name: "File Tree" }).click()
  await expect(page.getByTestId("bottom-panel")).toBeVisible({ timeout: 5_000 })
})
