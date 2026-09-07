import { expect, test, type Page } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { ENGINE_URL, engineHeaders } from "../engine"

// Owner (2026-09-07): "better highlight all the ancestors of the currently
// checked-out branch ... to be able to better track the history of the
// currently checked-out branch and better see who merged what and when".
// What the owner sees is on the graph canvas, so this samples pixels
// (pattern: selected-row-graph.spec.ts). Fixture: main with a merged
// `feature` branch and an unmerged `wip` branch.

// Every commit gets its own timestamp so the engine's --date-order is
// deterministic: wip is the newest row (nothing runs through it from above).
let tick = 0
function git(cwd: string, ...args: string[]): void {
  const date = `2026-09-07T10:${String(tick++).padStart(2, "0")}:00+00:00`
  execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
    cwd,
    stdio: "pipe",
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
}

async function openRepoOnEngine(path: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error(`failed to open ${path}: http ${res.status}`)
}

async function currentRepoPath(): Promise<string | null> {
  const res = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  if (!res.ok) return null
  return ((await res.json()) as { root?: string }).root ?? null
}

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

async function graphClip(page: Page, row: ReturnType<Page["locator"]>) {
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
      head: norm(style.getPropertyValue("--pg-lane-head")),
      lanes: [1, 2, 3, 4, 5, 6, 7].map((i) => norm(style.getPropertyValue(`--pg-lane-${i}`))),
    }
  })
}

test.describe("checked-out branch history highlight", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    // The engine is shared by every spec: remember what it had open BEFORE
    // the first test swaps in the fixture, so afterAll hands it back.
    previousRepo = await currentRepoPath()
    repoDir = mkdtempSync(join(tmpdir(), "pg-highlight-"))
    git(repoDir, "init", "-q", "-b", "main")
    writeFileSync(join(repoDir, "a.txt"), "a\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "base")
    git(repoDir, "checkout", "-q", "-b", "feature")
    writeFileSync(join(repoDir, "feature.txt"), "f\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "feature work")
    git(repoDir, "checkout", "-q", "main")
    writeFileSync(join(repoDir, "a.txt"), "a\nmain\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "main work")
    git(repoDir, "merge", "-q", "--no-ff", "-m", "Merge branch 'feature'", "feature")
    git(repoDir, "checkout", "-q", "-b", "wip", "main~2")
    writeFileSync(join(repoDir, "wip.txt"), "w\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "unmerged wip")
    git(repoDir, "checkout", "-q", "main")
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    for (let attempt = 1; ; attempt++) {
      try {
        rmSync(repoDir, { recursive: true, force: true })
        break
      } catch (e) {
        if (attempt >= 5) throw e
        await new Promise((r) => setTimeout(r, 300 * attempt))
      }
    }
  })

  for (const theme of ["light", "dark"] as const) {
    test(`ancestors of HEAD keep their colour and ring; the unmerged branch is grey (${theme})`, async ({ page }) => {
      await openRepoOnEngine(repoDir)
      await page.addInitScript((t) => {
        localStorage.setItem("pg.theme", t)
        localStorage.removeItem("pg.graph")
      }, theme)
      await page.goto("/")
      const rows = page.getByTestId("grid-row")
      await expect(rows).toHaveCount(5)
      await expect(rows.nth(0)).toContainText("unmerged wip")
      const t = await tokens(page)
      const wip = rows.filter({ hasText: "unmerged wip" })
      const merge = rows.filter({ hasText: "Merge branch 'feature'" })
      const feature = rows.filter({ hasText: "feature work" })
      const laneInk = (top: Top) => t.lanes.reduce((n, c) => n + count(top, c), 0)

      // Dim: the unmerged commit is painted in the non-relative grey, no lane colour.
      const wipTop = await topColours(page, await graphClip(page, wip))
      expect(count(wipTop, t.grey)).toBeGreaterThan(10)
      expect(laneInk(wipTop)).toBe(0)

      // Ring: the merge (an ancestor, not HEAD) shows its lane colour and the head-outline colour.
      const mergeTop = await topColours(page, await graphClip(page, merge))
      expect(laneInk(mergeTop)).toBeGreaterThan(10)
      expect(count(mergeTop, t.head)).toBeGreaterThan(4)

      // First parent only: the merged feature commit's node turns grey (the
      // mainline's line still runs through that row, so grey must rise by
      // about a node's worth of pixels rather than lane ink vanish), while
      // the merge itself stays coloured.
      const greyBefore = count(await topColours(page, await graphClip(page, feature)), t.grey)
      await page.getByTestId("graph-options-bar").hover()
      await page.getByTestId("graph-scope-select").click()
      await page.getByRole("option", { name: "First parent only" }).click()
      await expect
        .poll(async () => count(await topColours(page, await graphClip(page, feature)), t.grey))
        .toBeGreaterThan(greyBefore + 30)
      expect(laneInk(await topColours(page, await graphClip(page, merge)))).toBeGreaterThan(10)

      // Dim off: the unmerged commit gets its lane colour back.
      await page.getByTestId("graph-options-bar").hover()
      await page.getByTestId("graph-dim-toggle").click()
      await expect.poll(async () => laneInk(await topColours(page, await graphClip(page, wip)))).toBeGreaterThan(10)
      expect(await page.evaluate(() => localStorage.getItem("pg.graph"))).toContain('"dim":false')
    })
  }
})
