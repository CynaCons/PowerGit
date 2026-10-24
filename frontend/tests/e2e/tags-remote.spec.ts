import { expect, test, type Page } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// Owner, 2026-10-24 (v0.21.16):
//   "at the moment, we don't have the ability to differentiate between a
//   remote tag and a local tag. And that when I do a tag, actually, I don't
//   know if it's local or remote. The icon is not there, you know, the cloud
//   icon to indicate that it's remote. And if the tag is local, then I don't
//   have the ability to push it to remote."
// git keeps no remote-tracking tags, so the engine asks the remote which
// tags it has (ls-remote) when PowerGit fetches, and records each tag it
// pushes. A tag the remote has carries the cloud beside its tag glyph; a
// tag it lacks offers "Push tag to origin".

function row(page: Page, subject: string) {
  return page
    .getByTestId("grid-row")
    .filter({ has: page.locator(".msg-text", { hasText: new RegExp(`^${subject}$`) }) })
    .first()
}

function remoteTags(remote: string): string[] {
  return git(remote, "tag", "--list")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
}

test.describe("tags say whether the remote has them", () => {
  let root: string
  let remote: string
  let previous: string | null = null
  test.beforeEach(async () => {
    previous ??= await currentRepoPath()
    remote = makeRepo("pg-tags-remote-origin-")
    git(remote, "config", "receive.denyCurrentBranch", "ignore")
    root = makeRepo("pg-tags-remote-")
    git(root, "remote", "add", "origin", remote)
    git(root, "fetch", "-q", "origin")
    git(root, "reset", "-q", "--hard", "origin/main")
    write(root, "a.txt", "released\n")
    commit(root, "released")
    git(root, "push", "-q", "origin", "main")
    git(root, "tag", "v1.0")
    git(root, "push", "-q", "origin", "v1.0")
    write(root, "a.txt", "next\n")
    commit(root, "next")
    git(root, "tag", "-a", "v1.1", "-m", "not pushed yet")
    await openRepoOnEngine(root)
  })
  test.afterEach(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
    await removeRepo(root)
    await removeRepo(remote)
  })

  test("the cloud tells a remote tag from a local one, and a local tag pushes", async ({ page }) => {
    await page.goto("/")
    await expect(row(page, "next")).toBeVisible()
    // PowerGit learns the remote's tags when it fetches.
    await page.getByTestId("fetch-button").click()
    const pushed = row(page, "released").locator('[data-ref="v1.0"]')
    const local = row(page, "next").locator('[data-ref="v1.1"]')
    await expect(pushed).toHaveAttribute("data-tag-where", "remote")
    await expect(pushed.locator("svg")).toHaveCount(2)
    await expect(local).toHaveAttribute("data-tag-where", "local")
    await expect(local.locator("svg")).toHaveCount(1)

    // The tree says the same.
    const treeTag = (name: string) => page.locator(`[data-testid="tree-row"][data-label="${name}"]`)
    await expect(treeTag("v1.0")).toHaveAttribute("data-tag-where", "remote")
    await expect(treeTag("v1.1")).toHaveAttribute("data-tag-where", "local")

    // A tag the remote has offers no push.
    await pushed.click({ button: "right" })
    await expect(page.getByTestId("refctx-checkout")).toBeVisible()
    await expect(page.getByTestId("refctx-push-tag")).toHaveCount(0)
    await page.keyboard.press("Escape")

    // A local one does, and the cloud appears once it is pushed.
    await local.click({ button: "right" })
    await expect(page.getByTestId("refctx-push-tag")).toHaveText(/Push tag to origin/)
    await page.getByTestId("refctx-push-tag").click()
    await expect(local).toHaveAttribute("data-tag-where", "remote", { timeout: 15_000 })
    await expect(local.locator("svg")).toHaveCount(2)
    expect(remoteTags(remote)).toEqual(["v1.0", "v1.1"])
    await expect(page.getByTestId("error-banner")).toHaveCount(0)
  })

  test("a new tag can be pushed as it is created", async ({ page }) => {
    await page.goto("/")
    await page.getByTestId("fetch-button").click()
    await expect(row(page, "next").locator('[data-ref="v1.1"]')).toHaveAttribute("data-tag-where", "local")

    await row(page, "next").click({ button: "right" })
    await page.getByTestId("ctx-create-tag").click()
    await page.getByTestId("create-ref-name").fill("v1.2")
    await expect(page.getByTestId("create-ref-push-row")).toContainText("Push to origin")
    const push = page.getByTestId("create-ref-push")
    await expect(push).not.toBeChecked()
    await push.check()
    await page.getByTestId("create-ref-confirm").click()
    await expect(page.getByTestId("create-ref-dialog")).toHaveCount(0)

    const created = row(page, "next").locator('[data-ref="v1.2"]')
    await expect(created).toHaveAttribute("data-tag-where", "remote", { timeout: 15_000 })
    expect(remoteTags(remote)).toContain("v1.2")
    await expect(page.getByTestId("error-banner")).toHaveCount(0)
  })
})
