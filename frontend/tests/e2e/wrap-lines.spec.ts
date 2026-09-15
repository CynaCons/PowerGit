import { expect, test, type Locator, type Page } from "@playwright/test"

import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner, 2026-09-15: "whenever we display code (e.g. Commit view or Diff
// view): can we have an option to activate line wrapping in the floating
// action menu?"
//
// The proof is what the owner sees: a 400-character line is wider than the
// pane until Wrap lines is on in the floating pill, then the row grows and
// the pane no longer scrolls sideways while the gutter's numbers stay at
// the left edge. One remembered switch: it survives a reload and applies in
// the File tree's blob pane (its own pill) and in the commit window, and
// off in any pill is off everywhere. Wrapping is presentation, so the
// toggle never re-requests the diff. A virtualized diff (300 lines) with
// wrap on still reaches its last row with End and the review marks land on
// the right rows (measured rows, the revision grid's contract since v0.18.3).

const LONG_A = "0123456789".repeat(40)
const LONG_B = "abcdefghij".repeat(40)
const LONG_C = "klmnopqrst".repeat(40)

async function openInApp(page: Page, dir: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path: dir }),
  })
  const opened = (await res.json()) as { id: string }
  await page.goto(`/?repo=${opened.id}`)
  await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
}

/** A diff row under `scope` whose text cell holds `text`, case-sensitively (the row itself starts with gutter numbers). */
function diffRow(page: Page, scope: Locator, text: string): Locator {
  return scope.locator(".diff-row").filter({ has: page.locator(".diff-row-text", { hasText: new RegExp(text) }) })
}

/** How far the content runs past the scroll container's width (> 0: a horizontal scrollbar). */
const overflowX = (el: Locator) => el.evaluate((e) => e.scrollWidth - e.clientWidth)

/** The pill hides its controls until the pointer is inside. */
async function openPill(scope: Locator): Promise<Locator> {
  await scope.getByTestId("diff-options-bar").hover()
  const toggle = scope.getByTestId("diff-wrap-toggle")
  await expect(toggle).toBeVisible()
  return toggle
}

async function showDiff(page: Page, subject: string, file: string): Promise<void> {
  const row = page.getByTestId("grid-row").filter({ hasText: subject })
  await expect(row).toHaveCount(1, { timeout: 20_000 })
  await row.click()
  await page.getByRole("tab", { name: /Diff/ }).click()
  await page.getByTestId("file-list-row").filter({ hasText: file }).click()
}

