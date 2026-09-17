import { expect, test } from "@playwright/test"
import { PAGE_INSTRUMENTATION } from "../../scripts/perf/metrics.mjs"

// Interaction budgets on the synthetic heavy repo (v0.18.10 perf audit).
// Run via `npm run test:perf`. The page is instrumented from outside
// (scripts/perf/metrics.mjs: long tasks, rAF frames, graph canvas redraws)
// exactly as scripts/perf-audit.mjs does; the budgets are the numbers
// measured on 2026-09-16 (Vite dev build, headless Chromium, this fixture)
// × 1.5, so a regression fails and nothing here implies a fix.
// docs/perf/audit-2026-09-16.md has the measured values.

declare global {
  interface Window {
    __pgPerf: {
      start(): number
      end(): {
        longTasks: number
        longTaskTotalMs: number
        longTaskMaxMs: number
        framesOver32: number
        frameMaxMs: number
        redraws: number
      }
      now(): number
      lastInput(type: string): number | null
      redrawAfter(t0: number, timeoutMs?: number): Promise<number | null>
      waitText(selector: string, text: string, timeoutMs?: number): Promise<number | null>
    }
  }
}

// Measured 2026-09-16 with scripts/perf-audit.mjs on PowerGit / flutter /
// vscode (10k rows loaded, dev build): hover → redraw 32 – 34 ms median,
// click → Commit tab 140 – 221 ms median, a 6 s scroll 0 – 21 long tasks with
// frames up to 109 – 192 ms. Budgets are those × 1.5.
const BUDGET = {
  // The heavy fixture's measured boot allowance is deliberately looser than
  // the vscode target (< 8 s): CI hardware varies, so this is fixture × 1.5.
  bootToTenThousandRowsMs: 12_000,
  hoverToRedrawMedianMs: 50,
  selectToCommitTabMedianMs: 330,
  scrollLongTasks: 16, // per 3 s (vscode: 21 per 6 s)
  scrollFrameMaxMs: 300,
}

// The harness's viewport: the grid body shows ~30 rows above the bottom panel.
test.use({ viewport: { width: 1600, height: 1000 } })

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : Number.NaN
}

async function booted(page: import("@playwright/test").Page) {
  const started = Date.now()
  await page.addInitScript(PAGE_INSTRUMENTATION)
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(() => page.getByTestId("grid-body").evaluate((el) => el.firstElementChild!.scrollHeight), { timeout: 60_000 })
    .toBeGreaterThan(1_000 * 28)
  expect(Date.now() - started, "boot to 10,000 rows").toBeLessThan(BUDGET.bootToTenThousandRowsMs)
  // Steady state: while the eager pages stream in, each append is a
  // 150 – 400 ms long task that would land in the numbers (a backlog item of
  // its own, measured separately by the harness's boot scenario).
  await expect
    .poll(
      async () => {
        const grid = page.getByTestId("grid-body")
        const before = await grid.evaluate((el) => el.firstElementChild!.scrollHeight)
        await new Promise((r) => setTimeout(r, 1000))
        return before === (await grid.evaluate((el) => el.firstElementChild!.scrollHeight))
      },
      { timeout: 90_000, message: "history kept growing for 90 s" },
    )
    .toBe(true)
}

test("hovering rows repaints the graph within budget", async ({ page }) => {
  await booted(page)
  const body = (await page.getByTestId("grid-body").boundingBox())!
  const inBody = (b: { y: number; height: number }) => b.y >= body.y && b.y + b.height <= body.y + body.height
  const boxes = []
  for (const h of await page.getByTestId("grid-row").elementHandles()) {
    const b = await h.boundingBox()
    // Overscan rows sit in the DOM under the bottom panel; a pointer there hovers nothing.
    if (b && inBody(b)) boxes.push(b)
  }
  expect(boxes.length, "rows inside the grid body").toBeGreaterThan(15)
  const latencies: number[] = []
  for (const b of boxes.slice(0, 20)) {
    const t0 = await page.evaluate(() => window.__pgPerf.now())
    await page.mouse.move(b.x + 200, b.y + b.height / 2)
    const t1 = await page.evaluate((t) => window.__pgPerf.redrawAfter(t, 2000), t0)
    if (t1 !== null) latencies.push(t1 - t0)
    await page.waitForTimeout(60)
  }
  expect(latencies.length, "hovers that repainted the canvas").toBeGreaterThan(15)
  test
    .info()
    .annotations.push({ type: "perf", description: `hover → canvas redraw median ${median(latencies).toFixed(0)} ms` })
  expect(median(latencies), `hover → canvas redraw median ${median(latencies).toFixed(0)} ms`).toBeLessThan(
    BUDGET.hoverToRedrawMedianMs,
  )
})

test("selecting rows shows the Commit tab within budget", async ({ page }) => {
  await booted(page)
  const body = (await page.getByTestId("grid-body").boundingBox())!
  const inBody = (b: { y: number; height: number }) => b.y >= body.y && b.y + b.height <= body.y + body.height
  // Click the SHA cell: the message cell may start with a ref chip, and a
  // chip click selects that ref's tip instead of the row.
  const rows: { x: number; y: number; subject: string }[] = []
  for (const h of await page.locator('[data-testid="grid-row"]:not([data-artificial])').elementHandles()) {
    const b = await (await h.$('[data-testid="sha-cell"]'))?.boundingBox()
    const subject = ((await h.$eval(".msg-text", (el) => el.textContent)) ?? "").trim()
    if (b && inBody(b) && subject) rows.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, subject })
  }
  const latencies: number[] = []
  await page.evaluate(() => window.__pgPerf.start()) // inputs are stamped only inside a window
  for (let i = 0; i < 10; i++) {
    const r = rows[(i * 3) % rows.length]
    await page.mouse.click(r.x, r.y)
    const clickAt = await page.evaluate(() => window.__pgPerf.lastInput("click"))
    const shown = await page.evaluate(
      (s) => window.__pgPerf.waitText('[data-testid="commit-info"]', s, 10000),
      r.subject,
    )
    if (clickAt !== null && shown !== null) latencies.push(shown - clickAt)
    await page.waitForTimeout(150)
  }
  expect(latencies.length).toBe(10)
  test
    .info()
    .annotations.push({ type: "perf", description: `click → Commit tab median ${median(latencies).toFixed(0)} ms` })
  expect(median(latencies), `click → Commit tab median ${median(latencies).toFixed(0)} ms`).toBeLessThan(
    BUDGET.selectToCommitTabMedianMs,
  )
})

test("a 3 s wheel scroll keeps long tasks and frame stalls within budget", async ({ page }) => {
  await booted(page)
  const box = (await page.getByTestId("grid-body").boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.evaluate(() => window.__pgPerf.start())
  const t0 = Date.now()
  while (Date.now() - t0 < 3000) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(50)
  }
  const stats = await page.evaluate(() => window.__pgPerf.end())
  test.info().annotations.push({ type: "perf", description: `scroll 3 s: ${JSON.stringify(stats)}` })
  expect(stats.longTasks, `long tasks during scroll: ${JSON.stringify(stats)}`).toBeLessThan(BUDGET.scrollLongTasks)
  expect(stats.frameMaxMs, `longest frame during scroll: ${stats.frameMaxMs} ms`).toBeLessThan(BUDGET.scrollFrameMaxMs)
})
