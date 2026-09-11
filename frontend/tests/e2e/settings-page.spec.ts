import { expect, test } from "@playwright/test"

// v0.18.0, owner (2026-09-11): "Let's rework the settings panel. It's
// ugly, poor layout. It's not adapted. … We could do something like VS
// Code." Prototype A was chosen: Settings is a page in place of the graph,
// with a table of contents, a search box over every setting and changes
// that apply as they are made. These are the owner's sentences as tests.

test.beforeEach(async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
})

test("the gear opens Settings as a page with a search box, in place of the graph", async ({ page }) => {
  await page.getByTestId("grid-row").first().click()
  await page.getByTestId("settings-button").click()

  const settings = page.getByTestId("settings-page")
  await expect(settings).toBeVisible()
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible()
  await expect(page.getByTestId("settings-search")).toBeFocused()
  await expect(page.getByTestId("settings-toc")).toBeVisible()
  await expect(page.getByTestId("settings-toc-behaviour.autoFetch")).toHaveText("Background fetch")
  // Not a dialog over the graph: the graph is gone while the page shows.
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await expect(page.getByTestId("grid-row")).toHaveCount(0)
  await expect(page.getByTestId("bottom-panel")).toHaveCount(0)

  // The page fills the content area edge to edge, like the graph did.
  const content = (await page.getByTestId("browse-shell").boundingBox())!
  const box = (await settings.boundingBox())!
  expect(box.x + box.width).toBeGreaterThan(content.x + content.width - 2)

  // Escape brings the graph back, with the keyboard on it.
  await page.keyboard.press("Escape")
  await expect(settings).toHaveCount(0)
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await expect(page.getByTestId("grid-body")).toBeFocused()

  // The gear is a toggle: again opens, again closes.
  await page.getByTestId("settings-button").click()
  await expect(settings).toBeVisible()
  await page.getByTestId("settings-button").click()
  await expect(settings).toHaveCount(0)
})

test("typing fetch leaves the background-fetch setting", async ({ page }) => {
  await page.keyboard.press("Control+Comma")
  const rows = page.locator('[data-testid^="settings-row-"]')
  expect(await rows.count()).toBeGreaterThan(10)

  await page.getByTestId("settings-search").fill("fetch")
  await expect(rows).toHaveCount(1)
  await expect(page.getByTestId("settings-row-behaviour.autoFetch")).toBeVisible()
  await expect(page.getByTestId("settings-count")).toHaveText("1 setting")
  // Only the section with a hit stays, in the list and in the contents.
  await expect(page.locator("section[id^='settings-']")).toHaveCount(1)
  await expect(page.getByTestId("settings-toc-behaviour")).toBeVisible()
  await expect(page.getByTestId("settings-toc-appearance")).toHaveCount(0)
  await expect(page.getByTestId("settings-toc-behaviour.confirmations")).toHaveCount(0)

  await page.getByTestId("settings-search").fill("no such setting anywhere")
  await expect(rows).toHaveCount(0)
  await expect(page.getByTestId("settings-empty")).toHaveText("No setting matches.")
  await expect(page.getByTestId("settings-count")).toHaveText("0 settings")
})

test("a change applies without Save and survives a reload; Reset puts it back", async ({ page }) => {
  await page.keyboard.press("Control+Comma")
  const row = page.getByTestId("settings-row-behaviour.autoFetch")
  await expect(row).toHaveAttribute("data-changed", "false")
  await page.getByTestId("settings-autofetch").selectOption({ label: "Every 5 minutes" })
  // No Save anywhere; the row shows the change and the store has it.
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0)
  await expect(row).toHaveAttribute("data-changed", "true")
  await expect(row).toContainText("changed")
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pg.behaviour") ?? "{}").autoFetchMinutes)).toBe(5)

  await page.reload()
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
  await page.keyboard.press("Control+Comma")
  await expect(page.getByTestId("settings-autofetch")).toHaveValue("5")
  await expect(row).toHaveAttribute("data-changed", "true")

  await page.getByTestId("settings-reset-behaviour.autoFetch").click()
  await expect(page.getByTestId("settings-autofetch")).toHaveValue("0")
  await expect(row).toHaveAttribute("data-changed", "false")
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pg.behaviour") ?? "{}").autoFetchMinutes)).toBe(0)
})

test("Escape clears the search first, then closes the page", async ({ page }) => {
  await page.keyboard.press("Control+Comma")
  await page.getByTestId("settings-search").fill("editor")
  await expect(page.getByTestId("settings-row-appearance.theme")).toHaveCount(0)

  await page.keyboard.press("Escape")
  await expect(page.getByTestId("settings-search")).toHaveValue("")
  await expect(page.getByTestId("settings-page")).toBeVisible()
  await expect(page.getByTestId("settings-row-appearance.theme")).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(page.getByTestId("settings-page")).toHaveCount(0)
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
})

test("the contents column scrolls the list to a section and follows the scroll", async ({ page }) => {
  await page.keyboard.press("Control+Comma")
  await expect(page.getByTestId("settings-toc-appearance")).toHaveAttribute("aria-current", "true")
  await page.getByTestId("settings-toc-diagnostics.recovery").click()
  const list = page.getByTestId("settings-list")
  const listBox = (await list.boundingBox())!
  const rowBox = (await page.getByTestId("settings-row-diagnostics.recovery").boundingBox())!
  expect(rowBox.y).toBeGreaterThanOrEqual(listBox.y - 1)
  expect(rowBox.y).toBeLessThan(listBox.y + 60)
  await expect(page.getByTestId("settings-toc-diagnostics")).toHaveAttribute("aria-current", "true")
  await expect(page.getByTestId("settings-toc-appearance")).not.toHaveAttribute("aria-current", "true")
})
