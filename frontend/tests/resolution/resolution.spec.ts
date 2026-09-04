import { expect, test } from "@playwright/test"

// The app must fill — and never overflow — the window at every supported
// resolution. Guards against clipped bottom panels and broken flex layouts,
// including maximized/fullscreen-sized windows.
const VIEWPORTS: { width: number; height: number; name: string }[] = [
  { width: 1280, height: 800, name: "laptop" },
  { width: 1600, height: 900, name: "hd-plus" },
  { width: 1920, height: 1080, name: "full-hd" },
  { width: 2560, height: 1440, name: "qhd" },
  { width: 3840, height: 2160, name: "4k-fullscreen" },
]

for (const vp of VIEWPORTS) {
  test(`[${vp.name}] shell fills viewport without overflow`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto("/")
    await expect(page.getByTestId("browse-shell")).toBeVisible()

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      body: document.body.scrollHeight - document.body.clientHeight,
    }))
    expect(overflow.doc, "document scrolls vertically").toBeLessThanOrEqual(0)
    expect(overflow.body, "body scrolls vertically").toBeLessThanOrEqual(0)

    const shell = await page.getByTestId("browse-shell").boundingBox()
    expect(shell).not.toBeNull()
    expect(Math.round(shell!.width)).toBe(vp.width)
    expect(Math.round(shell!.height)).toBe(vp.height)
  })

  test(`[${vp.name}] bottom panel fully visible and resizable`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto("/")
    const panel = page.getByTestId("bottom-panel")
    await expect(panel).toBeVisible()

    let box = (await panel.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height)

    const splitter = page.getByTestId("panel-splitter")
    const sbox = (await splitter.boundingBox())!
    await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2)
    await page.mouse.down()
    await page.mouse.move(sbox.x + sbox.width / 2, sbox.y - 80, { steps: 4 })
    await page.mouse.up()

    box = (await panel.boundingBox())!
    expect(box.height).toBeGreaterThan(120)
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
  })

  test(`[${vp.name}] left panel collapse/expand keeps layout intact`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto("/")
    await page.getByTestId("left-panel-collapse").click()
    await expect(page.getByTestId("left-panel-collapsed")).toBeVisible()
    const grid = page.getByTestId("revision-grid")
    await expect(grid).toBeVisible()
    const gbox = (await grid.boundingBox())!
    expect(gbox.x).toBeGreaterThan(0)
    expect(gbox.x + gbox.width).toBeLessThanOrEqual(vp.width)
    await page.getByTestId("left-panel-expand").click()
    await expect(page.getByTestId("left-panel")).toBeVisible()
  })
}

async function noDocumentOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    body: document.body.scrollHeight - document.body.clientHeight,
  }))
  expect(overflow.doc, "document scrolls vertically").toBeLessThanOrEqual(0)
  expect(overflow.body, "body scrolls vertically").toBeLessThanOrEqual(0)
}

test("[narrow] toolbar overflow keeps chrome in the viewport", async ({ page }) => {
  // Toolbar width < 790 (navrail 48px + ~740) is the overflow tier: labels
  // collapse into a More menu and the left panel auto-hides so the grid
  // keeps Author/Date/SHA. 800×600 is the smallest size we still call a
  // desktop window.
  await page.setViewportSize({ width: 800, height: 600 })
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  await expect(page.getByTestId("toolbar")).toHaveAttribute("data-tier", "overflow")
  await expect(page.getByTestId("toolbar-more")).toBeVisible()
  await expect(page.getByTestId("left-panel-collapsed")).toBeVisible()

  const toolbar = (await page.getByTestId("toolbar").boundingBox())!
  expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(800)
  expect(toolbar.y + toolbar.height).toBeLessThanOrEqual(600)

  const shell = (await page.getByTestId("browse-shell").boundingBox())!
  expect(Math.round(shell.width)).toBe(800)
  expect(Math.round(shell.height)).toBe(600)
  await noDocumentOverflow(page)
})

test("[laptop] pane minimums keep the grid and bottom panel usable", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  const left = (await page.getByTestId("left-panel").boundingBox())!
  expect(left.width).toBeGreaterThanOrEqual(200)

  const panel = page.getByTestId("bottom-panel")
  let box = (await panel.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(120)
  expect(box.y + box.height).toBeLessThanOrEqual(800)

  const splitter = page.getByTestId("panel-splitter")
  const sbox = (await splitter.boundingBox())!
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sbox.x + sbox.width / 2, sbox.y + 400, { steps: 4 })
  await page.mouse.up()

  box = (await panel.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(120)
  expect(box.y + box.height).toBeLessThanOrEqual(800)
})

test("[laptop] application zoom scales #root without overflowing or losing selection", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  await expect(page.getByTestId("browse-shell")).toBeVisible()
  const rows = page.getByTestId("grid-row")
  await expect(rows.first()).toBeVisible()
  await rows.nth(2).click()
  await expect(rows.nth(2)).toHaveClass(/selected/)

  const zoomOf = () => page.locator("#root").evaluate((el) => getComputedStyle(el).zoom)
  expect(await zoomOf()).toMatch(/^(1|100%)$/)

  await page.keyboard.press("Control+Equal")
  await expect.poll(zoomOf).toMatch(/^(1\.1|110%)$/)
  await expect(rows.nth(2)).toHaveClass(/selected/)
  await noDocumentOverflow(page)

  await page.keyboard.press("Control+0")
  await expect.poll(zoomOf).toMatch(/^(1|100%)$/)
  await expect(rows.nth(2)).toHaveClass(/selected/)
  await noDocumentOverflow(page)
})

for (const mode of ["light", "dark"] as const) {
  test(`[laptop] ${mode} theme paints without overflowing`, async ({ page }) => {
    await page.addInitScript((pref) => localStorage.setItem("pg.theme", pref), mode)
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto("/")
    await expect(page.getByTestId("browse-shell")).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode)
    const colorScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
    expect(colorScheme).toContain(mode)
    await noDocumentOverflow(page)
  })
}
