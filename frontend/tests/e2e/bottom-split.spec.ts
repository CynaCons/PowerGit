import { expect, test } from "@playwright/test"

// Each Playwright test starts with a fresh, isolated browser context, so
// localStorage is already empty here - no explicit reset needed, and doing
// it via addInitScript would be wrong anyway since that script reruns on
// every later navigation, including this test's own page.reload().
test("dragging the bottom split handle resizes the file column and persists the width", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.locator('[data-testid="grid-row"]:not([data-artificial])').first().click()
  await page.getByRole("tab", { name: /Diff/ }).click()

  const fileList = page.getByTestId("file-list")
  await expect(fileList).toBeVisible()
  const handle = page.getByTestId("bottom-split-handle")
  await expect(handle).toBeVisible()

  const before = (await fileList.boundingBox())!
  const handleBox = (await handle.boundingBox())!
  const startX = handleBox.x + handleBox.width / 2
  const startY = handleBox.y + handleBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 120, startY, { steps: 10 })
  await page.mouse.up()

  const after = (await fileList.boundingBox())!
  const grew = after.width - before.width
  expect(grew).toBeGreaterThan(100)
  expect(grew).toBeLessThan(140)

  await page.reload()
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.locator('[data-testid="grid-row"]:not([data-artificial])').first().click()
  await page.getByRole("tab", { name: /Diff/ }).click()

  // Polled: under a loaded full-suite run the first frame after the reload
  // can still carry the default width (seen 2026-09-23); the saved one must
  // arrive, not be there on the very first read.
  await expect
    .poll(async () => Math.abs((await page.getByTestId("file-list").boundingBox())!.width - after.width))
    .toBeLessThan(2)
})
