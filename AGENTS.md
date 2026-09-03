# Agent Instructions

These instructions are the shared source for every coding agent on PowerGit.
Codex and Copilot load `AGENTS.md` from the repo root. Claude loads
`CLAUDE.md`, which is a shim that points here — do not duplicate guidance.

You are working on **PowerGit**: a GPL-3.0 fork of Git Extensions. New UI is
React inside Tauri. Git logic stays in C# (`PowerGit.Engine` sidecar, `net10.0`).
Read [PRD.md](PRD.md) before inventing product behaviour.

## Project shape

```
frontend/                # React + Vite + MUI UI (src/), Playwright suites (tests/)
frontend/src-tauri/      # Tauri shell: spawns the engine sidecar, hands it url+token
src/engine/              # headless C# git host, net10.0, no WinForms (+ xunit tests)
website/                 # GitHub Pages showcase + live demo build
docker/ubuntu-check/     # Linux (WebKitGTK) harness, run via scripts/ubuntu-check.ps1
scripts/                 # sidecar build, Windows packaging, Linux check
docs/srs/                # ASPICE-style requirements (what)
docs/agents/             # agent memories and context (living)
powerspawn/              # PowerSpawn MCP + nested powerplan (submodule)
.claude/skills/ .opencode/skills/  # release skill (kept identical)
PLAN.md                  # operational plan — powerplan is the only writer
PRD.md                   # product requirements
```

## Branches

- `powergit` (default) is the product. It carries none of the upstream tree.
- `master` is the untouched Git Extensions mirror at the upstream pin. It is
  an ancestor of `powergit` (connected with an "ours" merge in v0.13.1) so
  diffs and PRs between the two work; never merge it forward for content.
- The behavioural reference (`GitCommands`, `GitUI`, the `Graph/` lane model)
  is read from a sibling worktree, not from this checkout:

  ```bash
  git worktree add ../gitextensions-ref master
  ```

  Read it, cite it, port from it deliberately. Never copy GE files into this
  branch and never add features to the WinForms app.

## Commands

PowerGit UI and engine (dev on Windows). Prefer the user-local .NET 10 SDK
(`%LOCALAPPDATA%\Microsoft\dotnet`) if `dotnet --list-sdks` is empty.

```bash
# engine
dotnet test src/engine/PowerGit.Engine.sln
dotnet run --project src/engine/PowerGit.Engine --urls http://127.0.0.1:7733

# UI (from frontend/)
npm run dev               # Vite http://127.0.0.1:1420
npm run dev:all           # engine + Vite
npm run test:unit         # graph layout + 10k perf
npm run test:e2e          # headless Playwright assertions (default proof)
npm run test:resolution   # layout at 5 viewports up to 4K fullscreen
npm run test:live         # probe the deployed Pages site renders + demo draws
npm run test:perf         # heavy-repo perf budgets (50k commits, 2500 refs; builds the fixture on first run)
npm run test:visual       # pixel diffs — only when the owner asks
npm run test:demo         # slow headed owner walkthrough — only when asked
npm run tauri dev         # native window (needs engine running for health)
```

`test:e2e:debug` exists for headed debugging while writing a test.

## How we verify (token budget)

Default proof is **Playwright e2e assertions**, not screenshots.

- Run `npm run test:e2e` **once** after a UI change. If it fails, do not run it again. Read the first error, fix, then run once.
- Do **not** call Chrome DevTools `take_screenshot` / `take_snapshot` unless the owner asked to look, or pasted a screenshot. Those images re-enter the chat and dominate the context window.
- Visual / pixel work is `npm run test:visual` (`tests/visual/`). Owner-triggered only.
- Owner design demo is `npm run test:demo`. Parked until asked.
- If the page is blank, read the browser console or Vite log first. Restart Vite on HMR/`ReferenceError`. Do not screenshot a white page.
- Never `list_dir` `frontend/` — it walks `node_modules` and `src-tauri/target`. Use `frontend/src`.
- Keep specs quiet once green: no `console.log`, no `page.pause`, no `waitForTimeout` in e2e. Use `test:e2e:debug` only while writing a test.
- E2e is configured `retries: 0`, `maxFailures: 1`, traces/screenshots/video off. Do not turn those back on to “be thorough”.

