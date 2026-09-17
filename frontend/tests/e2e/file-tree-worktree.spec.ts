import { expect, test, type Locator, type Page } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner (2026-09-11, v0.16.0): "accessing a file in the file tree when
// selecting the working directory pseudo commit doesn't load. It should load
// the latest commit on that branch on which the working directory is based."
// Git Extensions lists HEAD's tree for its artificial commits and reads the
// file from the working tree (Working directory row) or from the index
// (Index row): FileViewer.ViewGitItemAsync goes to ViewFileAsync for
// WorkTreeId and to the index blob for IndexId. This spec builds a
// repository with one committed file edited on disk and another one staged
// (then edited again, so disk and index differ), and checks what each
// pseudo row's File Tree shows for both files.

// The bottom panel renders deferred: for a few frames after a row click the
// tree is still the previous row's, and a click into it (or its context
// menu) would act on that row. Wait until the tree belongs to the clicked
// row before touching it.
async function selectRow(page: Page, row: Locator, id: string) {
  await row.click()
  await expect(page.getByTestId("commit-file-tree-wrap")).toHaveAttribute("data-row", id)
}

test("File Tree of the Working directory row shows the file as it is on disk, of the Index row as staged", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const previous = await currentRepoPath()
  const dir = makeRepo("pg-tree-worktree-")
  write(dir, "notes.txt", "notes as committed\n")
  commit(dir, "notes")
  // notes.txt: edited on disk only (Working directory).
  write(dir, "notes.txt", "notes edited in the working tree\n")
  // a.txt: staged, then edited again, so the index and the disk differ.
  write(dir, "a.txt", "a staged in the index\n")
  git(dir, "add", "a.txt")
  write(dir, "a.txt", "a staged in the index\nplus an unstaged line\n")
  await openRepoOnEngine(dir)
  const opened = (await (await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })).json()) as {
    id: string
  }

  try {
    await page.goto(`/?repo=${opened.id}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    const rows = page.getByTestId("grid-row")
    const worktreeRow = rows.filter({ hasText: "Working directory" })
    const indexRow = rows.filter({ hasText: "Index" })
    await expect(worktreeRow).toHaveCount(1, { timeout: 20_000 })
    await expect(indexRow).toHaveCount(1)

    // --- Working directory: HEAD's tree, content from the disk -------------
    await worktreeRow.click()
    await page.getByRole("tab", { name: "File Tree" }).click()
    await expect(page.getByTestId("commit-file-tree-wrap")).toHaveAttribute("data-row", "WORKTREE")
    const tree = page.getByTestId("commit-file-tree")
    const notes = tree.locator('[data-path="notes.txt"]')
    await expect(notes).toBeVisible()
    await notes.click()
    const blob = page.getByTestId("blob-pane")
    await expect(blob).toContainText("notes edited in the working tree")
    await tree.locator('[data-path="a.txt"]').click()
    await expect(blob).toContainText("plus an unstaged line")

    // --- Index: HEAD's tree, content from the index -------------------------
    await selectRow(page, indexRow, "INDEX")
    await expect(tree.locator('[data-path="a.txt"]')).toBeVisible()
    await tree.locator('[data-path="a.txt"]').click()
    await expect(blob).toContainText("a staged in the index")
    await expect(blob).not.toContainText("plus an unstaged line")
    // Not staged: the index still holds the committed text.
    await tree.locator('[data-path="notes.txt"]').click()
    await expect(blob).toContainText("notes as committed")
    await expect(blob).not.toContainText("edited in the working tree")

    // --- A real commit again: the tree is that commit's --------------------
    const notesRow = rows.filter({ hasText: "notes" }).first()
    const notesSha = (await notesRow.getByTestId("sha-cell").getAttribute("title")) ?? ""
    await selectRow(page, notesRow, notesSha)
    await tree.locator('[data-path="notes.txt"]').click()
    await expect(blob).toContainText("notes as committed")

    // --- File history from the pending row: View reads the working tree ----
    await selectRow(page, worktreeRow, "WORKTREE")
    await tree.locator('[data-path="notes.txt"]').click({ button: "right" })
    await page.getByTestId("ctx-tree-file-history").click()
    const view = page.getByTestId("file-history")
    await expect(view).toHaveAttribute("data-path", "notes.txt")
    const historyRows = view.locator('[data-testid="grid-row"]')
    await expect(historyRows.first()).toContainText("Working directory")
    await expect(historyRows.first()).toHaveClass(/selected/)
    await page.getByRole("tab", { name: "View" }).click()
    await expect(page.getByTestId("blob-pane")).toContainText("notes edited in the working tree")
    await page.keyboard.press("Escape")
    await expect(view).toBeHidden()
  } finally {
    if (previous) await openRepoOnEngine(previous)
    await removeRepo(dir)
  }
})
