# PowerGit

**Goal:** Git Extensions Browse as React + Tauri, C# git engine sidecar, Windows + Linux. Dev on Windows. Ship `.zip` portable (Windows) and `.AppImage` (Linux).

**Philosophy:** Git Extensions is the *behavior* spec, not the visual spec. Material React chrome. Plan → design → code → e2e → update this file. After v0.3, each UI piece gets an owner design demo (on request).

**Verify:** `npm run test:e2e` once (no retries, stop at first fail, no screenshots). `test:visual` / Chrome shots only when the owner asks. See `AGENTS.md` → How we verify.

**Upstream pin:** `7f75cee29`

---

## Current Status

**Active:** v0.4 series complete for owner review (SHA, live git, bottom panel, tree, settings, VS Code, commit overlay, recents).

Live: UI `http://127.0.0.1:1420` · engine `http://127.0.0.1:7733`

Each v0.4.x: design → code → e2e. Owner reviews the whole 0.4 series when this pass completes.

---

## v0.0 — Fork (COMPLETE 2026-08-20)
- [x] Clone latest Git Extensions + submodules; GitHub fork synced

## v0.1 — Methodology (COMPLETE 2026-08-20)
- [x] PRD, AGENTS, CLAUDE, SRS, PowerSpawn/powerplan

## v0.2 — Engine sidecar (COMPLETE 2026-08-20)
- [x] `net10.0` Kestrel git host: health, open, current

## v0.3 — App scaffold (COMPLETE 2026-08-20)
- [x] Tauri + React Material shell, GE graph, hover fix

## v0.4 — Browse product

### v0.4.0 — Mini SHA-1 + live revision stream (COMPLETE)
- [x] Engine `GET /revisions` (`--topo-order --branches`, not `--all`/`--tags` so stale remotes don’t scatter the graph)
- [x] Graph from real `git log`; SHA-1 column (~7 chars)
- [x] E2e: sha-cell visible

### v0.4.1 — Bottom panel (COMPLETE)
- [x] Engine commit detail, name-status files, unified diff
- [x] Commit / Files / Diff tabs; file click loads diff
- [x] E2e: files tab visible

### v0.4.2 — Left panel repo-objects tree (COMPLETE)
- [x] Branches, Remotes, Tags, Submodules from engine
- [x] Current branch highlighted; click selects tip in graph

### v0.4.3 — Settings (COMPLETE)
- [x] Gear on navrail; `user.name`, `user.email`, `core.autocrlf`
- [x] E2e: settings dialog opens

### v0.4.4 — VS Code default tools (COMPLETE)
- [x] Auto-detect VS Code; settings Apply for editor/diff/merge

### v0.4.5 — Commit badge + overlay (COMPLETE)
- [x] Dirty count badge; unstaged/staged lists; stage click; commit needs staged+subject

### v0.4.6 — Navrail recents picker (COMPLETE)
- [x] History icon; card overlay (title, path, branch); persist recents.json

## v0.5 — Welcome / home (parked)
Recent repos with diff stats, Open, Clone.

## Later
- Graph context menu
- Fetch / Pull / Push
- Design-demo step/pause bar (opt-in `npm run test:demo`)
- Visual screenshot suite (`npm run test:visual`, owner-triggered)
- Tauri sidecar spawn; zip / AppImage
- Dark theme; stashes/worktrees
- Extract GitCommands

## Backlog
- Drop leftover 2021 origin branches
