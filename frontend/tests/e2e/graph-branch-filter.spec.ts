import { expect, test, type Page } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner (2026-09-15, v0.18.5): "I need to be able to select which branch I
// see in the graph. Like a dynamic filtering. It can be a mode, that when
// entered, I can activate branches on the left side explorer and only these
// are visible." Prototype docs/prototypes/branch-visibility.html, tab 4,
// variant A (the owner's pick): a funnel in the Repository header enters
// the mode, every ref gets a checkbox, the checked-out branch is locked,
// the strip and the grid chip say "n of N refs".
// Fixture: main (base, main-2) with two branches diverged from base, a
// (a-only) and b (b-only) — ticking a makes a-only appear, unticking
// removes it, main cannot be unticked, and the choice survives a reload.

const subjects = (page: Page) => page.locator('[data-testid="grid-row"] .msg-text')
const check = (page: Page, label: string) =>
  page.locator(`[data-testid="tree-row"][data-label="${label}"] [data-testid="tree-check"]`)

test.describe("choose the branches the graph shows", () => {
  let dir: string
  let previous: string | null = null
  let repoId = ""

  test.beforeAll(async () => {
    previous = await currentRepoPath()
    dir = makeRepo("pg-graph-filter-")
    git(dir, "checkout", "-q", "-b", "a")
    write(dir, "a.txt", "a\n")
    commit(dir, "a-only")
    git(dir, "checkout", "-q", "main")
    git(dir, "checkout", "-q", "-b", "b")
    write(dir, "b.txt", "b\n")
    commit(dir, "b-only")
    git(dir, "checkout", "-q", "main")
    write(dir, "m.txt", "m\n")
    commit(dir, "main-2")
    await openRepoOnEngine(dir)
    const opened = (await (await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })).json()) as {
      id: string
    }
    repoId = opened.id
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
    await removeRepo(dir)
  })

  test("I need to be able to select which branch I see in the graph. Like a dynamic filtering. It can be a mode, that when entered, I can activate branches on the left side explorer and only these are visible.", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.goto(`/?repo=${repoId}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    // Every branch: four subjects, no checkboxes, no strip, no chip.
    await expect(subjects(page)).toHaveText(["main-2", "b-only", "a-only", "base"])
    await expect(page.getByTestId("tree-check")).toHaveCount(0)
    await expect(page.getByTestId("tree-filter-strip")).toHaveCount(0)
    await expect(page.getByTestId("graph-filter-chip")).toHaveCount(0)

    // Enter the mode: the checked-out branch alone.
    const mode = page.getByTestId("tree-filter-mode")
    await expect(mode).toHaveAttribute("aria-pressed", "false")
    await mode.click()
    await expect(mode).toHaveAttribute("aria-pressed", "true")
    await expect(subjects(page)).toHaveText(["main-2", "base"])
    await expect(page.getByTestId("tree-filter-strip")).toContainText("Graph: 1 of 3 refs")
    await expect(page.getByTestId("graph-filter-count")).toHaveText("1 of 3 refs")
    // main is ticked and locked; a and b are unticked.
    await expect(check(page, "main")).toBeChecked()
    await expect(check(page, "main")).toBeDisabled()
    await expect(page.locator('[data-testid="tree-row"][data-label="main"] [data-testid="tree-lock"]')).toHaveAttribute(
      "title",
      "The checked-out branch is always shown",
    )
    await expect(check(page, "a")).not.toBeChecked()
    await expect(check(page, "b")).not.toBeChecked()

    // Tick a: its commit appears, b's does not, both counts say 2 of 3.
    await check(page, "a").click()
    await expect(check(page, "a")).toBeChecked()
    await expect(subjects(page)).toHaveText(["main-2", "a-only", "base"])
    await expect(page.getByTestId("tree-filter-count")).toHaveText("2 of 3")
    await expect(page.getByTestId("graph-filter-count")).toHaveText("2 of 3 refs")
    // The tick did not select a's tip in the grid (the click is the box's, not the row's).
    await expect(page.locator('[data-testid="grid-row"].selected .msg-text')).toHaveText("main-2")

    // Untick a: gone again.
    await check(page, "a").click()
    await expect(subjects(page)).toHaveText(["main-2", "base"])
    await expect(page.getByTestId("tree-filter-count")).toHaveText("1 of 3")

    // The selection survives a filter change when its commit is still listed.
    await page.locator('[data-testid="grid-row"]', { hasText: "main-2" }).click()
    await expect(page.locator('[data-testid="grid-row"].selected .msg-text')).toHaveText("main-2")
    await check(page, "b").click()
    await expect(subjects(page)).toHaveText(["main-2", "b-only", "base"])
    await expect(page.locator('[data-testid="grid-row"].selected .msg-text')).toHaveText("main-2")

    // Show all ticks everything and stays in the mode.
    await page.getByTestId("tree-filter-all").click()
    await expect(subjects(page)).toHaveText(["main-2", "b-only", "a-only", "base"])
    await expect(page.getByTestId("tree-filter-count")).toHaveText("3 of 3")
    await expect(check(page, "a")).toBeChecked()

    // Exit: every ref is back, the boxes, the strip and the chip are gone.
    await page.getByTestId("tree-filter-exit").click()
    await expect(mode).toHaveAttribute("aria-pressed", "false")
    await expect(subjects(page)).toHaveText(["main-2", "b-only", "a-only", "base"])
    await expect(page.getByTestId("tree-filter-strip")).toHaveCount(0)
    await expect(page.getByTestId("tree-check")).toHaveCount(0)
    await expect(page.getByTestId("graph-filter-chip")).toHaveCount(0)

    // The chip's × leaves the mode too.
    await mode.click()
    await expect(subjects(page)).toHaveText(["main-2", "base"])
    await page.getByRole("button", { name: "Show all refs" }).click()
    await expect(subjects(page)).toHaveText(["main-2", "b-only", "a-only", "base"])

    // The mode and the ticks are remembered for this repository.
    await mode.click()
    await check(page, "a").click()
    await expect(subjects(page)).toHaveText(["main-2", "a-only", "base"])
    await page.reload()
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    await expect(mode).toHaveAttribute("aria-pressed", "true")
    await expect(subjects(page)).toHaveText(["main-2", "a-only", "base"])
    await expect(check(page, "a")).toBeChecked()
    await expect(page.getByTestId("graph-filter-count")).toHaveText("2 of 3 refs")
  })
})

test.describe("Show all on a large ref set", () => {
  let dir: string
  let previous: string | null = null
  let repoId = ""

  test.beforeAll(async () => {
    previous = await currentRepoPath()
    dir = makeRepo("pg-graph-filter-many-")
    git(dir, "checkout", "-q", "-b", "a")
    write(dir, "a.txt", "a\n")
    commit(dir, "a-only")
    git(dir, "checkout", "-q", "main")
    git(dir, "checkout", "-q", "-b", "b")
    write(dir, "b.txt", "b\n")
    commit(dir, "b-only")
    git(dir, "checkout", "-q", "main")
    write(dir, "m.txt", "m\n")
    commit(dir, "main-2")
    for (let i = 0; i < 400; i++) git(dir, "branch", `b${i}`)
    await openRepoOnEngine(dir)
    repoId = ((await (await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })).json()) as { id: string }).id
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
    await removeRepo(dir)
  })

  test("Show all on 400 refs draws the graph", async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto(`/?repo=${repoId}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    await page.getByTestId("tree-filter-mode").click()
    await page.getByTestId("tree-filter-all").click()
    await expect(subjects(page)).toHaveText(["main-2", "b-only", "a-only", "base"])
    await expect(page.getByRole("alert")).toHaveCount(0)
  })
})
