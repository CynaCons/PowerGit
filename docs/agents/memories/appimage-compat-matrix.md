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

## Longevity mode (`--longevity <minutes>`)
Same launch, then keeps the app up N minutes while xdotool presses Down
every 2 s and Ctrl+R every 60 s on the PowerGit window, samples the process
tree every 10 s into `<out>/<ver>/rss.csv`
(`elapsed_s,rss_mb,procs,webproc,gpuproc,engine`) and fails on:
a WebKitWebProcess / WebKitGPUProcess exit after it was first seen, a
powergit-engine exit, RSS of the whole tree above `RSS_BUDGET_MB` (default
1500), or any fatal stderr pattern. Use it one version at a time
(`--versions "24.04"`); it is NOT wired into CI.

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
