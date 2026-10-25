// Captures the agent showcase screenshots into website/public/assets: an
// agent review in progress, a Markdown file reviewed in its preview, a branch
// plan with a predicted conflict, light and dark.
//
// Everything is real: a sample repository is built with git, the reviews and
// the plan are opened through the engine's own routes (the ones the MCP
// tools call), the board is a private PowerChannel file, and the owner's
// side is clicked in the app. Run it against a private engine so nothing
// reaches your own inbox or recent repositories:
//
//   pwsh frontend/scripts/e2e-harness.ps1 -Root <repo> -Name showcase -UiPort 1446 -EnginePort 7746
//   $env:SHOWCASE_PORT='1446'; $env:VITE_ENGINE_URL='http://127.0.0.1:7746'
//   $env:POWERCHANNEL_DB="$env:TEMP\pg-harness-showcase\data\board.db"
//   node frontend/scripts/capture-agents.mjs
import { chromium } from "playwright"
import { execFileSync, spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { readOrCreateToken } from "./engine-token.mjs"

const root = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")
const assets = `${root}/website/public/assets`
const port = Number(process.env.SHOWCASE_PORT ?? 1446)
const engine = process.env.VITE_ENGINE_URL ?? "http://127.0.0.1:7746"
const boardDb = process.env.POWERCHANNEL_DB
if (!boardDb) throw new Error("set POWERCHANNEL_DB to the private engine's board.db")
const token = readOrCreateToken()
mkdirSync(assets, { recursive: true })

async function api(path, body) {
  const res = await fetch(`${engine}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${path}: http ${res.status} ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ---- The board: a private PowerChannel file ----
const { DatabaseSync } = await import("node:sqlite")
mkdirSync(dirname(boardDb), { recursive: true })
const board = new DatabaseSync(boardDb)
board.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, author TEXT NOT NULL, text TEXT NOT NULL, created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS seen (reader TEXT NOT NULL, channel TEXT NOT NULL, last_id INTEGER NOT NULL, updated REAL NOT NULL, PRIMARY KEY (reader, channel));
`)
const post = (channel, author, text) =>
  board.prepare("INSERT INTO messages (channel, author, text, created) VALUES (?, ?, ?, ?)").run(channel, author, text, Date.now() / 1000)
const reading = (channel, reader) => {
  const last = board.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE channel = ?").get(channel).id
  board
    .prepare("INSERT OR REPLACE INTO seen (reader, channel, last_id, updated) VALUES (?, ?, ?, ?)")
    .run(reader, channel, last, Date.now() / 1000)
}

// ---- The sample repository: a small invoicing service ----
const dir = join(mkdtempSync(join(tmpdir(), "pg-showcase-")), "invoicing")
mkdirSync(dir)
let clock = Date.parse("2026-10-12T09:14:00Z")
const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" })
const write = (file, text) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true })
  writeFileSync(join(dir, file), text)
}
function commit(message, who = "Maya Chen <maya@example.com>", hours = 5) {
  clock += hours * 3600_000
  const date = new Date(clock).toISOString()
  const [name, email] = who.match(/^(.*) <(.*)>$/).slice(1)
  git("add", "-A")
  execFileSync("git", ["commit", "-q", "-m", message], {
    cwd: dir,
    env: { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
}
const TOM = "Tom Ellis <tom@example.com>"
const RIYA = "Riya Patel <riya@example.com>"

git("init", "-q", "-b", "main")
git("config", "core.autocrlf", "false")
const session = (timeout) => `export const SESSION = {\n  cookie: "inv_session",\n  timeout: ${timeout},\n  sameSite: "lax",\n}\n`
const client = `import { SESSION } from "./session"

export type Request = { path: string; body?: unknown }

export async function call<T>(req: Request): Promise<T> {
  const res = await fetch(\`/api\${req.path}\`, {
    method: req.body ? "POST" : "GET",
    body: req.body ? JSON.stringify(req.body) : undefined,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  })
  if (!res.ok) throw new Error(\`\${req.path}: \${res.status}\`)
  return (await res.json()) as T
}

export const sessionCookie = SESSION.cookie
`
write("package.json", `{\n  "name": "invoicing",\n  "version": "1.3.0",\n  "type": "module"\n}\n`)
write("README.md", "# Invoicing\n\nIssue, send and collect invoices.\n")
write("src/session.ts", session("30_000"))
write("src/api/client.ts", client)
commit("init: invoicing service skeleton")
write("src/invoice.ts", `export type Line = { label: string; qty: number; unit: number }\n\nexport type Invoice = { id: string; customer: string; lines: Line[] }\n\nexport const total = (inv: Invoice) => inv.lines.reduce((s, l) => s + l.qty * l.unit, 0)\n`)
commit("invoice: model and totals", TOM)
// Months of ordinary work: features that overlap and merge back.
const on = (branch) => git("checkout", "-q", branch)
const work = (branch, file, message, who, hours = 4) => {
  on(branch)
  write(file, `// ${message}\nexport const value = ${JSON.stringify(message)}\n`)
  commit(message, who, hours)
}
const merge = (branch, who = "Maya Chen <maya@example.com>") => {
  on("main")
  clock += 2 * 3600_000
  const date = new Date(clock).toISOString()
  const [name, email] = who.match(/^(.*) <(.*)>$/).slice(1)
  execFileSync("git", ["merge", "-q", "--no-ff", "-m", `Merge branch '${branch}'`, branch], {
    cwd: dir,
    env: { ...process.env, GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
  git("branch", "-q", "-d", branch)
}
git("branch", "feature/customers")
git("branch", "feature/pdf")
work("feature/customers", "src/customers.ts", "customers: model and search", RIYA)
work("feature/pdf", "src/pdf/render.ts", "pdf: render an invoice", TOM)
work("main", "src/config.ts", "config: read from the environment", "Maya Chen <maya@example.com>", 3)
work("feature/customers", "src/api/customers.ts", "api: customers endpoints", RIYA)
work("feature/pdf", "src/pdf/fonts.ts", "pdf: embed fonts", TOM)
merge("feature/customers")
git("branch", "feature/taxes")
work("feature/taxes", "src/taxes.ts", "taxes: VAT by country", RIYA, 6)
work("feature/pdf", "src/pdf/layout.ts", "pdf: page layout and footer", TOM)
work("main", "src/log.ts", "log: structured request logs", "Maya Chen <maya@example.com>")
merge("feature/pdf", TOM)
work("feature/taxes", "src/taxes.test.ts", "taxes: tests for reduced rates", RIYA)
git("branch", "feature/currency")
work("feature/currency", "src/currency.ts", "currency: format amounts per locale", TOM, 5)
merge("feature/taxes", RIYA)
work("feature/currency", "src/currency.test.ts", "currency: rounding tests", TOM)
merge("feature/currency")
write("src/api/invoices.ts", `import { call } from "./client"\nimport type { Invoice } from "../invoice"\n\nexport const listInvoices = () => call<Invoice[]>({ path: "/invoices" })\n`)
commit("api: list invoices")
git("tag", "v1.2")
write("src/invoice.ts", `export type Line = { label: string; qty: number; unit: number }\n\nexport type Invoice = { id: string; customer: string; lines: Line[] }\n\nexport const total = (inv: Invoice) =>\n  Math.round(inv.lines.reduce((s, l) => s + l.qty * l.unit, 0) * 100) / 100\n`)
commit("fix: round totals to the cent", RIYA)

// feature/auth: a longer session, a login route.
git("checkout", "-q", "-b", "feature/auth")
write("src/session.ts", session("readTimeout(config)"))
commit("auth: session timeout from config", TOM, 3)
write("src/api/login.ts", `import { call } from "./client"\n\nexport const login = (email: string, password: string) =>\n  call<{ ok: boolean }>({ path: "/login", body: { email, password } })\n`)
commit("auth: login route", TOM, 2)
git("checkout", "-q", "main")
write("src/session.ts", session("45_000"))
commit("fix: session timeout too short", RIYA)
write("README.md", "# Invoicing\n\nIssue, send and collect invoices.\n\nRun `npm start`, then open http://localhost:3000.\n")
commit("docs: how to run it")
git("tag", "v1.3")

// feature/reminders: Riya's branch, behind main.
git("checkout", "-q", "-b", "feature/reminders", "v1.2")
write("src/reminders.ts", `import type { Invoice } from "./invoice"\n\nexport const overdue = (inv: Invoice, due: Date) => Date.now() > due.getTime()\n`)
commit("reminders: overdue check", RIYA, 4)
git("checkout", "-q", "main")

// The agent's work: retries in the API client, and a doc for them. Left in
// the working tree, as an agent hands it over for review.
git("checkout", "-q", "-b", "agent/retry-api")
write(
  "src/api/client.ts",
  client
    .replace(
      `export async function call<T>(req: Request): Promise<T> {
  const res = await fetch(`,
      `const RETRIES = 3
const BACKOFF_MS = 250

/** Transient failures: the gateway timed out or the service is restarting. */
const retryable = (status: number) => status === 502 || status === 503 || status === 504

export async function call<T>(req: Request, attempt = 0): Promise<T> {
  const res = await fetch(`,
    )
    .replace(
      "  if (!res.ok) throw new Error(`${req.path}: ${res.status}`)",
      `  if (retryable(res.status) && attempt < RETRIES) {
    await new Promise((r) => setTimeout(r, BACKOFF_MS * 2 ** attempt))
    return call<T>(req, attempt + 1)
  }
  if (!res.ok) throw new Error(\`\${req.path}: \${res.status}\`)`,
    ),
)
write(
  "docs/retries.md",
  `# Retries

The API client retries a request when the gateway answers **502**, **503** or **504**.
Every other error reaches the caller at once.

## Backoff

| Attempt | Waits  |
| ------- | ------ |
| 1       | 250 ms |
| 2       | 500 ms |
| 3       | 1 s    |

After the third retry the error is thrown as before.

## What is not retried

- \`POST /payments\`: a payment must never be sent twice.
- Any 4xx answer: the request itself is wrong.
`,
)

// ---- Vite on the harness port, the engine on its own ----
const vite = spawn("npx", ["--no-install", "vite", "--port", String(port), "--strictPort"], {
  cwd: `${root}/frontend`,
  shell: true,
  stdio: "ignore",
  env: { ...process.env, VITE_ENGINE_URL: engine },
})
try {
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    up = await fetch(`http://127.0.0.1:${port}`).then(() => true, () => false)
  }
  if (!up) throw new Error("vite did not start")

  const { id: repo } = await api("/repos/open", { path: dir })

  // A review the agent opened, with its explanation on the retry loop.
  const review = await api(`/repos/${repo}/agent-reviews`, {
    mode: "wait",
    title: "Retry transient gateway errors in the API client",
    why: "Checkout fails about once a day when the gateway restarts. The client now retries **502 / 503 / 504** three times with backoff; payments are never retried.",
    agent: "claude",
    worktree: true,
    files: [
      { path: "src/api/client.ts", status: "M" },
      { path: "docs/retries.md", status: "A" },
    ],
    explanations: [
      { path: "src/api/client.ts", line: "+9", body: "Only gateway errors: a **500** is our bug and should surface, not be hidden by a retry." },
    ],
  })
  const channel = review.board
  if (!channel) throw new Error("the review has no board: is POWERCHANNEL_DB the engine's?")
  // A second agent reviews beside the owner.
  await api(`/repos/${repo}/agent-reviews/${review.id}/reviewer-comments`, {
    reviewer: "codex",
    path: "src/api/client.ts",
    line: "+20",
    body: "Recursion is fine at 3 attempts, but `POST /payments` goes through `call` too. Is it excluded?",
  })
  post(channel, "claude", "Reading the board. I will answer questions here while you review.")
  reading(channel, "claude")
  reading(channel, "codex")

  // A branch plan: rebase auth, stack the billing work, a PR on Bitbucket.
  const plan = await api(`/repos/${repo}/branch-plans`, {
    mode: "wait",
    title: "Land auth and reminders for 1.4",
    why: "Auth is reviewed. Rebase it on main, merge it, then bring reminders up to date and open its PR.",
    agent: "claude",
    steps: [
      { op: "rebase", branch: "feature/auth", onto: "main" },
      { op: "merge", from: "feature/auth", into: "main", mode: "no-ff" },
      { op: "rebase", branch: "feature/reminders", onto: "main" },
      { op: "commit", on: "feature/reminders", subject: "reminders: email the customer", files: ["src/reminders.ts"] },
      { op: "pr", from: "feature/reminders", into: "main", title: "Payment reminders" },
      { op: "tag", name: "v1.4", at: "main" },
    ],
    prs: [
      {
        branch: "feature/auth",
        id: "PR-41",
        title: "Login and configurable sessions",
        url: "https://bitbucket.example.com/projects/INV/repos/invoicing/pull-requests/41",
        state: "approved",
        into: "main",
      },
    ],
    explanations: [{ step: 1, body: "Main changed the same timeout in *fix: session timeout too short*. Keep `readTimeout(config)` with 45 s as its default." }],
  })

  if (plan.board) reading(plan.board, "claude")

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
  await page.addInitScript(() => {
    localStorage.setItem("pg.theme", "light")
    localStorage.setItem("pg.zoom", "1")
    localStorage.setItem("pg.bar", "rail")
    localStorage.setItem("pg.rail", "expanded")
    localStorage.removeItem("pg.reviewDiff")
  })
  const shot = (name) => page.screenshot({ path: `${assets}/${name}` })
  await page.goto(`http://127.0.0.1:${port}/?repo=${repo}`)
  await page.waitForSelector('[data-testid="grid-row"]', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.getByTestId("grid-row").filter({ hasText: "Merge branch 'feature/pdf'" }).first().click()
  await page.waitForTimeout(800)
  await shot("sample-browse.png")

  // The Diff tab of that merge, as a directory tree.
  await page.getByRole("tab", { name: /Diff/ }).click()
  await page.waitForTimeout(900)
  await shot("sample-diff.png")
  await page.getByRole("tab", { name: "Commit" }).click()

  // The commit window on the agent's change.
  await page.getByTestId("commit-button").click()
  await page.waitForSelector('[data-testid="commit-overlay"]')
  await page.getByTestId("commit-overlay").getByText("client.ts").first().click()
  await page.waitForTimeout(900)
  await shot("sample-commit.png")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)

  await page.getByTestId("agent-reviews-button").click()
  await page.waitForSelector('[data-testid="agent-review-row"]')

  // 1. The review: accept the first change, ask the agent a question, it answers on the board.
  await page.getByTestId("agent-review-row").filter({ hasText: "Retry transient" }).first().click()
  await page.waitForSelector('[data-testid="round-diff"]')
  await page.waitForTimeout(800)
  const line = page.locator('[data-testid="round-line"][data-key="+19"] td').nth(1)
  await line.click()
  await page.getByTestId("comment-draft").fill("Should the backoff have some jitter, so clients do not retry in step?")
  await page.getByTestId("comment-ask").click()
  await page.waitForTimeout(1500)
  const asked = await api(`/repos/${repo}/agent-reviews/${review.id}`)
  const question = asked.comments.find((c) => c.kind === "ask")
  post(channel, "claude", `${question.id}: Yes. I will add ±20 % jitter in the next round, and a test that pins it with a seeded random.`)
  reading(channel, "claude")
  await page.getByTestId("round-change").first().getByTestId("verdict-accept").click()
  await page.waitForTimeout(3500)
  await shot("agent-review.png")

  // 2. The Markdown file, in its preview, with a comment on the table.
  await page.getByTestId("round-file").filter({ hasText: "retries.md" }).first().click()
  await page.getByTestId("md-view-preview").click()
  const table = page.locator('[data-testid="md-block"]').filter({ has: page.locator("table") })
  await table.hover()
  await table.getByTestId("md-comment").click()
  await page.getByTestId("comment-draft").fill("Say the total worst case too: 1.75 s before the error.")
  await page.getByTestId("comment-add").click()
  await page.locator('[data-testid="md-block"]').first().hover()
  await page.waitForTimeout(600)
  await shot("agent-review-markdown.png")

  // 3. The branch plan, on the step whose rebase stops.
  await page.getByTestId("agent-review-back").click()
  await page.getByTestId("agent-review-row").filter({ hasText: "Land auth" }).first().click()
  await page.waitForSelector('[data-testid="plan-graph"]')
  await page.locator('[data-testid="plan-scrub"][data-at="1"]').click()
  await page.getByTestId("plan-step").first().click()
  await page.waitForTimeout(1200)
  await shot("branch-plan.png")
  await page.locator('[data-testid="plan-scrub"][data-at="6"]').click()
  await page.getByTestId("plan-step").nth(4).click()
  await page.waitForTimeout(1200)
  await shot("branch-plan-end.png")

  // 4. Dark: the plan again, on its last step.
  const dark = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
  await dark.addInitScript(() => {
    localStorage.setItem("pg.theme", "dark")
    localStorage.setItem("pg.zoom", "1")
    localStorage.setItem("pg.bar", "rail")
    localStorage.setItem("pg.rail", "expanded")
  })
  await dark.goto(`http://127.0.0.1:${port}/?repo=${repo}`)
  await dark.waitForSelector('[data-testid="grid-row"]', { timeout: 30000 })
  await dark.getByTestId("grid-row").filter({ hasText: "Merge branch 'feature/pdf'" }).first().click()
  await dark.waitForTimeout(900)
  await dark.screenshot({ path: `${assets}/sample-browse-dark.png` })
  await dark.getByTestId("agent-reviews-button").click()
  await dark.getByTestId("agent-review-row").filter({ hasText: "Land auth" }).first().click()
  await dark.waitForSelector('[data-testid="plan-graph"]')
  await dark.locator('[data-testid="plan-scrub"][data-at="6"]').click()
  await dark.getByTestId("plan-step").nth(4).click()
  await dark.waitForTimeout(1500)
  await dark.screenshot({ path: `${assets}/branch-plan-dark.png` })

  await browser.close()
  console.log(`agent screenshots captured to ${assets}; sample repository at ${dir}`)
} finally {
  vite.kill()
  board.close()
}
