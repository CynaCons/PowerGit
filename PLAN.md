# PowerGit

**Goal:** Git Extensions Browse as React + Tauri, C# git engine sidecar, Windows + Linux. Dev on Windows. Ship `.zip` portable (Windows) and `.AppImage` (Linux).

**Philosophy:** Git Extensions is the *behavior* spec, not the visual spec. Material React chrome. Plan → design → code → e2e → update this file. After v0.3, each UI piece gets an owner design demo (on request).

**Verify:** `npm run test:e2e` once (no retries, stop at first fail, no screenshots). `test:visual` / Chrome shots only when the owner asks. See `AGENTS.md` → How we verify.

**Upstream pin:** `7f75cee29`

---

## Current Status

**Active:** v0.4.7 — owner-review punch list (2026-08-21). v0.4.0–0.4.6 landed; Browse review named the defects below.

Live: UI `http://127.0.0.1:1420` · engine `http://127.0.0.1:7733`

Each v0.4.x: design → code → e2e. Do not start v0.5 until this punch list is done and the owner re-reviews.

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

### v0.4.7 — Owner review punch list (2026-08-21) (COMPLETE)

Settings
- [x] Field labels clipped in the settings panel (titles unreadable)

Main Browse
- [x] Graph / main card too round — smaller Material radius, not pill-like
- [x] Bottom panel resizable (drag splitter vs the revision grid)

Left panel
- [x] Real tree, not a flat/fake list: hierarchy, expand/collapse, nested remotes and tags as tree nodes

Commit overlay
- [x] Current popup overlaps, clips, and does not match Git Extensions FormCommit. Rebuild the *layout* of the original commit window (unstaged | staged | diff | message). Material chrome only — do not restyle WinForms, do match the arrangement.

Bottom panel
- [x] Per-commit **file tree** of the repo at that revision (GE File tree), not only a flat change list
- [x] Files and diff in a **left–right split** (GE split). Tabs-only stacked view is not enough
- [x] Diff colors match Git Extensions (add / remove / header / hunk). Do not invent a new palette

Graph context menu
- [x] Right-click on a revision/ref is missing. Add the Git Extensions basics: Checkout Branch, Reset branch, Rebase. Behaviour identical to Git Extensions (`RevisionGridMenuCommands` / FormCheckoutBranch, FormResetCurrentBranch, FormRebase) — same guards, prompts, and git operations. Material menu chrome only.

### v0.4.8 — Owner review punch list #2 (2026-08-21) (COMPLETE)
> Owner feedback round 2: appbar/navrail integration, full ref graph with GE colors, real file tree with blob viewing, floating diff-options toolbar, commit-dialog selection overhaul with file context menu + gitignore preview, GE-style left tree, author highlight. Stash handling planned for v0.4.9.
- [x] v0.4.8-1: AppBar visually integrated with navrail (single continuous chrome)
- [x] v0.4.8-2: graph always shows all local branches + tags, GE lane colors
- [x] v0.4.8-3: bottom panel resize — full-width visible splitter
- [x] v0.4.8-4: File Tree tab = full repo tree at commit; open unchanged files via new engine blob endpoint
- [x] v0.4.8-5: floating diff-options bar (context lines / full file / ignore whitespace), compact-on-idle, in commit dialog + bottom panel diff; engine diff options
- [x] v0.4.8-6: commit dialog multi-select (shift/ctrl, no text selection), stage/unstage selection
- [x] v0.4.8-7: right-click menu on staged/unstaged lists: stage/unstage/delete/add-to-gitignore; gitignore preview dialog with match count
- [x] v0.4.8-8: left tree GE look — icons per ref type, bold current branch
- [x] v0.4.8-9: author highlight — selecting a commit tints other commits by same author
- [x] v0.4.8-10: left tree right-click menus per element type — branch (checkout/delete), remote (fetch/configure), tag (checkout/delete), submodule (open); engine ops behind them
### v0.4.9 — Stash handling (2026-08-21) (COMPLETE)
> Final 0.4.x iteration: GE-parity stash handling — engine stash ops, stashes visible in graph, topbar mini menu + manage dialog.
**Goal:** Stash handling at Git Extensions parity: stash/apply/pop/drop from the UI, stashes visible in the revision graph, FormStash-style management dialog.
- [x] v0.4.9-1: engine stash ops — GET /stashes, POST /stash, /stash/apply, /stash/drop + tests
- [x] v0.4.9-2: stashes as graph nodes (include refs/stash in revisions) + distinct ref chip
- [x] v0.4.9-3: topbar Stash mini menu + FormStash-style manage dialog (list, stash w/ message+options, apply/pop/drop)
## v0.5 — Welcome / home (parked)
Recent repos with diff stats, Open, Clone.

## Later
- Fetch / Pull / Push
- Design-demo step/pause bar (opt-in `npm run test:demo`)
- Visual screenshot suite (`npm run test:visual`, owner-triggered)
- Tauri sidecar spawn; zip / AppImage
- Dark theme; stashes/worktrees
- Extract GitCommands

## Backlog
- Drop leftover 2021 origin branches
### Branch restructure + first Tauri build (2026-08-21)

- Local worktree was accidentally reset to the upstream pin; recovered via
  `git fetch` + fast-forward to `origin/master`, then re-applied the v0.4.7
  session deltas. Verified: engine tests 17/17, e2e 10/10.
- New orphan branch `powergit`: commit 1 = docs only (README rewritten for
  PowerGit, PRD, PLAN, SRS, agent guides, license), commit 2 = engine +
  frontend + tooling. `master` keeps full GitExtensions history as reference.
- First Tauri release build: `frontend/src-tauri/target/release/powergit.exe`
  and NSIS installer `PowerGit_0.3.0_x64-setup.exe`. Launch smoke passed
  (app process alive, engine health ok). Nothing pushed yet.
- v0.4.9 — stash handling: stash panel + topbar mini menu, stash/pending-changes nodes in graph (GE parity)
