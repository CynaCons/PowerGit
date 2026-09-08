import { expect, test } from "@playwright/test"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"

// Owner (2026-09-08): "The diff view and commit view are showing plaintext.
// Would be great to have automatic language recognition and syntax
// highlighting." A TypeScript change in the diff tab gets token colours;
// added lines are tinted; a file of unknown type stays plain.

function git(cwd: string, ...args: string[]) {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" })
}

async function openRepoOnEngine(path: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path }),
  })
  if (!res.ok) throw new Error(`failed to open ${path}: http ${res.status}`)
}

async function currentRepoPath(): Promise<string | null> {
  const res = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  if (!res.ok) return null
  return ((await res.json()) as { root: string }).root
}

test.describe("syntax highlighting in the diff view", () => {
  let repoDir: string
  let previousRepo: string | null = null

  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
    repoDir = mkdtempSync(join(tmpdir(), "pg-hl-"))
    git(repoDir, "init", "-q", "-b", "main")
    writeFileSync(join(repoDir, "a.ts"), "export const a = 1\n")
    writeFileSync(join(repoDir, "notes.unknownext"), "plain words here\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "first")
    writeFileSync(
      join(repoDir, "a.ts"),
      'export const a = 1\nexport function hello(name: string): string {\n  return "hi " + name\n}\n',
    )
    writeFileSync(join(repoDir, "notes.unknownext"), "plain words here\nmore plain words\n")
    git(repoDir, "add", "-A")
    git(repoDir, "commit", "-q", "-m", "second")
    await openRepoOnEngine(repoDir)
  })

  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
    rmSync(repoDir, { recursive: true, force: true })
  })

  test("a TypeScript diff gets token colours, an unknown file stays plain", async ({ page }) => {
    await page.goto("/")
    const rows = page.locator('[data-testid="grid-row"]:not([data-artificial])')
    await rows.first().waitFor()
    await rows.first().click()
    await page.getByRole("tab", { name: /Diff/ }).click()
    await page.getByTestId("file-list-row").filter({ hasText: "a.ts" }).click()
    const view = page.getByTestId("diff-view")
    await expect(view.locator(".diff-token").first()).toBeVisible()
    const colors = await view
      .locator(".diff-row-added .diff-token")
      .evaluateAll((els) => Array.from(new Set(els.map((e) => (e as HTMLElement).style.color))))
    expect(colors.length).toBeGreaterThan(1)
    await expect(view.locator(".diff-row-added").first()).toHaveCSS("background-color", /rgba\(24, 145, 0/)

    await page.getByTestId("file-list-row").filter({ hasText: "notes.unknownext" }).click()
    await expect(view).toContainText("more plain words")
    await expect(view.locator(".diff-token")).toHaveCount(0)
  })
})
