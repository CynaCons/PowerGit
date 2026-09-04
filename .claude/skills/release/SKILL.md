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

## 1. Version bump (one file)

`frontend/package.json` is the only version source (since v0.13.5). Bump it
and nothing else:

```powershell
cd frontend
npm version X.Y.Z --no-git-tag-version
cd ..
node scripts/check-version.mjs
git commit -am "chore(release): vX.Y.Z"
```

Everything else derives from it — do not edit these by hand:

| Derived where | How it reads package.json | Where it surfaces |
|---|---|---|
| `frontend/src-tauri/tauri.conf.json` | `"version": "../package.json"` | installer / zip / AppImage names, Tauri package info |
| `frontend/src-tauri/build.rs` | exports `POWERGIT_VERSION` at compile time | Rust shell (`Cargo.toml` stays `0.0.0`, no Cargo.lock churn) |
| `src/engine/PowerGit.Engine/PowerGit.Engine.csproj` | MSBuild regex → `<Version>` | `GET /health` `engine`, app status bar |
| `scripts/package-windows.ps1` | reads `package.json` | `dist/PowerGit_<ver>_*` file names |

## 1b. Verify the version

Do this after the bump commit and again after packaging. Each line says what
to check, where it shows, and how:

| What | Where it surfaces | How to check |
|---|---|---|
| Static derivation intact | files above | `node scripts/check-version.mjs` (exit 0) |
| Engine reports it | `GET /health` → `engine`, status bar bottom-right | start the engine, then `node scripts/check-version.mjs --engine-url http://127.0.0.1:7733` |
| Artifacts carry it | `dist/PowerGit_<ver>_win64.zip`, `_x64-setup.exe` | `node scripts/check-version.mjs --dist dist` after step 2 |
| Tag matches | GitHub release name | `node scripts/check-version.mjs --tag vX.Y.Z` before step 3 |
| Linux artifacts | release assets `*.AppImage`, `*.deb` | `gh release view vX.Y.Z` after CI: names contain `<ver>` |

The engine unit test `Health_ok` also asserts `/health` equals package.json,
so `dotnet test` in preflight already fails on drift.

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

The Linux job is gated (v0.13.10): `scripts/inspect-appimage.sh --self-test`,
then `--fix --strict` (strips the host-provided families: GLib/GIO,
libmount/libblkid, Wayland client libs, GStreamer, curl/nghttp2), then
`docker/appimage-check/run-matrix.sh` launches the repaired artifact in
stock ubuntu:22.04 / 24.04 / 26.04 and fails on a missing first paint or a
fatal stderr pattern. A red matrix means the AppImage must not ship; see
docs/agents/memories/appimage-compat-matrix.md to reproduce locally.
Before a minor release also run the 10-minute longevity gate once on 26.04
(`scripts/appimage-matrix.ps1 <file> -Versions "26.04" -Longevity 10`, and
again with `DISPLAY_MODE=wayland`).

## 4. GitHub release notes

Use `gh release view vX.Y.Z --web` / `gh release edit` to add notes:
highlights from PLAN.md iterations closed since the previous tag, known
issues, artifact list. GPL-3.0 license notice must stay intact.

## 5. Pages showcase refresh

1. Engine running locally, then `node frontend/scripts/capture-showcase.mjs`
   → regenerates `website/public/assets/*.png`.
2. Review each screenshot — never publish one that shows an error state,
   synthetic data, or a half-loaded graph.
3. Update the `website/` React copy if features changed (feature cards,
   screens grid captions).
4. Commit + push `powergit`; the `pages.yml` workflow deploys automatically.
   Verify the deployment went green (`gh run list --workflow=pages`), then run
   `npm run test:live` from `frontend/` — it checks the hero renders and the
   demo draws its graph rows on the live site.

## 6. Close out

- Tick/close the matching PLAN.md iteration via powerplan (never hand-edit).
- Final push. Confirm: release assets present, Pages updated, PLAN accurate.
