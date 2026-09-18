// Graph scenarios of the perf audit (v0.18.10): what the user does on the
// revision grid, measured from inside the page (metrics.mjs) with the engine's
// git command log cut to the same window (engine.mjs).
import { summarizeGitCalls } from "./engine.mjs"
import { cdpMetrics, heapAfterGc, median, metricsDelta, percentile, startProfile, stopProfile } from "./metrics.mjs"

const ROW = '[data-testid="grid-row"]'
const REAL_ROW = `${ROW}:not([data-artificial])`

/** Runs fn inside a measurement window; returns its result with the page,
 *  CDP, git-log and (optionally) profiler numbers attached. */
export async function measure(ctx, name, fn, { profile = false } = {}) {
  const { page, cdp, gitlog, log } = ctx
  log(`  ${name}…`)
  const before = await cdpMetrics(cdp)
  const wallStart = Date.now()
  await page.evaluate(() => window.__pgPerf.start())
  if (profile) await startProfile(cdp)
  let result
  try {
    result = await fn()
  } catch (e) {
    result = { error: String(e?.message ?? e) }
    log(`    failed: ${result.error}`)
  }
  const prof = profile ? await stopProfile(cdp) : undefined
  const pageStats = await page.evaluate(() => window.__pgPerf.end())
  const wallEnd = Date.now()
  const after = await cdpMetrics(cdp)
  const calls = gitlog.between(wallStart, wallEnd)
  const heap = await heapAfterGc(cdp)
  return {
    name,
    ...result,
    page: pageStats,
    cdp: metricsDelta(before, after),
    heapAfterGcMB: heap.usedMB,
    git: {
      calls: calls.length,
      totalMs: calls.reduce((n, e) => n + e.durationMs, 0),
      byCommand: summarizeGitCalls(calls),
    },
    profile: prof,
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Rows whose box lies inside the grid body: the virtualizer keeps 12
 *  overscan rows in the DOM below the body's clipped edge (under the bottom
 *  panel), and a pointer there hovers nothing. */
async function visibleRows(page, selector) {
  const body = await page.getByTestId("grid-body").boundingBox()
  const out = []
  for (const h of await page.locator(selector).elementHandles()) {
    const b = await h.boundingBox()
    if (!b || b.height <= 0 || b.y < body.y || b.y + b.height > body.y + body.height) continue
    const subject = ((await h.$eval(".msg-text", (el) => el.textContent).catch(() => "")) ?? "").trim()
    const sha = await (await h.$('[data-testid="sha-cell"]'))?.boundingBox()
    out.push({ ...b, subject, sha })
  }
  return out
}

export async function boot(ctx) {
  const { page, uiUrl, repo } = ctx
  return measure(ctx, "boot", async () => {
    const t0 = Date.now()
    await page.goto(`${uiUrl}/?repo=${repo.id}`)
    await page.locator(ROW).first().waitFor({ state: "visible", timeout: 90_000 })
    const firstRowMs = Date.now() - t0
    const body = page.getByTestId("grid-body")
    const height = () => body.evaluate((el) => el.firstElementChild?.scrollHeight ?? 0)
    while ((await height()) <= 1000 * 28 && Date.now() - t0 < 120_000) await sleep(50)
    const rows1000Ms = Date.now() - t0
    // Settle: the eager autofill (10k rows or the end of history) and no
    // tail spinner for 2 s.
    let stableSince = Date.now()
    let last = -1
    while (Date.now() - t0 < 180_000) {
      const n = await height()
      const tail = await page.getByTestId("history-tail-loading").count()
      if (n !== last || tail > 0) {
        last = n
        stableSince = Date.now()
      } else if (Date.now() - stableSince > 2000) break
      await sleep(100)
    }
    const rowsLoaded = Math.round(last / 28)
    return { firstRowMs, rows1000Ms, settleMs: stableSince - t0, rowsLoaded }
  })
}

export async function scroll(ctx) {
  const { page } = ctx
  const box = await page.getByTestId("grid-body").boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  return measure(
    ctx,
    "scroll",
    async () => {
      const t0 = Date.now()
      let steps = 0
      while (Date.now() - t0 < 6000) {
        await page.mouse.wheel(0, 400)
        steps += 1
        await sleep(50)
      }
      const rowsNow = await page
        .getByTestId("grid-body")
        .evaluate((el) => Math.round(el.firstElementChild.scrollHeight / 28))
      return { steps, rowsLoadedAfter: rowsNow }
    },
    { profile: true },
  )
}

export async function hover(ctx) {
  const { page } = ctx
  await page.getByTestId("grid-body").evaluate((el) => (el.scrollTop = 0))
  await sleep(300)
  const boxes = await visibleRows(page, ROW)
  const targets = []
  while (targets.length < 40 && boxes.length > 0) targets.push(boxes[targets.length % boxes.length])
  return measure(
    ctx,
    "hover",
    async () => {
      const latencies = []
      let missed = 0
      for (const b of targets) {
        const t0 = await page.evaluate(() => window.__pgPerf.now())
        await page.mouse.move(b.x + Math.min(200, b.width / 3), b.y + b.height / 2)
        const t1 = await page.evaluate((t) => window.__pgPerf.redrawAfter(t, 2000), t0)
        if (t1 === null) missed += 1
        else latencies.push(Math.round(t1 - t0))
        await sleep(60)
      }
      return {
        hovers: targets.length,
        redrawMissed: missed,
        toRedrawMedianMs: median(latencies),
        toRedrawP95Ms: percentile(latencies, 95),
      }
    },
    { profile: true },
  )
}

export async function select(ctx) {
  const { page } = ctx
  await page.getByTestId("grid-body").evaluate((el) => (el.scrollTop = 0))
  await sleep(300)
  const rows = []
  for (const b of await visibleRows(page, REAL_ROW)) if (b.subject) rows.push({ b, subject: b.subject })
  const picks = []
  for (let i = 0; i < 20 && rows.length > 0; i++) picks.push(rows[(i * 3) % rows.length])
  return measure(
    ctx,
    "select",
    async () => {
      const commitTab = []
      const highlight = []
      for (const { b, subject } of picks) {
        // The SHA cell, never a ref chip (a chip click selects that ref's tip).
        const c = b.sha ?? b
        await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2)
        const clickAt = await page.evaluate(() => window.__pgPerf.lastInput("click"))
        const [hl, ct] = await Promise.all([
          page.evaluate((s) => window.__pgPerf.waitText(".grid-row.selected .msg-text", s, 10000), subject),
          page.evaluate((s) => window.__pgPerf.waitText('[data-testid="commit-info"]', s, 10000), subject),
        ])
        if (hl !== null && clickAt !== null) highlight.push(Math.round(hl - clickAt))
        if (ct !== null && clickAt !== null) commitTab.push(Math.round(ct - clickAt))
        await sleep(150)
      }
      return {
        selections: picks.length,
        highlightMedianMs: median(highlight),
        highlightP95Ms: percentile(highlight, 95),
        commitTabMedianMs: median(commitTab),
        commitTabP95Ms: percentile(commitTab, 95),
        commitTabMaxMs: commitTab.length ? Math.max(...commitTab) : null,
      }
    },
    { profile: true },
  )
}

