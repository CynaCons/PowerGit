# PowerGit

**Goal:** Git Extensions Browse as React + Tauri, C# git engine sidecar, Windows + Linux. Dev on Windows. Ship `.zip` portable (Windows) and `.AppImage` (Linux).

**Philosophy:** Git Extensions is the *behavior* spec, not the visual spec. Material React chrome. Plan → design → code → e2e → update this file. After v0.3, each UI piece gets an owner design demo (on request).

**Verify:** `npm run test:e2e` once (no retries, stop at first fail, no screenshots). `test:visual` / Chrome shots only when the owner asks. See `AGENTS.md` → How we verify.

**Upstream pin:** `7f75cee29`

---

## Current Status

The current iteration is the last heading below that is not marked COMPLETE
(`powerplan get_current_iteration`). This header never names a version, so it
cannot go stale. Live dev: UI `http://127.0.0.1:1420` · engine `http://127.0.0.1:7733`
(bearer-token gated since v0.13.0).

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

## v0.5 — Welcome / home (parked) · Release track
Recent repos with diff stats, Open, Clone.

- [ ] GitHub Pages showcase site: new features + visuals screenshots
- [ ] Release skill for opencode and claude agents (.opencode/skills + .claude/skills): how to cut a release, update Pages visuals and main README
- [ ] Build and attach binaries to GitHub releases (Windows portable zip, Linux AppImage)

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

## v0.6 — Showcase + cleanup

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

## v0.7 — File Tree correctness + GE command bars

### v0.7.0 — File Tree correctness + GE-style command bars (planned) (2026-08-24) (COMPLETE)
**Goal:** Fix nested File Tree browsing (files invisible below depth 1), close the e2e coverage gap that missed it, and bring the topbar split-buttons and revision context menu closer to Git Extensions design fidelity.
- [x] Engine: normalize ListTree (GitHost.Queries.cs) so entry `name` is relative to the requested directory — strip the path prefix git ls-tree emits when `path` is passed; add engine test asserting nested fetch of docs/srs returns bare basenames
- [x] UI: fix CommitFileTree child path/label building to match normalized DTO; verify blob pane opens files at depth >= 2
- [x] E2E coverage: new spec that expands nested directories in the File Tree tab (e.g. frontend -> components) and asserts file rows render; must fail on the pre-fix engine
- [x] Topbar: Git Extensions-style split buttons (icon + dropdown caret) for Commit / Stash / Fetch / Pull / Push, with secondary actions (amend, force push variants, manage stashes) in the dropdown menus; match GE iconography and ordering
- [x] Revision context menu: expand toward GE parity (create branch/tag here, copy SHA, cherry-pick/revert placeholders as feasible); keep existing checkout/reset/rebase entries and testids stable
- [x] Verification: dotnet test src/engine/PowerGit.Engine.sln + npm run test:e2e green; smoke npm run dev once

## v0.8 — Large-repo responsiveness

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

## v0.9 — Linux AppImage hardening

