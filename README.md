# PowerGit

[![ci](https://github.com/CynaCons/PowerGit/actions/workflows/ci.yml/badge.svg?branch=powergit)](https://github.com/CynaCons/PowerGit/actions/workflows/ci.yml)

**A new frontend for [Git Extensions](https://github.com/gitextensions/gitextensions) — modern, portable, cross-platform.**

PowerGit keeps everything that makes Git Extensions great — especially its
revision graph — and rebuilds the way it looks and feels: a React + Material UI
running in a lightweight Tauri shell, talking to a self-contained C# git engine.

> **Scope of this fork:** we are building a _new frontend_, not rewriting git
> plumbing. Git Extensions is the **behavioural reference**, not shared code:
> the engine is a small `net10.0` host around the git CLI, and the lane
> layout is a TypeScript reimplementation of GE's `RevisionGraph`, verified
> against golden fixtures taken from GE's own tests (`tools/ge-parity/`).
> The upstream WinForms app is kept as a read-only mirror on `master` for
> exactly that reason. Today the product is the **Browse experience**
> (revision graph, commit details, diffs, staging, branches, stashes). More
> surfaces follow.

## Why

|            | Git Extensions (WinForms) | PowerGit                                                                     |
| ---------- | ------------------------- | ---------------------------------------------------------------------------- |
| UI toolkit | Windows Forms             | React + Material, Tauri shell                                                |
| Platform   | Windows only              | Windows today, Linux target                                                  |
| Install    | Heavy installer           | Portable zip — one exe + one sidecar                                         |
| Graph      | The gold standard         | Reimplemented lane layout, GE colours, golden-tested against GE, virtualized |

## Highlights

- **A grid you can shape** — drag the header dividers to resize the graph,
  author, date and SHA columns (double-click restores); a graph wider than
  its column gets a discreet scrollbar, Shift+wheel scrolls it. Diffs and
  the commit dialog highlight code by the file's language, light and dark.
- **Merge, rebase and conflicts, in the app** — merge with the fast-forward
  and squash options, rebase onto anything, rebase interactively with a
  reorderable list of commits, and resolve conflicts file by file (take
  either side, or open your merge tool) from a banner that says what is in
  progress and offers Continue, Skip and Abort.
- **A commit menu that has everything** — checkout, branch, tag, cherry-pick,
  revert, reset, compare, copy, archive and open in browser, with the same
  shortcuts the toolbar shows; branches and tags have their own menu.
- **See what git actually ran** — one line at the bottom opens a console with
  every command, its output and its exit code, and a failure says why on its
  own. Credentials never reach it.
- **The graph, always complete** — all branches, all tags, stashes as nodes;
  Git Extensions lane colours and a lane layout checked against GE's own
  graph snapshots; smooth up to thousands of commits.
- **Everything in reach** — commit details, changed files, the full repo tree
  at any revision, unified diffs with context/full-file/whitespace options.
- **Real staging** — FormCommit-style window: unstaged │ staged │ diff │
  message, multi-select, right-click stage/delete/gitignore (with preview).
- **Branch operations with GE guards** — checkout, reset, rebase from the
  graph's right-click menu; manage remotes, tags and submodules from the tree.
- **Self-sufficient packaging** — the app spawns its own .NET 10 engine
  sidecar; no prerequisites on the machine.

<p align="center">
  <img src="website/public/assets/browse.png" alt="PowerGit Browse" width="820" />
</p>

More screenshots and an interactive live demo:
**[cynacons.github.io/PowerGit](https://cynacons.github.io/PowerGit/)**

## Following the checked-out branch

The graph rings every commit the checked-out branch reaches and, by
default, greys out everything else, so its history and the merges into it
stand out. The pill at the bottom of the graph column switches between all
ancestors and the first-parent line, and turns the ring or the dimming off.

## If something goes wrong

Rail → **Diagnostic snapshot** (above Settings) writes a zip next to the
logs with the app and engine logs, the engine's state and the page's own
diagnostics; attach it to your report. Should the window ever stop
responding, or stop redrawing while the app still reacts to clicks, the
app's shell notices within about 20 seconds, writes the same snapshot on
its own, reloads the view, and if that does not bring the picture back,
asks in a native dialog whether to restart. The next launch says what
happened and where the snapshot is. If the window looks frozen but the
app still reacts, press **Diagnostic snapshot twice**: the app takes that
as "the display is dead", reloads its view, and a third press offers a
restart in a native dialog. On Linux the shell starts WebKitGTK without
its DMA-BUF renderer and without accelerated compositing, the usual
causes of black, non-redrawing windows (`POWERGIT_KEEP_DMABUF=1` and
`POWERGIT_KEEP_COMPOSITING=1` restore the defaults; `POWERGIT_WAYLAND=1`
runs on Wayland instead of XWayland). Settings → Tools → Open logs folder
shows the files.

## Updating

Settings → Updates → "Check for updates" asks GitHub for the latest release,
verifies its signature and, on "Download and restart", installs it and
reopens PowerGit. Nothing is checked or downloaded unless you press the
button. Works for the Windows installer and the Linux AppImage (the AppImage
must be writable); the portable zip is replaced by hand.

## Status & roadmap

Tracked openly in [PLAN.md](PLAN.md). Release v0.15.0 brings Git
Extensions' own operations into the app: merge, rebase (including
interactive), cherry-pick and revert now stop on a conflict instead of
undoing themselves, with a banner that offers Resolve, Continue, Skip and
Abort, and a resolve dialog that takes either side or opens your merge
tool. The commit menu is the full Git Extensions one, settings gained
identity scopes, tool pickers and switchable confirmations, and a git
console at the bottom shows every command PowerGit runs. It builds on
v0.14.3's grid work and v0.14.1's diagnostic snapshot and watchdog.
Parked: worktrees and hotkey remapping UI.

v0.15.2 adds diagnostics for the Ubuntu focus-loss freeze: Settings → Tools →
Open developer tools opens the inspector in release builds. To open it at launch,
run `POWERGIT_DEVTOOLS=1 ./YourDownloaded.AppImage`. Choose right-side docking
if available in the inspector, open Console and preserve logs. Native focus
events, page visibility changes and refresh timings are also saved beside the
existing snapshots (Settings → Tools → Open logs folder). This release adds
evidence gathering; the freeze is still under investigation.

Recent repositories now load even when no repository is open after restart.
Settings → Updates → Open app location reveals the running AppImage. Updates
replace it in place, so its filename may still contain the original version.

**If the window freezes on Linux, run this from a terminal while it is still
frozen** — nothing inside the app can report it, because the inspector and
the app's own panels are drawn by the same main loop that has stopped:

```
bash freeze-dump.sh
```

It is attached to each release. It reads `/proc` for the app's threads, asks
whether the engine is still answering, collects the logs, and writes one
`.tar.gz` to send back. Nothing is killed or modified. Install `elfutils` or
`gdb` first for full backtraces; without either it still reports what every
thread is waiting on, which is usually enough.

v0.15.3 stops that inspector being the only way in. The console at the bottom
of the window has a second tab, **APP LOG**, showing what PowerGit recorded
about itself: errors, focus and visibility changes, refresh timings, long
tasks and every `console.*` call, with a filter and Copy all. Open it from
Settings → Tools → Open app log, or press Ctrl+Shift+`. It needs no developer
tools and behaves the same on every platform. "Open developer tools" now says
whether the inspector actually opened instead of doing nothing visible.

## Development

Windows dev machine; .NET 10 SDK, Node 22, Rust.

```bash
# engine tests
dotnet test src/engine/PowerGit.Engine.sln

# UI dev server (+ engine)
cd frontend && npm ci && npm run dev:all

# headless proof
npm run test:e2e          # functional
npm run test:resolution   # layout at 5 viewports up to 4K fullscreen

# packaged Windows artifacts into dist/
pwsh scripts/package-windows.ps1
```

All git I/O goes through the engine (`http://127.0.0.1:7733`, bearer-token
gated); the UI never shells out to git. Agent guidance lives in
[AGENTS.md](AGENTS.md); requirements in [docs/srs](docs/srs/README.md).

The `powergit` branch is the product. The upstream Git Extensions tree lives
on `master` as a read-only behavioural reference; check it out beside this
clone with `git worktree add ../gitextensions-ref master`.

## Releases

Tags trigger CI builds for Windows (portable zip + installer) and Linux
(AppImage + deb): see the
[releases page](https://github.com/CynaCons/PowerGit/releases).

### Linux install notes

Download the `.AppImage`, `chmod +x` it and run it; the `.deb` installs the
same binaries under `/usr`. Both need the distro's WebKitGTK stack
(`libwebkit2gtk-4.1-0`, `libgtk-3-0`, `libayatana-appindicator3-1`,
`librsvg2-2`) and `git` on `PATH`.

Supported Ubuntu versions: **22.04, 24.04 and 26.04**. Every release
AppImage is launched in stock containers of all three before it is
published (`docker/appimage-check/run-matrix.sh`), so a version-skew crash
like v0.12.3's `libmount.so.1: version MOUNT_2_40 not found` on 26.04 fails
the release instead of the user. Other distros with WebKitGTK 2.40+ should
work but are untested. To check an artifact yourself:
`pwsh scripts/appimage-matrix.ps1 <file.AppImage>` (Docker Desktop required).

## License

GPL-3.0 — PowerGit is a combined work with Git Extensions.
See [LICENSE.md](LICENSE.md).
