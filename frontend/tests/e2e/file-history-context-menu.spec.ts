import { expect, test, type Page } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.16.0 review, finding 2: "File History exposes the main revision menu,
// including operations absent from GE's FileHistory context menu. Failure:
// open a file history, right-click an old commit, choose Reset or
// Checkout." Git Extensions' FormFileHistory menu is copy, the two
// difftools, manipulate commit (revert / cherry-pick) and the follow
// options. This spec opens a file history on a real repository,
// right-clicks an old commit and asserts that item set, that the Browse
// menu's branch operations are not there, that the submenus open, that the
// follow check item drives the view's own toggle, and that Copy works.

const historyRows = (page: Page) => page.locator('[data-testid="file-history"] [data-testid="grid-row"]')

test("file history rows get Git Extensions' FormFileHistory menu, not the Browse menu", async ({ page, context }) => {
  test.setTimeout(120_000)
  const previous = await currentRepoPath()
  const dir = makeRepo("pg-fh-menu-")
  write(dir, "doc.txt", "one\n")
  commit(dir, "doc-1")
  write(dir, "doc.txt", "one\ntwo\n")
  commit(dir, "doc-2")
  git(dir, "mv", "doc.txt", "renamed.txt")
  commit(dir, "doc-rename")
  write(dir, "renamed.txt", "one\ntwo\nthree\n")
  commit(dir, "doc-3")
  await openRepoOnEngine(dir)
  const opened = (await (await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })).json()) as {
    id: string
  }
  const clipboard = test.info().project.name !== "webkit"
  if (clipboard) await context.grantPermissions(["clipboard-read", "clipboard-write"])

  const menu = page.locator("#file-history-context-menu")
  const submenu = page.locator("#file-history-context-menu-sub")
  // The header's own Follow renames toggle (MUI Checkbox: the testid sits on the root, the input under it).
  const followToggle = page.getByTestId("file-history-follow").locator('input[type="checkbox"]')

  try {
    await page.goto(`/?repo=${opened.id}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    await page.getByTestId("grid-row").first().click()
    await page.getByRole("tab", { name: "File Tree" }).click()
    await page.getByTestId("commit-file-tree").locator('[data-path="renamed.txt"]').click({ button: "right" })
    await page.getByTestId("ctx-tree-file-history").click()
    await expect(page.getByTestId("file-history")).toBeVisible()
    const rows = historyRows(page)
    await expect(rows).toHaveCount(4)

    // --- an old commit: the FormFileHistory item set, nothing of Browse ------
    const oldRow = rows.nth(3)
    await expect(oldRow.locator(".msg-text")).toHaveText("doc-1")
    const oldSha = ((await oldRow.getByTestId("sha-cell").getAttribute("title")) ?? "").trim()
    expect(oldSha).toMatch(/^[0-9a-f]{40}$/)
    await oldRow.click({ button: "right" })
    await expect(menu).toBeVisible()
    const items = menu.locator('[role="menuitem"], [role="menuitemcheckbox"]')
    expect(await items.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")))).toEqual([
      "ctx-copy",
      "fh-difftool",
      "fh-difftool-local",
      "fh-manipulate",
      "fh-follow",
      "fh-follow-exact",
    ])
    await expect(items.locator(".MuiListItemText-root")).toHaveText([
      "Copy",
      "Open with difftool",
      "Difftool selected ↔ local",
      "Manipulate commit",
      "Detect and follow renames",
      "Detect and follow — exact renames and copies only",
    ])
    // Four groups: three separators, none above the first item.
    await expect(menu.locator("hr")).toHaveCount(3)
    expect(
      await menu
        .locator("ul > *")
        .first()
        .evaluate((el) => el.tagName),
    ).not.toBe("HR")
    // The Browse menu and its branch operations are not what opened.
    await expect(page.locator("#revision-context-menu")).toHaveCount(0)
    for (const id of [
      "ctx-reset",
      "ctx-checkout",
      "ctx-merge",
      "ctx-rebase",
      "ctx-rebase-interactive",
      "ctx-create-branch",
      "ctx-create-tag",
      "ctx-archive",
      "ctx-fixup",
      "ctx-compare",
    ]) {
      await expect(page.getByTestId(id), id).toHaveCount(0)
    }
    // The follow items mirror the header's toggles.
    await expect(page.getByTestId("fh-follow")).toHaveAttribute("aria-checked", "true")
    await expect(page.getByTestId("fh-follow-exact")).toHaveAttribute("aria-checked", "false")

    // --- Manipulate commit opens beside the menu with revert / cherry-pick ---
    await page.getByTestId("fh-manipulate").click()
    await expect(submenu).toBeVisible()
    await expect(menu).toBeVisible()
    await expect(submenu.locator(".MuiListItemText-root")).toHaveText(["Revert commit", "Cherry pick commit"])
    await submenu.getByTestId("fh-revert").click()
    await expect(menu).toHaveCount(0)
    const revert = page.getByRole("dialog")
    await expect(revert).toBeVisible()
    await expect(revert).toContainText("doc-1")
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(revert).toBeHidden()

    // --- Copy puts the commit's own SHA on the clipboard ----------------------
    await oldRow.click({ button: "right" })
    await expect(menu).toBeVisible()
    await page.getByTestId("ctx-copy").click()
    await expect(submenu.locator(".MuiListItemText-root").first()).toHaveText("SHA")
    await submenu.getByTestId("ctx-copy-sha").click()
    await expect(menu).toHaveCount(0)
    if (clipboard) {
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(oldSha)
    }

    // --- the follow check item is the view's toggle: renames stop being followed
    await rows.first().click({ button: "right" })
    await expect(menu).toBeVisible()
    await page.getByTestId("fh-follow").click()
    await expect(menu).toHaveCount(0)
    await expect(followToggle).not.toBeChecked()
    await expect(rows).toHaveCount(2)
    await expect(rows.locator(".msg-text")).toHaveText(["doc-3", "doc-rename"])
    await rows.first().click({ button: "right" })
    await expect(page.getByTestId("fh-follow")).toHaveAttribute("aria-checked", "false")
    await expect(page.getByTestId("fh-follow-exact")).toHaveAttribute("aria-disabled", "true")
    await page.getByTestId("fh-follow").click()
    await expect(followToggle).toBeChecked()
    await expect(rows).toHaveCount(4)

    // Escape brings the full history back, untouched by any of it.
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("file-history")).toBeHidden()
    await expect(page.getByTestId("grid-row")).toHaveCount(5)
  } finally {
    if (previous) await openRepoOnEngine(previous)
    await removeRepo(dir)
  }
})
