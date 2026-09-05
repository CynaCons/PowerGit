import { expect, test, type Page } from "@playwright/test"

// Owner report, 2026-09-05 (first raised against v0.12.1, repeated since):
//   "commits disappear when they are selected"
// The commit node and lane lines live on the graph canvas; the DOM row sits
// above it. From v0.12.1 the selected row (and the hovered row) painted an
// opaque background across the whole row, graph column included, so the
// selected commit's node vanished. Every earlier test asserted classes and
// computed styles on the DOM row, which cannot see the canvas underneath.
// This spec asserts what the owner sees: the composited pixels of the graph
// column on the selected row, in both themes and at two zoom levels.

type Top = Array<[string, number]>

async function topColours(page: Page, clip: { x: number; y: number; width: number; height: number }): Promise<Top> {
  const png = (await page.screenshot({ clip })).toString("base64")
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const canvas = document.createElement("canvas")
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    const counts = new Map<string, number>()
    for (let i = 0; i < data.length; i += 4) {
      const key = [data[i], data[i + 1], data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join("")
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, png)
}

async function graphClipOf(page: Page, row: ReturnType<Page["locator"]>) {
  const box = (await row.boundingBox())!
  const graphWidth = await page.getByTestId("graph-canvas").evaluate((el) => el.getBoundingClientRect().width)
  // Skip the 2px selection border at the left edge and 1px at top/bottom so
  // only the lane/node area is sampled.
  return { x: box.x + 3, y: box.y + 1, width: Math.max(8, graphWidth - 3), height: box.height - 2 }
}

function pixelsNotIn(top: Top, excluded: Set<string>): number {
  return top.filter(([colour]) => !excluded.has(colour)).reduce((n, [, count]) => n + count, 0)
}

async function tokens(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const norm = (v: string) => v.trim().replace("#", "").toLowerCase()
    return {
      selection: norm(style.getPropertyValue("--pg-grid-sel")),
      hover: norm(style.getPropertyValue("--pg-grid-hover")),
      surface: norm(style.getPropertyValue("--pg-surface")),
    }
  })
}

for (const theme of ["light", "dark"] as const) {
  for (const zoom of [1, 1.5] as const) {
    test(`the selected commit keeps its graph node (${theme}, ${zoom * 100}%)`, async ({ page }) => {
      await page.addInitScript(
        ({ theme, zoom }) => {
          window.localStorage.setItem("pg.theme", theme)
          window.localStorage.setItem("pg.zoom", String(zoom))
        },
        { theme, zoom },
      )
      await page.goto("/")
      const rows = page.getByTestId("grid-row")
      await expect(rows.nth(4)).toBeVisible({ timeout: 30_000 })
      const t = await tokens(page)
      expect(t.selection, "selection token resolved").toMatch(/^[0-9a-f]{6}$/)

      // Reference: an unselected row shows graph ink (lane lines and/or a
      // node) in its graph column.
      const reference = rows.nth(1)
      const referenceInk = pixelsNotIn(await topColours(page, await graphClipOf(page, reference)), new Set([t.surface]))
      expect(referenceInk, "an unselected row paints graph ink").toBeGreaterThan(20)

      // Click a row and move the pointer away so hover cannot mask the result.
      const target = rows.nth(2)
      await target.click()
      await expect(target).toHaveClass(/selected/)
      await page.mouse.move(5, 5)
      const clip = await graphClipOf(page, target)
      const top = await topColours(page, clip)
      const selectionPixels = top.find(([colour]) => colour === t.selection)?.[1] ?? 0
      expect(selectionPixels, "the selection band is painted behind the graph").toBeGreaterThan(100)
      const ink = pixelsNotIn(top, new Set([t.selection, t.surface]))
      expect(
        ink,
        `the selected row still shows its commit node and lanes (top colours: ${JSON.stringify(top.slice(0, 5))})`,
      ).toBeGreaterThan(20)

      // Hovering another row must not erase its graph either.
      const hovered = rows.nth(4)
      await hovered.hover()
      const hoverTop = await topColours(page, await graphClipOf(page, hovered))
      const hoverInk = pixelsNotIn(hoverTop, new Set([t.selection, t.surface, t.hover]))
      // The hover tint is translucent, so lane ink shifts colour but stays
      // distinct from the flat tint and surface.
      expect(hoverInk, "a hovered row still shows its graph").toBeGreaterThan(20)
    })
  }
}
