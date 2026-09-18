import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test, type Locator, type Page } from "@playwright/test"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

async function openInApp(page: Page, dir: string): Promise<void> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path: dir }),
  })
  const opened = (await res.json()) as { id: string }
  await page.goto(`/?repo=${opened.id}`)
  await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
}

function diffRow(page: Page, text: string): Locator {
  return page
    .getByTestId("diff-pane")
    .locator(".diff-row")
    .filter({ has: page.locator(".diff-row-text").filter({ hasText: new RegExp(`^${text.replace(/[+]/g, "[+]")}$`) }) })
}

async function pressUntilCursor(page: Page, key: string, row: Locator): Promise<void> {
  const rows = await page.getByTestId("diff-pane").locator(".diff-row").count()
  for (let i = 0; i < rows; i++) {
    if ((await row.getAttribute("class"))?.includes("diff-row-cursor")) return
    await page.keyboard.press(key)
  }
  await expect(row).toHaveClass(/diff-row-cursor/)
}

test.describe("persisted review", () => {
  let previousRepo: string | null = null
  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
  })

  test("mark two lines on the Working directory row, reload the page, the marks are still there; the JSON on disk equals the pane text; git status shows no untracked .powergit; Start over empties the pane and removes the file", async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000)
    const dir = makeRepo("pg-review-persist-")
    const base = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
    write(dir, "f.txt", `${base.join("\n")}\n`)
    commit(dir, "start")
    write(
      dir,
      "f.txt",
      `${[...base.slice(0, 2), "first", ...base.slice(2, 9), "second", ...base.slice(9)].join("\n")}\n`,
    )
    const head = git(dir, "rev-parse", "HEAD").trim()
    const reviewPath = join(dir, ".powergit", "reviews", `${head}-worktree.json`)
    const clipboard = test.info().project.name !== "webkit"
    if (clipboard) await context.grantPermissions(["clipboard-read", "clipboard-write"])
    try {
      await openInApp(page, dir)
      const selectDiff = async () => {
        await page.getByTestId("grid-row").filter({ hasText: "Working directory" }).first().click()
        await page.getByRole("tab", { name: /Diff/ }).click()
        await expect(diffRow(page, "+second")).toBeVisible({ timeout: 20_000 })
      }
      await selectDiff()
      await page.getByTestId("diff-review-toggle").click()
      await page.keyboard.press("Space")
      await pressUntilCursor(page, "j", diffRow(page, "+second"))
      await page.keyboard.press("x")
      await page.getByTestId("review-file-toggle").click()
      await expect(page.getByTestId("review-file-saved")).toHaveText(/Saved/)
      await page.reload()
      await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
      await selectDiff()
      await expect(page.getByTestId("diff-review-toggle")).toHaveAttribute("aria-pressed", "true")
      await expect(diffRow(page, "+first")).toHaveAttribute("data-review", "ok")
      await expect(diffRow(page, "+second")).toHaveAttribute("data-review", "rejected")
      await page.getByTestId("review-file-toggle").click()
      await expect(page.getByTestId("review-file-json")).toHaveText(readFileSync(reviewPath, "utf8"))
      expect(git(dir, "status", "--porcelain")).not.toContain(".powergit")
      if (clipboard) {
        await page.getByTestId("review-export").click()
        await page.getByTestId("review-export-md").click()
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("f.txt")
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("+second")
      }
      await page.getByTestId("review-start-over").click()
      await page.getByTestId("review-start-over-confirm-confirm").click()
      await expect(page.getByTestId("review-file-json")).toHaveText("No review yet.")
      expect(existsSync(reviewPath)).toBe(false)
      await expect(diffRow(page, "+first")).toHaveAttribute("data-review", "todo")
      await expect(diffRow(page, "+second")).toHaveAttribute("data-review", "todo")
    } finally {
      await removeRepo(dir)
    }
  })
})
