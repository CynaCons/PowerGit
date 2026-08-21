import { expect, test } from "@playwright/test"

// Unskip when the owner asks for pixel diffs (`npm run test:visual`).
test.skip("browse shell baseline", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  await expect(page).toHaveScreenshot("browse-shell.png")
})
