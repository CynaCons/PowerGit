import { expect, test } from "@playwright/test"

// Large-repo responsiveness budget (owner feedback 2026-08-24): interactions
// must stay snappy while the grid is virtualizing a long live history.
test("row selection stays responsive while scrolling a long history", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("engine-status")).toContainText("(", { timeout: 30_000 })
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })

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
  await target.click()
  await expect(page.locator(`.grid-row.selected [data-testid="sha-cell"][title="${sha}"]`)).toBeVisible({
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
