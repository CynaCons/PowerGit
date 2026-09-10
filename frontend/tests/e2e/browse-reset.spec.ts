import { expect, test, type Page } from "@playwright/test"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner, 2026-09-09: "when I'm in the diff view, I should be able to right
// click on a file and hit reset. Same for the diff in the diff view. Should
// be able to select some line, and hit reset." And on what reset must mean:
// "if it's in the diff of the working directory, it should just reset the
// staged or unstaged changes, basically resetting what the user is looking
// at… For commits that are already committed… you just reset what the user
// has selected and put that in the staged of the current working directory."
//
// Every assertion below is on the working tree and the index, never on UI
// state: the whole risk of this feature is destroying something the user was
// not shown, and only git can say whether that happened.

// Line endings are normalised everywhere: core.autocrlf rewrites them on
// Windows, and `git checkout` is one of the commands that does.
const lines = (text: string) => text.split(/\r?\n/).join("|")

/** The working-tree file. */
function onDisk(dir: string, name: string): string {
  return lines(readFileSync(join(dir, name), "utf8"))
}

/** The same path as the index holds it. */
function staged(dir: string, name: string): string {
  return lines(git(dir, "show", `:${name}`))
}

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

/** Selects a graph row by its label and switches to the Diff tab. */
async function openDiffOf(page: Page, rowText: string): Promise<void> {
  const row = page.getByTestId("grid-row").filter({ hasText: rowText })
  await expect(row).toHaveCount(1, { timeout: 20_000 })
  await row.first().click()
  await page.getByRole("tab", { name: /Diff/ }).click()
}

/** A diff row matched on its text cell; the row itself starts with gutter numbers. */
function diffRow(page: Page, text: string) {
  return page
    .getByTestId("diff-pane")
    .locator(".diff-row")
    .filter({
      has: page.locator(".diff-row-text").filter({ hasText: new RegExp(`^${text.replace(/[+]/g, "[+]")}$`) }),
    })
}

