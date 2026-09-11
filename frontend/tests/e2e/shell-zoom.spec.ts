import { expect, test } from "@playwright/test"

// v0.13.18 owner-report guards: at 150 % zoom the shell used to shrink to
// 1/zoom of the window and the rail's Settings button fell below the
// viewport. The Save/Cancel draft guard from the same release is gone with
// v0.18.0: the page applies a change at once and the row's Reset undoes it.

test("the shell fills the window at 150 % zoom and Settings stays reachable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => window.localStorage.setItem("pg.zoom", "1.5"))
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  const root = (await page.locator("#root").boundingBox())!
  expect(Math.round(root.width)).toBe(1280)
  expect(Math.round(root.height)).toBe(800)
  const settings = (await page.getByTestId("settings-button").boundingBox())!
  expect(settings.y + settings.height).toBeLessThanOrEqual(800)
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
})

test("a short window keeps Settings pinned and scrolls the commands", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 420 })
  await page.goto("/")
  const settings = (await page.getByTestId("settings-button").boundingBox())!
  expect(settings.y + settings.height).toBeLessThanOrEqual(420)
  await expect(page.getByTestId("rail-commands")).toBeVisible()
})

test("a change applies at once and Reset puts it back", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("settings-button").click()
  const row = page.getByTestId("settings-row-appearance.theme")
  await expect(row).toHaveAttribute("data-changed", "false")
  await page.getByTestId("settings-appearance").selectOption("dark")
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pg.theme"))).toBe("dark")
  await expect(row).toHaveAttribute("data-changed", "true")

  await page.getByTestId("settings-reset-appearance.theme").click()
  await expect(page.getByTestId("settings-appearance")).toHaveValue("system")
  await expect.poll(() => page.evaluate(() => localStorage.getItem("pg.theme"))).toBe("system")
  await expect(row).toHaveAttribute("data-changed", "false")
  await page.keyboard.press("Escape")
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toHaveCount(0)
})

test("the repository row opens the repository switcher", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("rail-repo").click()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
})
