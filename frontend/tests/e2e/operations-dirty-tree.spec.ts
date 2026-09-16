import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { expect, test, type Page } from "@playwright/test"

import { pickBranch } from "../dialogHelpers"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

function status(root: string) {
  return execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
}
function dirty(root: string) {
  write(root, "fileB", "dirty B\n")
  write(root, "fileC", "dirty C\n")
  write(root, "fileD", "dirty D\n")
  git(root, "add", "fileD")
  write(root, "untracked-1", "one\n")
  write(root, "untracked-2", "two\n")
}
function expectDirt(root: string) {
  expect(status(root)).toMatch(/ M fileB/)
  expect(status(root)).toMatch(/ M fileC/)
  expect(status(root)).toMatch(/M {2}fileD/)
  expect(status(root)).toMatch(/\?\? untracked-1/)
  expect(status(root)).toMatch(/\?\? untracked-2/)
}
function row(page: Page, text: string) {
  return page.getByTestId("grid-row").filter({ hasText: text }).first()
}

test.describe("operations on a developer's dirty tree", () => {
  let root: string
  let previous: string | null = null
  test.beforeEach(async () => {
    previous ??= await currentRepoPath()
    root = makeRepo("pg-dirty-ops-")
    for (const name of ["fileA", "fileB", "fileC", "fileD"]) write(root, name, `${name}\n`)
    commit(root, "files")
    git(root, "checkout", "-q", "-b", "feature")
    write(root, "fileA", "feature\n")
    commit(root, "feature change")
    git(root, "checkout", "-q", "main")
    write(root, "fileE", "main\n")
    commit(root, "main advance")
    git(root, "checkout", "-q", "-b", "pick-source", "HEAD~1")
    write(root, "fileF", "pick source\n")
    commit(root, "pick source")
    git(root, "checkout", "-q", "main")
    dirty(root)
    await openRepoOnEngine(root)
  })
  test.afterEach(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
    await removeRepo(root)
  })

  test("merge, rebase, cherry-pick and revert preserve non-overlapping tracked, staged and untracked dirt", async ({
    page,
  }) => {
    await page.goto("/")
    await expect(row(page, "main advance")).toBeVisible()
    await page.getByTestId("merge-button").click()
    await pickBranch(page, "merge-branch", "feature")
    await page.getByTestId("merge-confirm").click()
    await expect(page.getByTestId("merge-dialog")).toHaveCount(0)
    expectDirt(root)
    await expect(page.getByRole("alert")).toHaveCount(0)

    // Git always requires a clean tracked tree for rebase. The dirty-tree
    // default is checked, but exercise the inline recovery path explicitly.
    await row(page, "feature change").click({ button: "right" })
    await page.getByTestId("ctx-rebase").click()
    await expect(page.getByTestId("rebase-autostash")).toBeChecked()
    await page.getByTestId("rebase-autostash").click()
    await page.getByTestId("rebase-confirm").click()
    const rebase = page.getByTestId("rebase-dialog")
    await expect(rebase).toContainText(/cannot rebase/i)
    await rebase.getByTestId("rebase-stash-retry").click()
    await expect(rebase).toHaveCount(0)
    expectDirt(root)
    await expect(page.getByRole("alert")).toHaveCount(0)

    await row(page, "pick source").click({ button: "right" })
    await page.getByTestId("ctx-cherry-pick").click()
    await page.getByTestId("cherry-pick-confirm").click()
    const cherryPick = page.getByTestId("cherry-pick-dialog")
    await expect(cherryPick).toContainText(/would be overwritten|commit your changes or stash them/i)
    await cherryPick.getByTestId("cherry-pick-stash-retry").click()
    await expect(cherryPick).toHaveCount(0)
    expectDirt(root)
    await expect(page.getByRole("alert")).toHaveCount(0)

    await row(page, "pick source").click({ button: "right" })
    await page.getByTestId("ctx-revert").click()
    await page.getByTestId("revert-confirm").click()
    const revert = page.getByTestId("revert-dialog")
    await expect(revert).toContainText(/would be overwritten|commit your changes or stash them/i)
    await revert.getByTestId("revert-stash-retry").click()
    await expect(revert).toHaveCount(0)
    expectDirt(root)
    await expect(page.getByRole("alert")).toHaveCount(0)
  })

  for (const mode of ["soft", "mixed", "hard"] as const)
    test(`reset ${mode} follows git's dirty-tree semantics`, async ({ page }) => {
      await page.goto("/")
      await row(page, "main advance").click({ button: "right" })
      await page.getByTestId("ctx-reset").click()
      await page.getByTestId(`ctx-reset-${mode}`).click()
      await page.getByTestId(`reset-mode-${mode}`).click()
      await page.getByTestId("reset-confirm").click()
      await expect(page.getByTestId("reset-dialog")).toHaveCount(0)
      if (mode === "hard") {
        expect(status(root)).not.toMatch(/file[BCD]/)
        expect(existsSync(join(root, "untracked-1"))).toBe(true)
      } else expectDirt(root)
      await expect(page.getByRole("alert")).toHaveCount(0)
    })

  test("checkout keeps non-overlapping dirt", async ({ page }) => {
    await page.goto("/")
    const feature = page.locator('[data-testid="tree-row"][data-label="feature"]')
    await feature.click({ button: "right" })
    await page.getByRole("menuitem", { name: /Checkout/ }).click()
    await page.getByTestId("checkout-keep").click()
    await page.getByTestId("checkout-confirm").click()
    await expect(page.getByTestId("checkout-dialog")).toHaveCount(0)
    expect(git(root, "branch", "--show-current").trim()).toBe("feature")
    expectDirt(root)
    await expect(page.getByRole("alert")).toHaveCount(0)
  })

  test("a reset confirmed during a fetch waits rather than disappearing", async ({ page }) => {
    // A local bare remote makes Fetch available; delaying its completed-job
    // poll holds useJobs' engine-call gate without adding a wall-clock wait.
    const remote = makeRepo("pg-dirty-fetch-remote-")
    try {
      git(remote, "config", "receive.denyCurrentBranch", "ignore")
      git(root, "remote", "add", "origin", remote)
      await page.route("**/repos/*/jobs/*", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        await route.continue()
      })
      await page.goto("/")
      await expect(page.getByTestId("fetch-button")).toBeEnabled()
      await page.getByTestId("fetch-button").click()
      await expect(page.getByTestId("topbar-progress")).toContainText("Fetching")
      const before = git(root, "rev-parse", "HEAD").trim()
      const target = git(root, "rev-parse", "HEAD~1").trim()
      await row(page, "files").click({ button: "right" })
      await page.getByTestId("ctx-reset").click()
      await page.getByTestId("ctx-reset-mixed").click()
      await page.getByTestId("reset-confirm").click()
      await expect(page.getByTestId("topbar-progress")).toContainText("Waiting for")
      await expect(page.getByTestId("reset-dialog")).toHaveCount(0, { timeout: 15_000 })
      expect(git(root, "rev-parse", "HEAD").trim()).toBe(target)
      expect(git(root, "rev-parse", "HEAD").trim()).not.toBe(before)
    } finally {
      await removeRepo(remote)
    }
  })
})

