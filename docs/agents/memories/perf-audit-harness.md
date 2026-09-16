# Perf audit harness (v0.18.10, 2026-09-16)

`frontend/scripts/perf-audit.mjs` (+ `frontend/scripts/perf/*.mjs`) drives the
real UI with Playwright and CDP against an engine that is already running,
and prints a Markdown table plus a JSON under `frontend/test-results/perf/`.
The report it fed is `docs/perf/audit-2026-09-16.md`. It measures; it does
not assert — the budgets live in `tests/perf/interaction.spec.ts` and
`tests/perf/pending.spec.ts` behind `npm run test:perf`.

## Run it

```powershell
pwsh -NoProfile -File frontend/scripts/e2e-harness.ps1 -Root C:\dev\public-repo\pg-wt-perf -Name perf -UiPort 1461 -EnginePort 7761
cd frontend
$env:PW_PORT='1461'; $env:VITE_ENGINE_URL='http://127.0.0.1:7761'; $env:POWERGIT_ENGINE_URL='http://127.0.0.1:7761'
npm run perf:audit -- --repo C:\dev\flutter --runs 3            # the eight graph scenarios
npm run perf:audit -- --pending 2000 --runs 3                    # the pending-tree scenarios
npm run perf:audit -- --repo . --scenarios boot,hover --runs 1   # a subset
pwsh -NoProfile -File frontend/scripts/e2e-harness.ps1 -Root C:\dev\public-repo\pg-wt-perf -Name perf -Stop
```

The harness engine has its own `POWERGIT_DATA_DIR`, so the audit repositories
never reach the owner's Recent repositories (private-engine-data-dir). Never
point the default engine (:7733) at flutter or vscode. The script POSTs
`/repos/open` for `--repo` and pins the page with `/?repo=<id>`, so the
engine's "current" repository is irrelevant. `--pending N` builds or restores
`<tmpdir>/powergit-pending-<N>` through `scripts/perf/make-pending.mjs`
before every run (a `stage-all` mutates the tree). Vite on `--ui-url` is
reused when it answers, else started (and stopped) by the harness; the
first load after a Vite start is a warm-up that is not counted.

## What a scenario records

`scripts/perf/metrics.mjs` injects an init script: a `longtask`
PerformanceObserver, a rAF loop (frame deltas), a wrapper on
`CanvasRenderingContext2D.prototype.clearRect` that stamps every redraw of
`.graph-canvas` (`draw.ts drawRows` clears first, so one clearRect is one
redraw), and capture-phase listeners that stamp inputs. So "hover → canvas"
is `mousemove` dispatch to the next graph clearRect, in-page, no trace
needed. CDP `Performance.getMetrics` gives script/layout/style time and the
heap per window; `HeapProfiler.collectGarbage` + `Runtime.getHeapUsage` is
the "heap after GC" column; `Profiler` (500 µs sampling) gives the top
self-time functions for scroll and hover. The engine's git command log is
polled every 250 ms (`/gitlog?after=`; the buffer holds 50 entries, a boot
runs 60+) and cut to the scenario's wall-clock window.

## Gotchas

- The 12 overscan rows below the fold are in the DOM with a real bounding
  box; a pointer there hovers nothing. Filter targets by the viewport.
- The Vite dev build is 3-5× slower on render than `vite build`; every
  number in the tables says which build it was. Dev numbers rank
  bottlenecks; only a production run sets a shipping budget.
- `redrawAfter` polls at 16 ms but returns the recorded clearRect time, so
  the latency has 1 ms resolution; `waitText` is a MutationObserver plus a
  25 ms poll (a subject that is already on screen resolves at once).
- The `select` scenario (and `interaction.spec.ts`) clicks the row's SHA
  cell: the message cell may start with a ref chip, and a chip click
  selects that ref's tip, so the subject never matches (10 s timeout each;
  the heavy fixture's `gen/local-…` chips showed it). Targets must also be
  inside the grid body's box, not the viewport: overscan rows sit under the
  bottom panel.
- Heavy scenarios queue behind each other on one CPU: never run two harness
  processes at once, and close other browsers; the medians of 3 runs are
  reported, and the per-run values are in the JSON (`…Runs` arrays).
- `storm` appends to 200 tracked files and runs 20 `git update-index` in
  2 s; only the index writes reach `/events` (a tracked-file edit is
  invisible to the watcher until the 10 s status poll).
- `npm run test:perf` (perf-run.mjs) is its own orchestration on :7799 /
  :1421: the engine needs `POWERGIT_ENGINE_ORIGINS` for :1421 (it sat at
  "connecting to the engine…" from v0.13.0 to v0.18.10 and `heavy.spec`'s
  `engine-status` contains "(" assertion passed on that text). Extra
  arguments reach Playwright: `node scripts/perf-run.mjs --grep pending
  --reporter=list` (npm on Windows eats `--grep-invert`; call node).
- The heavy fixture packs its refs (stamp v2): 2,500 loose refs made every
  `git show %D` 4× slower and the selection budget measured the fixture.