export async function expand(ctx) {
  const { page } = ctx
  const body = page.getByTestId("grid-body")
  await body.evaluate((el) => (el.scrollTop = 0))
  const more = page.getByTestId("ref-more").first()
  for (let i = 0; i < 400 && (await more.count()) === 0; i++) {
    const atEnd = await body.evaluate((el) => {
      el.scrollTop += el.clientHeight
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 1
    })
    await sleep(80)
    if (atEnd) break
  }
  if ((await more.count()) === 0) {
    ctx.log("  expand: no +n chip in the loaded history")
    return { name: "expand", skipped: "no +n chip found" }
  }
  await more.scrollIntoViewIfNeeded()
  return measure(ctx, "expand", async () => {
    const t0 = await page.evaluate(() => window.__pgPerf.now())
    await more.click()
    await page.getByTestId("ref-fold").waitFor({ state: "visible", timeout: 10_000 })
    const settled = await page.evaluate(() => window.__pgPerf.redrawSettle(300, 5000))
    const t1 = await page.evaluate(() => window.__pgPerf.now())
    const expandMs = Math.round(Math.max(settled, 0) > t0 ? settled - t0 : t1 - t0)
    const t2 = await page.evaluate(() => window.__pgPerf.now())
    await page.getByTestId("ref-fold").click()
    await page.getByTestId("ref-fold").waitFor({ state: "detached", timeout: 10_000 })
    const settled2 = await page.evaluate(() => window.__pgPerf.redrawSettle(300, 5000))
    const t3 = await page.evaluate(() => window.__pgPerf.now())
    return { expandMs, foldMs: Math.round(settled2 > t2 ? settled2 - t2 : t3 - t2) }
  })
}

