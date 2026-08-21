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
