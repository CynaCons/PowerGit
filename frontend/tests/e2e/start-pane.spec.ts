import { expect, test, type Page } from "@playwright/test"
import { basename } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"
import { currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo } from "../repoFixture"

// The recent repositories, fourth pass (v0.20.10). Owner (2026-10-13): "would
// be better able to handle work trees … I would like to more easily find my
// work trees … or maybe something based on cards" → "Let's go with option E"
// (docs/prototypes/recents-v4.html): one card per repository with every
// worktree git lists for it, opened or not; one click opens a worktree.
//
// What the earlier passes asked for is still asserted (v0.18.7 dialog,
// v0.20.3 pane): the filter has the focus, 1–9 open, the arrows walk, Enter
// opens, Delete offers Undo instead of a confirm, the star pins.

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
  // Owner (2026-09-22, on the v0.20.3 release): "The 'xx min ago' is on the
  // same line as the branch name. They overlap." A branch name that fills
  // the row is what shows it.
  let long = ""
  const LONG_BRANCH = "feature/the-branch-name-that-fills-the-row-and-then-some"
  // By name, not by data-root: a Windows path in a CSS attribute selector
  // would have its backslashes read as escapes.
  const rowOf = (page: Page, dir: string) => page.getByTestId("start-row").filter({ hasText: basename(dir) })

  // A repository with two linked worktrees, only its main checkout opened.
  let wtMain = ""
  let wtA = ""
  let wtB = ""

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    a = makeRepo("pg-start-a-")
    b = makeRepo("pg-start-b-")
    long = makeRepo("pg-longbranch-")
    git(long, "checkout", "-q", "-b", LONG_BRANCH)
    wtMain = makeRepo("pg-wtrepo-")
    wtA = `${wtMain}-task-a`
    wtB = `${wtMain}-task-b`
    git(wtMain, "worktree", "add", "-q", "-b", "task/a-first", wtA)
    git(wtMain, "worktree", "add", "-q", "-b", "task/b-second", wtB)
    // Newest first on the engine: B then A, so A heads the list and B is the
    // one that is open in the first test.
    await openOnEngine(wtMain)
    await openOnEngine(long)
    bId = (await openOnEngine(b)).id
    await openOnEngine(a)
  })

  test.afterAll(async () => {
    // Off the worktrees first: the engine watches the one it has open, and
    // Windows will not delete a watched folder.
    await openRepoOnEngine(previousRepo ?? process.cwd())
    for (const dir of [wtA, wtB, wtMain]) await removeRepo(dir)
    for (const root of [a, b, long, wtMain, wtA, wtB]) {
      await fetch(`${ENGINE_URL}/repos/recents?root=${encodeURIComponent(root)}`, {
        method: "DELETE",
        headers: engineHeaders(),
      }).catch(() => undefined)
    }
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(a)
    await removeRepo(b)
    await removeRepo(long)
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
    // Each repository is a card; the worktree's path is on its row.
    await expect(rowOf(page, a).getByTestId("start-path")).toHaveAttribute("title", a)

    await page.keyboard.press("1")
    await expect(page.getByTestId("start-pane")).toHaveCount(0)
    await expect(page.getByTestId("title-strip")).toContainText(basename(a), { timeout: 30_000 })
  })

  // Owner (2026-10-13): "very importantly would be better able to handle work
  // trees … I would like to more easily find my work trees". Only the main
  // checkout was ever opened; git knows the other two, so they are on its
  // card, marked never opened, and one click opens one.
  test("a repository's card lists every worktree, the never-opened ones too, and one click opens one", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId("recents-button").click()
    await page.getByTestId("start-filter").fill(basename(wtMain))

    const card = page.getByTestId("start-card").filter({ hasText: basename(wtMain) })
    await expect(card).toHaveCount(1)
    const rows = card.getByTestId("start-row")
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText(basename(wtMain))
    await expect(rows.nth(0).getByTestId("start-main")).toBeVisible()
    for (const [dir, branch] of [
      [wtA, "task/a-first"],
      [wtB, "task/b-second"],
    ]) {
      const row = rows.filter({ hasText: basename(dir) })
      await expect(row).toHaveAttribute("data-never", "true")
      await expect(row).toContainText("never opened")
      await expect(row.getByTestId("start-branch")).toHaveText(branch)
    }

    await rows.filter({ hasText: basename(wtB) }).click()
    await expect(page.getByTestId("start-pane")).toHaveCount(0)
    await expect(page.getByTestId("title-strip")).toContainText(basename(wtB), { timeout: 30_000 })
    await expect(page.getByTestId("status-branch")).toHaveText("task/b-second")
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
    await expect(page.getByTestId("start-count")).toHaveText(/^2 of \d+ in 2 repositories$/)

    await filter.fill("nothing-like-this")
    await expect(page.getByTestId("start-empty")).toContainText('Nothing matches "nothing-like-this"')

    await page.keyboard.press("Escape")
    await expect(filter).toHaveValue("")
    await expect(page.getByTestId("start-pane")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("start-pane")).toHaveCount(0)
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
  })

  // Owner (2026-10-12): "when someone does a file open to open a new
  // project, we should directly open the Git history of that project. When
  // the user has gone to the extent that he has selected a project, he wants
  // to read the history of that project. We shouldn't just show that project
  // in the list of recent and then he has to double click on it to open it."
  test("Open folder… from the pane opens that repository's history and the pane goes away", async ({ page }) => {
    // A session of its own: earlier tests opened others, and idle ones are evicted.
    bId = (await openOnEngine(b)).id
    await page.goto(`/?repo=${bId}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    await page.getByTestId("recents-button").click()
    await expect(page.getByTestId("start-pane")).toBeVisible()

    // The browser build asks for the path; the desktop app shows the folder picker.
    page.once("dialog", (dialog) => void dialog.accept(a))
    await page.getByTestId("start-open-folder").click()

    await expect(page.getByTestId("start-pane")).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByTestId("title-strip")).toContainText(basename(a), { timeout: 30_000 })
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
  })

  // Owner (2026-09-23, on v0.20.7): "the list view of the recent repos has
  // color issues and need better separation between the rows. I think the
  // colors are swapped between selection and non-selection." The list sat on
  // the sunken grey and the cursor row was plain paper white, so the chosen
  // row looked like the ordinary one and every other row looked greyed out.
  for (const theme of ["light", "dark"] as const) {
    test(`the row under the cursor carries the selection colour, the others the list's surface, with a line between rows (${theme})`, async ({
      page,
    }) => {
      await page.addInitScript((t) => window.localStorage.setItem("pg.theme", t), theme)
      await page.goto("/")
      await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
      await page.getByTestId("recents-button").click()
      await page.getByTestId("start-filter").fill("pg-start-")
      const rows = page.getByTestId("start-row")
      await expect(rows).toHaveCount(2)
      await expect(rows.nth(0)).toHaveAttribute("data-cursor", "true")

      const colours = await page.evaluate(() => {
        // The colour a row shows: its own background, else the first ancestor's.
        const shown = (el: Element | null): string => {
          for (let e = el; e; e = e.parentElement) {
            const bg = getComputedStyle(e).backgroundColor
            if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg
          }
          return "none"
        }
        const resolve = (css: string) => {
          const probe = document.createElement("div")
          probe.style.background = css
          document.body.appendChild(probe)
          const bg = getComputedStyle(probe).backgroundColor
          probe.remove()
          return bg
        }
        const rows = [...document.querySelectorAll('[data-testid="start-row"]')]
        const cursor = rows.find((r) => r.getAttribute("data-cursor") === "true")!
        const other = rows.find((r) => r !== cursor)!
        return {
          cursor: shown(cursor),
          other: shown(other),
          selection: resolve("var(--pg-grid-sel)"),
          paper: shown(other.closest('[data-testid="start-card"]')),
          separators: rows.map((r) => {
            const s = getComputedStyle(r)
            return { width: parseFloat(s.borderTopWidth), colour: s.borderTopColor }
          }),
        }
      })
      expect(colours.cursor).toBe(colours.selection)
      expect(colours.other).toBe(colours.paper)
      expect(colours.other).not.toBe(colours.cursor)
      for (const line of colours.separators) {
        expect(line.width).toBeGreaterThanOrEqual(1)
        expect(line.colour).not.toBe("rgba(0, 0, 0, 0)")
      }
    })
  }

  test("the arrows walk the rows, and Enter opens what is under the cursor", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId("recents-button").click()
    await page.getByTestId("start-filter").fill("pg-start-")

    const rows = page.getByTestId("start-row")
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toHaveAttribute("data-cursor", "true")
    // ArrowDown walks the rows in reading order, from one card to the next.
    await page.keyboard.press("ArrowDown")
    await expect(rows.nth(1)).toHaveAttribute("data-cursor", "true")

    await page.keyboard.press("Enter")
    await expect(page.getByTestId("start-pane")).toHaveCount(0)
    await expect(page.getByTestId("title-strip")).toContainText(basename(b), { timeout: 30_000 })
  })

  test("the star pins a repository to the first card, and the engine remembers it", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId("recents-button").click()

    const row = rowOf(page, b)
    await row.hover()
    await row.getByTestId("start-pin").click()
    // A pinned repository is the first card.
    await expect(page.getByTestId("start-card").first()).toContainText(basename(b))
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
    await rowA.getByTestId("start-remove").click()
    await expect(rowA).toHaveCount(0)
    await expect(page.getByTestId("start-undo")).toBeVisible()

    await page.getByTestId("start-undo").click()
    await expect(rowA).toHaveCount(1)
    expect((await recents()).map((r) => r.root)).toContain(a.toLowerCase())

    // Let the five seconds pass: Playwright's clock fires the timer the pane
    // arms after the click, as the dialog's did.
    await page.clock.install()
    await rowA.getByTestId("start-remove").click()
    await expect(rowA).toHaveCount(0)
    await page.clock.fastForward(5_000)
    await expect.poll(async () => (await recents()).map((r) => r.root)).not.toContain(a.toLowerCase())
  })

  test("a long branch name is shown whole, wrapped rather than cut, and never runs under the time", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
    await page.getByTestId("recents-button").click()
    await page.getByTestId("start-filter").fill("pg-longbranch")
    const row = page.getByTestId("start-row").first()
    const branch = row.getByTestId("start-branch")
    await expect(branch).toHaveText(LONG_BRANCH)

    for (const width of [1280, 1600]) {
      await page.setViewportSize({ width, height: 900 })
      // Owner (2026-09-22): "I would like to have the branch names longer if
      // possible, so separate row for the rest would be good" — the chip
      // grows to a second line instead of cutting the name off.
      const shown = await branch.evaluate((el) => {
        const inner = el.lastElementChild as HTMLElement
        return { clipped: inner.scrollHeight > inner.clientHeight + 1, lines: Math.round(inner.clientHeight / 16) }
      })
      expect(shown.clipped, `branch clipped at ${width} px`).toBe(false)
      // Two lines here, three under CI's font metrics; what matters is that
      // the whole name shows and the chip stays a chip.
      expect(shown.lines, `branch lines at ${width} px`).toBeLessThanOrEqual(3)

      // And the first line still belongs to the name and the time (v0.20.4).
      const when = (await row.getByTestId("start-when").boundingBox())!
      const box = (await branch.boundingBox())!
      expect(when.y + when.height, `time overlaps the branch at ${width} px`).toBeLessThanOrEqual(box.y + 2)
    }
  })
})
