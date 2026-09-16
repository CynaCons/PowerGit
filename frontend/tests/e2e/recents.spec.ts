import { expect, test, type Page } from "@playwright/test"
import { basename } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"
import { currentRepoPath, makeRepo, openRepoOnEngine, removeRepo } from "../repoFixture"

// Owner (2026-09-08): "the recent repositories seem not persistent ... a
// small cross icon on the top right of the cards, to be able to remove
// them". They were persistent on disk; the page only asked for them once a
// repository had loaded (v0.15.2).
//
// Owner (2026-09-15): "can we run /frontend-design on the Recent
// Repositories overlay? Show me visual prototypes to improve that UI" →
// "ok for C" (docs/prototypes/recents.html, v0.18.7): a search box with the
// focus, a grid of tiles with an initials disc and the branch chip, keys
// (1–9, arrows, Enter) and a cross that offers Undo instead of a confirm.
//
// Owner (2026-09-16): "the scale and size of the overlay is not good. We
// need to rework that. Should be centered, and larger so that we can
// actually read the stuff on the cards" (v0.18.9): the paper is centred and
// sized to the window, the tiles are 340 px or wider and a 20-character
// name shows whole.

async function openOnEngine(path: string): Promise<{ id: string }> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error(`failed to open ${path}: http ${res.status}`)
  return (await res.json()) as { id: string }
}

/** What the engine's recents.json lists, lower-cased for the comparison. */
async function recentRoots(): Promise<string[]> {
  const res = await fetch(`${ENGINE_URL}/repos/recents`, { headers: engineHeaders() })
  return ((await res.json()) as { root: string }[]).map((r) => r.root.toLowerCase())
}

