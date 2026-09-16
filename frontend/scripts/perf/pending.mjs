// Pending-changes scenarios of the perf audit (v0.18.10), run on the tree
// scripts/perf/make-pending.mjs generates: the Working directory row, the
// Diff tab, the commit window, staging, and a live-refresh storm.
import { execFileSync } from "node:child_process"
import { appendFileSync } from "node:fs"
import { join } from "node:path"
import { timeStatus } from "./engine.mjs"
import { median } from "./metrics.mjs"
import { measure } from "./scenarios.mjs"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ROW = '[data-testid="grid-row"]'

/** Records every /status request the page makes: start, end, duration. */
export function trackStatusRequests(page) {
  const seen = []
  page.on("response", (res) => {
    const url = res.url()
    if (!/\/repos\/[^/]+\/status(\?|$)/.test(url)) return
    const t = res.request().timing()
    const start = t.startTime > 0 ? t.startTime : Date.now()
    seen.push({
      start,
      end: Date.now(),
      durationMs: Math.round(t.responseEnd >= 0 ? t.responseEnd : Date.now() - start),
    })
  })
  return {
    between: (from, to) => seen.filter((s) => s.end >= from && s.end <= to),
    all: seen,
  }
}

export async function wdRow(ctx) {
  const { page, uiUrl, repo, manifest } = ctx
  return measure(ctx, "wd-row", async () => {
    const t0 = Date.now()
    await page.goto(`${uiUrl}/?repo=${repo.id}`)
    await page.locator(ROW).first().waitFor({ state: "visible", timeout: 90_000 })
    const firstRowMs = Date.now() - t0
    const wd = page.locator(ROW).filter({ hasText: /Working directory \(/ })
    await wd.first().waitFor({ state: "visible", timeout: 180_000 })
    const text = (await wd.first().locator(".msg-text").textContent()) ?? ""
    const shown = Number((text.match(/\(([\d,\s]+) files?\)/)?.[1] ?? "0").replace(/[^\d]/g, ""))
    return { firstRowMs, wdRowMs: Date.now() - t0, wdCount: shown, expectedUnstaged: manifest.unstagedTotal }
  })
}

export async function diffTab(ctx) {
  const { page } = ctx
  const wd = page
    .locator(ROW)
    .filter({ hasText: /Working directory \(/ })
    .first()
  return measure(ctx, "diff-tab", async () => {
    const t0 = await page.evaluate(() => window.__pgPerf.now())
    await wd.click()
    await page.getByRole("tab", { name: /^Diff/ }).click()
    await page.getByTestId("file-list-row").first().waitFor({ state: "visible", timeout: 120_000 })
    const listAt = await page.evaluate(() => window.__pgPerf.now())
    const rendered = await page.getByTestId("file-list-row").count()
    await page.locator(".diff-row").first().waitFor({ state: "visible", timeout: 120_000 })
    const diffAt = await page.evaluate(() => window.__pgPerf.now())
    return { fileListMs: Math.round(listAt - t0), fileRowsRendered: rendered, firstDiffMs: Math.round(diffAt - t0) }
  })
}

export async function commitWindow(ctx) {
  const { page, manifest } = ctx
  return measure(ctx, "commit-window", async () => {
    const t0 = await page.evaluate(() => window.__pgPerf.now())
    await page.getByTestId("commit-button").click()
    await page.getByTestId("commit-message-input").waitFor({ state: "visible", timeout: 120_000 })
    const openAt = await page.evaluate(() => window.__pgPerf.now())
    const want = manifest.unstagedTotal
    const deadline = Date.now() + 180_000
    let rows = 0
    while (Date.now() < deadline) {
      rows = await page.getByTestId("unstaged-list-row").count()
      if (rows >= want) break
      await sleep(100)
    }
    const listAt = await page.evaluate(() => window.__pgPerf.now())
    const stagedRows = await page.getByTestId("staged-list-row").count()
    return { openMs: Math.round(openAt - t0), listsMs: Math.round(listAt - t0), unstagedRows: rows, stagedRows }
  })
}

export async function stageOne(ctx) {
  const { page } = ctx
  return measure(ctx, "stage-one", async () => {
    const before = await page.getByTestId("staged-list-row").count()
    await page.getByTestId("unstaged-list-row").first().click()
    const t0 = await page.evaluate(() => window.__pgPerf.now())
    await page.getByTestId("stage-selected").click()
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline && (await page.getByTestId("staged-list-row").count()) <= before) await sleep(50)
    const t1 = await page.evaluate(() => window.__pgPerf.now())
    return { stageOneMs: Math.round(t1 - t0) }
  })
}

export async function stageAll(ctx) {
  const { page } = ctx
  return measure(ctx, "stage-all", async () => {
    const t0 = await page.evaluate(() => window.__pgPerf.now())
    await page.getByTestId("stage-all").click()
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline && (await page.getByTestId("unstaged-list-row").count()) > 0) await sleep(100)
    const t1 = await page.evaluate(() => window.__pgPerf.now())
    const staged = await page.getByTestId("staged-list-row").count()
    return { stageAllMs: Math.round(t1 - t0), stagedRowsAfter: staged }
  })
}

