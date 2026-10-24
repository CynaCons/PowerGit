import { expect, test } from "@playwright/test"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { ENGINE_URL, engineHeaders } from "../engine"
import { commit, currentRepoPath, git, makeRepo, openRepoOnEngine, removeRepo, write } from "../repoFixture"

// v0.22.0, owner: "an MCP call or API that would enable ... some sort of like
// visual planner for branches", then on the prototype: "A branch plan in
// powergit would be cool ... Better than ascii", and "This is awesome. Let's
// bake it in!!!!" An agent opens a branch plan; PowerGit checks each step
// with git and shows the plan on its graph; the owner scrubs through it,
// reads the conflict, comments on a step, re-checks after main moved, and
// approves; the steps tick as the agent runs them.

type Db = { exec(sql: string): void; close(): void }
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

const session = (timeout: string) => `export const SESSION = {\n  name: "app",\n  timeout: ${timeout},\n}\n`

const STEPS = [
  { op: "rebase", branch: "feature/auth", onto: "main" },
  { op: "branch", name: "feature/billing", from: "feature/auth" },
  { op: "commit", on: "feature/billing", label: "B1", subject: "billing: plan model", files: ["src/billing/plan.ts"] },
  { op: "merge", from: "feature/billing", into: "feature/auth", mode: "no-ff" },
  { op: "merge", from: "feature/auth", into: "main", mode: "no-ff" },
  { op: "tag", name: "v1.5", at: "main" },
]

