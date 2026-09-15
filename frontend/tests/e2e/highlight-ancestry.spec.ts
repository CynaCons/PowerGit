import { expect, test, type Locator, type Page } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner, 2026-09-15 (v0.18.4):
//   "I want to be able to right click on a commit and hit Highlight
//   ancestry and then temporarily all the ancestry is highlighted like we
//   do for the current branch. This is temporary, and user should exit this
//   temporary to return to the normal highlighting where only the current
//   branch is highlighted."
// Git Extensions calls it "Highlight selected branch (until refresh)"
// (Ctrl+Shift+B, Alt+click). The highlight is on the graph canvas under the
// DOM rows, so the proof samples the composited pixels (the
// selected-row-graph.spec.ts pattern): with `side-2` as the root, the
// commits only HEAD reaches are painted in the non-relative grey and the
// root's own history keeps its lane colour; Exit, Esc and a second
// Ctrl+Shift+B bring the checked-out branch's highlight back.
//
// Fixture (newest first): after-merge (HEAD, main) → merge side → main-2 →
// side-2 (side) → side-1 → base.

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
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)
  }, png)
}

/** The lane/node area of a row's graph column, past the 2 px selection border. */
async function graphClip(page: Page, row: Locator) {
  const box = (await row.boundingBox())!
  const graphWidth = await page.getByTestId("graph-canvas").evaluate((el) => el.getBoundingClientRect().width)
  return { x: box.x + 3, y: box.y + 1, width: Math.max(8, graphWidth - 3), height: box.height - 2 }
}

const count = (top: Top, colour: string) => top.find(([c]) => c === colour)?.[1] ?? 0

async function tokens(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement)
    const norm = (v: string) => v.trim().replace("#", "").toLowerCase()
    return {
      grey: norm(style.getPropertyValue("--pg-lane-non-relative")),
      lanes: [1, 2, 3, 4, 5, 6, 7].map((i) => norm(style.getPropertyValue(`--pg-lane-${i}`))),
    }
  })
}

