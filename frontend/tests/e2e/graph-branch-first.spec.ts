import { expect, test, type Page } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.21.7, owner (2026-10-14): "sometimes I want to just visualize my
// branch as a whole … all the commits of my branch first, in a contiguous,
// continuous series of rows one under the other, and then I'm okay having
// the rest of the history based on times and dates … a toggle … I want the
// default option to be that all the commits of our active current branch
// are displayed first … since the base of the branch."
// Fixture: feature forks from main's base and the two branches alternate
// commits, so by date feature's commits sit between main's.

const subjects = (page: Page) => page.locator('[data-testid="grid-row"] .msg-text')

test.describe("my branch first", () => {
  let dir: string
  let previous: string | null = null
  let repoId = ""

  test.beforeAll(async () => {
    previous = await currentRepoPath()
    dir = makeRepo("pg-branch-first-")
    git(dir, "checkout", "-q", "-b", "feature")
    write(dir, "f.txt", "1\n")
    commit(dir, "f1")
    git(dir, "checkout", "-q", "main")
    write(dir, "m.txt", "1\n")
    commit(dir, "m1")
    git(dir, "checkout", "-q", "feature")
    write(dir, "f.txt", "2\n")
    commit(dir, "f2")
    git(dir, "checkout", "-q", "main")
    write(dir, "m.txt", "2\n")
    commit(dir, "m2")
    git(dir, "checkout", "-q", "feature")
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

  test("by default the checked-out branch's commits since its base come first, then the rest by date; the toggle is remembered", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.goto(`/?repo=${repoId}`)
    await expect(page.getByTestId("status-branch")).toHaveText("feature", { timeout: 30_000 })
    await expect(subjects(page)).toHaveText(["f2", "f1", "m2", "m1", "base"])

    await page.getByTestId("graph-options-bar").hover()
    const toggle = page.getByTestId("graph-branch-first")
    await expect(toggle).toHaveAttribute("aria-pressed", "true")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await expect(subjects(page)).toHaveText(["m2", "f2", "m1", "f1", "base"])

    await page.reload()
    await expect(subjects(page)).toHaveText(["m2", "f2", "m1", "f1", "base"], { timeout: 30_000 })
    await page.getByTestId("graph-options-bar").hover()
    await page.getByTestId("graph-branch-first").click()
    await expect(subjects(page)).toHaveText(["f2", "f1", "m2", "m1", "base"])
  })
})
