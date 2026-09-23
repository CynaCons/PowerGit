// In-app perf probe (v0.20.6): the graph scenarios of scripts/perf-audit.mjs,
// driven from inside the page so they run in the real webview (WebView2 on
// Windows, WebKitGTK on Linux) where Playwright and CDP cannot reach. Built
// in only when VITE_PERF_PROBE is set (main.tsx); the report goes to the
// sink (scripts/perf/probe-sink.mjs) as JSON. docs/perf/audit-2026-09-23.md.

type Frame = { at: number; delta: number }
type ProbeConfig = { repoId?: string; label: string; runs: number }

const ROW = '[data-testid="grid-row"]'
const REAL_ROW = `${ROW}:not([data-artificial])`
const ROW_PX = 28

const frames: Frame[] = []
const redraws: number[] = []
let recording = false
let lastFrame = 0

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r))
const round = (n: number) => Math.round(n * 10) / 10

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))])
}

/** Frame deltas and graph redraws in [from, to]. "Janky" frames are the ones
 *  that missed at least one vsync of the measured refresh interval. */
function frameStats(from: number, to: number, vsync: number) {
  const fr = frames.filter((f) => f.at >= from && f.at <= to).map((f) => f.delta)
  return {
    ms: Math.round(to - from),
    frames: fr.length,
    fps: round((fr.length * 1000) / Math.max(1, to - from)),
    p50: quantile(fr, 0.5),
    p95: quantile(fr, 0.95),
    p99: quantile(fr, 0.99),
    max: fr.length ? round(Math.max(...fr)) : null,
    janky: fr.filter((d) => d > vsync * 1.5).length,
    over50: fr.filter((d) => d > 50).length,
    over100: fr.filter((d) => d > 100).length,
    redraws: redraws.filter((r) => r >= from && r <= to).length,
  }
}

let instrumented = false

function instrument() {
  if (instrumented) return
  instrumented = true
  const loop = (t: number) => {
    if (recording && lastFrame) frames.push({ at: t, delta: t - lastFrame })
    lastFrame = t
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  // draw.ts drawRows clears first, so one clearRect on the graph canvas is one redraw.
  const proto = CanvasRenderingContext2D.prototype
  const clearRect = proto.clearRect
  proto.clearRect = function (this: CanvasRenderingContext2D, ...args: Parameters<typeof clearRect>) {
    if (this.canvas?.classList?.contains("graph-canvas")) redraws.push(performance.now())
    return clearRect.apply(this, args)
  }
}

function redrawAfter(t0: number, timeoutMs = 500): Promise<number | null> {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeoutMs
    const look = () => {
      const hit = redraws.find((r) => r > t0)
      if (hit !== undefined) return resolve(hit)
      if (performance.now() > deadline) return resolve(null)
      setTimeout(look, 4)
    }
    look()
  })
}

function waitText(selector: string, text: string, timeoutMs = 10000): Promise<number | null> {
  return new Promise((resolve) => {
    const deadline = performance.now() + timeoutMs
    const look = () => {
      if (document.querySelector(selector)?.textContent?.includes(text)) return resolve(performance.now())
      if (performance.now() > deadline) return resolve(null)
      setTimeout(look, 4)
    }
    look()
  })
}

const body = () => document.querySelector<HTMLElement>('[data-testid="grid-body"]')
const loadedRows = () => Math.round((body()?.firstElementChild?.scrollHeight ?? 0) / ROW_PX)

/** Rows fully inside the grid body (the overscan rows below its edge hover nothing). */
function visibleRows(selector: string): HTMLElement[] {
  const box = body()?.getBoundingClientRect()
  if (!box) return []
  return [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => {
    const b = el.getBoundingClientRect()
    return b.height > 0 && b.top >= box.top && b.bottom <= box.bottom
  })
}

/** Boot: first row, then the eager autofill settled (no change and no tail spinner for 2 s). */
async function boot() {
  let firstRow: number | null = null
  let last = -1
  let stableSince = performance.now()
  while (performance.now() < 180_000) {
    if (firstRow === null && document.querySelector(ROW)) firstRow = performance.now()
    const n = loadedRows()
    const tail = document.querySelector('[data-testid="history-tail-loading"]')
    if (n !== last || tail || firstRow === null) {
      last = n
      stableSince = performance.now()
    } else if (performance.now() - stableSince > 2000) break
    await sleep(50)
  }
  return { firstRowMs: firstRow && Math.round(firstRow), settleMs: Math.round(stableSince), rowsLoaded: last }
}

/** The display's refresh interval: the median frame over one idle second. */
async function measureVsync() {
  recording = true
  const from = performance.now()
  await sleep(1000)
  recording = false
  const fr = frames.filter((f) => f.at >= from).map((f) => f.delta)
  // A compositor that does not sync rAF to the display (WSLg) reports ~9 ms;
  // a frame is judged against a 60 Hz budget at least.
  return Math.max(16.7, quantile(fr, 0.5) ?? 16.7)
}

