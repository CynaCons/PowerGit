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
- Fetch / Pull / Push **dialogs** (buttons are wired to engine `/fetch`, `/pull`, `/push` since v0.6.4; richer dialogs later)
- Design-demo step/pause bar (opt-in `npm run test:demo`)
- Visual screenshot suite (`npm run test:visual`, owner-triggered)
- Dark theme; worktrees
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
- [ ] Hotkeys Slice 2–4: commit pane-focus/stage-all chords, grid parent/child/go-to, remapping UI (parked from v0.11.0) [agent: grok]
- UI zoom: Ctrl+= / Ctrl+- to scale the whole app, persisted (audit B.15; all sizes are fixed px today).
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
### v0.6.4 — Remaining cleanup sweep (2026-08-22) (COMPLETE)
> Sweep up everything left from the repo analysis: sync engine version constant, promote the live-demo probe to a proper script, refresh stale PLAN "Later" list and AGENTS commands, then a full packaged-build verification pass.
**Goal:** No known loose ends left in the repository outside explicitly backlogged items.
- [x] sync engineVersion constant with release version (drifted at 0.4.0)
- [x] check-live-demo.cjs -> npm run test:live, documented in release skill post-deploy step
- [x] refresh PLAN Later list + AGENTS commands (sidecar/packaging/stashes now shipped)
- [x] full verification: engine tests, e2e, resolution, unit, packaged-build smoke
### v0.7.0 — File Tree correctness + GE-style command bars (planned) (2026-08-24) (COMPLETE)
**Goal:** Fix nested File Tree browsing (files invisible below depth 1), close the e2e coverage gap that missed it, and bring the topbar split-buttons and revision context menu closer to Git Extensions design fidelity.
- [x] Engine: normalize ListTree (GitHost.Queries.cs) so entry `name` is relative to the requested directory — strip the path prefix git ls-tree emits when `path` is passed; add engine test asserting nested fetch of docs/srs returns bare basenames
- [x] UI: fix CommitFileTree child path/label building to match normalized DTO; verify blob pane opens files at depth >= 2
- [x] E2E coverage: new spec that expands nested directories in the File Tree tab (e.g. frontend -> components) and asserts file rows render; must fail on the pre-fix engine
- [x] Topbar: Git Extensions-style split buttons (icon + dropdown caret) for Commit / Stash / Fetch / Pull / Push, with secondary actions (amend, force push variants, manage stashes) in the dropdown menus; match GE iconography and ordering
- [x] Revision context menu: expand toward GE parity (create branch/tag here, copy SHA, cherry-pick/revert placeholders as feasible); keep existing checkout/reset/rebase entries and testids stable
- [x] Verification: dotnet test src/engine/PowerGit.Engine.sln + npm run test:e2e green; smoke npm run dev once
### v0.8.0 — Large-repo responsiveness + owner feedback #3 (2026-08-24) (COMPLETE)
> Owner feedback 2026-08-24: (1) show a progress indicator in the top app bar during fetch/pull/push; (2) fonts on Ubuntu AppImage look low-quality and too grey; (3) not all branches are visible by default — want Git Extensions behaviour, not just checked-out branches; (4) repos may be very heavy — never block the UI on engine responses (e.g. branch list); data must load dynamically and live-refresh; (5) visuals must scale with large projects; (6) navrail is too wide; (7) overall: on large projects the app is unusable/too laggy.
Code findings behind the feedback: fetch/pull/push are synchronous blocking POSTs (GitHost.Operations.cs, RunTimed up to 300 s) with only a boolean `busy` flag; App.tsx refreshRepo awaits Promise.all(revisions+refs+status) before anything renders; layoutGraph re-runs fully over all rows synchronously on every revisions change (main thread); Inter/Fira Code load from Google Fonts CDN via a media="print" onload trick that yields fallback system fonts when offline/blocked (packaged AppImage) and theme greys (#737373 secondary text) are light for Linux rasterizers; navrail is fixed 64 px.
**Goal:** On heavy repositories PowerGit stays fluid: no UI blocking on engine calls, every long git operation shows progress in the top bar, all branches are visible by default (GE parity), and typography/contrast/navrail feel desktop-quality on Windows and Linux.
- [x] Engine job model for network ops: POST /fetch, /pull, /push return a jobId immediately and run detached (300 s cap kept); GET /jobs/{id} reports running/done/error + captured output (poll or SSE); existing sync behaviour covered by tests; + engine tests
- [x] Topbar progress indicator: centered LinearProgress + operation label (Fetching…/Pulling…/Pushing…) in the AppBar driven by job state; buttons stay enabled for unrelated actions; errors surface as today
- [x] Non-blocking data loading: render the shell immediately at boot; revisions / refs / status / stashes load independently (kill the Promise.all in refreshRepo) with per-panel skeletons; refreshes use stale-while-revalidate (keep showing old data until new arrives); no dialog or grid ever waits on the engine to become interactive
- [x] All branches visible by default (GE parity): engine /revisions includes every local AND remote-tracking branch tip + tags (+stash), passing explicit tips to git log so the -n cap can never hide a branch tip; left tree shows all branches expanded as today; owner override of the v0.4.0 stale-remotes decision
- [x] Graph layout off the main thread: move/extend layoutGraph to a Web Worker (or incremental append-only layout) so 10k+ commits never block interaction; avoid full re-layout on selection/hover; keep lane output byte-identical (unit tests + existing layout.test.ts must pass unchanged)
- [x] Large-scale render audit + perf budget: extend the 10k unit perf test into a real budget; e2e spec on a large synthetic history asserting scroll + row-select stay responsive (no multi-frame stalls); tune virtualizer overscan/memoization as needed
- [x] Self-hosted fonts + contrast: bundle Inter and Fira Code woff2 in frontend assets, drop the Google Fonts CDN link (offline AppImage currently falls back to poor system rasterization); darken text.secondary/divider greys in theme.ts so text stops looking washed-out on Linux; verify in packaged build
- [x] Navrail slimming: reduce fixed width 64 px → 48 px (icon buttons compact), keep tooltips and testids stable
- [x] Verification: dotnet test engine sln + npm run test:unit + npm run test:e2e green; smoke npm run dev once; manual large-repo check (owner-provided heavy repo if available)
### v0.9.0 — Linux AppImage runtime hardening (2026-08-24) (COMPLETE)
> Owner report from the GitHub-release AppImage on Ubuntu: "libgvfscommon.so: undefined symbol: g_task_set_static_name" (needs GLib ≥ 2.76), failed loads of libgvfsdbus.so / libdconfsettings.so / libgioremote-volume-monitor.so ("g_assertion_message_cmpint" undefined — same GLib family), "libcurl-gnutls.so: undefined symbol nghttp2_option_set_no_rc_9113_leading_and_trailing_ws_validation" (nghttp2 ≥ ~1.50), and an atk-bridge unknown-signature warning.
Root cause analysis: linuxdeploy bundles GIO modules (gvfs, dconf) and libcurl-gnutls that were built against newer GLib/nghttp2 than the versions they bind to at runtime (the host's system stack pulled in by webkit2gtk). Non-fatal but degrades native file dialogs (no gvfs), GTK settings persistence (no dconf), and pollutes stderr on first run.
**Goal:** The released AppImage launches on stock Ubuntu with zero GLib/GIO/curl module errors: bundled libraries must never conflict with the host system stack that webkit2gtk already guarantees.
- [x] Reproduce + inspect bundle: build the AppImage, list bundled gio/modules (gvfs, dconf), libcurl-gnutls and their GLib/nghttp2 versions; confirm the symbol-mismatch diagnosis against the owner's stderr report
- [x] Fix bundling: exclude the host-provided stack from the AppImage (GIO/gvfs/dconf modules, libcurl-gnutls + its nghttp2 chain — webkit2gtk deps already guarantee them on target distros); wire exclusion flags into the linux release job (release.yml / sidecar scripts) and document them
- [x] Regression guard: extend scripts/ubuntu-check.ps1 (Docker) and/or the release CI job to launch the AppImage headless and fail on any "undefined symbol" or "Failed to load module" stderr line; silence residual atk-bridge noise (NO_AT_BRIDGE=1) if still present
### v0.10.0 — Large-repo scalability for real (2026-08-24) (COMPLETE)
> Re-delivers what v0.8.0/v0.9.0 checked off but did not achieve. Root findings: /revisions passes every ref as argv (breaks >~900 refs on Windows, slow topo walk re-run on every refresh); history hard-capped at 800 with no way to load more; clicking a branch whose tip is not loaded silently does nothing; RepoTree renders thousands of un-virtualized rows expanded; refreshRepo re-fetches everything after every action; sync ops (checkout/reset/rebase) give zero progress feedback; "Fetch all remotes" races the single-flight job guard; no live refresh at all; AppImage guard is a static 3-symbol scan, never launches the app. Owner emphasis: repos may have SO MANY branches they cannot all be shown — there must always be a way to find and see them (search/filter + jump-loads-history).
**Goal:** On a repo with 100k commits and thousands of branches, PowerGit stays fluid AND every branch is findable: /revisions is argv-safe and paged, history loads incrementally with append-only layout, the left tree is virtualized with a ref filter, jumping to any ref loads history until that ref is visible, all mutating ops show progress, repo data live-refreshes on .git changes, and the AppImage guard actually launches the app.
- [x] v0.10.0-1: Engine /revisions argv-safe + paged — replace explicit-tips argv with --branches --remotes --tags (+ refs/stash, + HEAD) so ref count can never exceed the Windows 32K command-line limit; add skip/max paging params; engine tests for paging and for a repo with 2000+ refs (generated in-test) [agent: claude]
- [x] v0.10.0-2: Incremental history loading — UI loads revisions in pages (first page fast, background auto-fill up to a ceiling), layout worker keeps state and appends rows without re-laying-out the prefix (full-run and append runs must produce identical rows; unit test proves it); grid shows a subtle loading tail indicator [agent: claude]
- [x] v0.10.0-3: Every branch findable (owner requirement) — left tree gets a filter/search box over ALL refs (branches/remotes/tags, uncapped for-each-ref data); clicking any ref whose tip is not yet in the loaded graph loads further pages until the tip is visible (with progress + graceful ceiling message) instead of silently doing nothing [agent: claude]
- [x] v0.10.0-4: RepoTree virtualization — flatten visible nodes and render via the existing virtualizer so thousands of refs cost only visible rows; remotes/tags sections auto-collapse above a threshold; keep tree-row testids and context menus working [agent: claude]
- [x] v0.10.0-5: Targeted refresh + stable selection — selection keyed by SHA (survives refresh), per-action refresh scope (status-only after stage, status+revisions+refs after commit/checkout, etc.) instead of the full 4-call sweep, debounce BottomPanel per-selection fetches [agent: claude]
- [x] v0.10.0-6: Progress feedback for all mutating ops — checkout/reset/rebase/stash-apply show the topbar busy indicator while running; fix "Fetch all remotes" to run sequentially against the single-flight job guard (currently guaranteed to error with >1 remote) [agent: claude]
- [x] v0.10.0-7: Live refresh (dropped v0.8.0 owner requirement) — engine watches .git metadata (HEAD, refs/, packed-refs, index) and exposes a change feed (SSE); UI subscribes, debounces, and triggers targeted refreshes so external git activity appears without user action; engine test for the watcher [agent: claude]
- [x] v0.10.0-8: Heavy-repo fixture + perf harness — script generates a synthetic repo (50k+ commits, 2000+ branches/tags) via git fast-import; opt-in npm run test:perf drives the real app against it asserting first-paint, scroll, ref-jump and filter latency budgets; documented in AGENTS.md [agent: claude]
- [x] v0.10.0-9: AppImage guard that actually guards — generalize inspect-appimage.sh symbol scan (ldd -r style unresolved-symbol check, not 3 hard-coded names), add a release.yml step that launches the AppImage headless (xvfb) and fails on "undefined symbol"/"Failed to load module" stderr; verification lands with the next tagged release [agent: claude]
- [x] v0.10.0-10: Verification — dotnet test engine sln, npm run test:unit, npm run test:e2e all green; smoke npm run dev once; test:perf run recorded against the heavy fixture [agent: claude]
> Note on v0.8.0/v0.9.0: several checked tasks delivered weaker artifacts than their text claims — the "large synthetic history" perf e2e runs against the small dev repo, and the v0.9.0 "launch headless" regression guard is a static 3-symbol scan that never launches the app. v0.10.0 supersedes those items; their checkboxes stand for what actually shipped, not the original task text.
## v0.11 — Git Extensions hotkeys
> Reintegrate Git Extensions keyboard shortcuts: catalog + dispatcher in React, GE default chords for actions PowerGit already has, commit-overlay S/U on selected files, grid arrow navigation (SRS-GRAPH-011). Unavailable GE commands stay unbound. Remapping UI last.

### v0.11.0 — Git Extensions hotkeys (2026-08-30) (COMPLETE)
> Slice 0 docs (SRS-hotkeys, agent memory) then Slice 1: TS catalog+dispatcher, Browse bindings, grid navigation (SRS-GRAPH-011), commit-overlay S/U. Later slices (commit pane-focus, grid parent/child, remapping UI) stay open.
**Goal:** On the Browse surface, Git Extensions default shortcuts fire the actions PowerGit already has. Grid arrow keys move selection. In the commit overlay, S/U stage/unstage the selected file(s) without stealing keystrokes from the message field.
- [x] v0.11.0-0: SRS-hotkeys.md (tag KEY) + register in docs/srs/README.md; agent memory docs/agents/memories/hotkeys.md [agent: grok]
- [x] v0.11.0-1: frontend/src/hotkeys/ catalog + parse + typing-guard + dispatcher + HotkeyHost; unit tests for GE default chords and S-vs-message-field [agent: grok]
- [x] v0.11.0-2: Browse bindings (commit/open/settings/fetch/pull/push/stash/create/checkout/rebase/focus/F5) + grid arrow/page/home/end (SRS-GRAPH-011) + shortcut captions on toolbar/menus [agent: grok]
- [x] v0.11.0-3: Commit overlay S/U on selected file(s) (multi-select); CompactFileList focusable; S types in the message field [agent: grok]
- [x] v0.11.0-4: Playwright e2e (arrows, Ctrl+Space, Ctrl+Comma, F5 no SPA reload, commit S/U + typing guard) + smoke npm run dev [agent: grok]
- [x] Later: Slice 2 commit pane-focus/stage-all, Slice 3 grid parent/child/go-to, Slice 4 remapping UI [agent: grok]
- [x] v0.11.0-5: Commit overlay always shows Stage / Stage all / Unstage / Unstage all (disabled when empty), matching FormCommit toolbarStaged — not selection-gated vanishing buttons [agent: grok]
- [x] v0.11.0-6: Commit overlay paper size is fixed (independent of selected file / diff length); lists and diff scroll inside. E2e: buttons visible + overlay box does not jump on file select [agent: grok]
### v0.12.0 — Owner feedback #4 — Linux AppImage review (2026-09-02) (COMPLETE)
**Goal:** Fix the defects the owner found running the v0.11.0 AppImage on Ubuntu: engine port collision on launch, graph missing other people's branches, unclear toolbar dropdown arrows, selected row indistinguishable from same-author rows, untracked file shows no diff, diff view renders ligatures instead of raw characters, red "string did not match" on fetch.
- [x] Engine port collision: AppImage crashes with "Failed to bind 127.0.0.1:7733 address already in use". Tauri must reuse an already-healthy engine or pick a free port, and kill the sidecar child on app exit.
- [x] Graph shows only the current branch: GE parity — all branches (local + remote) recently updated, ordered by date (--date-order), not one branch's topo chain filling the first page.
- [x] Top toolbar: icons closer to Git Extensions; dropdown arrows visually attached to their button (split-button grouping), not floating between neighbours.
- [x] Selected row highlight (Linux) is identical to the same-author highlight; selected row must be visibly distinct.
- [x] Untracked new file in commit view shows "no diff"; must show the full file as an added diff.
- [x] Diff view renders font ligatures (C++ "->" became an arrow); disable ligatures everywhere code is shown, raw characters only.
- [x] Fetch on Linux shows red "The string did not match the expected pattern" (WebKit DOMException); find the offending call and fix.
- [x] Tooling: powerplan submodule bumped to v0.7.2 (powerspawn already current).
### v0.12.1 — Owner feedback #5 — toolbar density + Linux author highlight (2026-09-02) (COMPLETE)
**Goal:** Toolbar buttons are too big: make the command bar compact (GE density). On Linux/WebKitGTK the same-author highlight makes rows disappear; fix with WebKit-safe CSS.
- [x] Toolbar too big: compact command bar (small buttons, tighter padding, 28-30px height, smaller icons/labels) at GE density.
- [x] Linux: same-author highlight makes rows disappear on WebKitGTK; make row highlight CSS/canvas WebKit-safe and keep text visible.
- [x] Bottom diff view: file list panel resizable (drag divider between file names and diff; width persisted).
- [x] Ubuntu fonts look low quality and too light grey: verify self-hosted Inter/Fira Code actually load under tauri:// on WebKitGTK, darken secondary text, add font smoothing and a good Linux fallback stack.
- [x] File Tree on Linux: cannot expand subdirectories or open files (owner report #2). Tree/blob logic and e2e are correct on Windows; subdirectory errors were silently hidden, now surfaced in the tree. Linux root cause still needs a repro.
- [x] Linux review pass: text-first JSON parsing everywhere, engine reuse only on matching version, ls-tree timeout, AppImage bundled-GLib strip in inspect script, Docker WebKit e2e harness (25/25 webkit + chromium on Linux).
### v0.12.2 — Owner-issue audit + Linux UI/UX pass (2026-09-02) (2026-09-03) (COMPLETE)
**Goal:** Revisit every owner-reported defect from earlier iterations and confirm each is actually fixed in the current code (not just ticked); fix the ones that are partial or regressed. Second pass on Linux UI/UX polish toward Git Extensions parity. Verify on Windows and in the Docker WebKit harness, then release.
- [x] Layout Web Worker: onerror handler + in-thread layouter fallback so a custom-scheme worker failure on WebKitGTK cannot leave the grid empty.
- [x] Diff view: no mid-token wrapping (white-space pre, horizontal scroll, tab-size 4, line-number gutter).
- [x] All 12 remaining catch sites use describeThrown so WebKit DOMException text reaches the UI (BottomPanel, CommitDialog, GitOps).
- [x] Error banner becomes a dismissable Alert with copy; status bar shows branch / ahead-behind / dirty like GE instead of engine health.
- [x] Scoped refresh: watcher events carry a kind so a status-only change does not refetch revisions/refs; selection and scroll preserved across refresh.
- [x] Grid auto-scroll only on user navigation (keyed by SHA), not on every refresh; focus returns to the grid after dialogs and actions.
- [x] Settings dialog label clipping (v0.4.7) verified with an e2e geometry assertion; splitters handle pointercancel.
- [x] Cherry-pick and revert implemented (engine + context menu), replacing the disabled placeholders from v0.7.0.
- [ ] Reopened from v0.11.0 (ticked but absent): Alt+Up/Down parent/child navigation, Ctrl+Shift+F find, Ctrl+G go-to. Deferred to next iteration.
- [x] Empty/failed states: when /revisions fails the grid stays blank; show an inline error with Retry, and real empty states for no-commits / no-files / no-stashes.
### v0.12.3 — Toolbar overflow, selection vs author, chrome bugs, VS Code fonts, syntax highlighting (2026-09-03) (COMPLETE)
**Goal:** Close the owner's 2026-09-03 Ubuntu round: stop the author highlight competing with (and erasing) the selection, make the command bar survive narrow windows, get the busy indicator out from under the buttons, kill the stray WebView context menu, restore Fetch All, adopt VS Code's font stack, and highlight source in the File Tree viewer.
- [x] Same-author marker moves off the row background onto the author name (CSS + canvas band removed), so selection owns the row background exclusively and nothing can be erased by a WebKitGTK class-mutation repaint
- [x] Command bar collapses progressively (labels -> icons -> "More" overflow menu) from its own measured width; nothing wraps or clips at any window size
- [x] Busy indicator moved out of its absolute centre overlay into the toolbar flow beside the status strip (it was painting over the buttons by construction)
- [x] WebView context menu suppressed app-wide outside text fields; the revision menu re-targets on a second right-click instead of leaking the browser menu through the modal backdrop
- [x] "Fetch all remotes" is always present in the Fetch menu (it only appeared with two or more remotes, so single-remote clones had no Fetch All at all)
- [x] UI font stack switched to VS Code's order (platform font first, Inter as fallback); `-webkit-font-smoothing: antialiased` removed — it thins text and was the cause of the "light grey" complaint it had been added to fix
- [x] Syntax highlighting in the File Tree blob viewer via Shiki (VS Code's own highlighter), bundled offline, lazy, with plain-text fallback and a size guard
- [x] Repo state (branch, ahead/behind, dirty, build info) moved from the toolbar's leftover width into a real bottom status bar; it was being elided to unreadable stubs at every window size
- [x] Narrow-window layout: ref panel auto-collapses below the overflow width (restored when the window grows, unless the user closed it), grid metadata columns shrink under 1200px so Date/SHA stop being pushed off the right edge, and adjacent columns get a gap
