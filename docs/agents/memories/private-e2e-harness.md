# Private e2e harness per worktree (v0.18.3, 2026-09-15)

## Two workers can run e2e at once — on their own ports
The default harness is one engine on :7733 and one Vite on :1420, and the
suite is serial because the engine has one "current" repository. Parallel
workers therefore used to queue on the ports (or clobber each other's
current repo). `frontend/scripts/e2e-harness.ps1` gives a checkout its own
engine (own port, own token file, own `POWERGIT_DATA_DIR`, CORS origin for
its own UI port) and `playwright.config.ts` honours `PW_PORT` for Vite:

```powershell
pwsh -NoProfile -File frontend/scripts/e2e-harness.ps1 -Root C:\dev\public-repo\pg-wt-refs -Name refs -UiPort 1441 -EnginePort 7741
# then, in the SAME shell, from that worktree's frontend/:
$env:PW_PORT='1441'; $env:VITE_ENGINE_URL='http://127.0.0.1:7741'; $env:POWERGIT_ENGINE_URL='http://127.0.0.1:7741'
npx playwright test tests/e2e/<spec>.spec.ts
pwsh -NoProfile -File frontend/scripts/e2e-harness.ps1 -Root ... -Name refs -Stop
```

The script records the engine pid under `%TEMP%\pg-harness-<name>\` and
reuses a running one; after an engine code change run `-Stop` then start
again (the exe is locked while it runs, see engine-exe-lock.md). Playwright
starts `npx vite --port <PW_PORT>` itself and kills it afterwards; Vite's
configured port stays 1420 for `tauri dev`.

## Gotchas
- The worktree's branch is the engine's current branch: specs that click
  `tree-row[data-label="powergit"]` (blob-highlight, file-tree) only pass on
  the main checkout. Every other spec is branch-agnostic.
- Visual baselines screenshot the repository name: never regenerate them
  from a worktree; the coordinator does it on the main tree.
- Stop only the engine pid the script recorded; never a foreign one.
- Worktrees share one `.git`: a parallel worker's commits on its branch are
  new rows in every checkout's graph (`--branches` lists them all) and land
  through the live refresh mid-spec. `shell.spec` "auto-scroll does not
  re-center" raced on that once (2026-09-15): its `rows.nth(5)` moved under
  it. Re-run the one test; it is not a product failure.
