import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.21.14, owner: "we need to also have the ability for other agents to plug
// into a review and drop comments … so that we can have reviews mixing both
// agents and humans together on the same review inside powergit." A second
// agent (codex-review) comments on the round the owner is reviewing; its
// comments show under their lines with its name, beside the owner's, and on
// the board; the owner dismisses one; the other goes to the author with the
// round, the author answers it, and the reviewer replies in the conversation.

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
const tText = (three: string, twentyFive: string) =>
  lines(30, (i) => (i === 3 ? three : i === 25 ? twentyFive : `line ${i}`))

test.describe("agent review with a reviewer agent", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("a reviewer agent's comments sit beside the owner's and go to the author with the round", async ({ page }) => {
    test.setTimeout(120_000)
    const dir = makeRepo("pg-review-mixed-")
    write(dir, "t.txt", tText("line 3", "line 25"))
    commit(dir, "one file")
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

      await page.goto(`/?repo=${repoId}`)
      await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
      write(dir, "t.txt", tText("line 3 changed", "line 25 changed"))
      const session = await api<{ id: string; board: string }>(`/repos/${repoId}/agent-reviews`, {
        method: "POST",
        body: JSON.stringify({ mode: "wait", title: "Mixed review", agent: "auth-fix", worktree: true, files: [{ path: "t.txt", status: "M" }] }),
      })
      const reviewer = (body: object) =>
        api<{ id: string }>(`/repos/${repoId}/agent-reviews/${session.id}/reviewer-comments`, {
          method: "POST",
          body: JSON.stringify({ reviewer: "codex-review", ...body }),
        })
      await page.getByTestId("agent-reviews-button").click()
      await page.getByTestId("agent-review-row").filter({ hasText: "Mixed review" }).filter({ hasText: basename(dir) }).click()

      // The reviewer comments on two lines while the owner reviews.
      const guard = await reviewer({ path: "t.txt", line: "+3", body: "Guard the null case." })
      await reviewer({ path: "t.txt", line: "+25", body: "Typo here." })
      const three = page.getByTestId("round-thread").filter({ hasText: "Guard the null case." })
      await expect(three).toBeVisible({ timeout: 15_000 })
      await expect(three.getByTestId("thread-author")).toHaveText("codex-review")
      await expect(three).toContainText("goes with the round")
      await expect(page.getByTestId("board-post").filter({ hasText: "Guard the null case." })).toHaveAttribute(
        "data-author",
        "codex-review",
      )

      // The owner adds a comment on the same line and dismisses the other reviewer comment.
      const card = page.getByTestId("round-change").filter({ hasText: "line 3 changed" })
      await card.locator('[data-testid="round-line"][data-key="+3"] td').nth(1).click()
      await page.getByTestId("comment-draft").fill("Agree, and rename it.")
      await page.getByTestId("comment-add").click()
      await expect(three).toContainText("Agree, and rename it.")
      const typo = page.getByTestId("round-thread").filter({ hasText: "Typo here." })
      await typo.getByTestId("comment-dismiss").click()
      await expect(typo).toHaveCount(0)
      await expect(page.getByTestId("board-post").filter({ hasText: "dismissed" })).toBeVisible()

      // Sent: the reviewer's comment goes to the author with the owner's; the dismissed one does not.
      await page.getByTestId("round-send").click()
      await expect(page.getByTestId("round-box")).toHaveAttribute("data-state", "sent")
      const sent = page.getByTestId("board-post").filter({ hasText: "Round 1 sent" })
      await sent.getByTestId("board-details-toggle").click()
      await expect(sent).toContainText("Guard the null case.")
      await expect(sent).toContainText("codex-review")
      await expect(sent).not.toContainText("Typo here.")

      // Round 2: the author answers, the reviewer replies; one conversation, three voices.
      write(dir, "t.txt", tText("line 3 guarded", "line 25 changed"))
      await api(`/repos/${repoId}/agent-reviews/${session.id}/revise`, {
        method: "POST",
        body: JSON.stringify({ note: "Round 2.", replies: [{ comment: guard.id, body: "Guarded it." }] }),
      })
      await expect(page.getByTestId("agent-review-screen")).toHaveAttribute("data-round", "2", { timeout: 15_000 })
      await reviewer({ replyTo: guard.id, body: "Looks right now." })
      const talk = page
        .getByTestId("round-change")
        .filter({ hasText: "line 3 guarded" })
        .getByTestId("round-thread")
        .filter({ hasText: "Guard the null case." })
      await expect(talk.getByTestId("thread-reply")).toHaveText([/Guarded it\./, /Looks right now\./], { timeout: 15_000 })
      await expect(talk.getByTestId("thread-reply").last()).toHaveAttribute("data-author", "codex-review")
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
