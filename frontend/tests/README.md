# Tests

Three lanes. Default is functional e2e. Visual and demo run only when the owner asks.

| Script                | What                    | Screenshots | When                        |
| --------------------- | ----------------------- | ----------- | --------------------------- |
| `npm run test:unit`   | Graph layout            | no          | every change to `src/graph` |
| `npm run test:e2e`    | Headless assertions     | no          | every UI change, **once**   |
| `npm run test:visual` | Pixel diffs             | yes         | owner asked                 |
| `npm run test:demo`   | Headed slow walkthrough | no          | owner design demo           |

E2e stops at the first failure (`maxFailures: 1`) and never retries. Do not re-run a red suite. Read the first error, fix, then run once.

While writing a new test, use `npm run test:e2e:debug`. After it is green, leave the spec quiet — no `console.log`, no `page.pause`, no `waitForTimeout`.

Visual specs live in `tests/visual/` and use `expect(page).toHaveScreenshot(...)`. Chrome DevTools MCP screenshots are not a test suite.

## Linux

The Windows lanes above run against Chromium. Linux has two extra lanes,
both Docker-based (`pwsh scripts/ubuntu-check.ps1` builds the image):

| Lane                                       | What                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `docker/ubuntu-check/check.sh`             | Engine tests + **all** e2e specs on a real Linux git, `--retries=0 --max-failures=1`, vite preview     |
| `docker/ubuntu-check/webkit-check.sh`      | Same fixture under Playwright WebKit (closest stand-in for the WebKitGTK webview of the AppImage)      |
| `docker/appimage-check/run-matrix.sh`      | Launches a built AppImage in stock ubuntu 22.04/24.04/26.04 and fails on runtime dependency errors     |

Both harness lanes seed the same fixture repo through
`docker/ubuntu-check/seed-repo.sh`: branch `powergit` checked out,
`frontend/src/**` (so `frontend/src/graph/layout.ts` exists at HEAD),
`README.md`, two authors, a `feature` branch and tag `v1.0.0`. Specs that
click tree rows (`blob-highlight`, `file-tree`) rely on that shape — extend
`seed-repo.sh`, not the individual scripts. Specs that call the engine
directly read `POWERGIT_ENGINE_URL` (default `http://127.0.0.1:7733`).

The AppImage matrix is not an e2e lane; it proves the shipped binary starts
on a stock desktop. See `docs/agents/memories/appimage-compat-matrix.md`.
