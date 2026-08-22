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
### v0.4.10 — Visual polish, resolutions, Linux check (2026-08-21) (COMPLETE)
> Polish + infrastructure: menu typography, commit-dialog row unification, graph offset, GE app icon, multi-resolution visual test suite, Docker Ubuntu check, regular pushes.
**Goal:** Fix menu/dialog visual defects, take over the GE app icon, and establish resolution + Linux verification so layout bugs (e.g. fullscreen clipping) are caught automatically.
- [x] v0.4.10-1: right-click menus — app font + compact size (theme-level)
- [x] v0.4.10-2: commit dialog rows unified on CompactFileList (kill offset divergence)
- [x] v0.4.10-3: graph left padding inside rounded container
- [x] v0.4.10-4: GE app icon for Tauri build
- [x] v0.4.10-5: multi-resolution e2e suite incl. fullscreen clipping check
- [x] v0.4.10-6: Docker Ubuntu smoke (engine + UI + e2e headless)
## v0.5 — Welcome / home (parked)
Recent repos with diff stats, Open, Clone.

### v0.5.1 — Engine sidecar spawn (2026-08-21) (COMPLETE)
> Make shipped builds self-sufficient: bundle the engine as a Tauri sidecar spawned at startup, so end users don't need to run anything manually.
**Goal:** Engine auto-start inside the packaged app (sidecar), verified by a real release build smoke test.
- [x] v0.5.1-1: publish engine as self-contained single-file exe into src-tauri/binaries with target-triple name
- [x] v0.5.1-2: tauri externalBin + shell plugin + Rust startup spawn on :7733
- [x] v0.5.1-3: release build smoke — packaged app spawns engine, health ok, no manual steps
### v0.5.2 — Windows artifacts (2026-08-21) (COMPLETE)
> One-command Windows artifact: portable zip (app + sidecar engine) plus the NSIS installer, versioned from tauri.conf.json.
**Goal:** scripts/package-windows.ps1 produces distributable, self-sufficient Windows artifacts.
- [x] package-windows.ps1: portable zip + NSIS installer, zip smoke-verified self-sufficient
### v0.5.3 — Release pipeline (2026-08-21) (COMPLETE)
> Tag-triggered GitHub Actions workflow producing Windows zip/installer and Linux AppImage/deb, attached to a GitHub release.
**Goal:** Pushing a vX.Y.Z tag builds and attaches release binaries for both platforms.
- [x] release.yml: windows (zip+installer) + linux (AppImage+deb) jobs, sidecar sh script
### v0.5.4 — Pages showcase (2026-08-21) (COMPLETE)
> GitHub Pages showcase: captured screenshots, static site, auto-deploy workflow.
**Goal:** docs/site deployed to GitHub Pages on push, showing real feature screenshots from real builds.
- [x] showcase site + screenshots + pages.yml deploy workflow
### v0.5.5 — Release skill (2026-08-21) (COMPLETE)
> release skill registered for opencode (.opencode/skills) and claude (.claude/skills): preflight, version bump, artifacts, tag, notes, Pages refresh.
**Goal:** Any agent can cut a release by following the skill.
- [x] release skill in .opencode/skills and .claude/skills
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
  session deltas.
- New orphan branch `powergit`: commit 1 = docs only, commit 2 = engine +
  frontend + tooling. `master` keeps full GitExtensions history as reference.
- First Tauri release build + launch smoke passed.

- Component/UI test coverage: stash flow, gitignore preview dialog, commit-dialog multi-select semantics, remote config dialog, blob viewer content
- Security: restrict engine CORS to known origins (tauri://localhost, http://tauri.localhost, dev server) and/or add a startup-generated token the frontend must send — blocks drive-by POSTs from random websites to 127.0.0.1:7733
- Reproduce fullscreen clipping in Tauri window: need owner screen resolution + DPI scaling %; CSS overflow hardening already in place
## v0.5 — Release track
- [ ] GitHub Pages showcase site: new features + visuals screenshots
- [ ] Release skill for opencode and claude agents (.opencode/skills + .claude/skills): how to cut a release, update Pages visuals and main README
- [ ] Build and attach binaries to GitHub releases (Windows portable zip, Linux AppImage)
### v0.6.1 — README scope rewrite (2026-08-22) (COMPLETE)
> Rewrite README to state the fork's scope crisply: a new, modern, portable, cross-platform frontend for Git Extensions.
**Goal:** A visitor understands within seconds what PowerGit is, what it is not yet, and why it exists.
- [x] README: scope-first rewrite (modern/portable/cross-platform frontend for GitExtensions)
### v0.6.2 — React showcase site (2026-08-22) (COMPLETE)
> Replace the static HTML page with a Vite + React site: hero, feature cards, screenshot gallery.
**Goal:** docs/site replaced by a React webapp under website/, built in CI and deployed to Pages.
- [x] website/: Vite+React+MUI hero site (features, screens)
- [x] pages.yml builds website + demo bundle, deploys combined artifact
### v0.6.3 — Live demo embed (2026-08-22) (COMPLETE)
> Embed the real PowerGit frontend (built with a /demo/ base path) in an iframe — it renders the revision graph from its built-in synthetic history when no engine is present, so visitors interact with the actual UI, not a video.
**Goal:** Live interactive demo of the real UI on the Pages site.
- [x] demo: real frontend built at /demo/ base, iframe embed with sample-data notice
