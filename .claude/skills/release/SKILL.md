---
name: release
description: Cut a PowerGit release — version bump, Windows artifacts, tagged CI for Linux binaries, GitHub release, README/Pages updates. Use when the owner asks to release, ship, or publish a version.
---

# Cutting a PowerGit release

Work on the `powergit` branch. Never push tags or releases without the owner
having approved the content that goes into them.

## 0. Preflight

- **Close the current iteration in PLAN.md** via powerplan
  (`powerplan_complete_task` for open tasks, then `powerplan_close_iteration`).
  A release must never ship from an iteration that is still open — PLAN.md is
  the changelog source for the release notes.
- `dotnet test src/engine/PowerGit.Engine.sln` (use the user-local dotnet:
  `%LOCALAPPDATA%\Microsoft\dotnet\dotnet.exe`; see docs/agents/memories/engine-exe-lock.md)
- `cd frontend && npm run test:e2e` (needs a live engine on :7733)
- `npm run test:resolution`
- Working tree clean; everything committed and pushed.

## 1. Version bump (one version string, three files)

Update all three to the same value — they are not synchronized automatically:

| File | Field |
|---|---|
| `frontend/src-tauri/tauri.conf.json` | `version` (drives installer/zip artifact names) |
| `frontend/src-tauri/Cargo.toml` | `version` (commit the Cargo.lock churn) |
| `frontend/package.json` | `version` |

Note: the engine's `engineVersion` constant lives in
`src/engine/PowerGit.Engine/Program.cs` and is displayed in the app's status
bar — bump it too so it matches (it has drifted before).

Commit: `chore(release): vX.Y.Z`.

## 2. Windows artifacts (local)

```powershell
pwsh scripts/package-windows.ps1
```

Produces in `dist/`:
- `PowerGit_<ver>_win64.zip` (portable: app + self-contained engine sidecar)
- `PowerGit_<ver>_x64-setup.exe` (NSIS installer)

Smoke-test the zip before publishing: extract to a clean dir, kill any running
engine, start `powergit.exe`, confirm `/health` on :7733 responds and the app
renders the real repo.

## 3. Tag → Linux binaries via CI

```powershell
git tag vX.Y.Z
git push origin powergit --tags
```

The `release.yml` workflow builds on the tag: a Windows job (zip + installer)
and a Linux job (AppImage + deb, engine sidecar via
`scripts/build-engine-sidecar.sh`), all attached to the GitHub Release.
Watch the Actions run; if it fails, fix forward and re-tag (`vX.Y.Z+1` or
delete/re-push the tag only if the release has no downloads yet).

## 4. GitHub release notes

Use `gh release view vX.Y.Z --web` / `gh release edit` to add notes:
highlights from PLAN.md iterations closed since the previous tag, known
issues, artifact list. GPL-3.0 license notice must stay intact.

## 5. Pages showcase refresh

1. Engine running locally, then `node frontend/scripts/capture-showcase.mjs`
   → regenerates `docs/site/assets/*.png`.
2. Review each screenshot — never publish one that shows an error state,
   synthetic data, or a half-loaded graph.
3. Update `docs/site/index.html` copy if features changed (feature cards,
   screens grid captions).
4. Commit + push `powergit`; the `pages.yml` workflow deploys automatically.
   Verify the deployment went green (`gh run list --workflow=pages`), then run
   `npm run test:live` from `frontend/` — it checks the hero renders and the
   demo draws its graph rows on the live site.

## 6. Close out

- Tick/close the matching PLAN.md iteration via powerplan (never hand-edit).
- Final push. Confirm: release assets present, Pages updated, PLAN accurate.
