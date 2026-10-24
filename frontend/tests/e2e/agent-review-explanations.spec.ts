import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.21.17, owner: "When agents open the review, i want them to have the
// posibility to drop "explanatory comments" justifying the changes. These
// would then be commented by me and the agents further." The author agent
// passes explanations with the round (open or revise); each sits under its
// line as the author's conversation; the owner and a reviewer agent reply in
// it; it is not a comment sent back with the round.

type Db = { exec(sql: string): void; close(): void }
const sqlite = async () => (await import("node:sqlite" as string)) as { DatabaseSync: new (path: string) => Db }
const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, author TEXT NOT NULL, text TEXT NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS seen (reader TEXT NOT NULL, channel TEXT NOT NULL, last_id INTEGER NOT NULL, updated REAL NOT NULL, PRIMARY KEY (reader, channel));
`

async function call(path: string, init: RequestInit = {}) {
  return fetch(`${ENGINE_URL}${path}`, { ...init, headers: engineHeaders({ "Content-Type": "application/json" }) })
}
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await call(path, init)
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

const lines = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i + 1) + "\n").join("")
const tText = (three: string, twentyFive: string) =>
  lines(30, (i) => (i === 3 ? three : i === 25 ? twentyFive : `line ${i}`))

type Thread = { id: string; kind: string; author: string | null; line: string; round: number }

test.describe("agent review explanations", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("the author explains a change on its line; the owner and a reviewer discuss it", async ({ page }) => {
    test.setTimeout(120_000)
    const dir = makeRepo("pg-review-explain-")
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

      // An explanation must sit on a line of the round's diff.
      const bad = await call(`/repos/${repoId}/agent-reviews`, {
        method: "POST",
        body: JSON.stringify({
          mode: "wait",
          title: "Bad explanation",
          agent: "auth-fix",
          worktree: true,
          files: [{ path: "t.txt", status: "M" }],
          explanations: [{ path: "t.txt", line: "+14", body: "Not in the diff." }],
        }),
      })
      expect(bad.status).toBe(400)
      expect(await bad.text()).toContain("not in the diff")

      const session = await api<{ id: string; comments: Thread[] }>(`/repos/${repoId}/agent-reviews`, {
        method: "POST",
        body: JSON.stringify({
          mode: "wait",
          title: "Explained review",
          agent: "auth-fix",
          worktree: true,
          files: [{ path: "t.txt", status: "M" }],
          explanations: [{ path: "t.txt", line: "+3", body: "Checked **once** here, so callers stop repeating it." }],
        }),
      })
      const explained = session.comments.find((c) => c.kind === "explain")!
      expect(explained).toMatchObject({ line: "+3", author: "auth-fix", round: 1 })

      await page.getByTestId("agent-reviews-button").click()
      await page.getByTestId("agent-review-row").filter({ hasText: "Explained review" }).filter({ hasText: basename(dir) }).click()

      // Under its line, as the author's conversation.
      const talk = page.getByTestId("round-thread").filter({ hasText: "callers stop repeating it" })
      await expect(talk).toBeVisible({ timeout: 15_000 })
      await expect(talk.getByTestId("thread-author")).toHaveText("auth-fix")
      await expect(talk.getByTestId("thread-kind")).toHaveText("explains the change")
      await expect(talk.locator("strong")).toHaveText("once")
      await expect(talk.getByTestId("comment-dismiss")).toHaveCount(0)
      // The author is not listed among the reviewers.
      await expect(page.getByTestId("agent-review-screen")).not.toContainText("reviewers: auth-fix")

      // The owner replies; the reply reaches the author on the board.
      await talk.getByTestId("thread-reply-open").click()
      await talk.getByTestId("thread-reply-text").fill("Why not in the caller?")
      await talk.getByTestId("thread-reply-send").click()
      await expect(talk.getByTestId("thread-reply")).toHaveText([/Why not in the caller\?/])
      await expect(
        page.getByTestId("board-post").filter({ hasText: `${explained.id} · t.txt:3` }).filter({ hasText: "Why not in the caller?" }),
      ).toBeVisible()

      // A reviewer agent joins the conversation.
      await api(`/repos/${repoId}/agent-reviews/${session.id}/reviewer-comments`, {
        method: "POST",
        body: JSON.stringify({ reviewer: "codex-review", replyTo: explained.id, body: "The caller has no context." }),
      })
      await expect(talk.getByTestId("thread-reply").last()).toHaveAttribute("data-author", "codex-review", {
        timeout: 15_000,
      })

      // Sent: an explanation is not one of the round's comments.
      await page.getByTestId("round-send").click()
      await expect(page.getByTestId("round-box")).toHaveAttribute("data-state", "sent")
      const sent = page.getByTestId("board-post").filter({ hasText: "Round 1 sent" })
      await expect(sent).toContainText("0 comments")
      await expect(sent).not.toContainText("callers stop repeating it")

      // Round 2 brings a new explanation; round 1's conversation stays.
      write(dir, "t.txt", tText("line 3 changed", "line 25 fixed"))
      await api(`/repos/${repoId}/agent-reviews/${session.id}/revise`, {
        method: "POST",
        body: JSON.stringify({
          note: "Round 2.",
          replies: [{ comment: explained.id, body: "Kept it here; the caller lacks context." }],
          explanations: [{ path: "t.txt", line: "+25", body: "Fixed the typo the reviewer saw." }],
        }),
      })
      await expect(page.getByTestId("agent-review-screen")).toHaveAttribute("data-round", "2", { timeout: 15_000 })
      const second = page.getByTestId("round-thread").filter({ hasText: "Fixed the typo the reviewer saw." })
      await expect(second.getByTestId("thread-author")).toHaveText("auth-fix")
      await expect(second.getByTestId("thread-kind")).toHaveText("explains the change")
      const first = page.getByTestId("round-thread").filter({ hasText: "callers stop repeating it" })
      await expect(first.getByTestId("thread-reply")).toHaveText([
        /Why not in the caller\?/,
        /The caller has no context\./,
        /Kept it here; the caller lacks context\./,
      ])
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
