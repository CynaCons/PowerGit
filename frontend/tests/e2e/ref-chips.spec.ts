import { expect, test, type Locator, type Page } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner, 2026-09-15 (v0.18.3):
//   "All branches should be displayed. If there are too many, we need a way
//   to either show a popup to view them all, or expand vertically the
//   column. When I click on a commit and view the Commit summary in the
//   bottom panel, I should see the active branches / tags on this commit,
//   with the icon to differentiate the local and remote. When my head is on
//   a commit that has both local and remote branches, I shall see all these
//   on the commit."
// Picks: the row grows (variant B), chips under the subject (variant A).
// Before this, a row showed three chips and clipped the group at 46 % of
// the column, so the HEAD row lost its remote and its tag; the Commit tab
// showed no ref at all.
//
// The lanes live on the canvas under the DOM rows, so the expanded row's
// graph is proven by sampling the composited pixels, as
// selected-row-graph.spec.ts does.

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

/** The lane/node area of a row's graph column: past the 2 px selection
 *  border, and `from`..`to` of the row's height (fractions). */
async function graphClipOf(page: Page, row: Locator, from = 0, to = 1) {
  const box = (await row.boundingBox())!
  const graphWidth = await page.getByTestId("graph-canvas").evaluate((el) => el.getBoundingClientRect().width)
  const y0 = box.y + Math.max(1, Math.round(box.height * from))
  const y1 = box.y + Math.min(box.height - 1, Math.round(box.height * to))
  return { x: box.x + 3, y: y0, width: Math.max(8, graphWidth - 3), height: Math.max(1, y1 - y0) }
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

test.describe("every ref on its row, and in the Commit tab", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    // base ← many (eight refs: five branches, two remote-tracking, a tag)
    // ← top (HEAD: main, origin/main and a tag). The eight-ref commit sits
    // between two others so a lane runs through its row.
    repoDir = makeRepo("pg-refchips-")
    git(repoDir, "remote", "add", "origin", repoDir)
    write(repoDir, "b.txt", "b\n")
    commit(repoDir, "many refs")
    for (const name of ["alpha", "beta", "gamma", "delta", "epsilon"]) git(repoDir, "branch", name)
    git(repoDir, "update-ref", "refs/remotes/origin/alpha", "HEAD")
    git(repoDir, "update-ref", "refs/remotes/origin/beta", "HEAD")
    git(repoDir, "tag", "v0.1")
    write(repoDir, "c.txt", "c\n")
    commit(repoDir, "top")
    git(repoDir, "update-ref", "refs/remotes/origin/main", "HEAD")
    git(repoDir, "tag", "v0.2")
    await openRepoOnEngine(repoDir)
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  const open = async (page: Page) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    // The chips classify against the ref tree (tags, remote names); wait
    // for it so a tag is a tag and not a local branch.
    await expect(page.locator('[data-testid="tree-row"][data-label="v0.2"]')).toBeVisible()
  }

  test("when my head is on a commit that has both local and remote branches, I shall see all these on the commit", async ({
    page,
  }) => {
    await open(page)
    const head = page.locator('[data-testid="grid-row"]:has([data-ref="HEAD"])').first()
    await expect(head.locator('[data-ref="HEAD"]')).toHaveAttribute("data-ref-kind", "head")
    // The local branch with the fork glyph, the remote one with the cloud.
    const local = head.locator('[data-ref="main"]')
    await expect(local).toHaveAttribute("data-ref-kind", "local")
    await expect(local.locator("svg")).toHaveCount(1)
    const remote = head.locator('[data-ref="origin/main"]')
    await expect(remote).toHaveAttribute("data-ref-kind", "remote")
    await expect(remote.locator("svg")).toHaveCount(1)
    // The fold is measured in the chip font, so whether the tag still fits
    // at 1280 px depends on the machine's fonts: none folded on Windows, the
    // Ubuntu runner's wider fallback folds the last chip into "+1". Either
    // way the group names every ref, and the tag is there once expanded
    // (v0.18.19: the spec had assumed Windows metrics).
    await expect(head.locator(".msg-refs")).toHaveAttribute("title", "HEAD, main, origin/main, v0.2")
    const more = head.getByTestId("ref-more")
    if ((await more.count()) > 0) await more.click()
    await expect(head.locator('[data-ref="v0.2"]')).toHaveAttribute("data-ref-kind", "tag")
  })

  test("if there are too many, expand vertically the column: +n grows the row, every chip shows, the lanes keep drawing, − folds it", async ({
    page,
  }) => {
    await open(page)
    const t = await tokens(page)
    const row = page.locator('[data-testid="grid-row"]:has([data-ref="alpha"])').first()
    const more = row.getByTestId("ref-more")
    await expect(more).toHaveText(/^\+\d+$/)
    // "+n" names what it folds; the row's group names everything.
    await expect(more).toHaveAttribute("title", /gamma/)
    const before = (await row.boundingBox())!.height
    expect(Math.round(before)).toBe(28)

    await more.click()
    await expect(row).toHaveClass(/expanded/)
    await expect(row).toHaveClass(/selected/)
    await expect(row.locator("[data-ref]")).toHaveCount(8)
    await expect(row.getByTestId("ref-more")).toHaveCount(0)
    await expect.poll(async () => (await row.boundingBox())!.height).toBeGreaterThan(28)
    // The row below moved down by the same amount: no overlap.
    const box = (await row.boundingBox())!
    const index = Number(await row.getAttribute("data-index"))
    const next = page.locator(`[data-testid="grid-row"][data-index="${index + 1}"]`)
    expect(Math.round((await next.boundingBox())!.y)).toBe(Math.round(box.y + box.height))
    // The selection band (the text cells' tint) fills the taller row.
    expect(Math.round((await row.locator(".author").boundingBox())!.height)).toBe(Math.round(box.height))

    // The graph through the taller row: the lane enters at the top, the
    // node sits at the middle, the lane leaves at the bottom. Pixels, not
    // classes: the canvas is under the DOM row.
    await page.mouse.move(5, 5)
    const excluded = new Set([t.selection, t.surface, t.hover])
    const whole = pixelsNotIn(await topColours(page, await graphClipOf(page, row)), excluded)
    expect(whole, "the expanded row paints its node and lanes").toBeGreaterThan(100)
    const top = pixelsNotIn(await topColours(page, await graphClipOf(page, row, 0, 0.15)), excluded)
    expect(top, "a lane enters the expanded row from above").toBeGreaterThan(4)
    const middle = pixelsNotIn(await topColours(page, await graphClipOf(page, row, 0.4, 0.6)), excluded)
    expect(middle, "the node sits at the row's middle").toBeGreaterThan(20)
    const bottom = pixelsNotIn(await topColours(page, await graphClipOf(page, row, 0.85, 1)), excluded)
    expect(bottom, "the lane leaves the expanded row below").toBeGreaterThan(4)

    await row.getByTestId("ref-fold").click()
    await expect(row).not.toHaveClass(/expanded/)
    await expect.poll(async () => Math.round((await row.boundingBox())!.height)).toBe(28)
    await expect(row.getByTestId("ref-more")).toBeVisible()
  })

  test("I should see the active branches / tags on this commit, with the icon to differentiate the local and remote", async ({
    page,
  }) => {
    await open(page)
    await page.locator('[data-testid="grid-row"]:has([data-ref="HEAD"])').first().click()
    const refs = page.getByTestId("commit-refs")
    await expect(refs).toBeVisible()
    await expect(refs.locator("[data-ref]")).toHaveText(["HEAD", "main", "origin/main", "v0.2"])
    const local = refs.locator('[data-ref="main"]')
    await expect(local).toHaveAttribute("data-ref-kind", "local")
    await expect(local.locator("svg")).toHaveCount(1)
    const remote = refs.locator('[data-ref="origin/main"]')
    await expect(remote).toHaveAttribute("data-ref-kind", "remote")
    await expect(remote.locator("svg")).toHaveCount(1)
    await expect(refs.locator('[data-ref="v0.2"]')).toHaveAttribute("data-ref-kind", "tag")
    // Right-click is the ref menu the grid's chips open.
    await remote.click({ button: "right" })
    await expect(page.getByTestId("refctx-checkout")).toBeVisible()
    await page.keyboard.press("Escape")

    // A commit without refs has no Refs row.
    await page.locator('[data-testid="grid-row"]').last().click()
    await expect(page.getByTestId("commit-info")).toContainText("base")
    await expect(page.getByTestId("commit-refs")).toHaveCount(0)
  })
})