Upstream WinForms Git Extensions (reference only, see Branches):

```bash
dotnet build ../gitextensions-ref/GitExtensions.slnx
```

## Powerplan and PowerSpawn

- **powerplan** is the only sanctioned writer of `PLAN.md`. Direct edits are a
  process violation except when powerplan is not yet runnable (bootstrap).
- Every mutation tool takes optional `plan_path`; default is the nearest PLAN.md.
- Optional `agent` tag on mutations: `[agent: <id>]`.
- **PowerSpawn** is how the coordinator launches workers (`spawn_claude`,
  `spawn_codex`, `spawn_copilot`, `spawn_grok`, …).
- Register both MCP servers (see `.mcp.json`). They do not merge into one server.

## Who owns which files

| File | Owner |
|---|---|
| `PLAN.md` | Coordinator via powerplan |
| `PRD.md`, `docs/srs/*` | Coordinator (or a task that explicitly says so) |
| `AGENTS.md`, `CLAUDE.md` | Coordinator; workers may append a memory under `docs/agents/` |
| Product code | Workers, scoped to the task |

Workers **must not**:

- Edit `PLAN.md`, `PRD.md`, or SRS files unless the task says so.
- Commit, push, or rewrite git history.
- Edit anything under `../gitextensions-ref` (the reference is read-only).
- Shell out to `git` from React. All git I/O goes through the C# engine.

## Recursive improvement (memories)

Agents get smarter across sessions by writing markdown, not by hoping the
context window remembers.

1. **Read** `docs/agents/README.md` and any file in `docs/agents/memories/` or
   `docs/agents/context/` that matches the task (graph, engine, sidecar, …).
2. **Use** that context. Do not rediscover the `net10.0-windows` trap from
   scratch every time.
3. **Write** a short memory when you learn something durable: a landmine, a
   mapping from Git Extensions type → new module, a Linux git quirk, a layout
   measurement. One fact per heading. No essays.
4. **Correct** a memory that is wrong. Stale memories are worse than none.

Naming: `docs/agents/memories/<topic>.md`, `docs/agents/context/<feature>.md`.
Do not put secrets there.

## Engineering rules

- GPL-3.0: this is a combined work with Git Extensions. No proprietary
  relicensing. New files belong in this tree under the same license.
- Match Git Extensions behaviour unless an SRS says otherwise. The graph is
  the product; a pretty-but-wrong lane layout is a defect.
- Engine target is `net10.0` (Linux-capable). Do not take a dependency that
  forces `net10.0-windows` or `UseWindowsForms` into the sidecar.
- UI is React + TypeScript. No WinForms in the new frontend.
- Evidence or it didn't happen: before calling work complete, run the relevant
  smoke (engine test, `npm run tauri dev` / `npm run dev`) and
  put the proof in the worker report.
- Keep diffs small. Do not reformat files you are not changing.

## Reporting

Return a coordinator-usable report: what changed (paths), how it was verified,
what is still open, which memory files you added or updated.

## Additions since v0.4 (current reality)

- website/ — React showcase site deployed to GitHub Pages (workflow:
  .github/workflows/pages.yml). The live demo at /PowerGit/demo/ is the
  real frontend built with a /PowerGit/demo/ Vite base; it renders its
  built-in synthetic history when no engine is reachable.
- Screenshots: canonical location is website/public/assets/. Regenerate with
  `node frontend/scripts/capture-showcase.mjs` (needs a live engine).
  Do not write screenshots anywhere else.
- Packaging & release: see the `release` skill (.opencode/skills/release/
  and .claude/skills/release/). Key scripts: scripts/build-engine-sidecar.ps1|.sh,
  scripts/package-windows.ps1, tag-triggered .github/workflows/release.yml.
- Engine URL is overridable with VITE_ENGINE_URL for dev/demo setups
  (default http://127.0.0.1:7733).
- Engine auth (v0.13.0): every request needs `Authorization: Bearer <token>`.
  Dev shares `frontend/.engine-token` between engine.ps1 and Vite; specs and
  scripts import `tests/engine.ts`. A bare `dotnet run` must get
  `POWERGIT_ENGINE_TOKEN`. See docs/agents/memories/engine-token.md.
- Linux smoke check: pwsh scripts/ubuntu-check.ps1 (requires Docker Desktop).
