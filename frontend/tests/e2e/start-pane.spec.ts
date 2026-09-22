import { expect, test, type Page } from "@playwright/test"
import { basename } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"
import { currentRepoPath, makeRepo, openRepoOnEngine, removeRepo } from "../repoFixture"

// The recent repositories, second pass. Owner (2026-09-22): "I don't like
// the current UI for the 'select a recent project' - can we try new visuals?
// Show me prototypes" → "ok for b" (prototype B of
// docs/prototypes/recents-v2.html, v0.20.3): the picker stops being a dialog
// over the app. It is the main pane — the list on the left with the filter,
// the groups, the pins and the keys; on the right the repository you are
// about to open, with its path, its state, its recent history and the verbs.
//
// What it replaces (recents.spec.ts, v0.18.7 and v0.18.9): a centred dialog
// of tiles with an initials disc. The behaviour the owner asked for then is
// still here and still asserted — the filter has the focus, 1–9 jump, the
// arrows walk, Delete offers Undo instead of a confirm.

async function openOnEngine(path: string): Promise<{ id: string }> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error(`failed to open ${path}: http ${res.status}`)
  return (await res.json()) as { id: string }
}

/** recents.json as the engine reports it, roots lower-cased for comparison. */
async function recents(): Promise<{ root: string; pinned?: boolean }[]> {
  const res = await fetch(`${ENGINE_URL}/repos/recents`, { headers: engineHeaders() })
  return ((await res.json()) as { root: string; pinned?: boolean }[]).map((r) => ({
    ...r,
    root: r.root.toLowerCase(),
  }))
}

test.describe("the start pane", () => {
  let previousRepo: string | null = null
  let a = ""
  let b = ""
  let bId = ""
  // By name, not by data-root: a Windows path in a CSS attribute selector
  // would have its backslashes read as escapes.
  const rowOf = (page: Page, dir: string) => page.getByTestId("start-row").filter({ hasText: basename(dir) })

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    a = makeRepo("pg-start-a-")
    b = makeRepo("pg-start-b-")
    // Newest first on the engine: B then A, so A heads the list and B is the
    // one that is open in the first test.
    bId = (await openOnEngine(b)).id
    await openOnEngine(a)
  })

  test.afterAll(async () => {
    for (const root of [a, b]) {
      await fetch(`${ENGINE_URL}/repos/recents?root=${encodeURIComponent(root)}`, {
        method: "DELETE",
        headers: engineHeaders(),
      }).catch(() => undefined)
    }
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(a)
    await removeRepo(b)
  })

  test("the rail swaps the grid for the pane, the filter has the focus, the open repository says so, and 1 opens the first", async ({
    page,
  }) => {
    await page.goto(`/?repo=${bId}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })

    await page.getByTestId("recents-button").click()
    await expect(page.getByTestId("start-pane")).toBeVisible()
    // A pane, not an overlay: the grid is gone, not covered.
    await expect(page.getByTestId("grid-row")).toHaveCount(0)
    await expect(page.getByTestId("start-filter")).toBeFocused()

    await expect(rowOf(page, a)).toContainText(basename(a))
    await expect(rowOf(page, a)).toContainText("main")
    await expect(rowOf(page, b)).toContainText("open now")
    // The right-hand side follows the cursor: A is first, so A is previewed.
    await expect(page.getByTestId("start-detail-path")).toHaveText(a)
    await expect(page.getByTestId("start-commit").first()).toBeVisible()

    await page.keyboard.press("1")
    await expect(page.getByTestId("start-pane")).toHaveCount(0)
    await expect(page.getByTestId("title-strip")).toContainText(basename(a), { timeout: 30_000 })
  })

  test("the filter marks what matched and counts; Escape clears it, then Escape puts the grid back", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId("recents-button").click()

    const filter = page.getByTestId("start-filter")
    await filter.fill("pg-start-")
    const rows = page.getByTestId("start-row")
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).getByTestId("start-match").first()).toHaveText("pg-start-")
    await expect(page.getByTestId("start-count")).toHaveText(/^2 of \d+$/)

    await filter.fill("nothing-like-this")
    await expect(page.getByTestId("start-empty")).toContainText('Nothing matches "nothing-like-this"')

    await page.keyboard.press("Escape")
    await expect(filter).toHaveValue("")
    await expect(page.getByTestId("start-pane")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("start-pane")).toHaveCount(0)
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
  })

  test("the arrows walk the list, the preview follows, and Enter opens what is under the cursor", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId("recents-button").click()
    await page.getByTestId("start-filter").fill("pg-start-")

    const rows = page.getByTestId("start-row")
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toHaveAttribute("data-cursor", "true")
    const first = (await rows.nth(0).boundingBox())!
    const second = (await rows.nth(1).boundingBox())!
    // One column, so ArrowDown is exactly one row down.
    expect(Math.round(second.x)).toBe(Math.round(first.x))
    expect(second.y).toBeGreaterThan(first.y)

    await page.keyboard.press("ArrowDown")
    await expect(rows.nth(1)).toHaveAttribute("data-cursor", "true")
    await expect(page.getByTestId("start-detail-path")).toHaveText(await rows.nth(1).getAttribute("data-root"))

    await page.keyboard.press("Enter")
    await expect(page.getByTestId("start-pane")).toHaveCount(0)
    await expect(page.getByTestId("title-strip")).toContainText(basename(b), { timeout: 30_000 })
  })

  test("the star pins a repository to the top of the list, and the engine remembers it", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId("recents-button").click()

    const row = rowOf(page, b)
    await row.hover()
    await row.getByTestId("start-pin").click()
    // The first group is Pinned, and B is in it.
    await expect(page.getByTestId("start-group").first()).toContainText("Pinned")
    await expect(page.getByTestId("start-row").first()).toHaveAttribute("data-root", b)
    await expect.poll(async () => (await recents()).find((r) => r.root === b.toLowerCase())?.pinned).toBe(true)

    await row.getByTestId("start-pin").click()
    await expect.poll(async () => (await recents()).find((r) => r.root === b.toLowerCase())?.pinned).toBe(false)
  })

  test("Remove hides the row and offers Undo; Undo brings it back; five seconds later it is gone for good", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId("recents-button").click()

    const rowA = rowOf(page, a)
    await expect(rowA).toHaveCount(1)
    await page.getByTestId("start-filter").fill("pg-start-a")
    await expect(rowA).toHaveAttribute("data-cursor", "true")
    await page.getByTestId("start-forget").click()
    await expect(rowA).toHaveCount(0)
    await expect(page.getByTestId("start-undo")).toBeVisible()

    await page.getByTestId("start-undo").click()
    await expect(rowA).toHaveCount(1)
    expect((await recents()).map((r) => r.root)).toContain(a.toLowerCase())

    // Let the five seconds pass: Playwright's clock fires the timer the pane
    // arms after the click, as the dialog's did.
    await page.clock.install()
    await page.getByTestId("start-forget").click()
    await expect(rowA).toHaveCount(0)
    await page.clock.fastForward(5_000)
    await expect.poll(async () => (await recents()).map((r) => r.root)).not.toContain(a.toLowerCase())
  })
})
