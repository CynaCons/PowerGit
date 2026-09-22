import { expect, test, type Page } from "@playwright/test"

// Owner report, 2026-09-22, on the v0.20.4 window:
//   "I think we're missing a bit of contrast and separators in the app.
//    Right now its all just white and its hard to distinguish the different
//    parts."
// He picked prototype D of docs/prototypes/contrast.html — "I like the cards
// best" — so every pane is a card on a desk. Whether two panes read apart is
// not something a class or a borderColor can answer: what answers it is the
// strip of pixels between them, which has to be the desk and not more paper.

type Top = Array<[string, number]>
type Clip = { x: number; y: number; width: number; height: number }

async function topColours(page: Page, clip: Clip): Promise<Top> {
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
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, png)
}

async function tokens(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const norm = (v: string) => v.trim().replace("#", "").toLowerCase()
    return {
      desk: norm(style.getPropertyValue("--pg-surface-alt")),
      paper: norm(style.getPropertyValue("--pg-surface")),
    }
  })
}

/** Per-channel distance between two "rrggbb" strings. */
function apart(a: string, b: string): number {
  const channels = (hex: string) => [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  const [x, y] = [channels(a), channels(b)]
  return Math.max(...x.map((v, i) => Math.abs(v - y[i])))
}

for (const theme of ["light", "dark"] as const) {
  for (const zoom of [1, 1.5] as const) {
    test(`every pane is a card with the desk showing between them (${theme}, ${zoom * 100}%)`, async ({ page }) => {
      await page.addInitScript(
        ({ theme, zoom }) => {
          window.localStorage.setItem("pg.theme", theme)
          window.localStorage.setItem("pg.zoom", String(zoom))
        },
        { theme, zoom },
      )
      await page.goto("/")
      await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
      const t = await tokens(page)
      expect(t.desk, "the desk token resolved").toMatch(/^[0-9a-f]{6}$/)
      // The desk is a step off the paper, or there is nothing to see.
      expect(apart(t.desk, t.paper), "the desk is a step off a pane").toBeGreaterThanOrEqual(8)

      const rail = (await page.getByTestId("navrail").boundingBox())!
      // At 150 % the content area is narrow enough that the tree comes back
      // as its collapsed strip; that is a card on the desk too.
      const treePane = (await page.getByTestId("left-panel").count())
        ? page.getByTestId("left-panel")
        : page.getByTestId("left-panel-collapsed")
      const tree = (await treePane.boundingBox())!
      const splitter = (await page.getByTestId("panel-splitter").boundingBox())!

      // 1. A gutter between the rail and the tree, and it shows the desk.
      const sideways = tree.x - (rail.x + rail.width)
      expect(sideways, "a gutter between the rail and the tree").toBeGreaterThanOrEqual(4)
      // 2. The bottom splitter is that same gutter, lying down.
      expect(splitter.height, "a gutter between the history and the commit panel").toBeGreaterThanOrEqual(4)

      for (const [what, clip] of [
        ["between the rail and the tree", { x: rail.x + rail.width + 1, y: tree.y + 60, width: 1, height: 80 }],
        ["between the history and the commit panel", { x: splitter.x + 60, y: splitter.y + 1, width: 120, height: 1 }],
      ] as Array<[string, Clip]>) {
        const top = await topColours(page, clip)
        const seen = JSON.stringify(top.slice(0, 3))
        expect(apart(top[0][0], t.desk), `the gutter ${what} shows the desk (saw ${seen})`).toBeLessThanOrEqual(10)
        const paper = top.find(([colour]) => colour === t.paper)?.[1] ?? 0
        const total = top.reduce((n, [, count]) => n + count, 0)
        expect(paper / total, `the gutter ${what} is not more paper (saw ${seen})`).toBeLessThan(0.34)
      }
    })
  }
}