test.describe("Wrap lines in the floating options pill", () => {
  // Opening a repository moves the engine's "current" one, which is what
  // every spec that just does page.goto("/") boots from. Put it back.
  let previousRepo: string | null = null
  let dir = ""
  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    // A commit adding a file with one 400-character line (and a 300-line
    // file whose first line is that long one), then a commit changing it.
    dir = makeRepo("pg-wrap-")
    write(dir, "long.txt", LONG_A + "\n")
    write(dir, "long.md", "# title\n\n" + LONG_A + "\n")
    const many = [LONG_A, ...Array.from({ length: 298 }, (_, i) => `line ${i + 2}`), "the end"]
    write(dir, "many.txt", many.join("\n") + "\n")
    commit(dir, "add long line")
    write(dir, "long.txt", LONG_B + "\n")
    commit(dir, "change long line")
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(dir)
  })

  test("whenever we display code (e.g. Commit view or Diff view): can we have an option to activate line wrapping in the floating action menu?", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await openInApp(page, dir)
    await showDiff(page, "change long line", "long.txt")
    const panel = page.getByTestId("bottom-panel")
    const lines = panel.getByTestId("diff-lines")
    const longRow = diffRow(page, panel, LONG_B)
    await expect(longRow).toBeVisible({ timeout: 20_000 })

    // Off by default: the row is wider than the pane and one line tall.
    const toggle = await openPill(panel)
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    expect(await overflowX(lines)).toBeGreaterThan(0)
    expect((await longRow.boundingBox())!.height).toBeLessThanOrEqual(18)
    const gutterBefore = (await longRow.locator(".diff-row-gutter").boundingBox())!

    // On: the row fits the pane and grows; the gutter has not moved; no
    // diff was requested again (presentation only, not a diff option).
    const requests: string[] = []
    page.on("request", (req) => {
      if (/\/(diff|changes)(\/|$)/.test(new URL(req.url()).pathname)) requests.push(req.url())
    })
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
    await expect(lines).toHaveAttribute("data-wrap", "true")
    await expect.poll(() => overflowX(lines)).toBeLessThanOrEqual(0)
    expect((await longRow.boundingBox())!.height).toBeGreaterThan(18)
    const gutterAfter = (await longRow.locator(".diff-row-gutter").boundingBox())!
    expect(Math.abs(gutterAfter.x - gutterBefore.x)).toBeLessThan(1)
    expect(requests).toEqual([])

    // Remembered: still on after a reload.
    await page.reload()
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    await showDiff(page, "change long line", "long.txt")
    await expect(longRow).toBeVisible({ timeout: 20_000 })
    await expect(lines).toHaveAttribute("data-wrap", "true")
    await expect.poll(() => overflowX(lines)).toBeLessThanOrEqual(0)
    await expect(await openPill(panel)).toHaveAttribute("aria-pressed", "true")

    // The File tree's blob pane: its own pill shows the switch on and the
    // long line wraps, in the plain <pre> and in Shiki's pre/code alike.
    await page.getByRole("tab", { name: "File Tree" }).click()
    await page.locator('[data-testid="commit-file-tree-row"][data-path="long.txt"]').click()
    const blob = page.getByTestId("blob-pane")
    await expect(blob).toContainText(LONG_B)
    await expect(blob).toHaveAttribute("data-wrap", "true")
    await expect(blob).toHaveCSS("white-space", "pre-wrap")
    await expect.poll(() => overflowX(blob)).toBeLessThanOrEqual(0)
    await expect(await openPill(panel)).toHaveAttribute("aria-pressed", "true")
    await page.locator('[data-testid="commit-file-tree-row"][data-path="long.md"]').click()
    await expect(blob.locator("pre code")).toBeAttached()
    await expect(blob).toContainText(LONG_A)
    await expect.poll(() => overflowX(blob)).toBeLessThanOrEqual(0)

    // The commit window's diff of an unstaged edit wraps too.
    write(dir, "long.txt", LONG_C + "\n")
    await page.keyboard.press("Control+Space")
    const overlay = page.getByTestId("commit-overlay")
    await expect(overlay).toBeVisible()
    await overlay.locator('[data-testid="unstaged-list-row"]:has([title="long.txt"])').click()
    const dialogLines = overlay.getByTestId("diff-lines")
    const dialogRow = diffRow(page, overlay, LONG_C)
    await expect(dialogRow).toBeVisible({ timeout: 20_000 })
    await expect(dialogLines).toHaveAttribute("data-wrap", "true")
    await expect.poll(() => overflowX(dialogLines)).toBeLessThanOrEqual(0)
    expect((await dialogRow.boundingBox())!.height).toBeGreaterThan(18)

    // Off in any pill is off everywhere: the dialog's diff scrolls sideways
    // again, and so does the blob pane behind it.
    const dialogToggle = await openPill(overlay)
    await expect(dialogToggle).toHaveAttribute("aria-pressed", "true")
    await dialogToggle.click()
    await expect(dialogToggle).toHaveAttribute("aria-pressed", "false")
    await expect(dialogLines).not.toHaveAttribute("data-wrap", "true")
    await expect.poll(() => overflowX(dialogLines)).toBeGreaterThan(0)
    expect((await dialogRow.boundingBox())!.height).toBeLessThanOrEqual(18)
    await page.keyboard.press("Escape")
    await expect(overlay).not.toBeVisible()
    await expect(blob).not.toHaveAttribute("data-wrap", "true")
    await expect(blob).toHaveCSS("white-space", "pre")
    await expect.poll(() => overflowX(blob)).toBeGreaterThan(0)
  })

  test("a virtualized diff with Wrap lines on reaches its last row with End, and the review marks land on the right rows", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.addInitScript(() => window.localStorage.setItem("pg.diffWrap", "1"))
    await openInApp(page, dir)
    await showDiff(page, "add long line", "many.txt")
    const panel = page.getByTestId("bottom-panel")
    const lines = panel.getByTestId("diff-lines")
    const first = diffRow(page, panel, LONG_A)
    const last = diffRow(page, panel, "the end")
    await expect(first).toBeVisible({ timeout: 20_000 })
    await expect(lines).toHaveAttribute("data-wrap", "true")
    expect((await first.boundingBox())!.height).toBeGreaterThan(18)
    // Virtualized: only a window of the 300 rows is in the DOM.
    expect(await panel.locator(".diff-row").count()).toBeLessThan(300)
    await expect(await openPill(panel)).toHaveAttribute("aria-pressed", "true")

    // End on the list scrolls to the last row, its text on screen.
    await lines.focus()
    await page.keyboard.press("End")
    await expect(last).toBeInViewport({ ratio: 0.5 })

    // Review mode: End and Home move the cursor to the last and first row
    // (measured heights, scrollToIndex), Space / x mark the row under it.
    const review = page.getByTestId("diff-review-toggle")
    await review.click()
    await expect(review).toHaveAttribute("aria-pressed", "true")
    await page.keyboard.press("End")
    // The diff text ends with a newline, so the last parsed row is an empty
    // one under "+the end": End lands there, k steps up onto the line.
    await expect(panel.locator(".diff-row-cursor")).toBeInViewport({ ratio: 0.5 })
    await expect(last).toBeInViewport({ ratio: 0.5 })
    await page.keyboard.press("k")
    await expect(last).toHaveClass(/diff-row-cursor/)
    await page.keyboard.press("Space")
    await expect(last).toHaveAttribute("data-review", "ok")
    await page.keyboard.press("Home")
    // Home lands on the diff header; n is the first unreviewed line, the long one.
    await page.keyboard.press("n")
    await expect(first).toHaveClass(/diff-row-cursor/)
    await expect(first).toBeInViewport({ ratio: 0.5 })
    await page.keyboard.press("x")
    await expect(first).toHaveAttribute("data-review", "rejected")
    await expect(page.getByTestId("diff-review-count")).toHaveText("2 / 300 lines · 1 rejected")
  })
})