/** A trackpad-like scroll: pxPerFrame on every frame for ms. */
async function fling(vsync: number, pxPerFrame: number, ms: number) {
  const el = body()!
  el.scrollTop = 0
  await sleep(300)
  recording = true
  const from = performance.now()
  while (performance.now() - from < ms) {
    el.scrollTop += pxPerFrame
    await nextFrame()
  }
  recording = false
  return { pxPerFrame, ...frameStats(from, performance.now(), vsync) }
}

/** Control: the same fling on a plain scrolling list with no React and no
 *  canvas, the size of the grid. If this is slow too, the webview's renderer
 *  is the limit, not the app. */
async function control(vsync: number, pxPerFrame: number, ms: number) {
  const box = document.createElement("div")
  box.style.cssText = "position:fixed;inset:0;overflow:auto;z-index:99999;background:#fff;font:13px sans-serif"
  box.innerHTML = Array.from(
    { length: 3000 },
    (_, i) =>
      `<div style="height:28px;line-height:28px;padding-left:12px;border-bottom:1px solid #eee">row ${i} — a commit subject of ordinary length</div>`,
  ).join("")
  document.body.appendChild(box)
  await sleep(500)
  recording = true
  const from = performance.now()
  while (performance.now() - from < ms) {
    box.scrollTop += pxPerFrame
    await nextFrame()
  }
  recording = false
  const stats = frameStats(from, performance.now(), vsync)
  box.remove()
  await sleep(300)
  return { pxPerFrame, ...stats }
}

/** The audit's wheel scroll: +400 px every 50 ms for 6 s. */
async function jump(vsync: number) {
  const el = body()!
  el.scrollTop = 0
  await sleep(300)
  recording = true
  const from = performance.now()
  while (performance.now() - from < 6000) {
    el.scrollTop += 400
    await sleep(50)
  }
  recording = false
  return frameStats(from, performance.now(), vsync)
}

/** A scrollbar drag from top to bottom of the loaded rows in 60 frames. */
async function skim(vsync: number) {
  const el = body()!
  el.scrollTop = 0
  await sleep(300)
  recording = true
  const from = performance.now()
  const end = el.scrollHeight - el.clientHeight
  for (let i = 1; i <= 60; i++) {
    el.scrollTop = (end * i) / 60
    await nextFrame()
  }
  recording = false
  return frameStats(from, performance.now(), vsync)
}

/** 40 hovers (React's onMouseEnter comes from mouseover), each to the next graph redraw. */
async function hover(vsync: number) {
  body()!.scrollTop = 0
  await sleep(300)
  const rows = visibleRows(ROW)
  const latencies: number[] = []
  let missed = 0
  let prev: HTMLElement | null = null
  recording = true
  const from = performance.now()
  for (let i = 0; i < 40 && rows.length > 0; i++) {
    const row = rows[(i * 7) % rows.length]
    const target = row.querySelector<HTMLElement>(".msg-text") ?? row
    const t0 = performance.now()
    // React fires enter/leave from the mouseout of the element left behind
    // and ignores a mouseover whose relatedTarget it owns, so send both.
    prev?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: target }))
    target.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: prev }))
    target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    const t1 = await redrawAfter(t0)
    if (t1 === null) missed += 1
    else latencies.push(t1 - t0)
    prev = target
    await sleep(60)
  }
  recording = false
  return {
    hovers: latencies.length + missed,
    missed,
    toRedrawP50: quantile(latencies, 0.5),
    toRedrawP95: quantile(latencies, 0.95),
    ...frameStats(from, performance.now(), vsync),
  }
}

/** 20 clicks on SHA cells (never a ref chip): row highlighted, Commit tab showing the subject. */
async function select(vsync: number) {
  body()!.scrollTop = 0
  await sleep(300)
  const rows = visibleRows(REAL_ROW).filter((r) => r.querySelector(".msg-text")?.textContent?.trim())
  const highlight: number[] = []
  const commitTab: number[] = []
  recording = true
  const from = performance.now()
  for (let i = 0; i < 20 && rows.length > 0; i++) {
    const row = rows[(i * 3) % rows.length]
    const subject = row.querySelector(".msg-text")!.textContent!.trim()
    const cell = row.querySelector<HTMLElement>('[data-testid="sha-cell"]') ?? row
    const t0 = performance.now()
    cell.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    cell.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    cell.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }))
    cell.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    cell.click()
    const [hl, ct] = await Promise.all([
      waitText(".grid-row.selected .msg-text", subject),
      waitText('[data-testid="commit-info"]', subject),
    ])
    if (hl !== null) highlight.push(hl - t0)
    if (ct !== null) commitTab.push(ct - t0)
    await sleep(150)
  }
  recording = false
  return {
    selections: Math.min(20, rows.length),
    highlightP50: quantile(highlight, 0.5),
    highlightP95: quantile(highlight, 0.95),
    commitTabP50: quantile(commitTab, 0.5),
    commitTabP95: quantile(commitTab, 0.95),
    commitTabMax: commitTab.length ? round(Math.max(...commitTab)) : null,
    ...frameStats(from, performance.now(), vsync),
  }
}

