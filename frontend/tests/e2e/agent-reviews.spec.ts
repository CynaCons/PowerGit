import { expect, test, type Locator, type Page } from "@playwright/test"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomBytes } from "node:crypto"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

async function openInApp(page: Page, dir: string) {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: engineHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ path: dir }),
  })
  const opened = (await res.json()) as { id: string }
  await page.goto(`/?repo=${opened.id}`)
  await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
}
const diffRow = (page: Page, text: string): Locator =>
  page
    .getByTestId("diff-pane")
    .locator(".diff-row")
    .filter({ has: page.locator(".diff-row-text").filter({ hasText: new RegExp(`^${text.replace(/[+]/g, "[+]")}$`) }) })
async function pressUntilCursor(page: Page, key: string, row: Locator) {
  for (let i = 0; i < (await page.locator(".diff-row").count()); i++) {
    if ((await row.getAttribute("class"))?.includes("diff-row-cursor")) return
    await page.keyboard.press(key)
  }
}

test.describe("agent reviews", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })
  test("a fake session written by hand appears in the inbox with the badge at 1, opens on its patch, and resolves each way", async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const dir = makeRepo("pg-agent-reviews-")
    write(dir, "f.txt", "one\ntwo\nthree\n")
    commit(dir, "start")
    const folder = join(dir, ".powergit", "agent-reviews")
    mkdirSync(folder, { recursive: true })
    const make = (mode: "wait" | "notify", title: string) => {
      const id = randomBytes(20).toString("hex"),
        now = new Date().toISOString()
      writeFileSync(
        join(folder, `${id}.json`),
        JSON.stringify({
          version: 1,
          id,
          mode,
          title,
          why: "A critical null guard",
          agent: "Codex",
          branch: "main",
          base: null,
          head: null,
          worktree: true,
          files: [
            {
              path: "f.txt",
              status: "M",
              patch:
                "diff --git a/f.txt b/f.txt\n--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,4 @@\n one\n+first\n two\n three\n",
            },
          ],
          status: "pending",
          unread: true,
          createdAt: now,
          updatedAt: now,
          resolvedAt: null,
          resolution: null,
          reason: null,
        }),
      )
      return id
    }
    const changeId = make("wait", "Guard the parser")
    try {
      await openInApp(page, dir)
      await expect(page.getByTestId("agent-reviews-badge")).toHaveText("1", { timeout: 10_000 })
      await page.getByTestId("agent-reviews-button").click()
      await page.getByTestId("agent-review-row").filter({ hasText: "Guard the parser" }).click()
      await expect(page.getByTestId("agent-review-why")).toContainText("critical")
      const row = diffRow(page, "+first")
      await expect(row).toBeVisible()
      await expect(page.getByTestId("diff-review-toggle")).toHaveAttribute("aria-pressed", "true")
      await page.getByTestId("diff-lines").focus()
      await pressUntilCursor(page, "j", row)
      await page.keyboard.press("x")
      await page.keyboard.press("/")
      await page.getByTestId("diff-cmd-input").type("comment needs a guard")
      await page.getByTestId("diff-cmd-input").press("Enter")
      await expect.poll(() => existsSync(join(dir, ".powergit", "reviews", `${changeId}.json`))).toBe(true)
      await page.getByTestId("agent-review-request-changes").click()
      await page.getByTestId("agent-review-summary").fill("Guard the null case")
      await page.getByTestId("agent-review-send").click()
      await expect(
        page.getByTestId("agent-review-row").filter({ hasText: "Guard the parser" }).getByTestId("agent-review-status"),
      ).toHaveText("Changes requested")
      const changed = JSON.parse(readFileSync(join(folder, `${changeId}.json`), "utf8"))
      expect(changed.status).toBe("changes_requested")
      expect(changed.resolution).toEqual({
        summary: "Guard the null case",
        comments: [{ path: "f.txt", line: "+2", side: "new", body: "needs a guard" }],
      })
      for (const [title, action, status] of [
        ["Approve this", "agent-review-approve", "approved"],
        ["Cancel this", "agent-review-cancel", "cancelled"],
      ] as const) {
        const id = make("wait", title)
        await page.getByLabel("Refresh agent reviews").click()
        await page.getByTestId("agent-review-row").filter({ hasText: title }).click()
        await page.getByTestId(action).click()
        if (action.includes("cancel")) await page.getByTestId("agent-review-cancel-confirm-confirm").click()
        await expect.poll(() => JSON.parse(readFileSync(join(folder, `${id}.json`), "utf8")).status).toBe(status)
      }
      const notify = make("notify", "Read this")
      await page.getByLabel("Refresh agent reviews").click()
      await page.getByTestId("agent-review-row").filter({ hasText: "Read this" }).click()
      await page.getByTestId("agent-review-ack").click()
      await expect.poll(() => JSON.parse(readFileSync(join(folder, `${notify}.json`), "utf8")).unread).toBe(false)
    } finally {
      await removeRepo(dir)
    }
  })
})
