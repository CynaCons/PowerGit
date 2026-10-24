import { expect, test, type Page } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner, 2026-10-24 (v0.21.15):
//   "when we're right clicking on a remote branch to check it out, the tool
//   should automatically preconfigure a branch name for the local branch
//   that would match the remote name (but without the remote name)."
//   "showed me "HEAD" as a branch name which is invalid"
// A clone has origin/HEAD, the remote's pointer at its default branch. The
// engine lists it with the remote-tracking branches, so its chip and its
// tree row offer Checkout; the dialog stripped "origin/" and suggested HEAD.

function row(page: Page, subject: string) {
  return page
    .getByTestId("grid-row")
    .filter({ has: page.locator(".msg-text", { hasText: new RegExp(`^${subject}$`) }) })
    .first()
}

test.describe("checking out a remote branch suggests its name", () => {
  let root: string
  let previous: string | null = null
  test.beforeEach(async () => {
    previous ??= await currentRepoPath()
    root = makeRepo("pg-checkout-remote-name-")
    write(root, "a.txt", "release\n")
    commit(root, "release")
    // The shape of a clone whose local main was deleted: origin/main and
    // origin/HEAD on "release", no local branch there.
    git(root, "remote", "add", "origin", root)
    git(root, "update-ref", "refs/remotes/origin/main", "HEAD")
    git(root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main")
    git(root, "checkout", "-q", "-b", "work")
    write(root, "b.txt", "work\n")
    commit(root, "work")
    git(root, "branch", "-q", "-D", "main")
    await openRepoOnEngine(root)
  })
  test.afterEach(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
    await removeRepo(root)
  })

  test("origin/HEAD's Checkout offers the default branch, named without the remote", async ({ page }) => {
    await page.goto("/")
    const release = row(page, "release")
    await expect(release).toBeVisible()
    await release.locator('[data-ref="origin/HEAD"]').click({ button: "right" })
    await page.getByTestId("refctx-checkout").click()

    const dialog = page.getByTestId("checkout-dialog")
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId("checkout-branch")).toHaveAttribute("data-value", "origin/main")
    await expect(page.getByTestId("checkout-as-track")).toBeChecked()
    await expect(page.getByTestId("checkout-local-name")).toHaveValue("main")
    await expect(page.getByTestId("checkout-confirm")).toBeEnabled()

    await page.getByTestId("checkout-confirm").click()
    await expect(dialog).toHaveCount(0)
    expect(git(root, "branch", "--show-current").trim()).toBe("main")
    expect(git(root, "rev-parse", "--abbrev-ref", "main@{upstream}").trim()).toBe("origin/main")
    await expect(page.getByTestId("error-banner")).toHaveCount(0)
  })

  test("HEAD typed as the local name is refused before git is asked", async ({ page }) => {
    await page.goto("/")
    await row(page, "release").locator('[data-ref="origin/main"]').click({ button: "right" })
    await page.getByTestId("refctx-checkout").click()
    await expect(page.getByTestId("checkout-local-name")).toHaveValue("main")
    await page.getByTestId("checkout-local-name").fill("HEAD")
    await expect(page.getByTestId("checkout-local-name")).toHaveAttribute("aria-invalid", "true")
    await expect(page.getByTestId("checkout-confirm")).toBeDisabled()
  })
})