test.describe("reset from the Browse diff view", () => {
  // Opening a repository moves the engine's "current" one, which is what
  // every spec that just does page.goto("/") boots from. Put it back.
  let previousRepo: string | null = null
  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
  })

  test("a Working directory file reset restores from the index and keeps staged work", async ({ page }) => {
    test.setTimeout(90_000)
    // makeRepo already committed a.txt as "base".
    const dir = makeRepo("pg-reset-wt-")
    write(dir, "a.txt", "base\nstaged\n")
    git(dir, "add", "a.txt")
    write(dir, "a.txt", "base\nstaged\nunstaged\n")
    try {
      await openInApp(page, dir)
      await openDiffOf(page, "Working directory")
      await expect(diffRow(page, "+unstaged")).toBeVisible({ timeout: 20_000 })

      await page.getByTestId("file-list-row").filter({ hasText: "a.txt" }).click({ button: "right" })
      const menu = page.getByTestId("diff-file-menu")
      await expect(menu).toBeVisible()
      await expect(menu.locator('[role="menuitem"] .MuiListItemText-root')).toHaveText([
        "Reset unstaged changes…",
        "Open with difftool",
        "Copy path",
      ])
      await page.getByTestId("ctx-diff-reset-file").click()

      const confirm = page.getByTestId("diff-reset-confirm")
      await expect(confirm).toContainText("Reset unstaged changes")
      // The promise the owner's semantics turn on.
      await expect(confirm).toContainText("anything already staged is kept")
      await page.getByTestId("diff-reset-confirm-confirm").click()

      await expect.poll(() => onDisk(dir, "a.txt"), { timeout: 15_000 }).toBe("base|staged|")
      expect(staged(dir, "a.txt")).toBe("base|staged|")
    } finally {
      await removeRepo(dir)
    }
  })

  test("selecting lines in a Working directory diff resets only those", async ({ page }) => {
    test.setTimeout(90_000)
    const dir = makeRepo("pg-reset-lines-")
    write(dir, "f.txt", "1\n2\n3\n")
    commit(dir, "start")
    write(dir, "f.txt", "1x\n2x\n3x\n")
    try {
      await openInApp(page, dir)
      await openDiffOf(page, "Working directory")
      await page.getByTestId("file-list-row").filter({ hasText: "f.txt" }).click()
      await expect(diffRow(page, "+3x")).toBeVisible({ timeout: 20_000 })

      await diffRow(page, "-1").click()
      await diffRow(page, "+1x").click({ modifiers: ["Control"] })
      const selected = page.getByTestId("diff-pane").locator(".diff-row-selected")
      await expect(selected).toHaveCount(2)

      // A refresh re-fetches this row's diff and hands the pane a new object.
      // The selection must survive it: the status poll fires every ten
      // seconds on its own, and a selection that empties itself while the
      // user reads is worse than no selection at all.
      await page.evaluate(() => window.dispatchEvent(new Event("focus")))
      await expect(page.getByTestId("panel-busy")).toHaveCount(0, { timeout: 15_000 })
      await expect(selected).toHaveCount(2)

      await diffRow(page, "+1x").click({ button: "right" })
      const menu = page.getByTestId("diff-line-menu")
      await expect(menu).toBeVisible()
      await expect(menu.locator('[role="menuitem"] .MuiListItemText-root')).toHaveText([
        "Reset selected 2 lines…",
        "Copy selected 2 lines",
      ])
      await page.getByTestId("ctx-diff-reset-lines").click()
      await page.getByTestId("diff-reset-confirm-confirm").click()

      await expect.poll(() => onDisk(dir, "f.txt"), { timeout: 15_000 }).toBe("1|2x|3x|")
    } finally {
      await removeRepo(dir)
    }
  })

  test("selecting lines in the Index diff unstages only those and leaves the file alone", async ({ page }) => {
    test.setTimeout(90_000)
    // The v0.15.5 fix: a partial selection used to build its patch from the
    // wrong side of the diff, so git refused every unstage narrower than a
    // whole hunk with "patch does not apply".
    const dir = makeRepo("pg-reset-index-")
    write(dir, "f.txt", "1\n2\n3\n")
    commit(dir, "start")
    write(dir, "f.txt", "1x\n2x\n3x\n")
    git(dir, "add", "f.txt")
    try {
      await openInApp(page, dir)
      await openDiffOf(page, "Index")
      await page.getByTestId("file-list-row").filter({ hasText: "f.txt" }).click()
      await expect(diffRow(page, "+3x")).toBeVisible({ timeout: 20_000 })

      await diffRow(page, "-1").click()
      await diffRow(page, "+1x").click({ modifiers: ["Control"] })
      await diffRow(page, "+1x").click({ button: "right" })
      await expect(page.getByTestId("diff-line-menu")).toBeVisible()
      await page.getByTestId("ctx-diff-reset-lines").click()

      const confirm = page.getByTestId("diff-reset-confirm")
      await expect(confirm).toContainText("not touched")
      await expect(page.getByTestId("diff-reset-confirm-confirm")).toHaveText("Unstage")
      await page.getByTestId("diff-reset-confirm-confirm").click()

      await expect.poll(() => staged(dir, "f.txt"), { timeout: 15_000 }).toBe("1|2x|3x|")
      // The working tree is untouched: the unstaged line went back to the
      // Working directory row, it was not discarded.
      expect(onDisk(dir, "f.txt")).toBe("1x|2x|3x|")
    } finally {
      await removeRepo(dir)
    }
  })

  test("undoing a file from a commit lands in the working tree and the index", async ({ page }) => {
    test.setTimeout(90_000)
    const dir = makeRepo("pg-reset-commit-")
    write(dir, "f.txt", "1\n2\n3\n")
    commit(dir, "before the edit")
    write(dir, "f.txt", "1x\n2x\n3x\n")
    commit(dir, "the edit to undo")
    try {
      await openInApp(page, dir)
      await openDiffOf(page, "the edit to undo")
      await expect(diffRow(page, "+3x")).toBeVisible({ timeout: 20_000 })

      await page.getByTestId("file-list-row").filter({ hasText: "f.txt" }).click({ button: "right" })
      const menu = page.getByTestId("diff-file-menu")
      await expect(menu).toBeVisible()
      // On a commit the verb is Undo: nothing is being restored, a change is
      // being reversed.
      await expect(menu.locator('[role="menuitem"] .MuiListItemText-root').first()).toHaveText(
        "Undo this file's changes…",
      )
      await page.getByTestId("ctx-diff-reset-file").click()

      const confirm = page.getByTestId("diff-reset-confirm")
      await expect(confirm).toContainText("History is not rewritten")
      await page.getByTestId("diff-reset-confirm-confirm").click()

      await expect.poll(() => onDisk(dir, "f.txt"), { timeout: 15_000 }).toBe("1|2|3|")
      // "put that in the staged of the current working directory": staged,
      // ready to commit, not merely sitting in the working tree.
      expect(staged(dir, "f.txt")).toBe("1|2|3|")
      // And the commit itself is untouched.
      expect(lines(git(dir, "show", "HEAD:f.txt"))).toBe("1x|2x|3x|")
    } finally {
      await removeRepo(dir)
    }
  })

  test("resetting an untracked file deletes it, behind a clearly different confirmation", async ({ page }) => {
    test.setTimeout(90_000)
    const dir = makeRepo("pg-reset-untracked-")
    write(dir, "new.txt", "never committed\n")
    try {
      await openInApp(page, dir)
      await openDiffOf(page, "Working directory")
      await expect(page.getByTestId("file-list-row").filter({ hasText: "new.txt" })).toBeVisible({ timeout: 20_000 })

      await page.getByTestId("file-list-row").filter({ hasText: "new.txt" }).click({ button: "right" })
      await page.getByTestId("ctx-diff-reset-file").click()

      const confirm = page.getByTestId("diff-reset-confirm")
      await expect(confirm).toContainText("Delete untracked file")
      await expect(confirm).toContainText("cannot be recovered")
      await expect(page.getByTestId("diff-reset-confirm-confirm")).toHaveText("Delete file")
      await page.getByTestId("diff-reset-confirm-confirm").click()

      await expect.poll(() => existsSync(join(dir, "new.txt")), { timeout: 15_000 }).toBe(false)
    } finally {
      await removeRepo(dir)
    }
  })
})
