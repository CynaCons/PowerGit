import { expect, test } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.15.0, owner: "interactive rebase with a GE-style list". The engine
// captures git's own todo (GIT_SEQUENCE_EDITOR) and runs the list the dialog
// hands back, so the two things a person actually does — fold a commit into
// the one before it, and move a commit — are asserted here end to end, plus
// an `edit` line stopping the rebase for an amend.

test.describe("interactive rebase", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeEach(async () => {
    previousRepo ??= await currentRepoPath()
    // Three independent commits on topic, so nothing conflicts and the only
    // thing under test is the todo list.
    repoDir = makeRepo("pg-irebase-")
    git(repoDir, "checkout", "-q", "-b", "topic")
    write(repoDir, "b.txt", "b\n")
    commit(repoDir, "add b")
    write(repoDir, "c.txt", "c\n")
    commit(repoDir, "add c")
    write(repoDir, "d.txt", "d\n")
    commit(repoDir, "add d")
    await openRepoOnEngine(repoDir)
  })

  test.afterEach(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  const openTodo = async (page: import("@playwright/test").Page) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    // Rebase interactively from the base commit: all three commits are listed.
    await page.getByTestId("grid-row").filter({ hasText: "base" }).first().click({ button: "right" })
    await page.getByTestId("ctx-rebase-interactive").click()
    await page.getByTestId("rebase-confirm").click()
    await expect(page.getByTestId("interactive-rebase-dialog")).toBeVisible()
  }

  test("squashing folds a commit into the one before it", async ({ page }) => {
    await openTodo(page)
    const rows = page.getByTestId("todo-row")
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText("add b")
    await expect(rows.nth(2)).toContainText("add d")

    await rows.nth(2).getByTestId("todo-action").selectOption("squash")
    await rows.nth(2).getByTestId("todo-message").fill("add c and d")
    await expect(page.getByTestId("todo-summary")).toContainText("1 folded")
    await page.getByTestId("irebase-confirm").click()

    await expect(page.getByTestId("interactive-rebase-dialog")).toHaveCount(0)
    await expect(page.getByTestId("op-banner")).toHaveCount(0)
    const grid = page.getByTestId("grid-row")
    await expect(grid.filter({ hasText: "add d" })).toHaveCount(0)
    await expect(grid.filter({ hasText: "add c and d" })).toHaveCount(1)
  })

  test("moving a commit up replays it earlier", async ({ page }) => {
    await openTodo(page)
    const rows = page.getByTestId("todo-row")
    await rows.nth(2).getByTestId("todo-up").click()
    await expect(rows.nth(1)).toContainText("add d")
    await expect(rows.nth(2)).toContainText("add c")
    await page.getByTestId("irebase-confirm").click()

    await expect(page.getByTestId("interactive-rebase-dialog")).toHaveCount(0)
    const grid = page.getByTestId("grid-row")
    // Newest first in the grid: c on top of d now.
    await expect(grid.nth(0)).toContainText("add c")
    await expect(grid.nth(1)).toContainText("add d")
  })

  test("an edit line stops the rebase and the banner continues it", async ({ page }) => {
    await openTodo(page)
    await page.getByTestId("todo-row").nth(1).getByTestId("todo-action").selectOption("edit")
    await page.getByTestId("irebase-confirm").click()

    const banner = page.getByTestId("op-banner")
    await expect(banner).toHaveAttribute("data-state", "rebasing")
    // Stopped to amend, not stopped on a conflict: Continue is available.
    await expect(page.getByTestId("op-conflict-count")).toHaveCount(0)
    await expect(page.getByTestId("op-continue")).toBeEnabled()
    await page.getByTestId("op-continue").click()

    await expect(page.getByTestId("op-banner")).toHaveCount(0)
    await expect(page.getByTestId("grid-row").filter({ hasText: "add d" })).toHaveCount(1)
  })
})
