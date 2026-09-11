import { expect, test, type Page } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"

// Owner report, 2026-09-05: "In the commit view, the right click menu on the
// unstaged files is not professional. Very poor." v0.13.14 gave the menu
// Git Extensions' basic file actions in the RevisionContextMenu house style.
//
// Owner, 2026-09-11 (v0.16.0): "In the commit window, on the left we have
// the files staged and unstaged. We need functional parity with what GE
// has. Should be able to right click on my files and do operations on them."
// This spec opens the menu on real files in an isolated repository and
// asserts Git Extensions' FileStatusList item set and order, that every
// action row carries an icon, and that the items work against the engine:
// reset through the "Reset file to" submenu, copy relative / full path, the
// skip-worktree check item round trip (the file leaves the list, comes back
// through "Show skip-worktree files" with the check mark set, and is
// restored), add to .git/info/exclude, and the staged list's own subset.

const row = (page: Page, list: "unstaged" | "staged", name: string) =>
  page.locator(`[data-testid="${list}-list-row"]:has([title="${name}"])`)

test("file context menu: GE item set and every item works against the engine", async ({ page, context }) => {
  test.setTimeout(150_000)
  const fs = await import("node:fs")
  const os = await import("node:os")
  const path = await import("node:path")
  const { execFileSync } = await import("node:child_process")
  const current = (await (await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })).json()) as {
    id: string
    root: string
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-menu-"))
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", ...args], { stdio: "pipe" })
  const gitOut = (...args: string[]) =>
    git(...args)
      .toString("utf8")
      .trim()
  execFileSync("git", ["init", "-q", "-b", "main", dir])
  fs.writeFileSync(path.join(dir, "tracked.txt"), "original\n")
  fs.writeFileSync(path.join(dir, "other.txt"), "other\n")
  git("add", "-A")
  git("commit", "-qm", "init")
  fs.writeFileSync(path.join(dir, "tracked.txt"), "changed\n")
  fs.writeFileSync(path.join(dir, "other.txt"), "other changed\n")
  fs.writeFileSync(path.join(dir, "new.txt"), "untracked\n")
  fs.writeFileSync(path.join(dir, "extra.txt"), "untracked too\n")
  const opened = (await (
    await fetch(`${ENGINE_URL}/repos/open`, {
      method: "POST",
      headers: engineHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path: dir }),
    })
  ).json()) as { id: string }
  const clipboard = test.info().project.name !== "webkit"
  if (clipboard) await context.grantPermissions(["clipboard-read", "clipboard-write"])

  const menu = page.getByTestId("commit-file-menu")
  const submenu = page.locator("#commit-file-context-menu-sub")
  const openMenuOn = async (list: "unstaged" | "staged", name: string) => {
    const r = row(page, list, name)
    await expect(r).toBeVisible()
    await r.click({ button: "right" })
    await expect(menu).toBeVisible()
  }

  try {
    await page.goto(`/?repo=${opened.id}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    await page.keyboard.press("Control+Space")
    await expect(page.getByTestId("commit-overlay")).toBeVisible()

    // --- the item set on one modified, unstaged file ------------------------
    await openMenuOn("unstaged", "tracked.txt")
    const items = menu.locator('[role="menuitem"], [role="menuitemcheckbox"]')
    await expect(items.locator(".MuiListItemText-root")).toHaveText([
      "Stage file",
      "Stage all",
      "Reset file to",
      "Open with difftool",
      "Open",
      "Open with…",
      "Edit",
      "Rename / move…",
      "Delete file…",
      "Copy path",
      // "Show in folder" needs the Tauri opener plugin: not offered in the browser.
      "View file history",
      "Add to .gitignore…",
      "Add to .git/info/exclude…",
      "Skip worktree",
      "Assume unchanged",
      "Stop tracking this file…",
      "Show skip-worktree files",
      "Show assumed-unchanged files",
    ])
    // Every action row has an icon so the labels line up; the four check
    // items keep the slot for their check mark (all unchecked here).
    expect(await items.locator(".MuiListItemIcon-root svg").count()).toBe(14)
    await expect(items.first()).toContainText("S")
    expect(await menu.locator("hr").count()).toBe(5)
    await expect(page.getByTestId("ctx-skip-worktree")).toHaveAttribute("aria-checked", "false")
    await expect(page.getByTestId("ctx-show-skip-worktree")).toHaveAttribute("aria-checked", "false")
    for (const id of ["ctx-stage-selected", "ctx-reset-file", "ctx-open-file", "ctx-move-file", "ctx-exclude-file"]) {
      await expect(page.getByTestId(id), id).toBeEnabled()
    }

    // --- copy relative / full path (submenu) --------------------------------
    await page.getByTestId("ctx-copy-path").click()
    await expect(submenu).toBeVisible()
    await expect(submenu.locator(".MuiListItemText-root")).toHaveText(["Full path", "Relative path"])
    await page.getByTestId("ctx-copy-relative").click()
    await expect(menu).toBeHidden()
    if (clipboard) {
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("tracked.txt")
      await openMenuOn("unstaged", "tracked.txt")
      await page.getByTestId("ctx-copy-path").click()
      await page.getByTestId("ctx-copy-full").click()
      const full = await page.evaluate(() => navigator.clipboard.readText())
      expect(full.replace(/\\/g, "/").toLowerCase()).toBe(
        path.join(dir, "tracked.txt").replace(/\\/g, "/").toLowerCase(),
      )
    }

    // --- skip-worktree: check item round trip ------------------------------
    await openMenuOn("unstaged", "other.txt")
    await page.getByTestId("ctx-skip-worktree").click()
    await expect(menu).toBeHidden()
    // git hides the file from status now; the list follows the engine's change stream.
    await expect(row(page, "unstaged", "other.txt")).toHaveCount(0, { timeout: 20_000 })
    expect(gitOut("ls-files", "-v", "--", "other.txt")).toBe("S other.txt")
    await expect(page.getByTestId("commit-file-menu-error")).toHaveCount(0)

    // The way back: show the hidden files, the row returns with git's letter
    // and the check mark set, and clearing the bit restores it as modified.
    await openMenuOn("unstaged", "new.txt")
    await page.getByTestId("ctx-show-skip-worktree").click()
    const hiddenRow = row(page, "unstaged", "other.txt")
    await expect(hiddenRow).toBeVisible({ timeout: 10_000 })
    await expect(hiddenRow.locator("span").first()).toHaveText("S")
    await hiddenRow.click({ button: "right" })
    await expect(menu).toBeVisible()
    await expect(page.getByTestId("ctx-skip-worktree")).toHaveAttribute("aria-checked", "true")
    await expect(page.getByTestId("ctx-show-skip-worktree")).toHaveAttribute("aria-checked", "true")
    await expect(page.getByTestId("ctx-stage-selected")).toBeDisabled()
    await page.getByTestId("ctx-skip-worktree").click()
    await expect(hiddenRow.locator("span").first()).toHaveText("M", { timeout: 20_000 })
    expect(gitOut("ls-files", "-v", "--", "other.txt")).toBe("H other.txt")
    await openMenuOn("unstaged", "other.txt")
    await expect(page.getByTestId("ctx-skip-worktree")).toHaveAttribute("aria-checked", "false")
    await page.getByTestId("ctx-show-skip-worktree").click()
    await expect(menu).toBeHidden()

    // --- add to .git/info/exclude (the ignore dialog in its exclude mode) ---
    await openMenuOn("unstaged", "new.txt")
    await page.getByTestId("ctx-exclude-file").click()
    const ignore = page.getByTestId("ignore-dialog")
    await expect(ignore).toBeVisible()
    await expect(ignore).toHaveAttribute("data-target", "exclude")
    await expect(ignore).toContainText("Add to .git/info/exclude")
    await expect(page.getByTestId("ignore-pattern").locator("input")).toHaveValue("/new.txt")
    await page.getByTestId("ignore-confirm").click()
    await expect(ignore).toBeHidden()
    // Written with the platform newline (CRLF on Windows), like .gitignore is.
    expect(fs.readFileSync(path.join(dir, ".git", "info", "exclude"), "utf8").replace(/\r\n/g, "\n")).toContain(
      "/new.txt\n",
    )
    // .git/info is outside the watcher's paths: the engine bumps the change
    // stream itself, so the list drops the file without waiting for a poll.
    await expect(row(page, "unstaged", "new.txt")).toHaveCount(0, { timeout: 20_000 })

    // --- multi-selection pluralises and disables one-file items -------------
    await row(page, "unstaged", "other.txt").click()
    await row(page, "unstaged", "extra.txt").click({ modifiers: ["Control"] })
    await row(page, "unstaged", "extra.txt").click({ button: "right" })
    await expect(menu).toBeVisible()
    await expect(page.getByTestId("ctx-stage-selected")).toContainText("Stage 2 files")
    await expect(page.getByTestId("ctx-exclude-file")).toContainText("Add 2 files to .git/info/exclude…")
    await expect(page.getByTestId("ctx-open-file")).toBeDisabled()
    await expect(page.getByTestId("ctx-ignore-file")).toBeDisabled()
    await expect(page.getByTestId("ctx-stop-tracking")).toBeDisabled()
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()

    // --- the staged list: unstage, no ignore group --------------------------
    await row(page, "unstaged", "other.txt").dblclick()
    await openMenuOn("staged", "other.txt")
    await expect(page.getByTestId("ctx-stage-selected")).toHaveText(/Unstage file/)
    await expect(page.getByTestId("ctx-stage-all")).toHaveText(/Unstage all/)
    await expect(page.getByTestId("ctx-ignore-file")).toHaveCount(0)
    await expect(page.getByTestId("ctx-skip-worktree")).toHaveCount(0)
    await page.getByTestId("ctx-reset-file").click()
    await expect(submenu.locator(".MuiListItemText-root")).toHaveText(["HEAD — discard all changes…"])
    // Escape closes the submenu first, then the menu.
    await page.keyboard.press("Escape")
    await expect(submenu).toBeHidden()
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()

    // --- reset to HEAD through the submenu, confirmed in-app ----------------
    await openMenuOn("unstaged", "tracked.txt")
    await page.getByTestId("ctx-reset-file").click()
    await expect(submenu.locator(".MuiListItemText-root")).toHaveText([
      "Index — discard unstaged changes…",
      "HEAD — discard all changes…",
    ])
    await page.getByTestId("ctx-reset-head").click()
    const confirm = page.getByTestId("reset-files-confirm")
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText("tracked.txt")
    await page.getByTestId("reset-files-confirm-confirm").click()
    await expect(row(page, "unstaged", "tracked.txt")).toHaveCount(0)
    // git may check the file out with CRLF (core.autocrlf); compare the content only.
    expect(fs.readFileSync(path.join(dir, "tracked.txt"), "utf8").trim()).toBe("original")
    // The untracked file is untouched by resetting another path.
    expect(fs.existsSync(path.join(dir, "extra.txt"))).toBe(true)
    await expect(page.getByTestId("commit-file-menu-error")).toHaveCount(0)
  } finally {
    await fetch(`${ENGINE_URL}/repos/${opened.id}`, { method: "DELETE", headers: engineHeaders() })
    await fetch(`${ENGINE_URL}/repos/open`, {
      method: "POST",
      headers: engineHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path: current.root }),
    })
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 })
    } catch (e) {
      console.warn(`temp repo left behind (${dir}): ${String(e)}`)
    }
  }
})
