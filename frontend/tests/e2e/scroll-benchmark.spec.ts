import { expect, test } from "@playwright/test"

// Owner, 2026-09-23, on v0.20.7 (Ubuntu): "The scrolling in the graph on
// linux is not smooth" — "about the same with the old renderer. Not smooth
// means like 10-15 fps while scrolling. We have a large repo." A graph on his
// machine cannot be measured from here, so the app measures itself: Settings
// → Diagnostics → Measure graph scrolling runs the probe on the graph on
// screen and writes the frame rates to the app log, which a diagnostic
// snapshot carries. This is the path he takes.

test("Measure graph scrolling closes Settings, scrolls the graph, and logs the frame rates", async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto("/")
  await expect(page.getByTestId("grid-row").nth(10)).toBeVisible({ timeout: 30_000 })

  await page.keyboard.press("Control+Comma")
  await expect(page.getByTestId("settings-page")).toBeVisible()
  await page.getByTestId("scroll-benchmark").click()
  await expect(page.getByTestId("settings-page")).toHaveCount(0)

  // It opens the app log on the result when it is done.
  const result = page.getByTestId("app-log-entry").filter({ hasText: "scroll benchmark: control" })
  await expect(result).toHaveCount(1, { timeout: 90_000 })
  for (const scenario of ["grid", "noCanvas", "noRowPaint", "noRowLayout", "skim", "jump"]) {
    await expect(result).toContainText(new RegExp(`${scenario} \\d+(\\.\\d)? fps`))
  }
  await expect(page.getByTestId("app-log-entry").filter({ hasText: "scroll benchmark data:" })).toHaveCount(1)
  // The graph is left where it was and draws again.
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await expect(page.locator(".graph-canvas")).toBeVisible()
})
