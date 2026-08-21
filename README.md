# PowerGit

**Git Extensions' Browse experience, rebuilt.** A GPL-3.0 fork of
[Git Extensions](https://github.com/gitextensions/gitextensions) whose product
is a new cross-platform UI: React + Material inside a Tauri shell, with all git
logic in a headless C# sidecar.

## What it is

- **The graph is the product.** A live revision graph driven by real `git log`,
  with commit details, changed files, per-commit file tree and unified diffs.
- **Behavior spec:** upstream Git Extensions WinForms (`src/app/GitUI`) defines
  *what* the app does. PowerGit re-imagines *how it looks* (Material chrome).
- **Cross-platform:** Windows first, Linux target; shipped as portable
  `.zip` (Windows) and `.AppImage` (Linux).

## Architecture

```
frontend/            React + Vite + MUI (UI), Tauri shell in frontend/src-tauri
src/engine/          PowerGit.Engine — net10.0 Kestrel git host (HTTP sidecar)
src/app/             upstream Git Extensions sources (behavioral reference)
docs/srs/            ASPICE-style requirements
docs/agents/         agent memories and context
PLAN.md              operational plan (roadmap + status)
PRD.md               product requirements
```

All git I/O goes through the C# engine (`http://127.0.0.1:7733`); the UI never
shells out to git.

## Development (Windows)

```bash
# engine
dotnet test src/engine/PowerGit.Engine.sln
dotnet run --project src/engine/PowerGit.Engine --urls http://127.0.0.1:7733

# UI (from frontend/)
npm install
npm run dev          # Vite on http://127.0.0.1:1420
npm run dev:all      # engine + Vite
npm run test:e2e     # Playwright assertions (default proof)
npm run tauri dev    # native window
```

## History note

This repository is a fork of Git Extensions. The `master` branch preserves the
upstream history (pinned at `7f75cee29`) as the behavioral reference. The
`powergit` branch carries only PowerGit's own history: documentation first,
then product code.

## License

GPL-3.0 — this is a combined work with Git Extensions. See [LICENSE.md](LICENSE.md).
