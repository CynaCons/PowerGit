# Engine exe lock blocks `dotnet test`

Captured 2026-08-21 during v0.4.7.

## Landmine
`dotnet test src/engine/PowerGit.Engine.sln` fails with MSB3027 when a dev
engine instance (`PowerGit.Engine.exe`) is running — the apphost copy step
cannot overwrite the locked exe.

## Fix
```powershell
Stop-Process -Name PowerGit.Engine -Force -ErrorAction SilentlyContinue
& "$env:LOCALAPPDATA\Microsoft\dotnet\dotnet.exe" test src/engine/PowerGit.Engine.sln
```

## Also
- `dotnet` on PATH is a launcher without SDKs; use the user-local SDK:
  `%LOCALAPPDATA%\Microsoft\dotnet\dotnet.exe`.
- Restart the engine after engine changes; the frontend expects it on
  `http://127.0.0.1:7733`.
- Launching the built `PowerGit.Engine.exe` directly fails on this machine:
  the apphost resolves to system .NET (6/8). Set
  `DOTNET_ROOT=%LOCALAPPDATA%\Microsoft\dotnet` first.
- Playwright e2e starts only Vite (`webServer` in playwright.config.ts).
  A live engine on :7733 must already be running or engine-backed tests
  (File Tree tab) fail with "Failed to fetch".

# Engine ops endpoints (v0.4.7)
- `POST /checkout {ref, force}` — 400 with a "force" hint when tree is dirty.
- `POST /reset {commit, mode: soft|mixed|hard}`.
- `POST /rebase {onto}` — auto-aborts a conflicted rebase so the repo is never
  left mid-rebase; error text says so.
- Ops tests build throwaway repos via `TempRepo` helper in GitHostTests.cs
  (`git init -b main`). Never run reset/rebase tests against the real repo.
