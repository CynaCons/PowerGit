# PowerGit

[![ci](https://github.com/CynaCons/PowerGit/actions/workflows/ci.yml/badge.svg?branch=powergit)](https://github.com/CynaCons/PowerGit/actions/workflows/ci.yml)

**A new frontend for [Git Extensions](https://github.com/gitextensions/gitextensions) — modern, portable, cross-platform.**

PowerGit keeps everything that makes Git Extensions great — especially its
revision graph — and rebuilds the way it looks and feels: a React + Material UI
running in a lightweight Tauri shell, talking to a self-contained C# git engine.

> **Scope of this fork:** we are building a *new frontend*, not rewriting git
> plumbing. Git Extensions is the **behavioural reference**, not shared code:
> the engine is a small `net10.0` host around the git CLI, and the lane
> layout is a TypeScript reimplementation of GE's `RevisionGraph`, verified
> against golden fixtures taken from GE's own tests (`tools/ge-parity/`).
> The upstream WinForms app is kept as a read-only mirror on `master` for
> exactly that reason. Today the product is the **Browse experience**
> (revision graph, commit details, diffs, staging, branches, stashes). More
> surfaces follow.

## Why

| | Git Extensions (WinForms) | PowerGit |
|---|---|---|
| UI toolkit | Windows Forms | React + Material, Tauri shell |
| Platform | Windows only | Windows today, Linux target |
| Install | Heavy installer | Portable zip — one exe + one sidecar |
| Graph | The gold standard | Reimplemented lane layout, GE colours, golden-tested against GE, virtualized |

## Highlights

- **A grid you can shape** — drag the header dividers to resize the graph,
  author, date and SHA columns (double-click restores); a graph wider than
  its column gets a discreet scrollbar, Shift+wheel scrolls it. Diffs and
  the commit dialog highlight code by the file's language, light and dark.
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

Tracked openly in [PLAN.md](PLAN.md). Release v0.14.3 fixes the Linux
freeze class where the window went black while the app still reacted (a
paint heartbeat, self-recovery by reloading the view, a native restart
dialog, WebKitGTK's DMA-BUF renderer off), lists recent repositories right
after launch with a cross to remove one, and reshapes the grid: resizable
columns, a scrollbar for wide graphs, branch lines that run through the
pending rows, and syntax-highlighted diffs. It builds on v0.14.1's
diagnostic snapshot and watchdog and v0.14.0's in-app updates.
Parked: worktrees and hotkey remapping UI.

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