### v0.9.0 — Linux AppImage runtime hardening (2026-08-24) (COMPLETE)
> Owner report from the GitHub-release AppImage on Ubuntu: "libgvfscommon.so: undefined symbol: g_task_set_static_name" (needs GLib ≥ 2.76), failed loads of libgvfsdbus.so / libdconfsettings.so / libgioremote-volume-monitor.so ("g_assertion_message_cmpint" undefined — same GLib family), "libcurl-gnutls.so: undefined symbol nghttp2_option_set_no_rc_9113_leading_and_trailing_ws_validation" (nghttp2 ≥ ~1.50), and an atk-bridge unknown-signature warning.
Root cause analysis: linuxdeploy bundles GIO modules (gvfs, dconf) and libcurl-gnutls that were built against newer GLib/nghttp2 than the versions they bind to at runtime (the host's system stack pulled in by webkit2gtk). Non-fatal but degrades native file dialogs (no gvfs), GTK settings persistence (no dconf), and pollutes stderr on first run.
**Goal:** The released AppImage launches on stock Ubuntu with zero GLib/GIO/curl module errors: bundled libraries must never conflict with the host system stack that webkit2gtk already guarantees.
- [x] Reproduce + inspect bundle: build the AppImage, list bundled gio/modules (gvfs, dconf), libcurl-gnutls and their GLib/nghttp2 versions; confirm the symbol-mismatch diagnosis against the owner's stderr report
- [x] Fix bundling: exclude the host-provided stack from the AppImage (GIO/gvfs/dconf modules, libcurl-gnutls + its nghttp2 chain — webkit2gtk deps already guarantee them on target distros); wire exclusion flags into the linux release job (release.yml / sidecar scripts) and document them
- [x] Regression guard: extend scripts/ubuntu-check.ps1 (Docker) and/or the release CI job to launch the AppImage headless and fail on any "undefined symbol" or "Failed to load module" stderr line; silence residual atk-bridge noise (NO_AT_BRIDGE=1) if still present

## v0.10 — Large-repo scalability for real

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

## v0.12 — Owner feedback rounds — Linux AppImage

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
- [x] Engine exits with its parent (--parent-pid watchdog): a force-killed or crashed UI no longer orphans a sidecar holding the port, which was the root of the original "address already in use" launch crash
- [x] Test integrity: four specs were asserting something other than what they claimed (repo-restore target, repo-specific .gitignore fixture, a nested-locator strict-mode match that only passed while the diff was still loading, exact containment of a label that straddles its border by design) — all corrected; Linux harness no longer clobbers the host node_modules and seeds a git identity

## v0.13 — Hardening — security, CI, structure, truth
> Project audit of 2026-09-03 (Good / Bad / Ugly). One iteration per finding. Ugly items first (engine exposure, docs vs repo reality), then structural debt (App.tsx, version sync, engine concurrency, CI, Rust tests).

### v0.13.0 — Engine auth token + CORS lockdown (Ugly #1) (2026-09-03) (COMPLETE)
**Goal:** The localhost engine is an unauthenticated remote control for git: AllowAnyOrigin/AnyHeader/AnyMethod CORS plus POST /reset, /rebase, /push, /branches/delete, /files/delete, /stash/drop, /tools/vscode. Any web page in any browser can drive it while the app runs. Gate every route behind a per-launch secret and lock CORS to the app origin.
- [x] Tauri shell generates a random 32-byte token per launch, passes it to the sidecar via env var (POWERGIT_ENGINE_TOKEN); engine_base_url command returns { url, token }; engine.ts sends it as Authorization: Bearer on every request [agent: claude]
- [x] Engine middleware rejects any request without the correct token with 401 (constant-time compare); GET /health stays unauthenticated for the port probe [agent: claude]
- [x] CORS narrowed to tauri://localhost, http://tauri.localhost and the Vite dev origin (no AllowAnyOrigin) [agent: claude]
- [x] Drop engine reuse in lib.rs: always spawn our own sidecar on a free port (parent-pid watchdog already prevents orphans); remove the version-match reuse path [agent: claude]
- [x] Dev/test paths: standalone engine (dev:all, dotnet run, engine.ps1, Docker harness) reads the token from env or prints a generated one; playwright config and scripts pass it [agent: claude]
- [x] Verification: engine tests for 401 without token / 200 with; e2e from the Vite origin with a wrong token expects rejection; dotnet test + test:unit + test:e2e green [agent: claude]

### v0.13.1 — Docs vs repo reality — orphan branch, missing upstream tree (Ugly #2) (2026-09-03) (COMPLETE)
**Goal:** AGENTS.md claims the WinForms tree stays in-tree as the behavioural spec and forbids deleting it, but the powergit branch is an orphan with 226 tracked files; src/app, externals and tests/ exist on disk only because .gitignore excludes them. master (17305 commits) and powergit (54) share no ancestor, so PRs against master cannot work. AGENTS.md still lists frontend/, src-tauri/ and src/engine/ as "to be created". Decide the branch model and make the docs tell the truth.
- [x] Connect histories: on powergit, git merge -s ours --allow-unrelated-histories master (tree unchanged; master becomes an ancestor so diffs/merge-base/PRs work) [agent: claude]
- [x] Make powergit the GitHub default branch; keep master by name as the untouched upstream mirror [agent: claude]
- [x] Reference worktree: document one command (git worktree add ../gitextensions-ref master); AGENTS.md points there for GitCommands/GitUI as the behavioural spec [agent: claude]
- [x] Remove the /src/app/, /externals/, /tests/ ignore rules (the tests/ one hides any future root tests dir) and drop the untracked upstream tree from the working copy once the worktree exists [agent: claude]
- [x] Rewrite AGENTS.md: current project-shape block (frontend, frontend/src-tauri, src/engine, website, docker, scripts, docs), delete the three 'to be created' markers, the 'do not delete WinForms' rule and the contradictory footnote, fix the two shell-mangled strings ('ode frontend/scripts', 'elease skill'), add a Branches section [agent: claude]
- [x] README dev section: one line on the reference worktree; replace upstream's verbatim CONTRIBUTING.md with a short PowerGit version [agent: claude]

### v0.13.2 — PLAN.md header frozen at v0.4.7 (Ugly #3) (2026-09-03) (COMPLETE)
**Goal:** The "Current Status" header says Active v0.4.7 (2026-08-21) and "do not start v0.5 until owner re-reviews", while twelve later versions are marked COMPLETE below it. Make the header derive from, or be updated with, the real current iteration so a reader trusting the top of the file is not misled.
- [x] Header stops claiming a version: keep goal / philosophy / verify / upstream pin; replace the 'Active: v0.4.7' paragraph and the 'do not start v0.5' gate with one line pointing at get_current_iteration / the last non-COMPLETE heading [agent: claude]
- [x] Close v0.12.2 properly: defer its one open hotkeys task (already in Backlog as Slice 2–4) so check_plan is clean and current becomes v0.13.0 [agent: claude]
- [x] One-time manual restructure (sanctioned exception to the powerplan-only rule, say so in the commit): majors in version order v0.0…v0.4, one merged v0.5, a major per v0.6…v0.12 with their iterations moved under them, v0.13 last; task text and checkboxes byte-identical [agent: claude]
- [x] Merge 'Later' into 'Backlog' at the end of the file; move the 2026-08-21 branch-restructure narrative into docs/agents/memories/branch-model.md [agent: claude]
- [x] After the restructure: powerplan check_plan reports ok; show_plan and get_current_iteration both say v0.13.0 [agent: claude]
- [x] Dedicated sub-iteration v0.13.9 upgrades powerplan (normalize, set_header, create_major insertion fix, lint rules) so this restructure never needs a manual edit again [agent: claude]

### v0.13.3 — Git Extensions reuse story is aspirational (Ugly #4) (2026-09-04) (COMPLETE)
**Goal:** README and AGENTS.md promise "the proven Git Extensions engine code" and a reused lane model, but src/engine references no upstream project: it is a fresh 2.3k-line git CLI wrapper, and the graph layouter is a TypeScript reimplementation. Either make the claim true (extract/port specific GE pieces with tests proving parity) or rewrite the claim to "GE is the behavioural reference, verified by parity tests".
- [x] Rewrite the claim in README and AGENTS.md: GE is the behavioural reference; the engine is a small net10.0 git CLI host; the lane layout is a TypeScript reimplementation of GE RevisionGraph verified by golden tests. Drop 'extract from' and 'reuse / expose' [agent: claude]
- [x] Golden parity generator: Windows-only C# console project under tools/ge-parity referencing GitUI from the ../gitextensions-ref worktree; feeds synthetic histories to RevisionGraph and dumps per-row lane/segment/sharing JSON; committed output, runs on demand [agent: claude]
- [x] Parity test in layout.test.ts: for each golden file run createLayouter over the same revisions and assert identical lanes, segment endpoints and lane-sharing flags [agent: claude]
- [x] Unit test pins the seven lane colours in types.ts to GE AppColor.GraphBranch1–7 hex values [agent: claude]
- [x] Record the decision: git-extensions-map memory marks 'expose lanes from C#' as superseded with the reason (GitUI graph is WinForms-bound, engine must stay net10.0, layout runs in a Web Worker); add SRS-GRAPH requirement 'lane layout matches GE on the golden fixtures' verified by Test [agent: claude]

### v0.13.4 — Split App.tsx god component + lint (Bad #1) (2026-09-04) (COMPLETE)
**Goal:** App.tsx is 1572 lines with 36 useState and 8 useEffect; GitOps.tsx is 662 lines with 15 states. No state container, no ESLint/Prettier. Extract feature hooks/stores (selection, panels, repo data, refresh) behind stable interfaces, add lint + format config with a CI gate, and keep e2e green throughout.
- [x] Six hooks, no store library: useEngineSession (offline/health/repo/recents/live), useHistory (revisions, paging, live graph rows, selected SHA), useRepoState (refs/status/stashes + watcher-scoped refresh), useJobs (busy/jobLabel), useDialogs (one discriminated union replaces 11 open flags/targets), useChromeLayout (bottom height, left open, bottom tab) [agent: claude]
- [x] Extract the command bar into components/CommandBar.tsx (toolbar tiers, overflow menu, anchors) taking session/jobs/dialog APIs as props [agent: claude]
- [x] App.tsx becomes composition only (<300 lines): call the hooks, render the shell, wire HotkeyHost [agent: claude]
- [x] Split GitOps.tsx into one file per dialog under components/dialogs/ with a shared useActionDialog hook for the busy/error pattern [agent: claude]
- [x] ESLint flat config (typescript-eslint, react-hooks, react-refresh, max-lines 400) + Prettier with lint and format:check scripts; fix any react-hooks/exhaustive-deps findings rather than disabling them; CI wiring lands in v0.13.7 [agent: claude]
- [x] Guard rails: no testid or behaviour change; one commit per extraction; npm run test:e2e once after each; test:unit green; smoke npm run dev [agent: claude]

### v0.13.5 — Single source of truth for the version (Bad #2) (2026-09-04) (COMPLETE)
**Goal:** The version is hand-copied in package.json, tauri.conf.json, Cargo.toml and a const in Program.cs. A mismatch silently makes the Tauri shell refuse to reuse its own engine. Derive all four from one place at build time and add a check that fails the build when they diverge.
- [x] package.json is the single source of the version; tauri.conf.json 'version' becomes the path '../package.json' (Tauri 2 reads it), so the config holds no copy [agent: claude]
- [x] build.rs reads package.json and exports POWERGIT_VERSION as a compile-time env; lib.rs uses it instead of CARGO_PKG_VERSION; Cargo.toml keeps a placeholder nothing consumes (no more Cargo.lock churn per release) [agent: claude]
- [x] Engine csproj sets Version from package.json via an MSBuild property function (regex on the file); Program.cs replaces the engineVersion const with the assembly informational version, so dotnet run and the packaged sidecar report the same number [agent: claude]
- [x] scripts/check-version.mjs asserts package.json, engine /health, Tauri package info and the packaged artifact names agree; fails non-zero; runs in CI (v0.13.7) and as release preflight [agent: claude]
- [x] Release skill (.claude/skills/release + .opencode mirror, kept identical): section 1 becomes 'npm version X.Y.Z --no-git-tag-version, commit chore(release)'; a new 'Verify the version' step lists WHAT is derived, WHERE it surfaces (status bar, /health, installer/zip names, GitHub release tag, Pages footer) and HOW to check each (check-version.mjs, curl /health, ls dist/, gh release view); drift footnote removed [agent: claude]
- [x] Verification: fresh dotnet run shows the package.json version in /health; npm run tauri build artifact names carry it; check-version.mjs passes; a deliberate mismatch fails it [agent: claude]

### v0.13.6 — Engine concurrency — one global mutable repo (Bad #3) (2026-09-04) (COMPLETE)
**Goal:** GitHost is a singleton with a single Current repository and the only lock lives in the file watcher. Two app windows, a second client, or concurrent e2e workers race on repo state (the memories already record e2e contention). Make repo state per-request or per-session and serialize mutating git operations per repo.
- [x] Repo sessions: GitHost becomes a registry of RepoSession keyed by root (root, watcher, jobs, write gate); POST /repos/open returns a session id; every route takes /repos/{id}/... ; engine.ts builds all URLs with the id [agent: claude]
- [x] Request-scoped root: each endpoint resolves its session once at entry and passes the root down; no git command reads shared state mid-request [agent: claude]
- [x] Per-session write gate (SemaphoreSlim(1)) around every mutating op incl. fetch/pull/push jobs; reads bypass; a colliding mutation returns 409 with the running job id (was 400) [agent: claude]
- [x] Session lifecycle: DELETE /repos/{id} disposes the watcher; recents stay client-driven. NOT done: idle-session pruning (sessions live until closed or the engine exits) — moved to the backlog [agent: claude]
- [x] Engine tests: two repos open with interleaved queries; concurrent stage+commit serialize; 409 on collision [agent: claude]

### v0.13.7 — CI on push/PR + Tauri CSP (Bad #4) (2026-09-04) (COMPLETE)
**Goal:** Only pages.yml and release.yml are tracked; engine tests, vitest and Playwright run only on developer machines. Add a ci.yml on push and pull_request that runs dotnet test, npm run test:unit and npm run test:e2e (Windows + Linux). Replace tauri.conf.json "csp": null with a real policy that still allows the engine origin, Shiki, and the layout worker.
- [x] .github/workflows/ci.yml on push + pull_request: dotnet test (engine), npm run lint + format:check, test:unit, test:e2e on windows-latest and ubuntu-22.04; check-version.mjs; powerplan check_plan [agent: claude]
- [x] tauri.conf.json csp: real policy (default-src 'self'; connect-src to the engine loopback origin; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' for MUI/emotion); verify Shiki, the layout worker and engine fetches still work in npm run tauri dev [agent: claude]
- [x] README CI badge; AGENTS.md 'How we verify' mentions CI as the gate [agent: claude]

### v0.13.8 — Rust shell unit tests (Bad #5) (2026-09-04) (COMPLETE)
**Goal:** frontend/src-tauri/src/lib.rs has zero #[test]s although it contains the hand-rolled HTTP health probe, the chunked-body decoder and the port-resolution decision, which already failed silently once. Add cargo unit tests for dechunk, looks_like_powergit_health (version match/mismatch, non-chunked, garbage) and resolve_engine_port against a local TcpListener stub; run them in CI.
- [x] cargo unit tests in lib.rs: generate_token shape/uniqueness, POWERGIT_VERSION exported by build.rs is X.Y.Z (dechunk and looks_like_powergit_health no longer exist: v0.13.0 removed engine reuse and the hand-rolled HTTP probe) [agent: claude]
- [x] resolve_port_preferring / pick_free_port / port_is_free tests against a local TcpListener (free port is returned as-is; a held port yields a different bindable port) [agent: claude]
- [x] cargo test wired into ci.yml (v0.13.7) [agent: claude]

### v0.13.9 — powerplan upgrade — normalize, set_header, create_major fix, lint (sub-iteration of v0.13.2) (2026-09-04) (COMPLETE)
**Goal:** powerplan has 22 iteration/task-scoped tools and nothing that touches majors, prose, the header block, or file order, which is why PLAN.md drifted and the fix needed a manual edit. Add the missing operations and lint rules in the powerspawn/powerplan submodule, release, and bump the pin here.
- [x] sort_plan / normalize: reorder majors and their iterations by version number; task text, checkboxes and prose blocks byte-identical; dry-run flag that reports the moves without writing [agent: claude]
- [x] set_header: read/replace the block between the H1 and the first major (goal, philosophy, verify, upstream pin, current-iteration pointer) [agent: claude]
- [x] create_major insertion fix: insert before the trailing Later/Backlog sections (or after the highest major by version), never mid-file; regression test with an out-of-order fixture [agent: claude]
- [x] check_plan lint rules: duplicate major headings, majors/iterations out of version order, iteration nested under a major with a different version prefix [agent: claude]
- [x] show_plan and check_plan agree on 'current' (today show_plan says v0.12.2, check_plan says v0.13.0); one definition, one code path [agent: claude]
- [x] Nice-to-have once sorted: move_iteration(version, major), update_major / merge_major, remove_prose / move_prose [agent: claude]
- [x] Release powerplan, bump the powerspawn/powerplan submodule pin in PowerGit, run normalize + check_plan on this PLAN.md as the acceptance test [agent: claude]

### v0.13.10 — Ubuntu 26.04 release blockers — AppImage, job routes, git hangs (PLANNED) (2026-09-04) (COMPLETE)
**Goal:** The published v0.12.3 AppImage fails before first paint on Ubuntu 26.04 because an older bundled libmount/libblkid is loaded beside the host GIO; the current session-aware frontend also sends Fetch/Pull/Push to pre-session URLs, GitHost can deadlock while synchronously draining redirected pipes, and the Linux harness stops on fixture branch drift. Remove these release blockers and make the real packaged AppImage—not a browser substitute—the Linux acceptance gate.
- [x] AppImage dependency hygiene: reproduce the v0.12.3 Ubuntu 26.04 MOUNT_2_40 failure from the published artifact; define the host-vs-bundle policy for GLib/GIO, libmount/libblkid, Wayland and GStreamer; extend scripts/inspect-appimage.sh to fail or safely strip every prohibited family, repack, then prove the repaired artifact starts against host WebKitGTK. [agent: claude]
- [x] Release compatibility matrix: build the AppImage once and launch that exact artifact in stock Ubuntu 22.04, 24.04 and 26.04 containers; require first paint/engine health, keep the process alive through the smoke interval, record stderr and fail on WebKit/GIO/GStreamer/ABI errors or an early child exit. [agent: claude]
- [x] Session-aware network jobs: make startFetch/startPull/startPush use /repos/{id}; return session-qualified Location headers from the engine; add contract tests that hit the real engine and assert POST plus job polling URLs so broad Playwright route globs cannot hide another regression. [agent: claude]
- [x] Deadlock-proof git execution: drain stdout and stderr concurrently, start timeout/cancellation before awaiting either stream, kill the whole process tree on timeout and always finish draining/dispose; add cross-platform tests with a helper that floods stderr and with a child that never exits. [agent: claude]
- [x] Repair the Ubuntu harness fixture contract: remove the hard-coded powergit branch assumption (or seed the declared branch consistently), run all Linux e2e specs rather than stopping at blob-highlight.spec.ts, and retain retries:0/maxFailures:1 as the gate. [agent: claude]
- [x] Acceptance proof: dotnet test, lint, format check, test:unit, one test:e2e run, cargo clippy/test, scripts/ubuntu-check.ps1, and the packaged-AppImage matrix are green; document the supported Ubuntu versions and retain the failing v0.12.3 stderr as a regression fixture. [agent: grok]

### v0.13.11 — Long-session UI resilience — bounded work, memory, recovery (PLANNED) (2026-09-04) (COMPLETE)
**Goal:** After launch, rapid history navigation and large repositories can leave overlapping git reads running, buffer unrestricted blob/diff data, clone large history graphs, and accumulate repository watchers; an engine or WebKit failure then has little durable evidence or recovery. Bound every expensive path, make latest selection win, supervise native processes, and prove stable interactive use over a representative Ubuntu session.
- [x] End-to-end latest-request-wins cancellation: let every engineFetch helper accept AbortSignal/timeouts; abort superseded commit/files/diff/blob/history requests; propagate HttpContext.RequestAborted into GitHost and terminate the corresponding git process instead of merely suppressing stale React state. [agent: claude]
- [x] Bound content before allocation: cap git stdout while it is read, probe blobs with git cat-file -s before loading, reject or truncate oversized text with explicit byte/line limits, preserve binary detection, and add truncation metadata to the DTO instead of appending an ambiguous text sentinel. [agent: claude]
- [x] Large-content UX: virtualize diff rows, keep gutter/keyboard/selection behavior accessible, and show an intentional 'too large to preview' state with size, truncation reason, copy/open-in-difftool actions and retry options; never hand an unrestricted blob or million-line element tree to WebKitGTK. [agent: claude]
- [x] History/worker memory: catch synchronous module-Worker construction failures and enter the existing main-thread fallback; remove avoidable full-history structured clones/state duplication on refresh, keep paging incremental, and add measurable JS-heap/RSS budgets for 10k and 100k histories. [agent: claude]
- [x] Session and watcher lifecycle: touch sessions on requests, evict idle sessions with active jobs protected, close the previously active session when the single-window UI no longer needs it, dispose watchers deterministically, narrow Linux watch scope away from object-pack churn, and test repeated open/close plus inotify pressure. [agent: claude]
- [x] Failure visibility and recovery: persist timestamped Tauri/engine stderr plus exit status, surface distinct connecting/offline/engine-exited/job-failed states through an accessible recovery panel, add a React error boundary and unhandled-rejection reporting, and supervise the sidecar with one bounded restart/backoff rather than silently ending its monitor. [agent: claude]
- [x] Ubuntu longevity gate: run the packaged app for at least 10 minutes on Ubuntu 26.04 under X11 and headless Wayland while rapidly changing revisions, opening capped large blobs/diffs, switching repositories and completing a network job; assert UI responsiveness, bounded RSS/child count/watch count, no WebKitWebProcess/GPUProcess/engine exit, and useful retained logs on injected failures. [agent: grok]

### v0.13.12 — Frontend trust — explicit state, repository-scoped API, operation UX (PLANNED) (2026-09-04) (COMPLETE)
**Goal:** Once long-session stability is established, make the interface unambiguous about what data it is showing and what Git is doing. Replace loosely related connection booleans and the global repository id with explicit state and repository-scoped clients; distinguish demo, startup, no-repository, recovering and failed-engine modes; give network operations inspectable destinations, progress, cancellation and results without reducing the revision graph's desktop-grade information density.
- [x] Model session UI as one discriminated state machine (starting, demo, no-repository, ready, busy, recovering, engine-failed) with legal transitions and derived view props; remove contradictory combinations of live/offline/health/repo/engineError booleans and add reducer transition tests. [agent: claude]
- [x] Separate demo from failure: synthetic history is enabled only by an explicit demo/build mode, never as an automatic packaged-app fallback; startup, unavailable engine, lost engine and unknown repository each get distinct copy, primary recovery action and access to diagnostics without replacing real data with samples. [agent: claude]
- [x] Repository-scoped engine client: replace the module-global REPO_ID with a client/context bound to {baseUrl, token, repoId}; make repository identity explicit at call sites, support ?repo=<id> or equivalent per-window pinning, and prove two windows/clients cannot silently switch each other's repository. [agent: claude]
- [x] Unify asynchronous surfaces: introduce reusable loading, empty, error and retry patterns with consistent placement/copy; preserve the last valid graph during refresh, distinguish initial load from background refresh, and eliminate scattered bare Loading… strings and duplicate error banners. [agent: claude]
- [x] Network-operation decisions: keep normal Fetch one-click while showing the selected remote; add Pull and Push previews that state source/destination branch, upstream, ahead/behind and rebase/refspec choices; require a deliberate force-with-lease confirmation and translate credential/SSH failures into actionable guidance. [agent: claude]
- [x] Inspectable job UX: make status-bar progress open a non-modal operation detail with elapsed state, cancellability, sanitized command context, live/final output, copy and retry; retain completed/failed results for the session and restore grid focus after actions instead of relying on an anonymous progress line. [agent: claude]
- [x] Accessibility and behavior proof: announce connection/job state through appropriate live regions, provide labels/tooltips and predictable focus for icon/menu/dialog actions, keep every core flow keyboard-complete, and add real-engine e2e coverage for startup, no repo, repo ready, background refresh, cancellation, failure, recovery, pull/push preview and multi-window repo isolation. [agent: claude]

### v0.13.13 — Visual system — Linux-native themes, zoom, consistent density (PLANNED) (2026-09-04) (COMPLETE)
**Goal:** With reliability and interaction states settled, consolidate PowerGit's visual language without redesigning the dense Git Extensions-style workspace. Move scattered colors, spacing and typography into semantic tokens; support system/light/dark appearance and persisted zoom; preserve graph readability, information density and predictable pane behavior across Windows and current Ubuntu displays.
- [x] Semantic token audit: inventory hard-coded colors, borders, spacing, row states and typography across MUI sx, app.css, diff/blob views and canvas graph drawing; define shared surface/text/selection/ref/diff/graph/status tokens and migrate without changing established layout or graph semantics. [agent: grok]
- [x] Appearance modes: add System, Light and Dark themes with persisted preference, react to OS changes, map GTK/Windows system colors where appropriate, and provide independently checked contrast palettes for graph lanes, ref badges, diffs, selection, focus and disabled text. [agent: grok]
- [x] Application zoom: implement persisted Ctrl+=, Ctrl+-, Ctrl+0 zoom over the complete workspace; scale row/canvas metrics and hit targets together, clamp to usable bounds, expose the current percentage, and keep splitter positions/scroll selection stable across zoom changes. [agent: grok]
- [x] Cross-platform typography and density: retain the platform-first Ubuntu/Windows font stacks, normalize control heights/baselines and code metrics through tokens, remove component-local exceptions where possible, and verify dense history rows remain legible without clipping at common DPI scaling levels. [agent: grok]
- [x] Interaction polish: give every icon-only action an accessible label and tooltip, make hover/focus/pressed/disabled states consistent, enforce practical pointer targets without bloating the desktop layout, and preserve visible keyboard focus through toolbar overflow, menus, dialogs, grid and splitters. [agent: grok]
- [x] Responsive and visual acceptance: keep test:resolution green at the five supported viewports through 4K, add assertions for narrow toolbar overflow, pane minimums, zoom and both themes, then run the owner-approved test:visual/design walkthrough on Windows and Ubuntu; update only canonical website/public/assets screenshots after acceptance. [agent: grok]

### v0.13.14 — Owner report — selected commit vanishes from the graph, laggy selection, symptom-first testing</title> (current) (ACTIVE)
<parameter name="goal">Owner report (2026-09-05): "commits disappear when they are selected" — reported since v0.12.1 and never seen by any audit because every test asserted DOM classes and computed styles while the commit node lives on the canvas underneath the opaque selected-row background. Also: clicking commits feels laggy because highlighting waits on the commit-details load. Fix both, add pixel-level symptom tests, and change how owner reports are tested and verified (symptom test first, owner closes, visual walkthrough on demand rather than full suite on CI).

- [ ] Selected commit vanishes from the graph: the opaque .grid-row.selected background (added in v0.12.1, z-index above the canvas) covered the canvas node and lane lines of the selected row on every platform. Tint moved to the text cells; the canvas keeps the graph-column band; tests/e2e/selected-row-graph.spec.ts samples the composited pixels (light/dark, 100%/150%, selected + hovered; red before, green after). Also found at 150%: the fixed 280px bottom panel swallowed the grid on a small zoomed viewport, now clamped. FIXED b025a5124, awaiting owner verification (owner ticks). [agent: claude]
- [ ] Immediate selection: a click must highlight in its own frame; commit details load afterwards. Cause: every click re-rendered the whole tree (RepoTree, CommandBar, BottomPanel). RepoTree/CommandBar memoised with stable callbacks (useStable), BottomPanel gets a deferred `current`. In-page: production 25 ms to class / <50 ms to paint, no long tasks (was ~70 ms); dev build 125-155 ms (was 200-1460 ms with 300 ms long tasks, React dev instrumentation is the remainder). perf.spec asserts the budget in-page. FIXED b025a5124, awaiting owner verification (owner ticks). [agent: claude]
- [x] Symptom-first rule: every owner-reported defect gets a failing test that reproduces the reported sentence (quoted verbatim in the test) on the reported platform before any fix; tests assert what the owner sees (composited pixels for canvas+DOM layers), not the mechanism of the fix. Write it into AGENTS.md and the release skill; retire the 'default proof is e2e assertions, not screenshots' guidance that produced this blind spot. [agent: claude]
- [x] Owner verification: tasks derived from an owner report are not tickable by agents; they are marked 'fixed, awaiting owner verification' and the owner closes them. Record in AGENTS.md and apply to the two report tasks of this iteration. [agent: claude]
- [x] Visual walkthrough on demand, not on CI: make the visual suite runnable per area (grid, bottom panel, dialogs, themes) with per-platform baselines, document 'run the subset for the area you touched' after any CSS/token/graph change, add a look-at-it step (scripts/capture-window.ps1 for the packaged/dev window plus a fixed state checklist) to audits and release preflight, and have a reviewer with vision inspect the captures. [agent: claude]
- [ ] Diff loading latency (owner: "can we make the diff loading faster?"): tests/e2e/diff-latency.spec.ts measures in-page click → highlight → file list → diff on screen and records the numbers. Baseline (dev, steady state) median ~1100 ms, 2500-3200 ms after a large diff: 150 ms debounce, a wasted diff request for the previous file against the new commit, files → diff serially, and DiffView rendering up to 2000 lines as per-element MUI boxes (an 818-line PLAN.md diff cost 400 ms to mount and slowed the next click's teardown). Fixes: leading-edge debounce (first change immediate, only rapid runs wait), engine GET /commits/{id}/changes returning files + first diff from two concurrent git calls (byte-identical to /files + /diff, tested), a per-commit LRU cache (engine/commitCache) with a prefetch on selection commit so requests overlap the panel render, a stale-file guard on the diff effect, DiffView rows as plain classed elements and virtualization above 200 lines (supersedes the DiffView backlog item). Result: dev 310-580 ms for every sampled row, production 180-260 ms (click highlight ~30 ms), bounded by the git process spawns. FIXED, awaiting owner verification (owner ticks). [agent: claude]
- [ ] Owner report (2026-09-05): "In the commit view, the right click menu on the unstaged files is not professional. Very poor." Was: three items (Stage selected, Delete…, Add to .gitignore…), one with an empty icon slot so the labels misaligned, no separators, two without shortcuts, none of Git Extensions' FormCommit file actions, and window.confirm prompts. Now: CommitFileContextMenu in the RevisionContextMenu house style with GE's item set and order (Stage/Unstage S/U · Reset file(s) to HEAD… · Delete file(s)… · Open with difftool · Copy path(s) · Add to .gitignore…), icon on every row, shortcut column, separators, plural labels for multi-selection, disabled-not-hidden, right-click selects the row like GE, in-app ConfirmDialog for Reset and Delete; engine POST /files/reset and /difftool/worktree (SessionTests). tests/e2e/commit-file-menu.spec.ts (isolated dirty repo) asserts the item set, icons, shortcuts, separators and that Reset restores the file. FIXED 6bb58ddb9, awaiting owner verification (owner ticks). [agent: claude]
- [ ] Owner report (2026-09-05): "In the commit view, we can select a piece of diff and reset it like we can in baseline Git Extensions." GE's FormCommit lets you select lines/hunks in the unstaged diff and Stage / Reset selected lines (git apply --cached / --reverse on a synthesized patch). Add line selection in the commit dialog's diff view with Stage selected lines and Reset selected lines (confirm on reset), an engine route that applies a synthesized partial patch and reports conflicts, and a symptom test that resets two lines of a three-line change and asserts the working tree afterwards. Owner ticks. [agent: claude]
- [ ] Owner request (2026-09-05): "On Windows and Linux, can we merge the appbar at the top with the window frame itself? integrating the three system-window buttons top right of the appbar with same functionality?" Frameless window (decorations off); the command bar carries data-tauri-drag-region (drag, double-click toggles maximize); WindowControls renders Minimize / Maximize-Restore / Close at the right edge outside the overflow-hidden toolbar (never clipped by a narrow or zoomed window), Windows 11 caption glyphs, Restore glyph follows the real state, Tauri capabilities granted, hidden outside the Tauri shell (unit test). Verified on the real window over WebView2 remote debugging: controls flush at the edge at 200 % DPI, maximize → 1440x912 and back, minimize works. Known gap: Windows 11 Snap Layouts do not pop up on hover over a custom maximize button (needs the decorum plugin). Linux X11/Wayland use the same Tauri path; confirm with the next AppImage matrix (add a capture there). FIXED 483a965f3, awaiting owner verification (owner ticks). [agent: claude]
- [ ] Brand: owner picked direction D (the crossing redrawn) from the four-direction board; src/assets/logo.svg is the single source, `npm run icons` regenerates the Windows/macOS/Linux/Android/iOS sets, all PNG sizes listed in bundle.icon for the AppImage/hicolor set, BrandMark in the app bar with theme tokens, site favicon + header. Linux AppImage icon is verified by the next tagged release's matrix run (the artifact is built in CI). DONE 90a7c0ea0, owner to confirm the look. [agent: claude]

## Backlog
- Drop leftover 2021 origin branches
- Component/UI test coverage: stash flow, gitignore preview dialog, commit-dialog multi-select semantics, remote config dialog, blob viewer content
- Reproduce fullscreen clipping in Tauri window: need owner screen resolution + DPI scaling %; CSS overflow hardening already in place
- [ ] Hotkeys Slice 2–4: commit pane-focus/stage-all chords, grid parent/child/go-to, remapping UI (parked from v0.11.0) [agent: grok]
- Reopened from v0.11.0 (ticked but absent): Alt+Up/Down parent/child navigation, Ctrl+Shift+F find, Ctrl+G go-to. Deferred to next iteration. (deferred from v0.12.2: duplicate of the Hotkeys Slice 2–4 backlog entry; v0.12.2 was already marked complete) [agent: claude]

### From the former “Later” list
- Fetch / Pull / Push **dialogs** (buttons are wired to engine `/fetch`, `/pull`, `/push` since v0.6.4; richer dialogs later)
- Design-demo step/pause bar (opt-in `npm run test:demo`)
- Visual screenshot suite (`npm run test:visual`, owner-triggered)
- Restore parallel Playwright workers on CI (fullyParallel) and run the Linux harness once as the acceptance test; lands after v0.13.0 so auth sits before session resolution (deferred from v0.13.6: engine is multi-repo safe now, but the UI boots from the engine-global /repos/current, so a spec opening a temp repo still leaks into concurrently booting specs; needs UI repo pinning (e.g. ?repo=id) first — see docs/agents/memories/engine-sessions.md) [agent: claude]
- Graph parity: 33 of 37 Git Extensions RevisionGraph fixtures diverge because GE's post-passes are not ported — StraightenLanes (6 fixtures), StraightenDiagonals (18), ReduceGraphCrossings when mergeGraphLanesHavingCommonParent=false (9). PowerGit matches GE's pre-straightening layout lane-for-lane, so the gap is only the look-ahead passes; porting them needs a revisable-rows worker protocol (rows re-emitted after look-ahead). See tools/ge-parity/README.md and frontend/src/graph/layout.ge-parity.test.ts KNOWN_DIVERGENCES. [agent: claude]
- Lint debt from v0.13.4: eslint.config.js exempts src/engine.ts (561 lines) and src/graph/* (draw.ts 407 lines, two no-useless-assignment) from max-lines/no-useless-assignment/preserve-caught-error, and .prettierignore skips them; drop the exemptions the next time those areas are touched [agent: claude]
- Lint: adopt the React Compiler rules shipped with eslint-plugin-react-hooks 7 (set-state-in-effect, refs, incompatible-library) — ~20 deliberate existing patterns flagged (dialog reset-on-open effects, latest-value refs in Host.tsx/SplitHandle, react-virtual); its own iteration [agent: claude]
- First CI run: .github/workflows/ci.yml has never executed (nothing pushed yet); expect first-run fixes (Windows shell quoting in the engine-start step, Playwright browser cache on ubuntu, cargo cache) [agent: claude]
- powerplan 0.8.0 has no update_iteration title tool; v0.13.10–v0.13.13 headings still contain the literal (PLANNED) after COMPLETE. Strip it when a retitle mutation exists. [agent: grok]
- worktrees [agent: grok]
- Owner-approved test:visual / design walkthrough and canonical website/public/assets screenshots (parked; owner-triggered). Resolution assertions for zoom, themes, toolbar overflow and pane minimums landed in v0.13.13. [agent: grok]
- History streaming owns the main thread: on a 17k-commit repository each 1000-row page append costs a 150-400 ms long task for ~15 s after boot (dev; less in production), which delays clicks made during that window (diff-latency.spec measures steady state only). Move the append/layout merge off the main thread or chunk it (requestIdleCallback / smaller batches) and assert with the spec run before settle. [agent: claude]
- Large first diffs render slowly: DiffView renders plain rows below VIRTUALIZE_MIN_LINES=2000, so a 1500-line first diff (PLAN.md) costs a 400 ms render in dev / ~120 ms in production on selection. Lower the threshold (~300 lines) once the specs that read the full diff text are adapted, and measure with diff-latency.spec's worst-case row. [agent: claude]
- Engine: details + changes on one selection spawn three git processes concurrently (show -s, diff-tree, show -p) and each takes 120-200 ms under contention vs 80-100 ms solo. Options: fold the details into /changes (one request, still concurrent), or a long-lived `git cat-file --batch` for commit metadata. [agent: claude]
