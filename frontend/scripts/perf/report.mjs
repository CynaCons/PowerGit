// Aggregation and the Markdown table of the perf audit (v0.18.10).
import { median } from "./metrics.mjs"

const SKIP = new Set(["name", "git", "profile", "page", "cdp", "error", "skipped"])

/** Medians per numeric field over runs of the same scenario; byCommand and
 *  profile come from the run whose wall time is the median. */
export function aggregate(runs) {
  const names = []
  for (const run of runs) for (const s of run) if (!names.includes(s.name)) names.push(s.name)
  return names.map((name) => {
    const samples = runs.map((run) => run.find((s) => s.name === name)).filter(Boolean)
    const numeric = (get) => median(samples.map(get).filter((v) => typeof v === "number"))
    const out = { name, runs: samples.length }
    const keys = new Set()
    for (const s of samples) for (const k of Object.keys(s)) if (!SKIP.has(k)) keys.add(k)
    for (const k of keys) {
      const vals = samples.map((s) => s[k])
      out[k] =
        typeof vals.find((v) => v !== undefined) === "number" ? numeric((s) => s[k]) : vals.find((v) => v !== undefined)
      if (typeof out[k] === "number") out[`${k}Runs`] = vals
    }
    out.page = {}
    for (const k of Object.keys(samples[0]?.page ?? {})) out.page[k] = numeric((s) => s.page?.[k])
    out.cdp = {}
    for (const k of Object.keys(samples[0]?.cdp ?? {})) out.cdp[k] = numeric((s) => s.cdp?.[k])
    out.heapAfterGcMB = numeric((s) => s.heapAfterGcMB)
    out.git = { calls: numeric((s) => s.git?.calls), totalMs: numeric((s) => s.git?.totalMs) }
    const sorted = [...samples].sort((a, b) => (a.page?.ms ?? 0) - (b.page?.ms ?? 0))
    const mid = sorted[Math.floor(sorted.length / 2)]
    out.git.byCommand = mid?.git?.byCommand ?? []
    out.profile = mid?.profile
    out.error = samples.find((s) => s.error)?.error
    out.skipped = samples.find((s) => s.skipped)?.skipped
    return out
  })
}

const KEY_FIELDS = [
  "firstRowMs",
  "rows1000Ms",
  "settleMs",
  "rowsLoaded",
  "steps",
  "rowsLoadedAfter",
  "hovers",
  "toRedrawMedianMs",
  "toRedrawP95Ms",
  "redrawMissed",
  "selections",
  "highlightMedianMs",
  "highlightP95Ms",
  "commitTabMedianMs",
  "commitTabP95Ms",
  "commitTabMaxMs",
  "expandMs",
  "foldMs",
  "onMs",
  "offMs",
  "tick5FirstRowsMs",
  "tick5StableMs",
  "loadedAfter5",
  "refsAfter5",
  "showAllFirstRowsMs",
  "showAllStableMs",
  "loadedAfterAll",
  "showAllEmptyGrid",
  "refs",
  "refreshMs",
  "loadedRows",
  "wdRowMs",
  "wdCount",
  "statusMedianMs",
  "fileListMs",
  "fileRowsRendered",
  "firstDiffMs",
  "openMs",
  "listsMs",
  "unstagedRows",
  "stageOneMs",
  "stageAllMs",
  "stormMs",
  "statusResponses",
  "statusMaxInFlight",
  "quietAfterMs",
  "quietTimedOut",
]

const fmt = (v) => (v === null || v === undefined ? "–" : typeof v === "number" ? v.toLocaleString("en-US") : String(v))

export function markdown(agg, meta) {
  const lines = []
  lines.push(
    `### ${meta.label} — ${meta.repoName} (${meta.build}, ${meta.runs} run${meta.runs > 1 ? "s" : ""}, medians)`,
  )
  lines.push("")
  lines.push(
    "| scenario | result | long tasks n / total / max ms | frames >32 ms / max ms | script / layout ms | heap MB (after GC) | git calls n / ms |",
  )
  lines.push("|---|---|---|---|---|---|---|")
  for (const s of agg) {
    if (s.skipped) {
      lines.push(`| ${s.name} | skipped: ${s.skipped} | | | | | |`)
      continue
    }
    const result = KEY_FIELDS.filter((k) => s[k] !== undefined)
      .map((k) => `${k.replace(/Ms$/, "")}=${fmt(s[k])}${k.endsWith("Ms") ? " ms" : ""}`)
      .join(", ")
    const p = s.page ?? {}
    const c = s.cdp ?? {}
    lines.push(
      `| ${s.name} | ${s.error ? `ERROR ${s.error}; ` : ""}${result} | ${fmt(p.longTasks)} / ${fmt(p.longTaskTotalMs)} / ${fmt(p.longTaskMaxMs)} | ${fmt(p.framesOver32)} / ${fmt(p.frameMaxMs)} | ${fmt(c.ScriptMs)} / ${fmt(c.LayoutMs)} | ${fmt(s.heapAfterGcMB)} | ${fmt(s.git.calls)} / ${fmt(s.git.totalMs)} |`,
    )
  }
  lines.push("")
  for (const s of agg) {
    if (s.git?.byCommand?.length) {
      lines.push(
        `- ${s.name} git calls: ` +
          s.git.byCommand
            .slice(0, 6)
            .map((g) => `${g.command} ×${g.count} ${g.totalMs} ms (max ${g.maxMs})`)
            .join("; "),
      )
    }
    if (s.profile?.top?.length) {
      lines.push(
        `- ${s.name} top self time: ` +
          s.profile.top
            .slice(0, 8)
            .map((t) => `${t.fn} ${t.selfMs} ms (${t.pct}%)`)
            .join("; "),
      )
    }
  }
  return lines.join("\n")
}
