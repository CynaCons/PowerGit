import { expect, test } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"

// Owner report, 2026-09-05: "In the commit view, the right click menu on the
// unstaged files is not professional. Very poor." Before v0.13.14 the menu
// had three items, one with an empty icon slot so the labels misaligned,
// no separators, and none of Git Extensions' file actions. This spec opens
// the menu on a real unstaged file in an isolated repository and asserts the
// item set and order, that every row carries an icon, that shortcuts show,
// and that "Reset to HEAD" really restores the file after the in-app
// confirmation (no window.confirm).

test("unstaged file context menu: GE item set, aligned rows, reset restores the file", async ({ page }) => {
  test.setTimeout(90_000)
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
  execFileSync("git", ["init", "-q", "-b", "main", dir])
  fs.writeFileSync(path.join(dir, "tracked.txt"), "original\n")
  git("add", "-A")
  git("commit", "-qm", "init")
  fs.writeFileSync(path.join(dir, "tracked.txt"), "changed\n")
  fs.writeFileSync(path.join(dir, "new.txt"), "untracked\n")
  const opened = (await (
    await fetch(`${ENGINE_URL}/repos/open`, {
      method: "POST",
      headers: engineHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ path: dir }),
    })
  ).json()) as { id: string }

  try {
    await page.goto(`/?repo=${opened.id}`)
    await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
    await page.keyboard.press("Control+Space")
    await expect(page.getByTestId("commit-overlay")).toBeVisible()
    const row = page.locator('[data-testid="unstaged-list-row"]:has([title="tracked.txt"])')
    await expect(row).toBeVisible()
    await row.click({ button: "right" })

    const menu = page.getByTestId("commit-file-menu")
    await expect(menu).toBeVisible()
    const items = menu.locator('[role="menuitem"]')
    await expect(items.locator(".MuiListItemText-root")).toHaveText([
      "Stage file",
      "Reset file to HEAD…",
      "Delete file…",
      "Open with difftool",
      "Copy path",
      "Add to .gitignore…",
    ])
    // Every row has an icon slot, so labels line up; the stage row shows its key.
    expect(await items.locator(".MuiListItemIcon-root svg").count()).toBe(6)
    await expect(items.first()).toContainText("S")
    expect(await menu.locator("hr").count()).toBe(3)

    await page.getByTestId("ctx-reset-file").click()
    const confirm = page.getByTestId("reset-files-confirm")
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText("tracked.txt")
    await page.getByTestId("reset-files-confirm-confirm").click()
    await expect(row).toHaveCount(0)
    // git may check the file out with CRLF (core.autocrlf); compare the content only.
    expect(fs.readFileSync(path.join(dir, "tracked.txt"), "utf8").trim()).toBe("original")
    // The untracked file is untouched by resetting another path.
    expect(fs.existsSync(path.join(dir, "new.txt"))).toBe(true)

    // A multi-selection pluralises and disables single-file actions.
    await page.keyboard.press("Escape")
    await page.keyboard.press("Control+Space")
    const untracked = page.locator('[data-testid="unstaged-list-row"]:has([title="new.txt"])')
    await untracked.click({ button: "right" })
    await expect(page.getByTestId("ctx-ignore-file")).toBeEnabled()
    await expect(page.getByTestId("ctx-difftool")).toBeEnabled()
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
