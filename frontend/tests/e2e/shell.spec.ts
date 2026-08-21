import { expect, test } from "@playwright/test"

test("browse chrome is present", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  await expect(page.getByTestId("navrail")).toBeVisible()
  await expect(page.getByTestId("left-panel")).toBeVisible()
  await expect(page.getByTestId("toolbar")).toBeVisible()
  await expect(page.getByTestId("revision-grid")).toBeVisible()
  await expect(page.getByTestId("bottom-panel")).toBeVisible()
  await expect(page.getByTestId("engine-status")).toBeVisible()
})

test("commit overlay opens from the toolbar", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("commit-button").click()
  await expect(page.getByTestId("commit-overlay")).toBeVisible()
  await page.keyboard.press("Escape")
})

test("selecting a row updates commit details", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()
  const before = await page.getByTestId("commit-info").innerText()
  await rows.nth(3).click()
  await expect(page.getByTestId("commit-info")).not.toHaveText(before)
  await expect(rows.nth(3)).toHaveClass(/selected/)
})

test("grid virtualizes a large history", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  const count = await rows.count()
  expect(count).toBeGreaterThan(8)
  expect(count).toBeLessThan(200)
  await page.getByTestId("grid-body").evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  await expect(rows.first()).toBeVisible()
  const after = await rows.count()
  expect(after).toBeLessThan(200)
})

test("sha column is visible", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("sha-cell").first()).toBeVisible()
  await expect(page.getByTestId("sha-cell").first()).toHaveText(/^[0-9a-f]{7}$/i)
})

test("settings opens from the navrail", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("settings-button").click()
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()
})

test("files tab lists changes for a commit", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("tab", { name: /Files/ }).click()
  await expect(page.getByTestId("file-list")).toBeVisible()
})
