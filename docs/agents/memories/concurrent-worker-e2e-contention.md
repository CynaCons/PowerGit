# Concurrent workers share the dev engine port and node processes

Observed 2026-09-02 running `frontend` e2e as one of three concurrent
workers on the same checkout/machine.

## The dev engine on :7733 is not exclusively yours
`dotnet run --project src/engine/PowerGit.Engine --urls http://127.0.0.1:7733`
started here died twice with exit code -1 within seconds of a Playwright
run, and a third start attempt failed with `address already in use` while
a *different* process was already answering `/health` (version matched,
so it was a real PowerGit engine, just not the one this session started).
Conclusion: another concurrent worker/agent also owns/restarts an engine on
the same port. Before assuming your engine crashed and re-diagnosing it,
just re-probe `/health` - if it answers, reuse it and move on. Only ever
`Stop-Process` a PID you captured from your own start command (per the
worker contract "kill only an engine you started").

## Vite/webServer failures mid-run are often another worker's WIP, not yours
Two consecutive `npx playwright test` runs failed at `page.goto` with
distinct causes traced to files this worker did not touch: a transient JSX
syntax error in a file another worker was actively saving, then a "no
matching export" mismatch between two other workers' files (one importing
a function the other hadn't exported yet). Both resolved themselves within
~1-2 minutes with no action from this session. If the first-error message
names a file outside your assigned scope, wait ~60-90s and retry once
rather than trying to "fix" a file you don't own.

## A machine running 3 agents can have 20+ node processes
`Get-Process | Where ProcessName -match 'dotnet|node'` showed ~21 node
processes and 1 dotnet process from unrelated sessions/timestamps. A plain
`page.goto` timeout with *no* `[WebServer]` error output at all (unlike the
two cases above) is consistent with CPU contention slowing Vite's cold
transform past the default 30s test timeout rather than any real bug.
Passing `--timeout=90000` on the `playwright test` CLI (no edit to the
shared `playwright.config.ts`) absorbed this without touching other
workers' config.
