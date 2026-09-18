import { expect, test, type Locator, type Page } from "@playwright/test"

import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

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

test.describe("review comments in the Diff tab", () => {
  let previousRepo: string | null = null
  test.beforeAll(async () => {
    previousRepo = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previousRepo ?? process.cwd())
  })

  test("/ on a changed line → /comment needs a guard → Enter → the note row is under the line with that text; /reject marks the line; /bogus shows the hint and leaves the line alone; Esc closes the command line", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const dir = makeRepo("pg-review-comments-")
    write(dir, "f.txt", "one\ntwo\nthree\n")
    commit(dir, "start")
    write(dir, "f.txt", "one\nfirst\ntwo\nthree\nsecond\n")
    try {
      await openInApp(page, dir)
      await page.getByTestId("grid-row").filter({ hasText: "Working directory" }).first().click()
      await page.getByRole("tab", { name: /Diff/ }).click()
      const pane = page.getByTestId("diff-pane")
      const first = diffRow(page, "+first")
      const second = diffRow(page, "+second")
      await expect(second).toBeVisible({ timeout: 20_000 })
      await page.getByTestId("diff-review-toggle").click()
      await pressUntilCursor(page, "j", second)

      await page.keyboard.press("/")
      const input = page.getByTestId("diff-cmd-input")
      await expect(input).toHaveValue("/")
      await input.type("comment needs a guard")
      await input.press("Enter")
      await expect(page.getByTestId("diff-note-row")).toHaveCount(1)
      await expect(page.getByTestId("diff-note-text")).toHaveValue("needs a guard")
      const rows = pane.locator(".diff-row, .diff-note-row")
      const secondIndex = await rows.evaluateAll((nodes) =>
        nodes.findIndex((node) => node.textContent?.includes("+second")),
      )
      await expect(rows.nth(secondIndex + 1)).toHaveAttribute("data-testid", "diff-note-row")
      await expect(second).toHaveAttribute("data-review", "todo")
      // TODO(coordinator): the bar says 1 comment; the pane JSON contains {"line":"+2","text":"needs a guard"}

      await page.keyboard.press("/")
      await input.type("reject")
      await input.press("Enter")
      await expect(second).toHaveAttribute("data-review", "rejected")

      await page.keyboard.press("/")
      await input.type("bogus")
      await input.press("Enter")
      await expect(page.getByTestId("diff-cmd-hint")).toContainText("Unknown command")
      await expect(input).toBeVisible()
      await expect(second).toHaveAttribute("data-review", "rejected")
      await input.press("Escape")
      await expect(input).toHaveCount(0)

      await first.hover()
      await first.locator(".diff-row-add").click()
      await expect(input).toHaveValue("/comment ")
      await input.press("Escape")
    } finally {
      await removeRepo(dir)
    }
  })
})
