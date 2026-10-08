import { expect, test, type Page } from "@playwright/test"

// v0.20.9: the graph canvas covers a window of rows around the rendered ones
// and is not redrawn until the scroll leaves it (owner's Ubuntu benchmark,
// 26–30 fps where a plain list ran at 60; hooks/useCanvasWindow.ts). What
// must not happen is a canvas that stops matching the rows: after a scroll
// inside the window, after one that leaves it, and after a far jump, every
// visible row still has its node painted on the canvas behind its graph cell.

/** For each fully visible row, whether the canvas has an opaque pixel on the
 *  row's centre line within the graph column (its node or a lane through it). */
async function nodesUnderRows(page: Page): Promise<boolean[]> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(".graph-canvas")!
    const body = document.querySelector<HTMLElement>('[data-testid="grid-body"]')!.getBoundingClientRect()
    const box = canvas.getBoundingClientRect()
    const scale = canvas.width / box.width
    const ctx = canvas.getContext("2d")!
    const rows = [...document.querySelectorAll<HTMLElement>('[data-testid="grid-row"]')]
      .map((r) => r.getBoundingClientRect())
      .filter((r) => r.top >= body.top && r.bottom <= body.bottom)
    return rows.map((r) => {
      const y = Math.round((r.top + r.height / 2 - box.top) * scale)
      if (y < 0 || y >= canvas.height) return false
      const line = ctx.getImageData(0, y, canvas.width, 1).data
      for (let i = 3; i < line.length; i += 4) if (line[i] > 200) return true
      return false
    })
  })
}

test("the canvas keeps matching the rows through scrolls inside, out of, and far beyond its window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto("/")
  const body = page.getByTestId("grid-body")
  await expect(page.getByTestId("grid-row").nth(20)).toBeVisible({ timeout: 30_000 })
  // The eager load fills in behind the first page; let it settle so the jump
  // below has somewhere to go.
  await expect.poll(() => body.evaluate((el) => el.scrollHeight / 28), { timeout: 60_000 }).toBeGreaterThan(2000)

  const check = async (label: string) => {
    await page.waitForTimeout(250)
    const under = await nodesUnderRows(page)
    expect(under.length, label).toBeGreaterThan(10)
    expect(under.every(Boolean), `${label}: rows without a node behind them: ${under.map(Number).join("")}`).toBe(true)
  }

  await check("at the top")
  // Inside the window: 10 rows, in small steps like a trackpad.
  for (let i = 0; i < 14; i++) await body.evaluate((el) => (el.scrollTop += 20))
  await check("after a scroll inside the window")
  // Out of it: 100 rows, continuously.
  for (let i = 0; i < 140; i++) await body.evaluate((el) => (el.scrollTop += 20))
  await check("after a scroll out of the window")
  // A far jump, like a scrollbar drag.
  await body.evaluate((el) => (el.scrollTop = 1500 * 28))
  await check("after a far jump")
  // And back to where it was before the jump, through the old window.
  await body.evaluate((el) => (el.scrollTop = 110 * 28))
  await check("after jumping back")
})
