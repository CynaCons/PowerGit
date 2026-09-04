# AppImage compatibility matrix (ubuntu 22.04 / 24.04 / 26.04)

## What it is
`docker/appimage-check/run-matrix.sh <file.AppImage>` launches ONE artifact
in stock `ubuntu:22.04`, `ubuntu:24.04` and `ubuntu:26.04` containers with
only the packages a desktop user has (libwebkit2gtk-4.1-0, libgtk-3-0,
libayatana-appindicator3-1, librsvg2-2, xvfb, git, curl) and passes a
version only when:

1. the sidecar engine answers `GET http://127.0.0.1:7733/health` within
   30 s (`HEALTH_TIMEOUT`) — the Tauri shell spawns it after GTK/WebKit
   init, so this is the first-paint proxy;
2. the process is still alive after `SMOKE_SECONDS` (default 20);
3. stderr matches none of `undefined symbol|Failed to load module|version
   .* not found|symbol lookup error|GStreamer-CRITICAL|
   WebKitWebProcess.*(crash|terminated)|Gdk-ERROR`.

Env in the container: `NO_AT_BRIDGE=1`, `WEBKIT_DISABLE_COMPOSITING_MODE=1`,
`--appimage-extract-and-run` (no FUSE in docker). It prints a summary table
and exits non-zero on any failure; per-version `app.stderr.txt`,
`app.stdout.txt`, `health.json`, `result.txt` land in `--out <dir>/<ver>/`.
The in-container half is `docker/appimage-check/launch.sh`; the host side
stages it with LF endings (Windows checkouts are CRLF) and mounts it.

## Running it locally (Windows host, Docker Desktop, Git Bash)
```powershell
gh release download v0.12.3 -R CynaCons/PowerGit -p '*.AppImage' -D $env:TEMP\pg
pwsh scripts/appimage-matrix.ps1 $env:TEMP\pg\PowerGit_0.12.3_amd64.AppImage
pwsh scripts/appimage-matrix.ps1 <file> -Versions "26.04"          # one image
pwsh scripts/appimage-matrix.ps1 <file> -Versions "26.04" -Longevity 10
```
Plain bash: `MSYS_NO_PATHCONV=1 bash docker/appimage-check/run-matrix.sh
<file> --out <dir> [--versions "24.04 26.04"] [--longevity N]`. Without
`MSYS_NO_PATHCONV=1` Git Bash rewrites `/app/...` mount targets into
`C:/Program Files/Git/app/...`. Each version takes ~60-90 s (apt + launch);
the first run pulls the three images.

## Longevity mode (`--longevity <minutes>`, v0.13.11 task 7)
Same launch, then keeps the app up N minutes and drives it two ways:
- xdotool on X11 (Down every 2 s, Ctrl+R every 60 s on the PowerGit window);
- the sidecar's HTTP API on every backend, with the bearer token read from
  the engine process environment (`/proc/<pid>/environ`, we are root):
  two seeded repos + a local bare remote under /tmp, then a rota of
  revision reads, a 3 MB blob (must come back `truncated: true`), a diff,
  a repo switch A→B→A, and one fetch job that must complete.
Every 10 s it samples the process tree into `<out>/<ver>/rss.csv`
(`elapsed_s,rss_mb,procs,webproc,gpuproc,engine,sessions,watchers,api_ms`)
and fails on: a WebKitWebProcess / WebKitGPUProcess exit after first seen,
a powergit-engine exit, RSS above `RSS_BUDGET_MB` (1500), an API read
slower than `API_BUDGET_S` (5 s), more than 4 sessions, or a fatal stderr
pattern.
- `DISPLAY_MODE=wayland` runs under weston's headless backend
  (`GDK_BACKEND=wayland`, no X); xdotool is skipped, the API drive is not.
- `INJECT_FAILURE=1` kills the engine halfway and requires the supervised
  restart: health back within 20 s and `sidecar exited` + a second
  `sidecar started` in `$XDG_DATA_HOME/com.cynacons.powergit/logs/engine.log`.
  Only builds from v0.13.11 on have the supervisor. Older artifacts are
  capability-detected and record an explicit SKIP (v0.12.3 also lacks
  session/watcher diagnostics and blob-truncation metadata) while the
  longevity rota still drives their global repository routes.
Use it one version at a time (`--versions "26.04"`); it is NOT wired into
CI. The acceptance run for v0.13.11 is 10 minutes on 26.04 in both modes.

## linuxdeploy's GTK hook must preserve an explicit backend
The GTK hook generated into `apprun-hooks/linuxdeploy-plugin-gtk.sh` by the
v0.12.3 toolchain contains `export GDK_BACKEND=x11`. That assignment
overrides `DISPLAY_MODE=wayland` even when Weston, its socket and host GTK
are healthy, so GTK initialization fails before the engine starts.
`scripts/inspect-appimage.sh --fix` rewrites it to an environment-respecting
X11 default. This keeps the compatibility default while allowing the
Wayland matrix to set `GDK_BACKEND=wayland` explicitly.

## Repairing a downloaded artifact
`scripts/inspect-appimage.sh --fix --strict --out <fixed.AppImage>` needs
squashfs-tools, binutils, python3, curl (appimagetool is downloaded). On
Windows run it inside a container:
```
docker run --rm -v C:/path/to/dir:/s ubuntu:24.04 bash -c '
  apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
    squashfs-tools binutils python3 curl ca-certificates file desktop-file-utils;
  bash /s/inspect-appimage.sh /s/PowerGit_x.y.z_amd64.AppImage --fix --strict --out /s/fixed.AppImage'
```
(copy the script into the mounted dir with LF endings first.)

## What the fixture proves
`docker/appimage-check/fixtures/v0.12.3-ubuntu-26.04.stderr.txt` is the
verbatim stderr of the published v0.12.3 asset in stock ubuntu:26.04:
`libmount.so.1: version `MOUNT_2_40' not found (required by the host
libgio-2.0.so.0)`, exit 1 after 7 s, no window. `inspect-appimage.sh
--self-test` asserts (a) the guard's fatal regex matches it, (b) the OLD
guard regex (`undefined symbol|Failed to load module`) does NOT — i.e. the
fixture documents exactly the gap that let v0.12.3 ship. After stripping
the prohibited families, the same artifact passed all three versions on
2026-09-04 (engine health at 6-8 s, alive at 20 s, 7 processes, ~600 MB RSS).

## Ubuntu 24.04+ package names
`libwebkit2gtk-4.1-0` and `libgtk-3-0` are `...-0t64` on 24.04/26.04; apt
resolves the old name through the transitional Provides, so launch.sh keeps
the 22.04 names.
