import { basename } from "node:path"
import { expect, test } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, write } from "../repoFixture"

// v0.22.6, owner: "when we are doing agents review, if there is a markdown
// file, can you give me a button that I can switch from the normal text view
// to the preview view? Just like it is in VS Code." A Markdown file of a
// review switches between its changes and the rendered file.

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: engineHeaders({ "Content-Type": "application/json" }),
  })
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

test.describe("agent review markdown preview", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("a Markdown file switches between its changes and its preview", async ({ page }) => {
    test.setTimeout(90_000)
    const dir = makeRepo("pg-review-markdown-")
    write(dir, "README.md", "# Guide\n\nIntro text.\n")
    write(dir, "notes.txt", "one\n")
    commit(dir, "start")
    write(dir, "README.md", "# Guide\n\nIntro text.\n\n## Install\n\n- Run **setup**\n- Open the app\n")
    write(dir, "notes.txt", "one\ntwo\n")
    const { id } = await api<{ id: string }>("/repos/open", { method: "POST", body: JSON.stringify({ path: dir }) })
    await api(`/repos/${id}/agent-reviews`, {
      method: "POST",
      body: JSON.stringify({
        mode: "notify",
        title: "Docs review",
        why: "",
        agent: "docs-test",
        worktree: true,
        files: [
          { path: "README.md", status: "M" },
          { path: "notes.txt", status: "M" },
        ],
      }),
    })
    await page.addInitScript(() => localStorage.removeItem("pg.reviewDiff"))
    await page.goto(`/?repo=${id}`)
    await page.getByTestId("agent-reviews-button").click()
    await page
      .getByTestId("agent-review-row")
      .filter({ hasText: "Docs review" })
      .filter({ hasText: basename(dir) })
      .click()
    await expect(page.getByTestId("round-diff")).toHaveAttribute("data-path", "README.md")

    // The changes first, as for any file.
    await expect(page.getByTestId("md-view-changes")).toHaveAttribute("aria-pressed", "true")
    await page.getByTestId("md-view-preview").click()
    const preview = page.getByTestId("md-preview")
    await expect(preview.locator("h1")).toHaveText("Guide")
    await expect(preview.locator("h2")).toHaveText("Install")
    await expect(preview.locator("li strong")).toHaveText("setup")
    await expect(page.getByTestId("round-diff")).toHaveCount(0)

    // Back to the changes.
    await page.getByTestId("md-view-changes").click()
    await expect(page.getByTestId("round-diff")).toBeVisible()
    await expect(preview).toHaveCount(0)

    // Another file has no switch.
    await page.getByTestId("round-file").filter({ hasText: "notes.txt" }).first().click()
    await expect(page.getByTestId("round-diff")).toHaveAttribute("data-path", "notes.txt")
    await expect(page.getByTestId("md-view-preview")).toHaveCount(0)
  })
})
