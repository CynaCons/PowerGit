import { expect, test, type Page } from "@playwright/test"

// Owner-reported defects, v0.12.3:
//  - "the button bar at the top ... doesn't work well with smaller windows"
//  - "the progress indicator during a fetch is overlapping with the toolbar"
//  - "right click again somewhere else, it shows the browser right click menu"
//  - "I really want my Fetch All option"

async function boot(page: Page) {
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible()
}

// Rectangle overlap in CSS pixels, ignoring sub-pixel layout noise.
function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  const eps = 0.5
  return (
    a.x < b.x + b.width - eps && b.x < a.x + a.width - eps && a.y < b.y + b.height - eps && b.y < a.y + a.height - eps
  )
}

test.describe("toolbar at narrow widths", () => {
  test("collapses to icons, then to an overflow menu, and never clips a control", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await boot(page)

    const toolbar = page.getByTestId("toolbar")
    await expect(toolbar).toHaveAttribute("data-tier", "full")
    // At full width every secondary action is a labelled button.
    await expect(page.getByTestId("checkout-button")).toContainText("Checkout")
    await expect(page.getByTestId("toolbar-more")).toHaveCount(0)

    // Mid width: the buttons are still there but have shed their labels.
    await page.setViewportSize({ width: 900, height: 900 })
    await expect(toolbar).toHaveAttribute("data-tier", "compact")
    const checkout = page.getByTestId("checkout-button")
    await expect(checkout).toBeVisible()
    await expect(checkout).not.toContainText("Checkout")
    // The label has to survive somewhere reachable, or the icon is a riddle.
    await expect(checkout).toHaveAttribute("title", /Checkout/)

    // Narrow: the secondary group is gone from the bar and lives in "More".
    await page.setViewportSize({ width: 700, height: 900 })
    await expect(toolbar).toHaveAttribute("data-tier", "overflow")
    await expect(page.getByTestId("checkout-button")).toHaveCount(0)
    const more = page.getByTestId("toolbar-more")
    await expect(more).toBeVisible()
    await more.click()
    await expect(page.getByTestId("more-checkout")).toBeVisible()
    await expect(page.getByTestId("more-rebase")).toBeVisible()
    await expect(page.getByTestId("more-tag")).toBeVisible()
    await page.keyboard.press("Escape")

    // Whatever the tier, nothing may be pushed outside the toolbar box: the
    // failure mode being guarded is buttons silently clipped off the right
    // edge rather than collapsing.
    for (const width of [1440, 1100, 900, 780, 700, 620]) {
      await page.setViewportSize({ width, height: 900 })
      const bar = (await toolbar.boundingBox())!
      const strays = await page
        .getByTestId("toolbar")
        .locator("button:visible")
        .evaluateAll(
          (els, right: number) =>
            els
              .map((el) => ({
                label: el.getAttribute("aria-label") ?? el.textContent,
                r: el.getBoundingClientRect().right,
              }))
              .filter((b) => b.r > right + 1)
              .map((b) => b.label),
          bar.x + bar.width,
        )
      expect(strays, `controls clipped off the toolbar at ${width}px`).toEqual([])
    }
  })
})

test("the busy indicator sits beside the toolbar controls, never on top of them", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await boot(page)

  // Hold the fetch open long enough to observe the indicator: the route is
  // never fulfilled, so the app stays in its busy state.
  let release: () => void = () => {}
  const held = new Promise<void>((r) => (release = r))
  await page.route("**/fetch", async (route) => {
    await held
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "cancelled" }) })
  })

  await page.getByTestId("fetch-button").click()
  const progress = page.getByTestId("topbar-progress")
  await expect(progress).toBeVisible()

  const progressBox = (await progress.boundingBox())!
  const buttonBoxes = await page
    .getByTestId("toolbar")
    .locator("button:visible")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return {
          label: el.getAttribute("aria-label") ?? el.textContent,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        }
      }),
    )
  const collisions = buttonBoxes.filter((b) => overlaps(progressBox, b)).map((b) => b.label)
  expect(collisions, "busy indicator painted over toolbar buttons").toEqual([])

  release()
  await page
    .getByTestId("error-banner-close")
    .click()
    .catch(() => {})
})

test("Fetch all remotes is always offered", async ({ page }) => {
  await boot(page)
  // It used to appear only once a second remote existed, so a single-remote
  // clone — the common case — had no "Fetch all" at all.
  await page.getByTestId("fetch-button-menu").click()
  await expect(page.getByTestId("fetch-all")).toBeVisible()
  await page.keyboard.press("Escape")
})

test("right-clicking a second commit re-targets our menu instead of the browser's", async ({ page }) => {
  await boot(page)
  const rows = page.getByTestId("grid-row")
  const menu = page.locator("#revision-context-menu")

  await rows.nth(1).click({ button: "right" })
  await expect(menu).toBeVisible()
  const firstBox = (await menu.boundingBox())!

  // The regression: the MUI Menu's modal root covered the viewport, so this
  // second right-click landed on the backdrop rather than the row, closing
  // our menu and letting the WebView show its own.
  await rows.nth(5).click({ button: "right" })
  await expect(menu).toBeVisible()
  const secondBox = (await menu.boundingBox())!
  expect(secondBox.y).not.toBe(firstBox.y)
  await expect(rows.nth(5)).toHaveClass(/selected/)

  // And a right-click away from any row simply dismisses it.
  await page.getByTestId("toolbar").click({ button: "right" })
  await expect(menu).toHaveCount(0)
})

test("the default browser context menu is suppressed outside text fields", async ({ page }) => {
  await boot(page)
  const defaultPrevented = await page.evaluate(() => {
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    document.querySelector('[data-testid="grid-body"], [data-testid="browse-shell"]')!.dispatchEvent(ev)
    return ev.defaultPrevented
  })
  expect(defaultPrevented).toBe(true)
})
