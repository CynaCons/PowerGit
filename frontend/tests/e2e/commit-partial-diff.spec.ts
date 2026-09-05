import { expect, test } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"

// Owner report, 2026-09-05: "In the commit view, we can select a piece of
// diff and reset it like we can in baseline Git Extensions." Three changed
// lines in one file; the owner selects two of them in the unstaged diff and
// resets them, then stages the remaining one from the diff. Asserted on the
// working tree and the index of an isolated repository, not on UI state.

test("select lines in the commit diff, reset two of three changes, stage the third", async ({ page }) => {
  test.setTimeout(90_000)
  const fs = await import("node:fs")
  const os = await import("node:os")
  const path = await import("node:path")
  const { execFileSync } = await import("node:child_process")
  const current = (await (await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })).json()) as {
    id: string
    root: string
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-lines-"))
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-C", dir, "-c", "user.email=t@t", "-c", "user.name=t", "-c", "core.autocrlf=false", ...args],
      {
        stdio: "pipe",
      },
    )
  execFileSync("git", ["init", "-q", "-b", "main", dir])
  const file = path.join(dir, "f.txt")
  fs.writeFileSync(file, "1\n2\n3\n")
  git("add", "-A")
  git("commit", "-qm", "init")
  fs.writeFileSync(file, "1x\n2x\n3x\n")
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
    await page.locator('[data-testid="unstaged-list-row"]:has([title="f.txt"])').click()
    const diffRows = page.getByTestId("commit-diff").locator(".diff-row")
    await expect(diffRows.filter({ hasText: "+3x" })).toBeVisible()

    // Select "-1", "-2", "+1x", "+2x" (click, then Ctrl+click the rest).
    // Match the text cell, not the row: the row's text starts with the gutter numbers.
    const row = (text: string) =>
      diffRows.filter({
        has: page.locator(".diff-row-text").filter({ hasText: new RegExp(`^${text.replace(/[+]/g, "[+]")}$`) }),
      })
    await row("-1").click()
    for (const t of ["-2", "+1x", "+2x"]) await row(t).click({ modifiers: ["Control"] })
    await expect(page.getByTestId("commit-diff").locator(".diff-row-selected")).toHaveCount(4)

    await row("+2x").click({ button: "right" })
    const menu = page.getByTestId("commit-diff-menu")
    await expect(menu).toBeVisible()
    await expect(menu.locator('[role="menuitem"] .MuiListItemText-root')).toHaveText([
      "Stage selected 4 lines",
      "Reset selected 4 lines…",
    ])
    await page.getByTestId("ctx-reset-lines").click()
    await expect(page.getByTestId("reset-lines-confirm")).toBeVisible()
    await page.getByTestId("reset-lines-confirm-confirm").click()
    // git apply on Windows may write CRLF (core.autocrlf); compare the content only.
    await expect.poll(() => fs.readFileSync(file, "utf8").split(/\r?\n/).join("|")).toBe("1|2|3x|")

    // The diff reloads with the one remaining change; stage it from the diff.
    await expect(row("+3x")).toBeVisible()
    await expect(row("+1x")).toHaveCount(0)
    await row("-3").click()
    await row("+3x").click({ modifiers: ["Shift"] })
    await row("+3x").click({ button: "right" })
    await page.getByTestId("ctx-stage-lines").click()
    await expect
      .poll(async () => {
        const status = (await (
          await fetch(`${ENGINE_URL}/repos/${opened.id}/status`, { headers: engineHeaders() })
        ).json()) as { staged: Array<{ path: string }>; unstaged: Array<{ path: string }> }
        return `${status.staged.map((f) => f.path).join(",")}|${status.unstaged.map((f) => f.path).join(",")}`
      })
      .toBe("f.txt|")
    expect(execFileSync("git", ["-C", dir, "diff", "--cached", "--", "f.txt"], { encoding: "utf8" })).toContain("+3x")
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