export async function ancestry(ctx) {
  const { page } = ctx
  await page.getByTestId("grid-body").evaluate((el) => (el.scrollTop = 0))
  await sleep(200)
  const row = page.locator(REAL_ROW).nth(3)
  await row.click()
  await sleep(300)
  return measure(ctx, "ancestry", async () => {
    const t0 = await page.evaluate(() => window.__pgPerf.now())
    await page.keyboard.press("Control+Shift+B")
    await page.getByTestId("graph-ancestry-root").waitFor({ state: "visible", timeout: 30_000 })
    const shown = await page.evaluate(() => window.__pgPerf.now())
    const settled = await page.evaluate(() => window.__pgPerf.redrawSettle(300, 20000))
    const onMs = Math.round(Math.max(shown, settled) - t0)
    await sleep(200)
    const t1 = await page.evaluate(() => window.__pgPerf.now())
    await page.getByTestId("graph-ancestry-exit").click()
    await page.getByTestId("graph-ancestry-root").waitFor({ state: "detached", timeout: 30_000 })
    const gone = await page.evaluate(() => window.__pgPerf.now())
    const settled2 = await page.evaluate(() => window.__pgPerf.redrawSettle(300, 20000))
    return { onMs, offMs: Math.round(Math.max(gone, settled2) - t1) }
  })
}

export async function filter(ctx) {
  const { page } = ctx
  const mode = page.getByTestId("tree-filter-mode")
  if ((await mode.count()) === 0) return { name: "filter", skipped: "no tree-filter-mode button" }
  await mode.click()
  await page.getByTestId("tree-filter-strip").waitFor({ state: "visible", timeout: 10_000 })
  await page.evaluate(() => window.__pgPerf.rowsStable(500, 30000))
  const stable = () => page.evaluate(() => window.__pgPerf.rowsStable(500, 120000))
  const now = () => page.evaluate(() => window.__pgPerf.now())
  const result = await measure(ctx, "filter", async () => {
    // Five ticks 100 ms apart (each one is a reset + reload), then the time
    // from the last tick to the first rows back and to a settled grid (the
    // eager autofill included); then Show all = every ref on the request.
    const boxes = page.locator('[data-testid="tree-check"]:not(:checked):not(:disabled)')
    let t0 = 0
    for (let i = 0; i < 5; i++) {
      t0 = await now()
      await boxes.first().click()
      if (i < 4) await sleep(100)
    }
    const reload = page.evaluate(() => window.__pgPerf.rowsReload(60000))
    const s1 = await stable()
    const r1 = await reload
    const ticked = await page
      .getByTestId("tree-filter-count")
      .textContent()
      .catch(() => null)
    const t1 = await now()
    await page.getByTestId("tree-filter-all").click()
    const reload2 = page.evaluate(() => window.__pgPerf.rowsReload(60000))
    const s2 = await stable()
    const r2 = await reload2
    const count = await page
      .getByTestId("tree-filter-count")
      .textContent()
      .catch(() => null)
    return {
      tick5FirstRowsMs: r1 === null ? null : Math.round(r1 - t0),
      tick5StableMs: Math.round(s1.at - t0),
      loadedAfter5: s1.loaded,
      refsAfter5: ticked?.trim() ?? null,
      showAllFirstRowsMs: r2 === null ? null : Math.round(r2 - t1),
      showAllStableMs: Math.round(s2.at - t1),
      loadedAfterAll: s2.loaded,
      showAllEmptyGrid: s2.empty,
      refs: count?.trim() ?? null,
    }
  })
  await page
    .getByTestId("tree-filter-exit")
    .click()
    .catch(() => undefined)
  await stable()
  return result
}

export async function refresh(ctx) {
  const { page } = ctx
  await page.getByTestId("grid-body").focus()
  return measure(ctx, "refresh", async () => {
    const t0 = await page.evaluate(() => window.__pgPerf.now())
    await page.keyboard.press("F5")
    await page
      .getByTestId("status-refreshing")
      .waitFor({ state: "visible", timeout: 3000 })
      .catch(() => undefined)
    await page.getByTestId("status-refreshing").waitFor({ state: "detached", timeout: 120_000 })
    const s = await page.evaluate(() => window.__pgPerf.rowsStable(500, 120000))
    return { refreshMs: Math.round(s.at - t0), loadedRows: s.loaded }
  })
}

export const GRAPH_SCENARIOS = { boot, scroll, hover, select, expand, ancestry, filter, refresh }
