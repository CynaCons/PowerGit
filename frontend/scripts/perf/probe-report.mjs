#!/usr/bin/env node
// Prints the in-app probe reports (src/perf/probe.ts) as one Markdown table:
// medians over runs, one row per report.
//   node scripts/perf/probe-report.mjs test-results/perf/probe-*.json
import { readFileSync } from "node:fs"
import { basename } from "node:path"

const median = (xs) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}
const pick = (runs, scenario, key) => median(runs.map((r) => r[scenario]?.[key]))
const fmt = (v) => (v === null || v === undefined ? "–" : String(v))

const cols = [
  ["control fps / p95", (r) => `${fmt(pick(r, "control24", "fps"))} / ${fmt(pick(r, "control24", "p95"))}`],
  [
    "fling24 fps / p95 / janky",
    (r) =>
      `${fmt(pick(r, "fling24", "fps"))} / ${fmt(pick(r, "fling24", "p95"))} / ${fmt(pick(r, "fling24", "janky"))}`,
  ],
  ["fling96 fps / p95", (r) => `${fmt(pick(r, "fling96", "fps"))} / ${fmt(pick(r, "fling96", "p95"))}`],
  ["jump fps / max", (r) => `${fmt(pick(r, "jump", "fps"))} / ${fmt(pick(r, "jump", "max"))}`],
  ["skim p95 / max", (r) => `${fmt(pick(r, "skim", "p95"))} / ${fmt(pick(r, "skim", "max"))}`],
  [
    "hover p50 / p95 (missed)",
    (r) =>
      `${fmt(pick(r, "hover", "toRedrawP50"))} / ${fmt(pick(r, "hover", "toRedrawP95"))} (${fmt(pick(r, "hover", "missed"))})`,
  ],
  [
    "select highlight / commit tab p50",
    (r) => `${fmt(pick(r, "select", "highlightP50"))} / ${fmt(pick(r, "select", "commitTabP50"))}`,
  ],
]

console.log(`| report | boot first row / settled ms | ${cols.map(([h]) => h).join(" | ")} |`)
console.log(`|---|---|${cols.map(() => "---").join("|")}|`)
for (const file of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(file, "utf8"))
  if (j.error) {
    console.log(`| ${j.label} | error: ${j.error} |`)
    continue
  }
  const runs = j.runs ?? []
  const name = `${j.label} (${runs.length}×, dpr ${j.dpr}, ${j.viewport})`
  console.log(
    `| ${name} | ${fmt(j.boot?.firstRowMs)} / ${fmt(j.boot?.settleMs)} | ${cols.map(([, f]) => f(runs)).join(" | ")} |`,
  )
}
console.error(
  `${process.argv.length - 2} report(s): ${process.argv
    .slice(2)
    .map((f) => basename(f))
    .join(", ")}`,
)
