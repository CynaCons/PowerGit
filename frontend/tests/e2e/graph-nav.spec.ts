import { expect, test, type Locator, type Page, type Route } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner (2026-09-16, v0.18.12): "when we're in the main graph, I'd like to
// have some sort of control buttons for 'go to head', 'go to successor' and
// 'go to parent'" — "definitely the compass bottom right" (prototype B of
// docs/prototypes/graph-nav.html). Git Extensions has the commands without
// buttons: Go to parent (Ctrl+P, the first parent, the way back remembered),
// Go to child (Ctrl+N, the first child in the loaded graph), Select current
// revision (Ctrl+Shift+C), Alt+← / Alt+→ over the selection history.
//
// Fixture (newest first): after-merge (HEAD, main) → merge side [main-2,
// side-2] → main-2 → side-2 (side) → side-1 → wip-1 (wip, unmerged) → base.

type Box = { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const row = (page: Page, subject: string) => page.getByTestId("grid-row").filter({ hasText: subject })
const selectedSubject = (page: Page) => page.locator(".grid-row.selected .msg-text")
const shaOf = async (r: Locator) => (await r.getByTestId("sha-cell").textContent())!.trim()
/** The tooltip saying `text` is up (a previous one may still be fading out). */
const expectTip = (page: Page, text: string | RegExp) =>
  expect(page.getByRole("tooltip").filter({ hasText: text }).last()).toBeVisible()

async function open(page: Page, repoId: string, rowCount: number) {
  await page.goto(`/?repo=${repoId}`)
  await expect(page.getByTestId("grid-row")).toHaveCount(rowCount)
  await expect(page.getByTestId("graph-nav")).toBeVisible()
  await page.mouse.move(5, 5)
}

async function currentRepoId(): Promise<string> {
  const res = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  return ((await res.json()) as { id: string }).id
}

test.describe("the compass: go to parent, child and HEAD", () => {
  let dir: string
  let previous: string | null = null
  let repoId = ""

  test.beforeAll(async () => {
    previous = await currentRepoPath()
    dir = makeRepo("pg-graph-nav-")
    git(dir, "checkout", "-q", "-b", "wip")
    write(dir, "w.txt", "1\n")
    commit(dir, "wip-1")
    git(dir, "checkout", "-q", "main")
    git(dir, "checkout", "-q", "-b", "side")
    write(dir, "side.txt", "1\n")
    commit(dir, "side-1")
    write(dir, "side.txt", "2\n")
    commit(dir, "side-2")
    git(dir, "checkout", "-q", "main")
    write(dir, "a.txt", "main-2\n")
    commit(dir, "main-2")
    git(dir, "merge", "-q", "--no-ff", "-m", "merge side", "side")
    write(dir, "a.txt", "after\n")
    commit(dir, "after-merge")
    await openRepoOnEngine(dir)
    repoId = await currentRepoId()
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
    await removeRepo(dir)
  })

  test("a pill at the bottom-right of the graph body, the twin of the options pill: 45 % at rest, full on hover, over neither the options pill nor the scrollbar", async ({
    page,
  }) => {
    await open(page, repoId, 7)
    const nav = page.getByTestId("graph-nav")
    const body = (await page.getByTestId("grid-body").boundingBox())!
    const box = (await nav.boundingBox())!
    // Bottom-right, 10 px in from the body's edges (the options pill's offsets).
    expect(Math.round(body.x + body.width - (box.x + box.width))).toBe(10)
    expect(Math.round(body.y + body.height - (box.y + box.height))).toBe(10)
    // Three 28 px round buttons stacked child · HEAD · parent.
    const buttons = ["graph-nav-child", "graph-nav-head", "graph-nav-parent"]
    let lastBottom = 0
    for (const id of buttons) {
      const b = (await page.getByTestId(id).boundingBox())!
      expect(Math.round(b.width)).toBe(28)
      expect(Math.round(b.height)).toBe(28)
      expect(b.y).toBeGreaterThanOrEqual(lastBottom)
      lastBottom = b.y + b.height
    }
    // At rest: 45 % like the options pill; hovered: full, expanded.
    await expect(nav).toHaveAttribute("data-expanded", "false")
    await expect(nav).toHaveCSS("opacity", "0.45")
    await nav.hover()
    await expect(nav).toHaveAttribute("data-expanded", "true")
    await expect(nav).toHaveCSS("opacity", "1")
    // Never over the options pill (expanded too) nor the graph's scrollbar.
    const options = page.getByTestId("graph-options-bar")
    await options.hover()
    await expect(options).toHaveAttribute("data-expanded", "true")
    expect(overlaps((await nav.boundingBox())!, (await options.boundingBox())!)).toBe(false)
    const scrollbar = page.getByTestId("graph-scrollbar")
    if (await scrollbar.count()) {
      expect(overlaps((await nav.boundingBox())!, (await scrollbar.boundingBox())!)).toBe(false)
    }
  })

  test("↓ goes to the parent, ↑ back to the child it came from, ⌂ to HEAD (tinted while there)", async ({ page }) => {
    await open(page, repoId, 7)
    const head = page.getByTestId("graph-nav-head")
    // The first row is HEAD: ⌂ is lit and says so.
    await expect(head).toHaveAttribute("data-lit", "true")
    await expect(head).toHaveAttribute("aria-disabled", "true")
    await head.hover()
    await expectTip(page, "Already at HEAD")

    await row(page, "side-1").click()
    await expect(selectedSubject(page)).toHaveText("side-1")
    await expect(head).not.toHaveAttribute("data-lit", "true")
    const parent = page.getByTestId("graph-nav-parent")
    await parent.hover()
    const baseSha = await shaOf(row(page, "base"))
    await expectTip(page, `Go to parent ${baseSha}`)
    await expectTip(page, "Ctrl+P")
    await parent.click()
    await expect(selectedSubject(page)).toHaveText("base")

    // base's first loaded child is main-2 (higher in the grid), but the way
    // back is remembered: ↑ returns to side-1, as Git Extensions does.
    const child = page.getByTestId("graph-nav-child")
    await child.hover()
    await expectTip(page, `Go to child ${await shaOf(row(page, "side-1"))}`)
    await child.click()
    await expect(selectedSubject(page)).toHaveText("side-1")
    // A click elsewhere forgets it: from base, ↑ is the first loaded child.
    await row(page, "base").click()
    await child.hover()
    await expectTip(page, `Go to child ${await shaOf(row(page, "main-2"))}`)

    await head.hover()
    await expectTip(page, `Go to HEAD ${await shaOf(row(page, "after-merge"))}`)
    await expectTip(page, "Ctrl+Shift+C")
    await head.click()
    await expect(selectedSubject(page)).toHaveText("after-merge")
    await expect(head).toHaveAttribute("data-lit", "true")
  })

  test("Ctrl+P, Ctrl+N, Ctrl+Shift+C from the grid; Alt+← and Alt+→ walk the way you came", async ({ page }) => {
    await open(page, repoId, 7)
    await row(page, "merge side").click()
    await expect(page.getByTestId("grid-body")).toBeFocused()
    await page.keyboard.press("Control+P")
    await expect(selectedSubject(page)).toHaveText("main-2")
    await page.keyboard.press("Control+P")
    await expect(selectedSubject(page)).toHaveText("base")
    await page.keyboard.press("Control+N")
    await expect(selectedSubject(page)).toHaveText("main-2")
    await page.keyboard.press("Control+N")
    await expect(selectedSubject(page)).toHaveText("merge side")
    await page.keyboard.press("Control+Shift+C")
    await expect(selectedSubject(page)).toHaveText("after-merge")
    // Back over the selections: after-merge ← merge ← main-2 ← base ← main-2 ← merge.
    await page.keyboard.press("Alt+ArrowLeft")
    await expect(selectedSubject(page)).toHaveText("merge side")
    await page.keyboard.press("Alt+ArrowLeft")
    await expect(selectedSubject(page)).toHaveText("main-2")
    await page.keyboard.press("Alt+ArrowLeft")
    await expect(selectedSubject(page)).toHaveText("base")
    await page.keyboard.press("Alt+ArrowRight")
    await expect(selectedSubject(page)).toHaveText("main-2")
    // Ctrl+P from a text field is swallowed by the app, not printed by the browser.
    await page.getByTestId("tree-filter").focus()
    await page.keyboard.press("Control+P")
    await expect(selectedSubject(page)).toHaveText("base")
  })

  test("on a merge the parent button carries the count; the badge opens the parents list to the left; the button itself takes the first parent", async ({
    page,
  }) => {
    await open(page, repoId, 7)
    await row(page, "merge side").click()
    const parent = page.getByTestId("graph-nav-parent")
    const count = page.getByTestId("graph-nav-parent-count")
    await expect(count).toHaveText("2")
    await parent.hover()
    await expectTip(page, "Go to first parent")
    await expectTip(page, "2 parents, open the list")

    await count.click()
    const menu = page.getByTestId("graph-nav-parents")
    await expect(menu).toBeVisible()
    await expect(menu).toContainText(`2 parents of ${await shaOf(row(page, "merge side"))}`)
    const first = page.getByTestId("graph-nav-parent-0")
    const second = page.getByTestId("graph-nav-parent-1")
    await expect(first).toContainText(await shaOf(row(page, "main-2")))
    await expect(first).toContainText("main-2")
    await expect(first).toContainText("Ctrl+P")
    await expect(second).toContainText(await shaOf(row(page, "side-2")))
    await expect(second).toContainText("side-2")
    await expect(second).not.toContainText("Ctrl+P")
    // The list opens to the left of the pill, inside the graph.
    const paper = (await menu.locator(".MuiPaper-root").boundingBox())!
    const pill = (await page.getByTestId("graph-nav").boundingBox())!
    expect(paper.x + paper.width).toBeLessThanOrEqual(pill.x)
    await second.click()
    await expect(menu).toBeHidden()
    await expect(selectedSubject(page)).toHaveText("side-2")

    // The button itself: the first parent, as Git Extensions does.
    await row(page, "merge side").click()
    await parent.click()
    await expect(selectedSubject(page)).toHaveText("main-2")
    await expect(count).toHaveCount(0)
    // Escape closes the list without moving.
    await row(page, "merge side").click()
    await parent.click({ button: "right" })
    await expect(menu).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    await expect(selectedSubject(page)).toHaveText("merge side")
  })

  test("nowhere to go: the first commit has no parent, a tip no child, a pending row no navigation — the reason is in the tooltip", async ({
    page,
  }) => {
    await open(page, repoId, 7)
    await row(page, "base").click()
    const parent = page.getByTestId("graph-nav-parent")
    await expect(parent).toHaveAttribute("aria-disabled", "true")
    await expect(parent).toHaveAttribute("data-reason", "no-parent")
    await parent.hover()
    await expectTip(page, "No parent — first commit")
    await parent.click({ force: true }) // Playwright honours aria-disabled; a hand does not
    await expect(selectedSubject(page)).toHaveText("base")

    await row(page, "wip-1").click()
    const child = page.getByTestId("graph-nav-child")
    await expect(child).toHaveAttribute("aria-disabled", "true")
    await child.hover()
    await expectTip(page, "No child in the loaded history")
    await child.click({ force: true })
    await expect(selectedSubject(page)).toHaveText("wip-1")

    // A pending row is not a commit: neither parent nor child, HEAD still.
    write(dir, "a.txt", "dirty\n")
    const pending = page.getByTestId("grid-row").filter({ hasText: "Working directory" })
    await expect(pending).toBeVisible({ timeout: 15_000 })
    await pending.click()
    await expect(parent).toHaveAttribute("data-reason", "pending")
    await expect(child).toHaveAttribute("data-reason", "pending")
    await parent.hover()
    await expectTip(page, "Select a commit to navigate")
    const head = page.getByTestId("graph-nav-head")
    await expect(head).not.toHaveAttribute("aria-disabled", "true")
    await head.click()
    await expect(selectedSubject(page)).toHaveText("after-merge")
    git(dir, "checkout", "-q", "--", "a.txt")
    await expect(pending).toHaveCount(0, { timeout: 15_000 })
  })

  test("under the ref filter, Alt+← to a commit the filter dropped says 'Not in the filtered graph' instead of paging", async ({
    page,
  }) => {
    await open(page, repoId, 7)
    await row(page, "wip-1").click()
    await row(page, "base").click()
    // Enter the mode: the checked-out branch alone; wip-1 leaves the graph.
    await page.getByTestId("tree-filter-mode").click()
    await expect(row(page, "wip-1")).toHaveCount(0)
    await expect(page.getByTestId("grid-row")).toHaveCount(6)
    await expect(selectedSubject(page)).toHaveText("base")
    await page.getByTestId("grid-body").focus()
    await page.keyboard.press("Alt+ArrowLeft")
    await expect(page.getByTestId("status-note")).toContainText("Not in the filtered graph")
    await expect(selectedSubject(page)).toHaveText("base")
    await page.getByTestId("tree-filter-exit").click()
    await expect(page.getByTestId("grid-row")).toHaveCount(7)
    await page.evaluate((id) => localStorage.removeItem(`pg.graphRefs.${id}`), repoId)
  })
})

/** `n` commits on main after the base, through fast-import (a commit per
 *  process would take minutes). Returns nothing; the engine pages them. */
function manyCommits(dir: string, n: number): void {
  const start = Math.floor(Date.UTC(2026, 8, 9, 0, 0, 0) / 1000)
  let stream = ""
  for (let i = 1; i <= n; i++) {
    const msg = `bulk-${i}`
    const body = `${i}\n`
    stream += `commit refs/heads/main\ncommitter t <t@t> ${start + i * 60} +0000\ndata ${Buffer.byteLength(msg)}\n${msg}\n`
    if (i === 1) stream += "from refs/heads/main^0\n"
    stream += `M 644 inline f.txt\ndata ${Buffer.byteLength(body)}\n${body}\n`
  }
  execFileSync("git", ["fast-import", "--quiet"], { cwd: dir, input: stream, stdio: ["pipe", "pipe", "pipe"] })
  // fast-import moves the branch, not the worktree: sync it so the grid has
  // no pending row on top and index 999 is bulk-101.
  git(dir, "reset", "-q", "--hard")
}

test.describe("a parent below the loaded window", () => {
  let dir: string
  let previous: string | null = null
  let repoId = ""

  test.beforeAll(async () => {
    previous = await currentRepoPath()
    dir = makeRepo("pg-graph-nav-deep-")
    manyCommits(dir, 1100)
    await openRepoOnEngine(dir)
    repoId = await currentRepoId()
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
    await removeRepo(dir)
  })

  test("the grid pages until the commit arrives, the tail says 'Loading history to <sha>…', the selection lands on it and scrolls into view", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    // Hold the second page (skip=1000) until the test lets it through. Every
    // request for it is held: a reset during boot re-issues the page, and
    // the one the grid waits on must be the one released.
    const held: Route[] = []
    await page.route(/\/revisions\?.*skip=1000/, (route) => {
      held.push(route)
    })
    await page.goto(`/?repo=${repoId}`)
    await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => held.length, { timeout: 30_000 }).toBeGreaterThan(0)
    // The last loaded row (index 999): its parent is on the held page.
    const body = page.getByTestId("grid-body")
    await body.focus()
    await page.keyboard.press("End")
    const last = page.locator('[data-testid="grid-row"][data-index="999"]')
    await expect(last).toHaveClass(/selected/)
    await expect(last).toContainText("bulk-101")
    const parent = page.getByTestId("graph-nav-parent")
    await expect(parent).not.toHaveAttribute("aria-disabled", "true")
    await parent.click()
    const tail = page.getByTestId("history-tail-loading")
    await expect(tail).toHaveText(/^Loading history to [0-9a-f]{7}…$/)
    const target = (await tail.textContent())!.match(/[0-9a-f]{7}/)![0]
    await expect(page.getByTestId("graph-nav-loading")).toBeVisible()
    await expect(last).toHaveClass(/selected/)

    for (const route of held) await route.continue().catch(() => undefined)
    // The page is in: 1100 rows tall.
    await expect
      .poll(() => page.getByTestId("grid-body").evaluate((el) => el.firstElementChild!.scrollHeight), {
        timeout: 30_000,
      })
      .toBeGreaterThanOrEqual(1100 * 28)
    const landed = page.locator(".grid-row.selected")
    await expect(landed).toContainText("bulk-100", { timeout: 30_000 })
    await expect(landed.getByTestId("sha-cell")).toHaveText(target)
    await expect(landed).toBeInViewport()
    await expect(tail).toHaveCount(0)
    // And back up: the child is the row we came from.
    await page.getByTestId("graph-nav-child").click()
    await expect(page.locator(".grid-row.selected")).toContainText("bulk-101")
  })
})