test.describe("overlapping dirty tree offers recovery", () => {
  test("merge keeps git's overwrite refusal in the dialog, then Stash and retry succeeds", async ({ page }) => {
    const root = makeRepo("pg-dirty-overlap-")
    const previous = await currentRepoPath()
    try {
      write(root, "fileB", "base\n")
      commit(root, "base B")
      git(root, "checkout", "-q", "-b", "feature")
      write(root, "fileB", "feature\n")
      commit(root, "feature B")
      git(root, "checkout", "-q", "main")
      write(root, "fileB", "local\n")
      await openRepoOnEngine(root)
      await page.goto("/")
      await page.getByTestId("merge-button").click()
      await pickBranch(page, "merge-branch", "feature")
      await page.getByTestId("merge-confirm").click()
      const dialog = page.getByTestId("merge-dialog")
      await expect(dialog).toContainText(/would be overwritten|commit your changes or stash them/i)
      await dialog.getByTestId("merge-stash-retry").click()
      await expect(dialog).toHaveCount(0)
      expect(git(root, "log", "-1", "--format=%s")).toMatch(/Merge|feature B/)
      await expect(page.getByTestId("error-banner")).toHaveCount(0)
    } finally {
      await openRepoOnEngine(previous ?? process.cwd())
      await removeRepo(root)
    }
  })
})