async function run(sink: string, config: ProbeConfig) {
  const report: Record<string, unknown> = {
    label: config.label,
    userAgent: navigator.userAgent,
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    boot: await boot(),
  }
  console.info("[probe] booted", JSON.stringify(report.boot))
  await sleep(1000)
  const vsync = await measureVsync()
  report.vsyncMs = round(vsync)
  report.rafIdleP50 = quantile(
    frames.map((f) => f.delta),
    0.5,
  )
  report.rowsLoaded = loadedRows()
  const scenarios: [string, () => Promise<unknown>][] = [
    ["control24", () => control(vsync, 24, 3000)],
    ["fling24", () => fling(vsync, 24, 5000)],
    ["fling96", () => fling(vsync, 96, 5000)],
    ["jump", () => jump(vsync)],
    ["skim", () => skim(vsync)],
    ["hover", () => hover(vsync)],
    ["select", () => select(vsync)],
  ]
  const runs: Record<string, unknown>[] = []
  for (let i = 0; i < config.runs; i++) {
    const result: Record<string, unknown> = {}
    for (const [name, scenario] of scenarios) {
      console.info(`[probe] run ${i + 1}/${config.runs} ${name}`)
      result[name] = await scenario()
    }
    runs.push(result)
  }
  report.runs = runs
  await fetch(`${sink}/report`, { method: "POST", body: JSON.stringify(report) })
}

/** One fling with a temporary stylesheet applied: which part of a frame the
 *  graph costs on this machine (canvas drawing, row painting, row layout). */
async function flingWith(vsync: number, css: string) {
  const style = document.createElement("style")
  style.textContent = css
  document.head.appendChild(style)
  try {
    await sleep(300)
    return await fling(vsync, 24, 4000)
  } finally {
    style.remove()
  }
}

export type ScrollBenchmark = Record<string, unknown>

/**
 * Settings → Diagnostics → Measure graph scrolling (v0.20.8, owner on
 * v0.20.7: "not smooth means like 10-15 fps while scrolling. We have a large
 * repo."). Runs on the grid on screen, in the installed app, and splits a
 * scroll frame: the grid as is, without the canvas, without painting the row
 * text, without laying the rows out, and a plain list as the webview's own
 * ceiling. The result goes to the app log, so a diagnostic snapshot carries it.
 */
export async function runScrollBenchmark(): Promise<ScrollBenchmark> {
  instrument()
  const el = body()
  if (!el || !document.querySelector(ROW)) throw new Error("no graph on screen")
  const start = el.scrollTop
  const canvas = document.querySelector<HTMLCanvasElement>(".graph-canvas")
  const vsync = await measureVsync()
  const result: ScrollBenchmark = {
    userAgent: navigator.userAgent,
    dpr: window.devicePixelRatio,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    rowsLoaded: loadedRows(),
    rowsInDom: document.querySelectorAll(ROW).length,
    elementsInGrid: el.getElementsByTagName("*").length,
    canvasPx: canvas ? `${canvas.width}x${canvas.height}` : null,
    vsyncMs: round(vsync),
  }
  try {
    result.control = await control(vsync, 24, 3000)
    result.grid = await fling(vsync, 24, 4000)
    result.noCanvas = await flingWith(vsync, ".graph-canvas { visibility: hidden !important; }")
    result.noRowPaint = await flingWith(vsync, ".grid-row > * { visibility: hidden !important; }")
    // The cells out of layout, the row itself kept: a row of height 0 would
    // be re-measured by the virtualizer and collapse the list.
    result.noRowLayout = await flingWith(vsync, ".grid-row > * { display: none !important; }")
    result.skim = await skim(vsync)
    result.jump = await jump(vsync)
  } finally {
    el.scrollTop = start
  }
  return result
}

/** The fps line of each scenario, for a one-line log entry a person can read. */
export function summarizeBenchmark(b: ScrollBenchmark): string {
  const fps = (k: string) => (b[k] as { fps?: number; p95?: number } | undefined) ?? {}
  const parts = ["control", "grid", "noCanvas", "noRowPaint", "noRowLayout", "skim", "jump"].map(
    (k) => `${k} ${fps(k).fps ?? "–"} fps (p95 ${fps(k).p95 ?? "–"} ms)`,
  )
  return `${parts.join(" · ")} · dpr ${String(b.dpr)} · canvas ${String(b.canvasPx)} · ${String(b.rowsInDom)} rows / ${String(b.elementsInGrid)} elements in the grid`
}

export async function installProbe(sink: string) {
  instrument()
  let config: ProbeConfig = { label: "probe", runs: 3 }
  try {
    config = { ...config, ...(await (await fetch(`${sink}/config`)).json()) }
  } catch (e) {
    console.info("[probe] no sink, no probe:", String(e))
    return
  }
  console.info("[probe] config", JSON.stringify(config))
  // Pin the repository the way the audit does (/?repo=<id>), once.
  if (config.repoId && new URLSearchParams(location.search).get("repo") !== config.repoId) {
    location.replace(`/?repo=${encodeURIComponent(config.repoId)}`)
    return
  }
  try {
    await run(sink, config)
  } catch (e) {
    await fetch(`${sink}/report`, { method: "POST", body: JSON.stringify({ label: config.label, error: String(e) }) })
  }
}
