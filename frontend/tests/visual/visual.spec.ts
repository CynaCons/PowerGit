import { expect, test, type Page } from "@playwright/test"

// Pixel baselines, on demand and per area — never the whole suite on CI.
//   npm run test:visual -- --grep @grid      (also @bottom, @dialogs, @themes)
//   npm run test:visual:update -- --grep @grid   seeds/refreshes baselines
// Baselines are per platform (Playwright appends -win32 / -linux); look at
// the diff images before accepting a new baseline. Owner report 2026-09-05:
// the selected commit's graph node was hidden for five releases while every
// DOM-level assertion stayed green; @grid exists so that class of defect has
// a picture in review.

async function ready(page: Page) {
  await page.goto("/")
  const rows = page.getByTestId("grid-row")
  await expect(rows.nth(8)).toBeVisible({ timeout: 30_000 })
  await page.mouse.move(5, 5)
  return rows
}

function appearance(page: Page, theme: "light" | "dark", zoom = 1) {
  return page.addInitScript(
    ({ theme, zoom }) => {
      window.localStorage.setItem("pg.theme", theme)
      window.localStorage.setItem("pg.zoom", String(zoom))
    },
    { theme, zoom },
  )
}

test.describe("@grid", () => {
  test("selected and hovered rows keep their graph", async ({ page }) => {
    await appearance(page, "light")
    const rows = await ready(page)
    await rows.nth(3).click()
    await expect(rows.nth(3)).toHaveClass(/selected/)
    await rows.nth(6).hover()
    await expect(page.getByTestId("revision-grid")).toHaveScreenshot("grid-selected-hovered.png")
  })

  test("selected row at 150 % zoom", async ({ page }) => {
    await appearance(page, "light", 1.5)
    const rows = await ready(page)
    await rows.nth(2).click()
    await expect(rows.nth(2)).toHaveClass(/selected/)
    await page.mouse.move(5, 5)
    await expect(page.getByTestId("revision-grid")).toHaveScreenshot("grid-selected-zoom150.png")
  })
})

test.describe("@themes", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`shell in ${theme}`, async ({ page }) => {
      await appearance(page, theme)
      const rows = await ready(page)
      await rows.nth(3).click()
      await page.mouse.move(5, 5)
      await expect(page.getByTestId("browse-shell")).toHaveScreenshot(`shell-${theme}.png`)
    })
  }
})

test.describe("@bottom", () => {
  test("commit, diff and file tree tabs", async ({ page }) => {
    await appearance(page, "light")
    const rows = await ready(page)
    await rows.nth(3).click()
    const panel = page.getByTestId("bottom-panel")
    await expect(page.getByTestId("commit-loading")).toHaveCount(0, { timeout: 15_000 })
    await expect(panel).toHaveScreenshot("bottom-commit.png")
    await page.getByRole("tab", { name: /^Diff/ }).click()
    await expect(page.getByTestId("diff-loading")).toHaveCount(0, { timeout: 15_000 })
    await expect(panel).toHaveScreenshot("bottom-diff.png")
    await page.getByRole("tab", { name: "File Tree" }).click()
    await expect(panel).toHaveScreenshot("bottom-tree.png")
  })
})

test.describe("@dialogs", () => {
  test("commit overlay and settings", async ({ page }) => {
    await appearance(page, "light")
    await ready(page)
    await page.keyboard.press("Control+Space")
    await expect(page.getByTestId("commit-overlay")).toBeVisible()
    await expect(page).toHaveScreenshot("dialog-commit.png")
    await page.keyboard.press("Escape")
    await page.keyboard.press("Control+Comma")
    await expect(page.getByRole("dialog")).toBeVisible()
    await expect(page).toHaveScreenshot("dialog-settings.png")
  })
})