test.describe("branch plans", () => {
  let previous: string | null = null
  test.beforeAll(async () => {
    previous = await currentRepoPath()
  })
  test.afterAll(async () => {
    await openRepoOnEngine(previous ?? process.cwd())
  })

  // v0.22.1, owner: "Add the missing things to the planning, like the rebase
  // check and the cherry pick": a cherry-pick step is checked commit by
  // commit, and a long history folds its quiet run instead of being cut.
  test("a cherry-pick step shows its copy, and a long history folds its quiet run", async ({ page }) => {
    test.setTimeout(150_000)
    const dir = makeRepo("pg-branch-plan-pick-")
    git(dir, "checkout", "-q", "-b", "topic")
    write(dir, "fix.ts", "export const fixed = true\n")
    commit(dir, "fix: guard the empty repo")
    const fix = git(dir, "rev-parse", "HEAD").trim()
    git(dir, "checkout", "-q", "main")
    for (let i = 0; i < 150; i++) git(dir, "commit", "-q", "--allow-empty", "-m", `main ${i}`)
    try {
      const { id: repoId } = await api<{ id: string }>("/repos/open", {
        method: "POST",
        body: JSON.stringify({ path: dir }),
      })
      await page.goto(`/?repo=${repoId}`)
      await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
      await api(`/repos/${repoId}/branch-plans`, {
        method: "POST",
        body: JSON.stringify({
          mode: "wait",
          title: "Bring the empty-repo fix to main",
          agent: "auth-fix",
          steps: [{ op: "cherry-pick", commits: [fix], onto: "main" }],
        }),
      })
      await page.getByTestId("agent-reviews-button").click()
      await page
        .getByTestId("agent-review-row")
        .filter({ hasText: "Bring the empty-repo fix" })
        .filter({ hasText: basename(dir) })
        .click()
      const step = page.getByTestId("plan-step")
      await expect(step).toHaveCount(1, { timeout: 15_000 })
      await expect(step).toHaveAttribute("data-result", "ok")
      await expect(step).toContainText("Cherry-pick 1 commit onto main")
      await expect(step).toContainText("1 commit replays cleanly")
      await page.locator('[data-testid="plan-scrub"][data-at="1"]').click()
      await expect(page.locator('[data-testid="plan-row"][data-kind="planned"]')).toContainText(
        "fix: guard the empty repo",
      )
      const fold = page.locator('[data-testid="plan-row"][data-kind="fold"]')
      await expect(fold).toHaveCount(1)
      await expect(fold).toContainText(/\d+ commits/)
      expect(await page.locator('[data-testid="plan-row"]').count()).toBeLessThan(20)

      // v0.22.2, owner: "Make the panels resizeable in the branch plan": the
      // steps pane and the step detail follow their handles.
      const drag = async (testid: string, dx: number, dy: number) => {
        const box = (await page.getByTestId(testid).boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 5 })
        await page.mouse.up()
      }
      const width = async () => (await page.getByTestId("plan-steps").boundingBox())!.width
      const height = async () => (await page.getByTestId("plan-detail-pane").boundingBox())!.height
      const header = async () => (await page.getByTestId("plan-header").boundingBox())!.height
      const [w0, h0, t0] = [await width(), await height(), await header()]
      await drag("review-files-splitter", 80, 0)
      await drag("plan-detail-splitter", 0, -100)
      expect(await width()).toBeGreaterThan(w0 + 40)
      expect(await height()).toBeGreaterThan(h0 + 60)
      // v0.22.3, owner: "you didnt make the top panel resizeable".
      await drag("plan-header-splitter", 0, -60)
      expect(await header()).toBeLessThan(t0 - 40)
    } finally {
      await removeRepo(dir)
    }
  })

  // v0.22.5, owner: "Can we add labels in the branch plan, to have "PRs"
  // represented and including a clickable link that would open the PR?",
  // then "agents may be working with other sites. At work, we work with
  // bitbucket. So keep it generic, agents should be able to fill their PR
  // infos". The agent gives each PR's id, title, url and state; a planned PR
  // is a step that ticks once the agent reports its url.
  test("pull requests show as labels on their branches and link out, from any host", async ({ page }) => {
    test.setTimeout(120_000)
    const dir = makeRepo("pg-branch-plan-prs-")
    git(dir, "checkout", "-q", "-b", "feature/auth")
    write(dir, "auth.ts", "export const auth = 1\n")
    commit(dir, "auth: login")
    git(dir, "checkout", "-q", "-b", "feature/billing", "main")
    write(dir, "billing.ts", "export const billing = 1\n")
    commit(dir, "billing: plans")
    git(dir, "checkout", "-q", "main")
    const bitbucket = "https://bitbucket.example.com/projects/APP/repos/web/pull-requests/17"
    try {
      const { id: repoId } = await api<{ id: string }>("/repos/open", {
        method: "POST",
        body: JSON.stringify({ path: dir }),
      })
      await page.goto(`/?repo=${repoId}`)
      await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
      const plan = await api<{ id: string }>(`/repos/${repoId}/branch-plans`, {
        method: "POST",
        body: JSON.stringify({
          mode: "wait",
          title: "Ship auth and billing through review",
          agent: "auth-fix",
          steps: [
            { op: "merge", from: "feature/auth", into: "main" },
            { op: "pr", from: "feature/billing", into: "main", title: "Billing plans" },
          ],
          prs: [
            { branch: "feature/auth", id: "PR-17", title: "Auth login", url: bitbucket, state: "open", into: "main" },
          ],
        }),
      })
      await page.getByTestId("agent-reviews-button").click()
      await page
        .getByTestId("agent-review-row")
        .filter({ hasText: "Ship auth and billing" })
        .filter({ hasText: basename(dir) })
        .click()
      await expect(page.getByTestId("plan-step").nth(1)).toContainText(
        "Open a pull request from feature/billing into main",
      )
      await page.locator('[data-testid="plan-scrub"][data-at="0"]').click()

      // An existing PR: a label beside its branch that opens the PR.
      const pr = page.locator('[data-testid="plan-pr"][data-branch="feature/auth"]')
      await expect(pr).toContainText("PR-17")
      await expect(pr).toContainText("open")
      await expect(pr).toHaveAttribute("href", bitbucket)
      await expect(pr).toHaveAttribute("title", /Auth login/)

      // A planned PR: dashed until the agent opens it.
      await page.locator('[data-testid="plan-scrub"][data-at="2"]').click()
      const planned = page.locator('[data-testid="plan-pr"][data-branch="feature/billing"]')
      await expect(planned).toHaveAttribute("data-planned", "true")
      await expect(planned).toContainText("PR → main")

      // Approved, the agent opens it and reports it: the step ticks and the label links.
      await page.getByTestId("plan-approve").click()
      await expect(page.getByTestId("plan-progress")).toContainText("0 of 2")
      const url = "https://git.example.org/team/web/-/merge_requests/9"
      await api(`/repos/${repoId}/branch-plans/${plan.id}/prs`, {
        method: "POST",
        body: JSON.stringify({
          branch: "feature/billing",
          id: "!9",
          title: "Billing plans",
          url,
          state: "open",
          into: "main",
        }),
      })
      await expect(page.getByTestId("plan-step").nth(1)).toHaveAttribute("data-done", "true", { timeout: 15_000 })
      await expect(planned).not.toHaveAttribute("data-planned", "true")
      await expect(planned).toHaveAttribute("href", url)
      await expect(planned).toContainText("!9")
      // The PR is the agent's word: the merge before it has not run.
      await expect(page.getByTestId("plan-step").nth(0)).not.toHaveAttribute("data-done", "true")
      await expect(page.getByTestId("plan-progress")).toContainText("1 of 2")

      // Only web links are accepted.
      const bad = await fetch(`${ENGINE_URL}/repos/${repoId}/branch-plans/${plan.id}/prs`, {
        method: "POST",
        headers: engineHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ branch: "feature/auth", id: "x", url: "javascript:alert(1)" }),
      })
      expect(bad.status).toBe(400)
    } finally {
      await removeRepo(dir)
    }
  })

  test("an agent's branch plan shows on the graph, is discussed and approved, and ticks as it runs", async ({
    page,
  }) => {
    test.setTimeout(150_000)
    const dir = makeRepo("pg-branch-plan-")
    write(dir, "session.ts", session("30_000"))
    commit(dir, "release 1.4")
    git(dir, "tag", "v1.4")
    git(dir, "checkout", "-q", "-b", "feature/auth")
    write(dir, "session.ts", session("readTimeout(config)"))
    commit(dir, "auth: login form and session")
    write(dir, "token.ts", "export const refresh = () => 1\n")
    commit(dir, "auth: refresh tokens")
    git(dir, "checkout", "-q", "main")
    write(dir, "session.ts", session("45_000"))
    commit(dir, "fix: session timeout too short")
    write(dir, "NOTES.md", "1.4.1\n")
    commit(dir, "docs: release notes")
    let boardPath: string | null = null
    let db: Db | null = null
    try {
      const { id: repoId } = await api<{ id: string }>("/repos/open", {
        method: "POST",
        body: JSON.stringify({ path: dir }),
      })
      const status = await api<{ path: string }>(`/repos/${repoId}/board/status`)
      test.skip(!resolve(status.path).toLowerCase().startsWith(resolve(tmpdir()).toLowerCase()), "not a test board")
      boardPath = status.path
      mkdirSync(dirname(boardPath), { recursive: true })
      const { DatabaseSync } = await sqlite()
      db = new DatabaseSync(boardPath)
      db.exec(SCHEMA)

      // The preview checks the steps without opening anything.
      const preview = await api<{ steps: { n: number; result: string; conflicts?: { path: string }[] }[] }>(
        `/repos/${repoId}/branch-plans/preview`,
        { method: "POST", body: JSON.stringify({ steps: STEPS }) },
      )
      // Merging into a branch the other side already contains cannot conflict.
      expect(preview.steps.map((s) => s.result)).toEqual(["conflict", "ok", "unknown", "ok", "ok", "ok"])
      expect(preview.steps[0].conflicts?.map((c) => c.path)).toEqual(["session.ts"])

      await page.goto(`/?repo=${repoId}`)
      await expect(page.getByTestId("status-branch")).toHaveText("main", { timeout: 30_000 })
      const plan = await api<{ id: string }>(`/repos/${repoId}/branch-plans`, {
        method: "POST",
        body: JSON.stringify({
          mode: "wait",
          title: "Rebase auth, stack billing, merge both",
          why: "Auth is behind main and billing needs its token refresh.",
          agent: "auth-fix",
          steps: STEPS,
          explanations: [{ step: 1, body: "I keep main's 45 s and read the override after it." }],
        }),
      })

      await page.getByTestId("agent-reviews-button").click()
      // The inbox lists every repository's reviews: this repository's row.
      const row = page
        .getByTestId("agent-review-row")
        .filter({ hasText: "Rebase auth, stack billing" })
        .filter({ hasText: basename(dir) })
      await expect(row).toContainText("Branch plan")
      await row.click()

      // The plan on the graph: steps with their checks, the scrubber, the rows.
      const screen = page.getByTestId("plan-screen")
      await expect(screen).toBeVisible({ timeout: 15_000 })
      const steps = page.getByTestId("plan-step")
      await expect(steps).toHaveCount(6)
      await expect(steps.nth(0)).toHaveAttribute("data-result", "conflict")
      await expect(steps.nth(1)).toHaveAttribute("data-result", "ok")
      await page.locator('[data-testid="plan-scrub"][data-at="0"]').click()
      await expect(page.locator('[data-testid="plan-row"]:not([data-kind="exists"])')).toHaveCount(0)
      // From the branches' common base: release 1.4, two on main, two on auth.
      await expect(page.locator('[data-testid="plan-row"][data-kind="exists"]')).toHaveCount(5)
      await page.locator('[data-testid="plan-scrub"][data-at="6"]').click()
      await expect(page.locator('[data-testid="plan-row"][data-kind="planned"]')).toHaveCount(3)
      await expect(page.locator('[data-testid="plan-row"][data-kind="merge"]')).toHaveCount(2)
      await expect(page.locator('[data-testid="plan-row"][data-kind="ghost"]')).toHaveCount(2)

      // Step 1: the conflict, the agent's explanation, the owner's comment.
      await steps.nth(0).click()
      const detail = page.getByTestId("plan-detail")
      await expect(detail.getByTestId("plan-conflict-file")).toHaveText(["session.ts"])
      await expect(detail).toContainText("I keep main's 45 s")
      await detail.getByTestId("plan-comment-text").fill("Squash the login commit while you are at it.")
      await detail.getByTestId("plan-comment-send").click()
      await expect(detail).toContainText("Squash the login commit while you are at it.")
      await expect(page.getByTestId("board-post").filter({ hasText: "Squash the login commit" })).toHaveAttribute(
        "data-author",
        "human",
      )

      // Main moves: the plan says so and is checked again.
      write(dir, "NOTES.md", "1.4.1\n1.4.2\n")
      commit(dir, "docs: more notes")
      await expect(page.getByTestId("plan-stale")).toBeVisible({ timeout: 15_000 })
      await page.getByTestId("plan-recheck").click()
      await expect(page.getByTestId("plan-stale")).toHaveCount(0)
      await expect(steps.nth(0)).toHaveAttribute("data-result", "conflict")

      // Approved: the agent runs the steps, PowerGit ticks them as the refs move.
      await page.getByTestId("plan-approve").click()
      await expect(page.getByTestId("plan-progress")).toContainText("0 of 6")
      git(dir, "rebase", "-q", "-X", "theirs", "main", "feature/auth")
      git(dir, "branch", "feature/billing", "feature/auth")
      git(dir, "checkout", "-q", "feature/billing")
      write(dir, "plan.ts", "export const plans = []\n")
      commit(dir, "billing: plan model")
      git(dir, "checkout", "-q", "feature/auth")
      git(dir, "merge", "-q", "--no-ff", "-m", "Merge feature/billing", "feature/billing")
      git(dir, "checkout", "-q", "main")
      git(dir, "merge", "-q", "--no-ff", "-m", "Merge feature/auth", "feature/auth")
      git(dir, "tag", "v1.5")
      await expect(page.getByTestId("plan-progress")).toContainText("6 of 6", { timeout: 20_000 })
      await expect(steps.nth(5)).toHaveAttribute("data-done", "true")
      const done = await api<{ status: string }>(`/repos/${repoId}/agent-reviews/${plan.id}`)
      expect(done.status).toBe("approved")
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
