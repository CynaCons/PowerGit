#!/usr/bin/env node
// Performance audit harness (v0.18.10): drives the real UI with Playwright
// against an already-running engine (start one with
// frontend/scripts/e2e-harness.ps1 so it has its own POWERGIT_DATA_DIR) and
// records what the user feels per scenario — long tasks, frame times, input
// to canvas repaint, click to Commit tab — beside the engine's git command
// log. Writes frontend/test-results/perf/<repo>-<timestamp>.json and prints
// a Markdown table. See docs/agents/memories/perf-audit-harness.md.
//
//   node scripts/perf-audit.mjs --repo C:\dev\flutter [--scenarios boot,scroll,hover]
//   node scripts/perf-audit.mjs --pending 2000 [--scenarios wd-row,diff-tab,…]
//   options: --engine-url (default http://127.0.0.1:7761) --ui-url (default
//   http://127.0.0.1:1461; started when not answering) --runs 3 --headed
//   --label <name>; token from POWERGIT_ENGINE_TOKEN or frontend/.engine-token.
import { mkdirSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"
import { engineHealth, engineToken, ensureVite, openRepo, startGitLogPoller } from "./perf/engine.mjs"
import { PAGE_INSTRUMENTATION, openCdp } from "./perf/metrics.mjs"
import { PENDING_SCENARIOS, trackStatusRequests } from "./perf/pending.mjs"
import { aggregate, markdown } from "./perf/report.mjs"
import { GRAPH_SCENARIOS } from "./perf/scenarios.mjs"

const frontendDir = resolve(fileURLToPath(new URL(".", import.meta.url)), "..")
const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && !args[i + 1]?.startsWith("--") ? args[i + 1] : i >= 0 ? true : def
}

const engineUrl = process.env.POWERGIT_ENGINE_URL ?? opt("engine-url", "http://127.0.0.1:7761")
const uiUrl = opt("ui-url", `http://127.0.0.1:${process.env.PW_PORT ?? 1461}`)
const runs = Number(opt("runs", 3))
const headed = opt("headed", false) === true
const pendingN = opt("pending", null)
const repoArg = opt("repo", null)
if (!repoArg && !pendingN) {
  console.error("usage: perf-audit.mjs --repo <path> | --pending <N> [--scenarios a,b] [--runs 3]")
  process.exit(2)
}
const catalogue = pendingN ? PENDING_SCENARIOS : GRAPH_SCENARIOS
const wanted = opt("scenarios", null)
const scenarioNames = wanted ? String(wanted).split(",") : Object.keys(catalogue)
for (const n of scenarioNames)
  if (!catalogue[n]) throw new Error(`unknown scenario ${n}; known: ${Object.keys(catalogue).join(", ")}`)

const log = (m) => console.error(m)
const token = engineToken()
const health = await engineHealth(engineUrl, token)
log(`engine ${health.engine} at ${engineUrl}, ${health.gitVersion}`)

let manifest = null
const ensurePending = async () => {
  const { ensurePendingRepo } = await import(new URL("../../scripts/perf/make-pending.mjs", import.meta.url))
  manifest = await ensurePendingRepo({ n: Number(pendingN) })
  return manifest.root
}
const repoPath = pendingN ? await ensurePending() : resolve(repoArg)
const repo = await openRepo(engineUrl, token, repoPath)
log(`repository ${repo.name} (${repo.id}) on ${repo.branch}`)

const vite = await ensureVite(uiUrl, engineUrl, frontendDir, token)
log(`ui at ${uiUrl}${vite.started ? " (vite started by the harness)" : " (reused)"}`)
const label = opt("label", pendingN ? `pending-${pendingN}` : basename(repoPath))
const browser = await chromium.launch({ headless: !headed })
// Warm-up: the first load after a Vite start pays the dependency pre-bundle
// and on-demand transforms; that is Vite, not the app, so it is not run 1.
{
  const page = await browser.newPage()
  await page.goto(`${uiUrl}/?repo=${repo.id}`)
  await page
    .locator('[data-testid="grid-row"]')
    .first()
    .waitFor({ state: "visible", timeout: 120_000 })
    .catch(() => undefined)
  await page.close()
}
const allRuns = []
const startedAt = new Date()
try {
  for (let r = 0; r < runs; r++) {
    log(`run ${r + 1}/${runs}`)
    if (pendingN && r > 0) await ensurePending() // restore the tree a stage-all mutated
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
    await context.addInitScript(PAGE_INSTRUMENTATION)
    const page = await context.newPage()
    const cdp = await openCdp(page)
    const gitlog = startGitLogPoller(engineUrl, token, repo.id)
    const statusRequests = trackStatusRequests(page)
    const ctx = { page, cdp, gitlog, uiUrl, engineUrl, token, repo, manifest, statusRequests, log }
    const results = []
    if (!scenarioNames.includes("boot") && !scenarioNames.includes("wd-row")) {
      // Every scenario assumes a booted page with rows on screen.
      results.push(await (pendingN ? PENDING_SCENARIOS["wd-row"] : GRAPH_SCENARIOS.boot)(ctx))
    }
    for (const name of scenarioNames) results.push(await catalogue[name](ctx))
    await gitlog.stop()
    await context.close()
    allRuns.push(results)
    const line = results.map((s) => `${s.name}${s.error ? " ERR" : s.skipped ? " skip" : ""}`).join(", ")
    log(`  done: ${line}`)
  }
} finally {
  await browser.close()
  await vite.stop()
}

const agg = aggregate(allRuns)
const meta = {
  label,
  repoName: repo.name,
  repoPath,
  build: `vite dev, chromium ${headed ? "headed" : "headless"}, 1600×1000`,
  runs,
  engine: health,
  manifest,
  startedAt: startedAt.toISOString(),
  scenarios: scenarioNames,
}
const outDir = join(frontendDir, "test-results", "perf")
mkdirSync(outDir, { recursive: true })
const stamp = startedAt.toISOString().replace(/[:.]/g, "-").slice(0, 19)
const outFile = join(outDir, `${label}-${stamp}.json`)
writeFileSync(outFile, JSON.stringify({ meta, medians: agg, runs: allRuns }, null, 2))
console.log(markdown(agg, meta))
console.log(`\nJSON: ${outFile}`)
