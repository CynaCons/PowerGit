import { expect, test, type Page } from "@playwright/test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.21.3 (owner 2026-10-13, layout A of docs/prototypes/agent-review-v3.html):
// an agent's review opens in full view; the owner accepts and rejects changes,
// asks on the review's powerchannel channel and sees the agent's answer under
// the line, sends the round, sees round 2 with the unchanged change still
// accepted, and approves. The engine's board is a temporary board.db created
// here with powerchannel's schema; a run whose engine points at a board outside
// the temp folder (the user's real one) skips the board test.

type Db = { exec(sql: string): void; prepare(sql: string): { run(...args: unknown[]): unknown }; close(): void }
const sqlite = async () => (await import("node:sqlite" as string)) as { DatabaseSync: new (path: string) => Db }

const SCHEMA = `
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, author TEXT NOT NULL, text TEXT NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS seen (reader TEXT NOT NULL, channel TEXT NOT NULL, last_id INTEGER NOT NULL, updated REAL NOT NULL, PRIMARY KEY (reader, channel));
`

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...init,
    headers: engineHeaders({ "Content-Type": "application/json" }),
  })
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

async function openInApp(page: Page, dir: string): Promise<string> {
  const { id } = await api<{ id: string }>("/repos/open", { method: "POST", body: JSON.stringify({ path: dir }) })
  await page.goto(`/?repo=${id}`)
  await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
  return id
}

const lines = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i + 1) + "\n").join("")

