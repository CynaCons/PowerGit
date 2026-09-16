// Browser-side measurement for the perf audit (v0.18.10): an init script
// that records long tasks, rAF frame times, canvas redraws and input events
// inside the page, plus the CDP Performance and Profiler domains around each
// scenario. Nothing here touches product code; the page is instrumented from
// outside through Playwright.

/** Injected before any page script (page.addInitScript). */
export const PAGE_INSTRUMENTATION = `(() => {
  const S = { longTasks: [], frames: [], redraws: [], inputs: [], active: false, lastFrame: 0 }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) S.longTasks.push({ start: e.startTime, duration: e.duration })
    }).observe({ type: "longtask", buffered: true })
  } catch {}
  const loop = (t) => {
    if (S.active && S.lastFrame) S.frames.push({ at: t, delta: t - S.lastFrame })
    S.lastFrame = t
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  const proto = CanvasRenderingContext2D.prototype
  const clearRect = proto.clearRect
  proto.clearRect = function (...args) {
    if (this.canvas && this.canvas.classList.contains("graph-canvas")) S.redraws.push(performance.now())
    return clearRect.apply(this, args)
  }
  for (const type of ["mousemove", "pointerdown", "click", "keydown", "wheel"]) {
    document.addEventListener(type, () => { if (S.active) S.inputs.push({ type, t: performance.now() }) }, true)
  }
  const stats = (from, to) => {
    const lt = S.longTasks.filter((e) => e.start >= from && e.start <= to)
    const fr = S.frames.filter((f) => f.at >= from && f.at <= to)
    const rd = S.redraws.filter((r) => r >= from && r <= to)
    return {
      ms: Math.round(to - from),
      longTasks: lt.length,
      longTaskTotalMs: Math.round(lt.reduce((n, e) => n + e.duration, 0)),
      longTaskMaxMs: Math.round(lt.reduce((n, e) => Math.max(n, e.duration), 0)),
      frames: fr.length,
      framesOver32: fr.filter((f) => f.delta > 32).length,
      framesOver100: fr.filter((f) => f.delta > 100).length,
      frameMaxMs: Math.round(fr.reduce((n, f) => Math.max(n, f.delta), 0)),
      frameMeanMs: fr.length ? Math.round((fr.reduce((n, f) => n + f.delta, 0) / fr.length) * 10) / 10 : 0,
      redraws: rd.length,
    }
  }
  let winStart = 0
  window.__pgPerf = {
    start() { S.active = true; winStart = performance.now(); S.inputs.length = 0; return winStart },
    end() { S.active = false; return stats(winStart, performance.now()) },
    now() { return performance.now() },
    lastInput(type) { for (let i = S.inputs.length - 1; i >= 0; i--) if (S.inputs[i].type === type) return S.inputs[i].t; return null },
    /** Resolves with the time of the first redraw after t0, or null after timeoutMs. */
    redrawAfter(t0, timeoutMs = 3000) {
      return new Promise((resolve) => {
        const deadline = performance.now() + timeoutMs
        const look = () => {
          const hit = S.redraws.find((r) => r > t0)
          if (hit !== undefined) return resolve(hit)
          if (performance.now() > deadline) return resolve(null)
          setTimeout(look, 16)
        }
        look()
      })
    },
    /** Resolves when no graph redraw happened for quietMs (returns the last one). */
    redrawSettle(quietMs = 300, timeoutMs = 20000) {
      return new Promise((resolve) => {
        const deadline = performance.now() + timeoutMs
        const look = () => {
          const last = S.redraws[S.redraws.length - 1] ?? 0
          const now = performance.now()
          if (now - last >= quietMs || now > deadline) return resolve(last)
          setTimeout(look, 20)
        }
        look()
      })
    },
    /** Resolves with performance.now() once selector's text contains text. */
    waitText(selector, text, timeoutMs = 15000) {
      return new Promise((resolve) => {
        const deadline = performance.now() + timeoutMs
        const check = () => {
          const el = document.querySelector(selector)
          if (el && el.textContent.includes(text)) return true
          return false
        }
        if (check()) return resolve(performance.now())
        const mo = new MutationObserver(() => { if (check()) { mo.disconnect(); resolve(performance.now()) } })
        mo.observe(document.body, { subtree: true, childList: true, characterData: true })
        const poll = () => {
          if (check()) { mo.disconnect(); return resolve(performance.now()) }
          if (performance.now() > deadline) { mo.disconnect(); return resolve(null) }
          setTimeout(poll, 25)
        }
        poll()
      })
    },
    /** Resolves when the grid stops changing (loaded rows = scrollHeight / 28,
     *  first row text, the refreshing flag, the tail spinner) for quietMs; an
     *  empty grid counts as settled after 10 x quietMs (a failed reload). */
    rowsStable(quietMs = 500, timeoutMs = 60000) {
      return new Promise((resolve) => {
        const deadline = performance.now() + timeoutMs
        let sig = null, since = performance.now()
        const look = () => {
          const rows = document.querySelectorAll('[data-testid="grid-row"]')
          const body = document.querySelector('[data-testid="grid-body"]')
          const loaded = Math.round((body?.firstElementChild?.scrollHeight ?? 0) / 28)
          const busy = (document.querySelector('[data-testid="status-refreshing"]') ? 1 : 0) + (document.querySelector('[data-testid="history-tail-loading"]') ? 2 : 0)
          const s = rows.length + ":" + loaded + ":" + (rows[0]?.textContent ?? "") + ":" + busy
          const now = performance.now()
          if (s !== sig) { sig = s; since = now }
          const quiet = now - since
          if ((rows.length > 0 && busy === 0 && quiet >= quietMs) || quiet >= quietMs * 10 || now > deadline) return resolve({ at: since, rows: rows.length, loaded, empty: rows.length === 0 })
          setTimeout(look, 25)
        }
        look()
      })
    },
    /** After a reload that empties the grid: the time the first rows came back
     *  (null when the grid never emptied within 1.5 s or never refilled). */
    rowsReload(timeoutMs = 60000) {
      return new Promise((resolve) => {
        const t0 = performance.now(), deadline = t0 + timeoutMs
        let emptied = false
        const look = () => {
          const n = document.querySelectorAll('[data-testid="grid-row"]').length
          const now = performance.now()
          if (!emptied && n === 0) emptied = true
          if (emptied && n > 0) return resolve(now)
          if ((!emptied && now - t0 > 1500) || now > deadline) return resolve(null)
          setTimeout(look, 10)
        }
        look()
      })
    },
    heap() { const m = performance.memory; return m ? { usedMB: +(m.usedJSHeapSize / 1048576).toFixed(1), totalMB: +(m.totalJSHeapSize / 1048576).toFixed(1) } : null },
  }
})()`

