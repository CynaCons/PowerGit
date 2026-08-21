# PowerGit — Product Requirements

**One-liner:** Git Extensions' workflow and layout, rebuilt as a React UI inside a Tauri shell, talking to the existing C# git engine — so the client finally runs well on Linux (and stays native on Windows and macOS).

**Home:** [github.com/CynaCons/PowerGit](https://github.com/CynaCons/PowerGit), a GPL-3.0 fork of [Git Extensions](https://github.com/gitextensions/gitextensions).

Status: PRD 2026-08-20 — see [PLAN.md](PLAN.md) for the build plan. Requirements live in [docs/srs/](docs/srs/).

---

## 1. Problem

Git Extensions is an outstanding Git GUI. The revision graph, the bottom commit/diff panel, the left repo tree (branches, remotes, submodules), and the commit overlay are the reason people stay. It is also a WinForms app on `net10.0-windows`. It does not run well on Linux. That is the whole gap.

PowerGit does **not** invent a new Git workflow. It changes the presentation layer and the packaging so the same product can live on Linux.

## 2. Users

- **The Git Extensions user on Linux** (primary): needs the graph, the diff panel, remotes/submodules, and a fast commit overlay. Not the Visual Studio plugin, not Explorer integration, not every plugin.
- **The same user on Windows / macOS:** one binary family, same UI.
- **The human developer of PowerGit:** reads PLAN.md, arbitrates scope.
- **Coordinator and worker agents:** operate PLAN.md through powerplan; spawn through PowerSpawn; keep memories in `docs/agents/`.

## 3. Product principles

1. **Git Extensions is the behavior spec, not the visual spec.** Keep the Browse information architecture (toolbar, left tree, revision graph, commit details). The chrome is a modern React/MUI app: nav rail, card panels, portable web UI. Do not copy WinForms look.
2. **Subset, not clone-everything.** Features ship when the user names them. Unnamed Git Extensions features are out of scope until they are pulled in.
3. **Keep the C# git brain.** Do not reimplement `git log` parsing, rebase, submodule, encoding, or mergetool in TypeScript or Rust. Wrap `GitCommands`.
4. **Linux is a first-class runtime**, not a Mono afterthought. Engine target is `net10.0` (no `-windows`). UI is the webview, not WinForms.
5. **System git, not a bundled git.** Same contract as Git Extensions: `git` on PATH.
6. **Single writer for the plan.** PLAN.md mutations go through powerplan. Evidence or it didn't happen is a process rule, not an MCP parameter.

## 4. Decision: keep C# on Linux

**.NET 10 runs on Linux. Git on Linux is the same CLI Git Extensions already shells out to.** C# is not the portability problem. WinForms is.

What we keep:

- `GitCommands` / `GitModule` / `RevisionReader` — process git, parse revisions, diffs, remotes, submodules.
- The revision-graph **model** (`RevisionGraph`, lanes, segments) currently sitting under `src/app/GitUI/UserControls/RevisionGrid/Graph/`. React renders; C# still owns lane assignment unless a later spike proves a TS port is cheaper.

What we do not take to Linux as-is:

- `net10.0-windows` + global `UseWindowsForms` in `Directory.Build.props`
- WinForms `GitUI`, ConEmu, Explorer shell extension, PuTTY dialogs, `AdysTech.CredentialManager`, `Application.UserAppDataPath`

Packaging: **Tauri hosts React; C# runs as a sidecar** (local HTTP or stdio JSON-RPC). Tauri does windows, installers, and OS chrome. The sidecar is `PowerGit.Engine`, `net10.0`, self-contained publish per OS.

Rejected alternatives:

| Alternative | Why not |
|---|---|
| Rewrite the git layer in Rust/TS | Throws away 15 years of porcelain, encodings, and edge cases. The graph *data* is the hard part; `RevisionReader` already solved it. |
| Photino / WebView2 hosted by C# (no Tauri) | Simpler process model, but the distribution target is Tauri. React stays swappable if sidecar pain forces a revisit. |
| Keep WinForms, try it on Linux | Upstream already marks next version Windows-only. That is the bug we are forking to fix. |

## 5. Product shape (v1)

```
┌──────────────────────────────────────────────────────────┐
│  Tauri (Rust) — window, menus, sidecar lifetime, install │
│  ┌────────────────────────────────────────────────────┐  │
│  │ React — Git Extensions Browse layout               │  │
│  │  navrail │ left tree │ toolbar                     │  │
│  │          │           │ revision graph + grid       │  │
│  │          │           │ commit details + diff       │  │
│  │          │           │ commit overlay (on demand)  │  │
│  └───────────────────────┬────────────────────────────┘  │
│                          │ invoke / events               │
│  ┌───────────────────────▼────────────────────────────┐  │
│  │ PowerGit.Engine (C#, net10.0 sidecar)              │  │
│  │ GitModule, RevisionReader, RevisionGraph, remotes  │  │
│  └───────────────────────┬────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────┘
                           │ process
                           ▼
                          git
```

### In scope (named by the user)

1. **Revision graph + grid** — branch visualization, the main reason to open the app.
2. **Bottom panel** — selected commit details and inline diff review.
3. **Top toolbar + commit overlay** — write the commit message the Git Extensions way (popup/overlay, not a separate philosophy).
4. **Left panel** — remotes, branches, submodules; double-click a submodule to open it.
5. **Navrail (new)** — switch between recent / open repositories. Replaces the awkward repo-switcher rather than copying it.

### Explicitly out of v1

Visual Studio / VS Code VSIX, Windows Explorer shell extension, ConEmu console, plugin gallery (GitHub, Gource, statistics, build servers, …), translations, installer feature-parity with the WiX setup, "open in Visual Studio", sparse-checkout UI, git-gui mergetool hosting beyond "call the configured tool".

## 6. Users' jobs

- Open a repo (from navrail, recent list, or folder picker) and see the graph in under a couple of seconds on a mid-size repo.
- Select a commit, read the message, review the file list, open a diff in the bottom panel.
- Stage, write a message, commit from the overlay.
- Fetch/pull/push from the toolbar (minimum git verbs around the graph).
- Inspect remotes and submodules; open a submodule as the active repo.
- Switch repo from the navrail without a dashboard detour.

## 7. Stack

| Layer | Choice |
|---|---|
| UI | React + TypeScript + Vite |
| Shell | Tauri 2 |
| Git engine | C# / .NET 10 (`net10.0`) sidecar. v0.2 is a thin git host; GitCommands extract follows |
| Git binary | System `git` on PATH |
| Dev | Windows. UI is the same on Windows and Linux |
| Ship | Portable `.zip` (Windows), `.AppImage` (Linux) |
| Agent methodology | PowerSpawn + powerplan MCP, PLAN.md, SRS, `docs/agents/` |
| License | GPL-3.0 (inherited) |

## 8. Quality bar

- Linux, Windows, and macOS are all launch targets. Linux is the one we will actually dogfood first after the Windows dev loop works.
- Graph must *feel* like Git Extensions (lane colours, refs on commits, artificial working-directory / index rows), not like a generic vis.js tree.
- Engine never talks to the DOM. UI never shells out to git except through the engine (or a documented exception).
- Smoke: app launches without crash on the current platform before an iteration is called complete.

## 9. Documents

| Doc | Role |
|---|---|
| [PLAN.md](PLAN.md) | Operational plan (powerplan) |
| [AGENTS.md](AGENTS.md) | Shared agent briefing |
| [docs/srs/](docs/srs/) | ASPICE-style requirements per feature |
| [docs/agents/](docs/agents/) | Durable agent memories and context |
| Upstream README | Git Extensions history; rewrite when the new UI is real |
