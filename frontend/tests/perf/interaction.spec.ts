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

const BUDGET = {
  hoverToRedrawMedianMs: 60, // measured 31-40 ms
  selectToCommitTabMedianMs: 400, // measured 150-260 ms
  scrollLongTasks: 30, // measured 10-20 over 3 s while pages stream in
  scrollFrameMaxMs: 600, // measured 300-400 ms (a page append)
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : Number.NaN
}

async function booted(page: import("@playwright/test").Page) {
  await page.addInitScript(PAGE_INSTRUMENTATION)
  await page.goto("/")
  await expect(page.getByTestId("grid-row").first()).toBeVisible({ timeout: 30_000 })
  await expect
    .poll(() => page.getByTestId("grid-body").evaluate((el) => el.firstElementChild!.scrollHeight), { timeout: 60_000 })
    .toBeGreaterThan(1_000 * 28)
}

test("hovering rows repaints the graph within budget", async ({ page }) => {
  await booted(page)
  const view = page.viewportSize()!
  const boxes = []
  for (const h of await page.getByTestId("grid-row").elementHandles()) {
    const b = await h.boundingBox()
    if (b && b.y >= 0 && b.y + b.height <= view.height) boxes.push(b)
  }
  expect(boxes.length).toBeGreaterThan(10)
  const latencies: number[] = []
  for (const b of boxes.slice(0, 20)) {
    const t0 = await page.evaluate(() => window.__pgPerf.now())
    await page.mouse.move(b.x + 200, b.y + b.height / 2)
    const t1 = await page.evaluate((t) => window.__pgPerf.redrawAfter(t, 2000), t0)
    if (t1 !== null) latencies.push(t1 - t0)
    await page.waitForTimeout(60)
  }
  expect(latencies.length, "hovers that repainted the canvas").toBeGreaterThan(15)
  expect(median(latencies), `hover → canvas redraw median ${median(latencies).toFixed(0)} ms`).toBeLessThan(
    BUDGET.hoverToRedrawMedianMs,
  )
})

test("selecting rows shows the Commit tab within budget", async ({ page }) => {
  await booted(page)
  const view = page.viewportSize()!
  const rows: { x: number; y: number; subject: string }[] = []
  for (const h of await page.locator('[data-testid="grid-row"]:not([data-artificial])').elementHandles()) {
    const b = await h.boundingBox()
    const subject = ((await h.$eval(".msg-text", (el) => el.textContent)) ?? "").trim()
    if (b && b.y >= 0 && b.y + b.height <= view.height && subject)
      rows.push({ x: b.x + 240, y: b.y + b.height / 2, subject })
  }
  const latencies: number[] = []
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
  expect(stats.longTasks, `long tasks during scroll: ${JSON.stringify(stats)}`).toBeLessThan(BUDGET.scrollLongTasks)
  expect(stats.frameMaxMs, `longest frame during scroll: ${stats.frameMaxMs} ms`).toBeLessThan(BUDGET.scrollFrameMaxMs)
})
