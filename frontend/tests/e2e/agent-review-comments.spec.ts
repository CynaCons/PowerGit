import { expect, test, type Page } from "@playwright/test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.21.12, owner: "when I'm dropping a comment in the review panel, it is
// not deletable." A comment that goes with the round can be edited and
// deleted before the round is sent; a question already asked on the board is
// withdrawn (the board says so). The board test needs a temporary board.db,
// as in agent-review-rounds.spec.ts.

type Db = { exec(sql: string): void; close(): void }
const sqlite = async () => (await import("node:sqlite" as string)) as { DatabaseSync: new (path: string) => Db }
const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, author TEXT NOT NULL, text TEXT NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS seen (reader TEXT NOT NULL, channel TEXT NOT NULL, last_id INTEGER NOT NULL, updated REAL NOT NULL, PRIMARY KEY (reader, channel));
`

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, { ...init, headers: engineHeaders({ "Content-Type": "application/json" }) })
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

const lines = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i + 1) + "\n").join("")

async function openReview(page: Page, prefix: string, title: string) {
  const dir = makeRepo(prefix)
  write(dir, "t.txt", lines(10, (i) => `line ${i}`))
  commit(dir, "ten lines")
  const { id: repoId } = await api<{ id: string }>("/repos/open", { method: "POST", body: JSON.stringify({ path: dir }) })
  await page.goto(`/?repo=${repoId}`)
  await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
  write(dir, "t.txt", lines(10, (i) => (i === 3 ? "line 3 changed" : `line ${i}`)))
  return { dir, repoId, title }
}

async function startReview(page: Page, repoId: string, dir: string, title: string) {
  const session = await api<{ id: string; board: string | null }>(`/repos/${repoId}/agent-reviews`, {
    method: "POST",
    body: JSON.stringify({ mode: "wait", title, agent: "auth-fix", worktree: true, files: [{ path: "t.txt", status: "M" }] }),
  })
  await page.getByTestId("agent-reviews-button").click()
  await page.getByTestId("agent-review-row").filter({ hasText: title }).filter({ hasText: basename(dir) }).click()
  await expect(page.getByTestId("agent-review-screen")).toBeVisible()
  return session
}

test.describe("agent review comments", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("a comment for the round can be edited and deleted before the round goes", async ({ page }) => {
    test.setTimeout(90_000)
    const { dir, repoId } = await openReview(page, "pg-review-comments-", "Comments can go")
    try {
      await startReview(page, repoId, dir, "Comments can go")
      const change = page.getByTestId("round-change").filter({ hasText: "line 3 changed" })
      await change.locator('[data-testid="round-line"][data-key="+3"] td').nth(1).click()
      await page.getByTestId("comment-draft").fill("Rename this.")
      await page.getByTestId("comment-add").click()
      await expect(page.getByTestId("round-box")).toContainText("1 comment")

      const body = change.getByTestId("thread-body")
      await expect(body).toHaveText("Rename this.")
      await change.getByTestId("comment-edit").click()
      await change.getByTestId("comment-edit-text").fill("Rename this to refreshOnce.")
      await change.getByTestId("comment-edit-save").click()
      await expect(body).toHaveText("Rename this to refreshOnce.")

      await change.getByTestId("comment-delete").click()
      await expect(change.getByTestId("thread-body")).toHaveCount(0)
      await expect(page.getByTestId("round-box")).toContainText("0 comments")
      // Gone from the review file too: a reload does not bring it back.
      await page.reload()
      await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
      await page.getByTestId("agent-reviews-button").click()
      await page.getByTestId("agent-review-row").filter({ hasText: "Comments can go" }).filter({ hasText: basename(dir) }).click()
      await expect(page.getByTestId("round-change").filter({ hasText: "line 3 changed" })).toBeVisible()
      await expect(page.getByTestId("round-change").filter({ hasText: "line 3 changed" }).getByTestId("thread-body")).toHaveCount(0)
    } finally {
      await removeRepo(dir)
    }
  })

  test("a question asked on the board can be withdrawn", async ({ page }) => {
    test.setTimeout(90_000)
    const { dir, repoId } = await openReview(page, "pg-review-withdraw-", "Take it back")
    let boardPath: string | null = null
    let db: Db | null = null
    try {
      const status = await api<{ path: string }>(`/repos/${repoId}/board/status`)
      test.skip(!resolve(status.path).toLowerCase().startsWith(resolve(tmpdir()).toLowerCase()), "not a test board")
      boardPath = status.path
      mkdirSync(dirname(boardPath), { recursive: true })
      const { DatabaseSync } = await sqlite()
      db = new DatabaseSync(boardPath)
      db.exec(SCHEMA)

      await startReview(page, repoId, dir, "Take it back")
      const change = page.getByTestId("round-change").filter({ hasText: "line 3 changed" })
      await change.locator('[data-testid="round-line"][data-key="+3"] td').nth(1).click()
      await page.getByTestId("comment-draft").fill("Why this line?")
      await page.getByTestId("comment-ask").click()
      await expect(page.getByTestId("board-post").filter({ hasText: "Why this line?" })).toBeVisible()

      await change.getByTestId("comment-withdraw").click()
      await expect(change.getByTestId("thread-body")).toHaveCount(0)
      await expect(page.getByTestId("board-post").filter({ hasText: "c1 withdrawn" })).toBeVisible()
      await expect(page.getByTestId("round-box")).toContainText("0 comments")
    } finally {
      db?.close()
      if (boardPath)
        for (const f of [boardPath, `${boardPath}-wal`, `${boardPath}-shm`])
          try {
            if (existsSync(f)) rmSync(f, { force: true })
          } catch {
            // left for the next run
          }
      await removeRepo(dir)
    }
  })
})