const METRIC_KEYS = [
  "TaskDuration",
  "ScriptDuration",
  "LayoutDuration",
  "RecalcStyleDuration",
  "LayoutCount",
  "RecalcStyleCount",
  "JSHeapUsedSize",
  "Nodes",
]

export async function openCdp(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Performance.enable")
  await cdp.send("Profiler.enable")
  await cdp.send("HeapProfiler.enable")
  return cdp
}

export async function cdpMetrics(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics")
  const out = {}
  for (const m of metrics) if (METRIC_KEYS.includes(m.name)) out[m.name] = m.value
  return out
}

/** Delta of the CDP metrics: durations in ms, heap in MB, counts as counts. */
export function metricsDelta(before, after) {
  const d = {}
  for (const k of METRIC_KEYS) {
    const v = (after[k] ?? 0) - (before[k] ?? 0)
    if (k.endsWith("Duration")) d[k.replace("Duration", "Ms")] = Math.round(v * 1000)
    else if (k === "JSHeapUsedSize") d.heapDeltaMB = +(v / 1048576).toFixed(1)
    else d[k] = v
  }
  d.heapAfterMB = +((after.JSHeapUsedSize ?? 0) / 1048576).toFixed(1)
  return d
}

export async function heapAfterGc(cdp) {
  await cdp.send("HeapProfiler.collectGarbage")
  const { usedSize, totalSize } = await cdp.send("Runtime.getHeapUsage")
  return { usedMB: +(usedSize / 1048576).toFixed(1), totalMB: +(totalSize / 1048576).toFixed(1) }
}

export async function startProfile(cdp) {
  await cdp.send("Profiler.setSamplingInterval", { interval: 500 })
  await cdp.send("Profiler.start")
}

/** Stops the sampling profiler; returns the top functions by self time. */
export async function stopProfile(cdp, top = 12) {
  const { profile } = await cdp.send("Profiler.stop")
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const self = new Map()
  let total = 0
  for (let i = 0; i < profile.samples.length; i++) {
    const node = byId.get(profile.samples[i])
    const dt = (profile.timeDeltas[i] ?? 0) / 1000
    total += dt
    const f = node?.callFrame
    if (!f) continue
    const file = (f.url || "").split("/").pop().split("?")[0]
    const name = f.functionName || "(anonymous)"
    if (name === "(idle)" || name === "(program)" || name === "(garbage collector)") {
      const key = name
      self.set(key, (self.get(key) ?? 0) + dt)
      continue
    }
    const key = `${name} ${file}${f.lineNumber >= 0 ? ":" + (f.lineNumber + 1) : ""}`
    self.set(key, (self.get(key) ?? 0) + dt)
  }
  const rows = [...self.entries()]
    .filter(([k]) => k !== "(idle)")
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([fn, ms]) => ({ fn, selfMs: Math.round(ms), pct: +((ms / Math.max(1, total)) * 100).toFixed(1) }))
  return { totalMs: Math.round(total), idleMs: Math.round(self.get("(idle)") ?? 0), top: rows }
}

export const median = (xs) => {
  const s = [...xs].filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((a, b) => a - b)
  if (s.length === 0) return null
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

export const percentile = (xs, p) => {
  const s = [...xs].filter((x) => typeof x === "number" && !Number.isNaN(x)).sort((a, b) => a - b)
  if (s.length === 0) return null
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]
}
