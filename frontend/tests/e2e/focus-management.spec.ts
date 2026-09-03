import { expect, test } from "@playwright/test"

// Covers audit item 5/7 (section B, item 5): closing a dialog used to leave
// focus on <body>, so arrow keys stopped working until the grid was
// clicked. App.tsx now centralises focus-return into `focusGrid()`.
test("Escape after Ctrl+Comma returns focus to the grid so ArrowDown moves the selection", async ({ page }) => {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()

  await rows.first().click()
  await expect(rows.first()).toHaveClass(/selected/)

  await page.keyboard.press("Control+Comma")
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(page.getByRole("heading", { name: "Settings" })).toBeHidden()

  await page.keyboard.press("ArrowDown")
  await expect(rows.nth(1)).toHaveClass(/selected/)
})