test.describe("recent repositories picker", () => {
  let previousRepo: string | null = null
  let a = ""
  let b = ""
  let bId = ""
  // Four more, older than A and B, for the sizing tests: a filter on
  // "pg-grid-" shows exactly these, one of them with a 20-character name
  // (mkdtemp adds six characters to "pg-grid-twenty").
  let grid: string[] = []
  const tileOf = (page: Page, dir: string) => page.getByTestId("recent-card").filter({ hasText: basename(dir) })

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    grid = ["pg-grid-1-", "pg-grid-2-", "pg-grid-3-", "pg-grid-twenty"].map(makeRepo)
    for (const dir of grid) await openOnEngine(dir)
    a = makeRepo("pg-recent-a-")
    b = makeRepo("pg-recent-b-")
    // Newest first on the engine: B then A, so the list reads A, B, then
    // whatever was open. The pages below pin B (or A) so the first tile is
    // never the repository that is open.
    bId = (await openOnEngine(b)).id
    await openOnEngine(a)
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(a)
    await removeRepo(b)
    for (const dir of grid) await removeRepo(dir)
  })

  test("the picker opens with the filter focused; every tile has a disc with the initials and the branch chip; 1 opens the first", async ({
    page,
  }) => {
    await page.goto(`/?repo=${bId}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })

    await page.getByTestId("recents-button").click()
    await expect(page.getByTestId("recents-filter")).toBeFocused()

    const tileA = tileOf(page, a)
    await expect(tileA).toHaveCount(1)
    // "pg-recent-a-…" → the first two words' initials, as the author discs do.
    await expect(tileA.getByTestId("recent-disc")).toHaveText("PR")
    await expect(tileA.getByTestId("recent-branch")).toHaveText("main")
    await expect(tileA.getByTestId("recent-path")).toHaveAttribute("title", a)
    // The open repository says so on its tile rather than pretending it can be reopened.
    await expect(tileOf(page, b).getByTestId("recent-open-now")).toHaveText("open now")
    await expect(tileA.getByTestId("recent-open-now")).toHaveCount(0)

    // A is the newest, so it is tile 1.
    await page.keyboard.press("1")
    await expect(page.getByTestId("recents-picker")).toHaveCount(0)
    await expect(page.getByTestId("title-strip")).toContainText(basename(a), { timeout: 30_000 })
  })

  test("typing part of a path leaves only the matching tiles with the match highlighted; ArrowDown then Enter opens the second", async ({
    page,
  }) => {
    // The engine's current repository is A (opened last, or by the test above).
    await page.goto("/")
    await expect(page.getByTestId("title-strip")).toContainText(basename(a), { timeout: 30_000 })

    await page.getByTestId("recents-button").click()
    const filter = page.getByTestId("recents-filter")
    await filter.fill("pg-recent-")
    const tiles = page.getByTestId("recent-card")
    await expect(tiles).toHaveCount(2)
    await expect(tiles.nth(0).getByTestId("recent-match").first()).toHaveText("pg-recent-")
    await expect(tiles.nth(1).getByTestId("recent-match").first()).toHaveText("pg-recent-")
    await expect(page.getByTestId("recents-count")).toHaveText(/^2 of \d+$/)

    await filter.fill("nothing-like-this")
    await expect(page.getByTestId("recents-empty")).toContainText('Nothing matches "nothing-like-this"')
    // Escape clears the filter first; the picker stays.
    await page.keyboard.press("Escape")
    await expect(filter).toHaveValue("")
    await expect(page.getByTestId("recents-picker")).toBeVisible()

    await filter.fill("pg-recent-")
    await expect(tiles).toHaveCount(2)
    await expect(tiles.nth(0)).toHaveAttribute("data-cursor", "true")
    // A row is three tiles; from the first of two the cursor lands on the last.
    await page.keyboard.press("ArrowDown")
    await expect(tiles.nth(1)).toHaveAttribute("data-cursor", "true")
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("recents-picker")).toHaveCount(0)
    await expect(page.getByTestId("title-strip")).toContainText(basename(b), { timeout: 30_000 })
  })

  test("the picker opens centred, 1120 px wide on a large screen and the window minus 96 px on a small one; a tile is at least 340 px wide", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("grid-row").first().waitFor({ timeout: 30_000 })
    // min(1120px, 100vw − 96px): the cap until 1216 px, the window's width
    // minus the margins below it.
    for (const [width, height, paperWidth] of [
      [1920, 1080, 1120],
      [1280, 720, 1120],
      [1100, 700, 1004],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.getByTestId("recents-button").click()
      await expect(page.getByTestId("recent-card").first()).toBeVisible()
      // The paper is the picker's parent (MUI puts the dialog's children straight into it).
      const paper = (await page.getByTestId("recents-picker").locator("..").boundingBox())!
      expect(Math.round(paper.width), `paper width at ${width}`).toBe(paperWidth)
      expect(Math.abs(paper.x + paper.width / 2 - width / 2), `x centre at ${width}`).toBeLessThanOrEqual(2)
      expect(Math.abs(paper.y + paper.height / 2 - height / 2), `y centre at ${height}`).toBeLessThanOrEqual(2)
      const tile = (await page.getByTestId("recent-card").first().boundingBox())!
      expect(tile.width, `tile width at ${width}`).toBeGreaterThanOrEqual(340)
      await page.keyboard.press("Escape")
      await expect(page.getByTestId("recents-picker")).toHaveCount(0)
    }
  })

  test("a 20-character name shows whole at 1280×720; ArrowDown moves the cursor by exactly one visual row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto("/")
    await page.getByTestId("grid-row").first().waitFor({ timeout: 30_000 })
    await page.getByTestId("recents-button").click()
    await page.getByTestId("recents-filter").fill("pg-grid-")
    const tiles = page.getByTestId("recent-card")
    await expect(tiles).toHaveCount(grid.length)

    const twenty = grid[3]
    expect(basename(twenty)).toHaveLength(20)
    const name = tileOf(page, twenty).getByTestId("recent-name")
    await expect(name).toHaveText(basename(twenty))
    // No ellipsis: the text fits its box.
    const fit = await name.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }))
    expect(fit.scroll).toBeLessThanOrEqual(fit.client)

    // The grid is auto-fill: the keys read the column count back from the
    // CSS. From the first tile, ArrowDown lands on the tile straight below —
    // the one whose index is the number of tiles on the first row.
    const boxes = await tiles.evaluateAll((els) =>
      els.map((el) => {
        const b = el.getBoundingClientRect()
        return { x: Math.round(b.x), y: Math.round(b.y) }
      }),
    )
    const perRow = boxes.filter((b) => b.y === boxes[0].y).length
    expect(perRow).toBeGreaterThanOrEqual(2)
    expect(perRow).toBeLessThan(boxes.length)
    await expect(tiles.nth(0)).toHaveAttribute("data-cursor", "true")
    await page.keyboard.press("ArrowDown")
    await expect(tiles.nth(perRow)).toHaveAttribute("data-cursor", "true")
    const first = (await tiles.nth(0).boundingBox())!
    const cursor = (await page.locator('[data-testid="recent-card"][data-cursor="true"]').boundingBox())!
    expect(Math.round(cursor.x - first.x)).toBe(0)
    // One row down: the tile's height plus the hairline gap.
    expect(Math.round(cursor.y - first.y)).toBe(Math.round(first.height) + 1)
  })

  test("the cross hides the tile and the footer offers Undo; Undo brings it back; five seconds later it is gone for good", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByTestId("grid-row").first().waitFor({ timeout: 30_000 })

    await page.getByTestId("recents-button").click()
    const tileA = tileOf(page, a)
    await expect(tileA).toHaveCount(1)
    // The cross shows on hover (and on the cursor tile).
    await tileA.hover()
    await tileA.getByTestId("recent-forget").click()
    await expect(tileA).toHaveCount(0)
    await expect(page.getByTestId("recents-removed")).toContainText(`Removed ${basename(a)}`)

    await page.getByTestId("recents-undo").click()
    await expect(tileA).toHaveCount(1)
    await expect(page.getByTestId("recents-count")).toBeVisible()
    expect(await recentRoots()).toContain(a.toLowerCase())

    // Now let the five seconds pass: Playwright's clock fakes the timer the
    // dialog arms after the click, and fastForward fires it.
    await page.clock.install()
    await tileA.hover()
    await tileA.getByTestId("recent-forget").click()
    await expect(tileA).toHaveCount(0)
    await page.clock.fastForward(5_000)
    await expect(page.getByTestId("recents-count")).toBeVisible()
    await expect.poll(recentRoots).not.toContain(a.toLowerCase())
    await expect(tileA).toHaveCount(0)
  })
})
