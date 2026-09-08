import { expect, test, type Page } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.15.0, owner: "the right-click menu will be upgraded". The commit menu
// is Git Extensions' full one now: five groups separated by dividers, an
// icon on every row, the same shortcuts the toolbar shows, and submenus for
// reset / delete / compare / copy. What is in it is unit-tested
// (revisionMenuModel.test.ts); this spec proves the rendering, the submenu
// behaviour and the ref-chip menu against a real repository.

const EXPECTED_ORDER = [
  "ctx-checkout",
  "ctx-merge",
  "ctx-rebase",
  "ctx-rebase-interactive",
  "ctx-reset",
  "ctx-create-branch",
  "ctx-create-tag",
  "ctx-delete-branch",
  "ctx-delete-tag",
  "ctx-cherry-pick",
  "ctx-revert",
  "ctx-fixup",
  "ctx-squash",
  "ctx-compare",
  "ctx-copy",
  "ctx-archive",
  "ctx-open-browser",
]

test.describe("revision context menu", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    // A row that carries both a branch (not the current one) and a tag, so
    // every conditional entry of the menu is present at once.
    repoDir = makeRepo("pg-ctxmenu-")
    write(repoDir, "b.txt", "b\n")
    commit(repoDir, "second")
    git(repoDir, "branch", "topic")
    git(repoDir, "tag", "v1.0")
    write(repoDir, "c.txt", "c\n")
    commit(repoDir, "third")
    await openRepoOnEngine(repoDir)
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
  })

  const openMenu = async (page: Page) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()
    // The chips come from each revision's own refs, but Merge and the two
    // Delete submenus classify them against the ref tree, which lands a
    // moment later. Wait for the tree, or the menu is built from an empty
    // branch list and those three entries are hidden.
    await expect(page.locator('[data-testid="tree-row"][data-label="topic"]')).toBeVisible()
    await expect(page.locator('[data-testid="tree-row"][data-label="v1.0"]')).toBeVisible()
    await page.locator('[data-testid="grid-row"]:has([data-ref="topic"])').first().click({ button: "right" })
    await expect(page.locator("#revision-context-menu")).toBeVisible()
  }

  test("shows the Git Extensions groups in order, with dividers, icons and shortcuts", async ({ page }) => {
    await openMenu(page)
    const ids = await page
      .locator('#revision-context-menu [role="menuitem"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")))
    expect(ids).toEqual(EXPECTED_ORDER)

    // One separator per group boundary, and none above the first item.
    await expect(page.locator("#revision-context-menu hr")).toHaveCount(4)
    const firstChild = await page
      .locator("#revision-context-menu > ul > *")
      .first()
      .evaluate((el) => el.tagName)
    expect(firstChild).not.toBe("HR")

    // An icon on every row (CommitFileContextMenu house style).
    for (const id of EXPECTED_ORDER) {
      await expect(page.locator(`#revision-context-menu [data-testid="${id}"] svg`).first()).toBeVisible()
    }

    await expect(page.getByTestId("ctx-checkout")).toContainText("Ctrl+.")
    await expect(page.getByTestId("ctx-merge")).toContainText("Ctrl+M")
    await expect(page.getByTestId("ctx-merge")).toContainText("Merge 'topic' into current branch")
    await expect(page.getByTestId("ctx-rebase")).toContainText("Ctrl+Shift+E")
    // No remote in the fixture: the item is there, greyed, not missing.
    await expect(page.getByTestId("ctx-open-browser")).toHaveAttribute("aria-disabled", "true")
    // Nothing staged: the fixup/squash pair is disabled too.
    await expect(page.getByTestId("ctx-fixup")).toHaveAttribute("aria-disabled", "true")
  })

  test("a submenu opens beside the menu without closing it, and its item acts", async ({ page }) => {
    await openMenu(page)
    await page.getByTestId("ctx-reset").click()
    const sub = page.locator("#revision-context-menu-sub")
    await expect(sub).toBeVisible()
    // The parent must still be open: a submenu click is inside the menu.
    await expect(page.locator("#revision-context-menu")).toBeVisible()
    await expect(sub.getByTestId("ctx-reset-soft")).toBeVisible()
    await expect(sub.getByTestId("ctx-reset-hard")).toBeVisible()

    await sub.getByTestId("ctx-reset-mixed").click()
    await expect(page.getByRole("heading", { name: /Reset branch/ })).toBeVisible()
    await page.getByRole("button", { name: "Cancel" }).click()
  })

  test("the delete submenus list the row's own refs", async ({ page }) => {
    await openMenu(page)
    await page.getByTestId("ctx-delete-branch").click()
    await expect(page.locator("#revision-context-menu-sub").getByTestId("ctx-delete-branch-topic")).toBeVisible()

    await page.getByTestId("ctx-delete-tag").click()
    const sub = page.locator("#revision-context-menu-sub")
    await expect(sub.getByTestId("ctx-delete-tag-v1.0")).toBeVisible()
    // Deleting asks in-app, never through a native prompt.
    await sub.getByTestId("ctx-delete-tag-v1.0").click()
    await expect(page.getByTestId("confirm-dialog")).toBeVisible()
    await page.getByTestId("confirm-dialog-cancel").click()
  })

  test("Compare offers the pairs and opens the compare view", async ({ page }) => {
    await openMenu(page)
    await page.getByTestId("ctx-compare").click()
    const sub = page.locator("#revision-context-menu-sub")
    await expect(sub.getByTestId("ctx-compare-head")).toBeVisible()
    await expect(sub.getByTestId("ctx-compare-to-base")).toHaveAttribute("aria-disabled", "true")
    await sub.getByTestId("ctx-compare-head").click()

    await expect(page.getByTestId("compare-dialog")).toBeVisible()
    await expect(page.getByTestId("compare-files")).toBeVisible()
    await page.getByTestId("compare-close").click()
  })

  test("Copy puts the commit's own fields on the clipboard", async ({ page, context }) => {
    const canReadClipboard = test.info().project.name !== "webkit"
    if (canReadClipboard) await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await openMenu(page)
    const sha = await page
      .locator('[data-testid="grid-row"]:has([data-ref="topic"])')
      .first()
      .getByTestId("sha-cell")
      .textContent()

    await page.getByTestId("ctx-copy").click()
    await page.locator("#revision-context-menu-sub").getByTestId("ctx-copy-sha").click()
    if (canReadClipboard) {
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain((sha ?? "").trim())
    }
    // The menu closes after acting, like every other item.
    await expect(page.locator("#revision-context-menu")).toHaveCount(0)
  })

  test("a ref chip has its own menu, and pending rows keep the one-item menu", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("grid-row").first()).toBeVisible()

    await page.locator('[data-ref="topic"]').first().click({ button: "right" })
    await expect(page.getByTestId("refctx-checkout")).toBeVisible()
    await expect(page.getByTestId("refctx-merge")).toContainText("Merge 'topic' into current branch")
    await expect(page.getByTestId("refctx-rebase")).toBeVisible()
    await expect(page.getByTestId("refctx-delete")).toBeVisible()
    // The row menu must not have opened underneath it.
    await expect(page.locator("#revision-context-menu")).toHaveCount(0)
    await page.keyboard.press("Escape")

    // Pending-change rows are not commits (v0.14.1): one entry only.
    write(repoDir, "a.txt", "dirty\n")
    const pending = page.locator('[data-testid="grid-row"][data-artificial]')
    await expect(pending.first()).toBeVisible({ timeout: 20_000 })
    await pending.first().click({ button: "right" })
    await expect(page.getByTestId("ctx-open-commit")).toBeVisible()
    await expect(page.getByTestId("ctx-rebase")).toHaveCount(0)
  })
})