test.describe("agent review rounds", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  test("two rounds on the board: verdicts, a question answered under its line, round 2 keeps the accepted change, approve", async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const dir = makeRepo("pg-review-rounds-")
    write(
      dir,
      "t.txt",
      lines(30, (i) => `line ${i}`),
    )
    commit(dir, "thirty lines")
    let boardPath: string | null = null
    let db: Db | null = null
    try {
      const repoId = await openInApp(page, dir)
      const status = await api<{ path: string }>(`/repos/${repoId}/board/status`)
      const temp = resolve(tmpdir()).toLowerCase()
      test.skip(
        !resolve(status.path).toLowerCase().startsWith(temp),
        `the engine's board is not a test board: ${status.path}`,
      )
      boardPath = status.path
      mkdirSync(dirname(boardPath), { recursive: true })
      const { DatabaseSync } = await sqlite()
      db = new DatabaseSync(boardPath)
      db.exec(SCHEMA)

      write(
        dir,
        "t.txt",
        lines(30, (i) => (i === 3 ? "line 3 changed" : i === 25 ? "line 25 changed" : `line ${i}`)),
      )
      const session = await api<{ id: string; board: string }>(`/repos/${repoId}/agent-reviews`, {
        method: "POST",
        body: JSON.stringify({
          mode: "wait",
          title: "Fix the refresh race",
          why: "Two refreshes could run at once.",
          agent: "auth-fix",
          worktree: true,
          files: [{ path: "t.txt", status: "M" }],
        }),
      })
      expect(session.board).toMatch(/^review-pg-review-rounds-/)
      // The agent is on the channel.
      db!
        .prepare("INSERT INTO seen (reader, channel, last_id, updated) VALUES (?, ?, 0, ?)")
        .run("auth-fix", session.board, Date.now() / 1000)

      await page.getByTestId("agent-reviews-button").click()
      await expect(
        page
          .getByTestId("agent-review-row")
          .filter({ hasText: "Fix the refresh race" })
          .filter({ hasText: basename(dir) }),
      ).toContainText("round 1 · your turn")
      await page
        .getByTestId("agent-review-row")
        .filter({ hasText: "Fix the refresh race" })
        .filter({ hasText: basename(dir) })
        .click()

      // Full view: the repository tree is gone, the review has the row.
      const screen = page.getByTestId("agent-review-screen")
      await expect(screen).toBeVisible()
      await expect(page.getByTestId("left-panel")).toHaveCount(0)
      await expect(page.getByTestId("board-channel")).toHaveText(session.board)
      await expect(page.getByTestId("board-presence")).toHaveAttribute("data-reading", "yes")
      await expect(page.getByTestId("board-post").first()).toContainText("Round 1 opened")

      const first = page.getByTestId("round-change").filter({ hasText: "line 3 changed" })
      const second = page.getByTestId("round-change").filter({ hasText: "line 25 changed" })
      await first.getByTestId("verdict-accept").click()
      await expect(first).toHaveAttribute("data-verdict", "accept")
      await second.getByTestId("verdict-reject").click()
      await expect(second).toHaveAttribute("data-verdict", "reject")

      // A question on line 3, asked at once; the agent answers on the board.
      await first.locator('[data-testid="round-line"][data-key="+3"] td').nth(1).click()
      await page.getByTestId("comment-draft").fill("Why this line?")
      await page.getByTestId("comment-ask").click()
      await expect(page.getByTestId("board-post").filter({ hasText: "Why this line?" })).toContainText("t.txt:3")
      db!
        .prepare("INSERT INTO messages (channel, author, text, created) VALUES (?, ?, ?, ?)")
        .run(session.board, "auth-fix", "c1: the old line raced with the timer", Date.now() / 1000)
      await expect(first.getByTestId("thread-reply")).toContainText("the old line raced with the timer", {
        timeout: 15_000,
      })

      // v0.21.11, owner: "agents should be encouraged to structure their
      // text, maybe with markdown format. Now it's just a blob of text." An
      // agent post in Markdown reads as a list, bold and a code block.
      db!
        .prepare("INSERT INTO messages (channel, author, text, created) VALUES (?, ?, ?, ?)")
        .run(
          session.board,
          "auth-fix",
          "Plan for round 2:\n\n- keep **line 25** as it was\n- add a test for the timer\n\n```ts\nconst delay = 250\n```",
          Date.now() / 1000,
        )
      const markdownPost = page.getByTestId("board-post").filter({ hasText: "Plan for round 2" })
      await expect(markdownPost.locator("li").filter({ hasText: "add a test for the timer" })).toBeVisible({
        timeout: 15_000,
      })
      await expect(markdownPost.locator("strong").filter({ hasText: "line 25" })).toBeVisible()
      await expect(markdownPost.locator("pre")).toContainText("const delay = 250")
      await expect(markdownPost).not.toContainText("**")
      await expect(markdownPost).not.toContainText("```")

      // A comment that goes with the round, on line 25.
      await second.locator('[data-testid="round-line"][data-key="+25"] td').nth(1).click()
      await page.getByTestId("comment-draft").fill("Keep line 25 as it was.")
      await page.getByTestId("comment-add").click()
      await expect(page.getByTestId("round-box")).toContainText("1 comment")
      await page.getByTestId("round-note").fill("One thing.")
      await page.getByTestId("round-send").click()
      await expect(page.getByTestId("round-box")).toHaveAttribute("data-state", "sent")
      await expect(page.getByTestId("agent-review-turn")).toContainText("round 1 sent · agent revising")
      await expect(page.getByTestId("board-post").filter({ hasText: "Round 1 sent" })).toContainText("✗ h2")

      // The agent restores line 25 its own way and opens round 2.
      write(
        dir,
        "t.txt",
        lines(30, (i) => (i === 3 ? "line 3 changed" : i === 25 ? "line 25 again" : `line ${i}`)),
      )
      await api(`/repos/${repoId}/agent-reviews/${session.id}/revise`, {
        method: "POST",
        body: JSON.stringify({ note: "Restored 25.", replies: [{ comment: "c2", body: "done" }] }),
      })
      await expect(page.getByTestId("agent-review-screen")).toHaveAttribute("data-round", "2", { timeout: 15_000 })
      await expect(page.getByTestId("round-change").filter({ hasText: "line 3 changed" })).toHaveAttribute(
        "data-origin",
        "carried",
      )
      await expect(page.getByTestId("round-change").filter({ hasText: "line 3 changed" })).toHaveAttribute(
        "data-verdict",
        "accept",
      )
      const revised = page.getByTestId("round-change").filter({ hasText: "line 25 again" })
      await expect(revised).toHaveAttribute("data-origin", "revised")
      await expect(revised.getByTestId("round-thread")).toContainText("done")

      await revised.getByTestId("verdict-accept").click()
      await expect(page.getByTestId("round-send")).toHaveText("Approve all (2)")
      await page.getByTestId("round-send").click()
      await expect(page.getByTestId("round-box")).toHaveAttribute("data-state", "closed")
      await expect(page.getByTestId("board-post").filter({ hasText: "Approved" })).toBeVisible()

      // The rail leaves the review: Recent repositories takes the window.
      await page.getByTestId("recents-button").click()
      await expect(page.getByTestId("agent-review-screen")).toHaveCount(0)
      await page.getByTestId("agent-reviews-button").click()
      await expect(page.getByTestId("agent-reviews-view")).toBeVisible()
      await page.getByTestId("inbox-filter-all").click()
      await expect(
        page
          .getByTestId("agent-review-row")
          .filter({ hasText: "Fix the refresh race" })
          .filter({ hasText: basename(dir) }),
      ).toContainText("approved · round 2")
    } finally {
      db?.close()
      // Best effort: the engine may still hold the file for a moment.
      if (boardPath)
        for (const f of [boardPath, `${boardPath}-wal`, `${boardPath}-shm`])
          try {
            if (existsSync(f)) rmSync(f, { force: true })
          } catch {
            // left for the next run, which recreates the schema
          }
      await removeRepo(dir)
    }
  })

  test("without powerchannel the column lists the rounds and the round still goes back", async ({ page }) => {
    test.setTimeout(60_000)
    const dir = makeRepo("pg-review-noboard-")
    try {
      const repoId = await openInApp(page, dir)
      const status = await api<{ path: string; available: boolean }>(`/repos/${repoId}/board/status`)
      test.skip(status.available, "a board is installed for this engine")
      const session = await api<{ id: string; board: string | null }>(`/repos/${repoId}/agent-reviews`, {
        method: "POST",
        body: JSON.stringify({
          mode: "wait",
          title: "No board here",
          agent: "auth-fix",
          files: [{ path: "a.txt", status: "M", patch: "@@ -1 +1 @@\n-base\n+next\n" }],
        }),
      })
      expect(session.board).toBeNull()
      await page.getByTestId("agent-reviews-button").click()
      await page
        .getByTestId("agent-review-row")
        .filter({ hasText: "No board here" })
        .filter({ hasText: basename(dir) })
        .click()
      await expect(page.getByTestId("board-column")).toHaveAttribute("data-board", "off")
      await expect(page.getByTestId("board-unavailable")).toContainText("powerchannel not found")
      await page.getByTestId("verdict-reject").click()
      await page.getByTestId("round-send").click()
      await expect(page.getByTestId("round-box")).toHaveAttribute("data-state", "sent")
    } finally {
      await removeRepo(dir)
    }
  })
})
