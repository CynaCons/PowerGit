import { expect, test } from "@playwright/test"

// Owner (2026-09-08): "The columns that we have in the main graph view,
// should be resizeable" and "the git graph may sometimes be larger than the
// allocated column space ... a discreet scroll bar at the bottom of that
// column ... shift scroll to scroll left or right in the column".

async function cellWidth(page: import("@playwright/test").Page, cls: string): Promise<number> {
  const box = await page.locator(`[data-testid="grid-row"] .${cls}`).first().boundingBox()
  return box!.width
}

async function drag(page: import("@playwright/test").Page, testid: string, dx: number) {
  const handle = page.getByTestId(testid)
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx / 2, y)
  await page.mouse.move(x + dx, y)
  await page.mouse.up()
}

test("dragging a header handle resizes the column and the width survives a reload", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("grid-row").first().waitFor()
  const before = await cellWidth(page, "author")
  await drag(page, "col-resize-author", 60)
  const after = await cellWidth(page, "author")
  expect(Math.round(after - before)).toBe(60)

  await page.reload()
  await page.getByTestId("grid-row").first().waitFor()
  expect(Math.round(await cellWidth(page, "author"))).toBe(Math.round(after))
  // Double-click restores the default.
  await page.getByTestId("col-resize-author").dblclick()
  expect(Math.round(await cellWidth(page, "author"))).toBe(Math.round(before))
})

test("a graph wider than its column gets a scrollbar that Shift+wheel drives", async ({ page }) => {
  await page.goto("/")
  await page.getByTestId("grid-row").first().waitFor()
  const graph = await cellWidth(page, "graph-cell")
  // Narrow the graph column to a fraction of its natural width.
  await drag(page, "col-resize-graph", -(graph - 30))
  const bar = page.getByTestId("graph-scrollbar")
  await expect(bar).toBeVisible()
  const canvas = page.getByTestId("graph-canvas")
  expect(Math.round((await canvas.boundingBox())!.width)).toBeLessThanOrEqual(31)

  const body = page.getByTestId("grid-body")
  const box = (await body.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  const topBefore = await body.evaluate((el) => el.scrollTop)
  await page.keyboard.down("Shift")
  await page.mouse.wheel(0, 40)
  await page.keyboard.up("Shift")
  await expect.poll(() => bar.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
  // Shift+wheel moved the graph, not the rows.
  expect(await body.evaluate((el) => el.scrollTop)).toBe(topBefore)

  await page.getByTestId("col-resize-graph").dblclick()
  await expect(bar).toBeHidden()
})
