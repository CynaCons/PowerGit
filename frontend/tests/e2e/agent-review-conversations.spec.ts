import { expect, test, type Page } from "@playwright/test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.21.13, owner: "if I drop a comment on round one, when the agent comes
// with round two, I lose the comments. Can we make it so that when we
// increase the round, we can still view the previous comments from the
// previous rounds? And when the agent answers, it should be displayed in a
// conversation, like in Bitbucket." Round 1 has a comment on a change the
// agent then revises, a comment on a rejected change the agent then removes,
// and a question on a file the agent then reverts; all three stay visible in
// round 2, the revised one still in round 3, and a reply in a conversation
// reaches the board and gets its answer underneath.

type Db = { exec(sql: string): void; prepare(sql: string): { run(...args: unknown[]): unknown }; close(): void }
const sqlite = async () => (await import("node:sqlite" as string)) as { DatabaseSync: new (path: string) => Db }
const SCHEMA = `
PRAGMA journal_mode=WAL;
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
const tText = (three: string, twentyFive: string) =>
  lines(30, (i) => (i === 3 ? three : i === 25 ? twentyFive : `line ${i}`))

async function commentOn(page: Page, change: string, key: string, text: string, how: "comment-add" | "comment-ask") {
  const card = page.getByTestId("round-change").filter({ hasText: change })
  await card.locator(`[data-testid="round-line"][data-key="${key}"] td`).nth(1).click()
  await page.getByTestId("comment-draft").fill(text)
  await page.getByTestId(how).click()
}

test.describe("agent review conversations across rounds", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("round 1's comments stay in rounds 2 and 3, and a reply gets its answer in the conversation", async ({ page }) => {
    test.setTimeout(150_000)
    const dir = makeRepo("pg-review-talk-")
    write(dir, "t.txt", tText("line 3", "line 25"))
    write(dir, "u.txt", lines(8, (i) => `u ${i}`))
    commit(dir, "two files")
    let boardPath: string | null = null
    let db: Db | null = null
    try {
      const { id: repoId } = await api<{ id: string }>("/repos/open", { method: "POST", body: JSON.stringify({ path: dir }) })
      const status = await api<{ path: string }>(`/repos/${repoId}/board/status`)
      test.skip(!resolve(status.path).toLowerCase().startsWith(resolve(tmpdir()).toLowerCase()), "not a test board")
      boardPath = status.path
      mkdirSync(dirname(boardPath), { recursive: true })
      const { DatabaseSync } = await sqlite()
      db = new DatabaseSync(boardPath)
      db.exec(SCHEMA)
      const say = (text: string) =>
        db!
          .prepare("INSERT INTO messages (channel, author, text, created) VALUES (?, ?, ?, ?)")
          .run(session.board, "auth-fix", text, Date.now() / 1000)

      await page.goto(`/?repo=${repoId}`)
      await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
      write(dir, "t.txt", tText("line 3 changed", "line 25 changed"))
      write(dir, "u.txt", lines(8, (i) => (i === 5 ? "u 5 changed" : `u ${i}`)))
      const session = await api<{ id: string; board: string }>(`/repos/${repoId}/agent-reviews`, {
        method: "POST",
        body: JSON.stringify({
          mode: "wait",
          title: "Talk across rounds",
          agent: "auth-fix",
          worktree: true,
          files: [
            { path: "t.txt", status: "M" },
            { path: "u.txt", status: "M" },
          ],
        }),
      })
      await page.getByTestId("agent-reviews-button").click()
      await page.getByTestId("agent-review-row").filter({ hasText: "Talk across rounds" }).filter({ hasText: basename(dir) }).click()

      // Round 1: a question on u.txt, answered on the board; two comments on t.txt, the second change rejected.
      await page.locator('[data-testid="round-file"][data-path="u.txt"]').click()
      await commentOn(page, "u 5 changed", "+5", "Why touch u?", "comment-ask")
      say("c1: it shared the timer")
      await expect(page.getByTestId("thread-reply").filter({ hasText: "it shared the timer" })).toBeVisible({ timeout: 15_000 })
      await page.locator('[data-testid="round-file"][data-path="t.txt"]').click()
      await commentOn(page, "line 3 changed", "+3", "Rename this.", "comment-add")
      await page.getByTestId("round-change").filter({ hasText: "line 25 changed" }).getByTestId("verdict-reject").click()
      await commentOn(page, "line 25 changed", "+25", "Keep 25 as it was.", "comment-add")
      await page.getByTestId("round-send").click()
      await expect(page.getByTestId("round-box")).toHaveAttribute("data-state", "sent")

      // Round 2: line 3 revised, line 25 restored (removed), u.txt reverted (the file leaves the round).
      write(dir, "t.txt", tText("line 3 again", "line 25"))
      write(dir, "u.txt", lines(8, (i) => `u ${i}`))
      await api(`/repos/${repoId}/agent-reviews/${session.id}/revise`, { method: "POST", body: JSON.stringify({ note: "Round 2." }) })
      await expect(page.getByTestId("agent-review-screen")).toHaveAttribute("data-round", "2", { timeout: 15_000 })

      const revised = page.getByTestId("round-change").filter({ hasText: "line 3 again" })
      await expect(revised.getByTestId("round-thread")).toContainText("Rename this.")
      await expect(revised.getByTestId("round-thread")).toContainText("Round 1, line 3")
      await expect(page.getByTestId("round-removed").filter({ hasText: "Keep 25 as it was." })).toBeVisible()

      const gone = page.locator('[data-testid="round-file"][data-path="u.txt"]')
      await expect(gone).toContainText("Not in round 2")
      await gone.click()
      const asked = page.getByTestId("round-thread").filter({ hasText: "Why touch u?" })
      await expect(asked.getByTestId("thread-reply")).toContainText("it shared the timer")

      // A reply in the revised change's conversation goes to the board; the answer lands under it.
      await page.locator('[data-testid="round-file"][data-path="t.txt"]').click()
      const talk = revised.getByTestId("round-thread").filter({ hasText: "Rename this." })
      await talk.getByTestId("thread-reply-open").click()
      await talk.getByTestId("thread-reply-text").fill("Call it refreshOnce.")
      await talk.getByTestId("thread-reply-send").click()
      await expect(page.getByTestId("board-post").filter({ hasText: "Call it refreshOnce." })).toBeVisible()
      say("c2: renamed to refreshOnce")
      await expect(talk.getByTestId("thread-reply")).toHaveText([/Call it refreshOnce\./, /renamed to refreshOnce/], {
        timeout: 15_000,
      })

      // Round 3: line 3 revised again; round 1's conversation is still there (two hops).
      await page.getByTestId("round-send").click()
      await expect(page.getByTestId("round-box")).toHaveAttribute("data-state", "sent")
      write(dir, "t.txt", tText("line 3 third", "line 25"))
      await api(`/repos/${repoId}/agent-reviews/${session.id}/revise`, { method: "POST", body: JSON.stringify({ note: "Round 3." }) })
      await expect(page.getByTestId("agent-review-screen")).toHaveAttribute("data-round", "3", { timeout: 15_000 })
      await expect(
        page.getByTestId("round-change").filter({ hasText: "line 3 third" }).getByTestId("round-thread"),
      ).toContainText("Rename this.")
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
