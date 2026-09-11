import { expect, test } from "@playwright/test"

test("Settings exposes the desktop inspector action", async ({ page }) => {
  await page.goto("/?demo=1")
  await page.getByTestId("grid-row").first().waitFor()
  // Browser proof of the Settings action; native inspector opening is a shell check.
  await page.evaluate(() => {
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        invoke: async (command: string) => {
          if (command === "open_devtools") document.body.dataset.inspectorRequested = "true"
        },
      },
    })
  })
  await page.getByTestId("settings-button").click()
  await expect(page.getByTestId("settings-page")).toBeVisible()
  const button = page.getByTestId("open-devtools")
  await expect(button).toBeVisible()
  await button.click()
  await expect(page.locator("body")).toHaveAttribute("data-inspector-requested", "true")
})
