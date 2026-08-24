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
  // The virtualizer recycles DOM as the layout worker streams rows in, so
  // pin the assertion to the row's data-index rather than its nth position.
  const dataIndex = await target.getAttribute("data-index")
  await target.click()
  await expect(page.locator(`[data-testid="grid-row"][data-index="${dataIndex}"]`)).toHaveClass(/selected/, { timeout: 2_000 })

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