/**
 * The live-refresh storm, with the commit window open: 200 tracked files
 * get a byte appended over 2 s (what an editor or a build does; git's
 * watcher sees nothing until the index changes) and, in the same 2 s, 20
 * `git update-index` calls touch .git/index (what an agent running git
 * does; each write is an /events message). Then wait until no /status
 * request has completed for 2 s.
 */
export async function storm(ctx) {
  const { manifest, statusRequests } = ctx
  const root = manifest.root
  const rel = (i) => join(`d${i % 23}`, `s${i % 7}`, `g${Math.floor(i / 161) % 11}`, `f${i}.txt`)
  return measure(ctx, "storm", async () => {
    const t0 = Date.now()
    for (let step = 0; step < 20; step++) {
      for (let j = 0; j < 10; j++) appendFileSync(join(root, rel(step * 10 + j)), "x")
      execFileSync("git", ["update-index", "--add", "--", rel(step * 10).replace(/\\/g, "/")], {
        cwd: root,
        stdio: "ignore",
      })
      await sleep(100)
    }
    const stormEnd = Date.now()
    let lastSeen = stormEnd
    let quietAt = null
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const recent = statusRequests.between(t0, Date.now())
      const last = recent.reduce((n, s) => Math.max(n, s.end), t0)
      if (last > lastSeen) lastSeen = last
      if (Date.now() - lastSeen >= 2000) {
        quietAt = lastSeen
        break
      }
      await sleep(100)
    }
    const inWindow = statusRequests.between(t0, Date.now())
    const durations = inWindow.map((s) => s.durationMs)
    // Requests in flight at once: the maximum overlap of [start, end].
    let maxInFlight = 0
    for (const s of inWindow) {
      const overlapping = inWindow.filter((o) => o.start <= s.start && o.end >= s.start).length
      maxInFlight = Math.max(maxInFlight, overlapping)
    }
    return {
      stormMs: stormEnd - t0,
      statusResponses: inWindow.length,
      statusMedianMs: median(durations),
      statusMaxInFlight: maxInFlight,
      quietAfterMs: quietAt === null ? null : quietAt - t0,
      quietTimedOut: quietAt === null,
    }
  })
}

/** GET /status ×5 straight from node, and the git calls the engine ran for them. */
export async function statusDirect(ctx) {
  const { engineUrl, token, repo } = ctx
  return measure(ctx, "status-direct", async () => {
    const r = await timeStatus(engineUrl, token, repo.id, 5)
    return { statusMs: r.samples, statusMedianMs: median(r.samples), unstaged: r.unstaged, staged: r.staged }
  })
}

export const PENDING_SCENARIOS = {
  "wd-row": wdRow,
  "status-direct": statusDirect,
  "diff-tab": diffTab,
  "commit-window": commitWindow,
  "stage-one": stageOne,
  storm,
  "stage-all": stageAll,
}