test.describe("highlight ancestry (until refresh)", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    repoDir = makeRepo("pg-ancestry-")
    git(repoDir, "checkout", "-q", "-b", "side")
    write(repoDir, "side.txt", "1\n")
    commit(repoDir, "side-1")
    write(repoDir, "side.txt", "2\n")
    commit(repoDir, "side-2")
    git(repoDir, "checkout", "-q", "main")
    write(repoDir, "a.txt", "main-2\n")
    commit(repoDir, "main-2")
    git(repoDir, "merge", "-q", "--no-ff", "-m", "merge side", "side")
    write(repoDir, "a.txt", "after\n")
    commit(repoDir, "after-merge")
    await openRepoOnEngine(repoDir)
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  type Grid = {
    t: Awaited<ReturnType<typeof tokens>>
    after: Locator
    side2: Locator
    side1: Locator
    laneInk: (top: Top) => number
    inkOf: (row: Locator) => Promise<{ grey: number; lane: number }>
  }

  const openGrid = async (page: Page): Promise<Grid> => {
    // The default options (dim on, ring on, all ancestors), whatever an
    // earlier spec left in localStorage.
    await page.addInitScript(() => localStorage.removeItem("pg.graph"))
    await page.goto("/")
    const rows = page.getByTestId("grid-row")
    await expect(rows).toHaveCount(6)
    await expect(rows.nth(0)).toContainText("after-merge")
    const t = await tokens(page)
    const laneInk = (top: Top) => t.lanes.reduce((n, c) => n + count(top, c), 0)
    const inkOf = async (row: Locator) => {
      const top = await topColours(page, await graphClip(page, row))
      return { grey: count(top, t.grey), lane: laneInk(top) }
    }
    return {
      t,
      after: rows.filter({ hasText: "after-merge" }),
      side2: rows.filter({ hasText: "side-2" }),
      side1: rows.filter({ hasText: "side-1" }),
      laneInk,
      inkOf,
    }
  }

  /** What the owner sees with `side-2` as the root: the commits only HEAD
   *  reaches are grey, the root's own history keeps its colour. */
  const expectSideHighlighted = async (g: Grid) => {
    await expect.poll(async () => g.inkOf(g.after)).toMatchObject({ lane: 0 })
    expect((await g.inkOf(g.after)).grey).toBeGreaterThan(10)
    expect((await g.inkOf(g.side1)).lane).toBeGreaterThan(10)
  }

  /** Back to the checked-out branch: HEAD's line is coloured again. */
  const expectHeadHighlighted = async (g: Grid) => {
    await expect.poll(async () => (await g.inkOf(g.after)).lane).toBeGreaterThan(10)
  }

  const highlightSide2FromMenu = async (page: Page, g: Grid) => {
    await g.side2.click({ button: "right" })
    await page.getByRole("menuitem", { name: "Highlight ancestry (until refresh)" }).click()
  }

  test("right click on a commit and hit Highlight ancestry, and then temporarily all the ancestry is highlighted like we do for the current branch", async ({
    page,
  }) => {
    const g = await openGrid(page)
    // The checked-out branch first: HEAD's row is coloured, nothing is temporary.
    await expectHeadHighlighted(g)
    await expect(page.getByTestId("graph-options-bar")).toHaveAttribute("data-ancestry", "false")

    await highlightSide2FromMenu(page, g)
    await expectSideHighlighted(g)

    // The pill is the mode's home: pinned open, the root's SHA and Exit.
    const bar = page.getByTestId("graph-options-bar")
    await expect(bar).toHaveAttribute("data-ancestry", "true")
    await expect(bar).toHaveAttribute("data-expanded", "true")
    const sha = (await g.side2.getByTestId("sha-cell").textContent())?.trim()
    expect(sha).toHaveLength(7)
    await expect(page.getByTestId("graph-ancestry-root")).toHaveText(sha!)
    await expect(page.getByTestId("graph-ancestry-exit")).toBeVisible()
    await expect(bar).not.toContainText("Checked-out branch")
    // Scope, Ring and Dim keep working on the temporary root.
    await expect(page.getByTestId("graph-scope-select")).toBeVisible()
    await expect(page.getByTestId("graph-dim-toggle")).toBeVisible()
    // Still pinned open with the pointer elsewhere.
    await page.mouse.move(5, 5)
    await expect(bar).toHaveAttribute("data-expanded", "true")
  })

  test("user should exit this temporary to return to the normal highlighting where only the current branch is highlighted", async ({
    page,
  }) => {
    const g = await openGrid(page)
    await highlightSide2FromMenu(page, g)
    await expectSideHighlighted(g)

    await page.getByTestId("graph-ancestry-exit").click()
    await expectHeadHighlighted(g)
    await expect(page.getByTestId("graph-ancestry-root")).toHaveCount(0)
    const bar = page.getByTestId("graph-options-bar")
    await expect(bar).toHaveAttribute("data-ancestry", "false")
    await expect(bar).toContainText("Checked-out branch")
    // The pill collapses again once the pointer leaves it.
    await page.mouse.move(5, 5)
    await expect(bar).toHaveAttribute("data-expanded", "false")
  })

  test("Alt+click on a commit sets the root again; Escape with the grid focused exits", async ({ page }) => {
    const g = await openGrid(page)
    await g.side2.click({ modifiers: ["Alt"] })
    await expect(g.side2).toHaveClass(/selected/)
    await expectSideHighlighted(g)
    await expect(page.getByTestId("graph-ancestry-root")).toBeVisible()

    await expect(page.getByTestId("grid-body")).toBeFocused()
    await page.keyboard.press("Escape")
    await expectHeadHighlighted(g)
    await expect(page.getByTestId("graph-ancestry-root")).toHaveCount(0)
  })

  test("Ctrl+Shift+B on the selected row sets the root; the same row again exits", async ({ page }) => {
    const g = await openGrid(page)
    await g.side2.click()
    await expect(g.side2).toHaveClass(/selected/)
    await page.keyboard.press("Control+Shift+B")
    await expectSideHighlighted(g)
    await expect(page.getByTestId("graph-ancestry-root")).toBeVisible()

    await page.keyboard.press("Control+Shift+B")
    await expectHeadHighlighted(g)
    await expect(page.getByTestId("graph-ancestry-root")).toHaveCount(0)
  })
})
