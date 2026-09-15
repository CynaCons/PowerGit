import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

import { expect, test, type Download, type Page } from "@playwright/test"

import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.18.6, owner (2026-09-15): "Being able to export a patch from a commit.
// Probably from the right click menu." The browser path of "Save as patch…":
// the row menu's entry opens the engine's streamed patch under git's own
// file name and the browser saves it; the proof is the saved file — git am
// rebuilds the commit from it in a clone, git apply --check accepts the
// pending rows' one. The shell path (native Save dialog + write_text_file)
// is the owner's tick.

/** The next download, whichever page starts it: the opener, or the popup
 *  `window.open(url, "_blank", "noopener")` creates for the attachment. */
function nextDownload(page: Page): Promise<Download> {
  return new Promise((resolve) => {
    page.once("download", resolve)
    page.context().once("page", (popup) => popup.once("download", resolve))
  })
}

async function saveFromRowMenu(page: Page, row: ReturnType<Page["locator"]>, label: string): Promise<Download> {
  await row.click({ button: "right" })
  const menu = page.locator("#revision-context-menu")
  await expect(menu).toBeVisible()
  const item = menu.getByRole("menuitem", { name: label })
  await expect(item).toBeVisible()
  const download = nextDownload(page)
  await item.click()
  await expect(menu).toHaveCount(0)
  return download
}

test.describe("save a commit as a patch", () => {
  let repoDir: string
  let cloneDir: string
  let previousRepo: string | null = null
  let baseSha = ""
  let changeSha = ""

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    repoDir = makeRepo("pg-savepatch-")
    baseSha = git(repoDir, "rev-parse", "HEAD").trim()
    write(repoDir, "a.txt", "base\nchanged\n")
    // 0x00..0xff once: git sees NULs and calls the file binary.
    writeFileSync(join(repoDir, "b.bin"), Buffer.from(Array.from({ length: 256 }, (_, i) => i)))
    commit(repoDir, "change")
    changeSha = git(repoDir, "rev-parse", "HEAD").trim()
    cloneDir = mkdtempSync(join(tmpdir(), "pg-savepatch-clone-"))
    execFileSync("git", ["clone", "-q", repoDir, cloneDir], { stdio: "pipe" })
    await openRepoOnEngine(repoDir)
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    await removeRepo(repoDir)
    await removeRepo(cloneDir)
  })

  test("Being able to export a patch from a commit. Probably from the right click menu.", async ({ page }) => {
    await page.goto("/")
    const rows = page.getByTestId("grid-row")
    await expect(rows).toHaveCount(2)

    // --- a commit: git's own file name, the mailbox text, git am rebuilds it ---
    const download = await saveFromRowMenu(page, rows.filter({ hasText: "change" }).first(), "Save as patch…")
    expect(download.suggestedFilename()).toBe("0001-change.patch")
    const patchPath = await download.path()
    const text = readFileSync(patchPath, "utf8")
    expect(text.startsWith(`From ${changeSha} `)).toBe(true)
    expect(text).toContain("Subject: [PATCH] change")
    expect(text).toContain("GIT binary patch")

    git(cloneDir, "reset", "-q", "--hard", baseSha)
    git(cloneDir, "am", patchPath)
    expect(git(cloneDir, "log", "-1", "--format=%s").trim()).toBe("change")
    expect(git(cloneDir, "rev-parse", "HEAD^{tree}").trim()).toBe(git(repoDir, "rev-parse", `${changeSha}^{tree}`).trim())

    // --- the Working directory row: the pending diff, applies on `change` ---
    write(repoDir, "a.txt", "base\nchanged\nand again\n")
    await page.reload()
    const pending = rows.filter({ hasText: "Working directory" })
    await expect(pending).toHaveCount(1, { timeout: 20_000 })
    const worktree = await saveFromRowMenu(page, pending.first(), "Save changes as patch…")
    expect(worktree.suggestedFilename().toLowerCase()).toBe(`${basename(repoDir)}-worktree.patch`.toLowerCase())
    const worktreePath = await worktree.path()
    expect(readFileSync(worktreePath, "utf8")).toContain("+and again")
    git(cloneDir, "apply", "--check", worktreePath)

    // --- a clean working directory: the entry has nothing to save ---
    // The menu is open on the row when the edit goes away under it; the
    // live refresh empties the row's count and the entry greys out instead
    // of offering an empty file.
    await pending.first().click({ button: "right" })
    const item = page.locator("#revision-context-menu").getByRole("menuitem", { name: "Save changes as patch…" })
    await expect(item).not.toHaveAttribute("aria-disabled", "true")
    git(repoDir, "checkout", "-q", "--", "a.txt")
    await expect(item).toHaveAttribute("aria-disabled", "true", { timeout: 20_000 })
    await page.keyboard.press("Escape")
  })
})
