import { expect, test, type Page } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner (2026-09-11, v0.16.0): "In main view, in the file tree, right click a
// file and show the file history. Here again, we have to be functionally
// equivalent to GE." Git Extensions' FormFileHistory: the revision grid
// limited to the commits that touched the path (renames followed), with
// the diff of that file at the selected commit and its content. This spec
// builds a repository where one file changes three times and is renamed
// once, with unrelated commits around it, opens the history from the File
// Tree's menu, and checks the grid, the Diff and View tabs, the follow
// toggle, Escape, and the other two entry points (Ctrl+Shift+H, the Diff
// tab's file menu).

const historyRows = (page: Page) => page.locator('[data-testid="file-history"] [data-testid="grid-row"]')

test("View file history: the grid lists only the file's commits, the diff shows that file, Escape returns", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const previous = await currentRepoPath()
  const dir = makeRepo("pg-file-history-")
  write(dir, "doc.txt", "one\n")
  commit(dir, "doc-1")
  write(dir, "other.txt", "x\n")
  commit(dir, "other-1")
  write(dir, "doc.txt", "one\ntwo\n")
  commit(dir, "doc-2")
  git(dir, "mv", "doc.txt", "renamed.txt")
  commit(dir, "doc-rename")
  write(dir, "other.txt", "y\n")
  commit(dir, "other-2")
  write(dir, "renamed.txt", "one\ntwo\nthree\n")
  commit(dir, "doc-3")
  write(dir, "other.txt", "z\n")
  commit(dir, "other-3")
  await openRepoOnEngine(dir)
  const opened = (await (await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })).json()) as {
    id: string
  }

  try {
    await page.goto(`/?repo=${opened.id}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    const mainRows = page.getByTestId("grid-row")
    await expect(mainRows).toHaveCount(8)

    // --- the File Tree's menu ---------------------------------------------
    await mainRows.first().click()
    await page.getByRole("tab", { name: "File Tree" }).click()
    const tree = page.getByTestId("commit-file-tree")
    const fileRow = tree.locator('[data-path="renamed.txt"]')
    await expect(fileRow).toBeVisible()
    await fileRow.click({ button: "right" })
    const treeMenu = page.getByTestId("file-tree-menu")
    await expect(treeMenu).toBeVisible()
    await expect(treeMenu.locator(".MuiListItemText-root")).toHaveText(["View file history", "Copy path"])
    await page.getByTestId("ctx-tree-file-history").click()

    // --- the view: only the commits that touched the file, renames followed
    const view = page.getByTestId("file-history")
    await expect(view).toBeVisible()
    await expect(view).toHaveAttribute("data-path", "renamed.txt")
    await expect(page.getByTestId("file-history-path")).toHaveText("renamed.txt")
    const rows = historyRows(page)
    await expect(rows).toHaveCount(4)
    await expect(rows.locator(".msg-text")).toHaveText(["doc-3", "doc-rename", "doc-2", "doc-1"])
    // The main grid is gone while the history shows; nothing else is.
    await expect(page.getByTestId("grid-row")).toHaveCount(4)

    // Diff tab (the default, as in GE): that file at the selected commit.
    await expect(page.getByRole("tab", { name: "Diff" })).toHaveAttribute("aria-selected", "true")
    const diff = page.getByTestId("diff-view")
    await expect(diff).toBeVisible()
    await expect(diff).toContainText("+three")
    await expect(diff).not.toContainText("other.txt")

    // Before the rename the file was doc.txt: the title says so and the
    // diff is the old name's.
    await rows.nth(2).click()
    await expect(page.getByTestId("file-history-path")).toHaveText("renamed.txt (doc.txt)")
    await expect(diff).toContainText("+two")
    await expect(diff).not.toContainText("three")

    // View tab: the blob at that commit, under its name then.
    await page.getByRole("tab", { name: "View" }).click()
    const blob = page.getByTestId("blob-pane")
    await expect(blob).toBeVisible()
    await expect(blob).toContainText("two")
    await expect(blob).not.toContainText("three")

    // Commit tab: the commit's own details.
    await page.getByRole("tab", { name: "Commit" }).click()
    await expect(page.getByTestId("file-history-commit")).toContainText("doc-2")

    // Follow renames off (GE "Detect and follow renames"): the new name
    // only exists from the rename on.
    await page.getByTestId("file-history-follow").click()
    await expect(rows).toHaveCount(2)
    await expect(rows.locator(".msg-text")).toHaveText(["doc-3", "doc-rename"])
    await page.getByTestId("file-history-follow").click()
    await expect(rows).toHaveCount(4)

    // --- Escape brings the full history back, untouched ---------------------
    await page.keyboard.press("Escape")
    await expect(view).toBeHidden()
    await expect(page.getByTestId("grid-row")).toHaveCount(8)
    await expect(page.getByTestId("grid-row").first().locator(".msg-text")).toHaveText("other-3")

    // --- Ctrl+Shift+H on the file selected in the tree ---------------------
    await expect(page.getByTestId("commit-file-tree")).toBeVisible()
    await tree.locator('[data-path="other.txt"]').click()
    await expect(page.getByTestId("blob-pane")).toContainText("z")
    await page.keyboard.press("Control+Shift+H")
    await expect(view).toHaveAttribute("data-path", "other.txt")
    await expect(historyRows(page)).toHaveCount(3)
    await page.getByTestId("file-history-close").click()
    await expect(view).toBeHidden()
    await expect(page.getByTestId("grid-row")).toHaveCount(8)

    // --- the Diff tab's file menu ------------------------------------------
    await page.getByRole("tab", { name: /Diff/ }).click()
    const fileListRow = page.getByTestId("file-list-row").filter({ hasText: "other.txt" })
    await expect(fileListRow).toBeVisible()
    await fileListRow.click({ button: "right" })
    await page.getByTestId("ctx-diff-file-history").click()
    await expect(view).toHaveAttribute("data-path", "other.txt")
    // Opened from a commit that touched the file: that commit is selected.
    await expect(historyRows(page).nth(0)).toHaveClass(/selected/)
    await expect(page.getByTestId("diff-view")).toContainText("+z")
    await page.keyboard.press("Escape")
    await expect(view).toBeHidden()
  } finally {
    if (previous) await openRepoOnEngine(previous)
    await removeRepo(dir)
  }
})
