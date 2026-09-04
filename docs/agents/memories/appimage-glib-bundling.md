# AppImage GLib/GIO bundling mismatches

## The owner-reported errors map to one root-cause family
`undefined symbol: g_task_set_static_name` (gvfs) and
`g_assertion_message_cmpint` (dconf) need GLib >= 2.76; the libcurl-gnutls
error needs nghttp2 >= ~1.50. Bundled objects were built against newer
GLib/nghttp2 than what they resolve against at runtime (host stack pulled in
via webkit2gtk). Non-fatal but noisy and degrades native file dialogs /
settings persistence. 2026-08-24.

## v0.12.3: the same family, the other direction, and FATAL
The published v0.12.3 AppImage dies before first paint on Ubuntu 26.04:
```
powergit: /tmp/appimage_extracted_.../usr/lib/libmount.so.1: version `MOUNT_2_40' not found (required by /usr/lib/x86_64-linux-gnu/libgio-2.0.so.0)
```
v0.12.x had already stripped the bundled GLib, so the HOST libgio (GLib
2.88 on 26.04) loads — and it needs util-linux 2.40+ symbols, but the AppRun
hook puts the bundle's usr/lib first, so the bundled libmount 2.37 (from the
ubuntu-22.04 runner) shadows the host's. Every symbol resolved fine on the
build host, so the old `ldd -r` check and the old runtime guard regex
(`undefined symbol|Failed to load module`) both passed. Reproduced
2026-09-04 in a stock `ubuntu:26.04` container; captured stderr is the
fixture `docker/appimage-check/fixtures/v0.12.3-ubuntu-26.04.stderr.txt`.

## Host-vs-bundle policy (authoritative copy: scripts/inspect-appimage.sh header)
Families that must NEVER be bundled. The host webkit2gtk-4.1 stack provides
all of them (hard deps of libwebkit2gtk-4.1-0 / libgtk-3-0), and a second,
older copy in the process breaks at load whenever the host copy is newer.

| family    | objects                                                             | why it breaks when bundled |
|-----------|---------------------------------------------------------------------|----------------------------|
| glib      | libglib/libgio/libgobject/libgmodule/libgthread-2.0, gio/modules/*  | host GIO modules + host webkit resolve against the older bundled GLib: `undefined symbol`, `Failed to load module` |
| utillinux | libmount, libblkid, libuuid                                         | host libgio needs `MOUNT_2_40` (util-linux >= 2.40); bundled 2.37 shadows it: `version ... not found` (v0.12.3) |
| wayland   | libwayland-client / -cursor / -egl / -server                        | host GTK/WebKit/EGL bind to the host copies; a second copy breaks version negotiation |
| gstreamer | libgst*.so, gstreamer-1.0/ plugin dirs                              | host webkit media backend loads host plugins against the bundled core: `GStreamer-CRITICAL`, `symbol lookup error` |
| curl      | libcurl*, libnghttp2*                                               | bundled curl newer than host nghttp2: `undefined symbol` |

Everything else (GTK, WebKit, ICU, pango, cairo, pixbuf loaders, immodules)
stays bundled — that is what Tauri/linuxdeploy intend, and the matrix proves
those start on 22.04/24.04/26.04. Stripping the five families from the
published v0.12.3 (`inspect-appimage.sh --fix --strict`) made it start on
ubuntu:26.04 (engine /health at 7 s, alive at 20 s, stderr clean).

## Inspector modes
* default: prohibited families are WARN; FAIL only on unresolved symbols or
  a bundled GLib.
* `--strict`: presence of any family is FAIL even when symbols resolve on the
  build host — this is the mode that would have caught v0.12.3. CI runs
  `--fix --strict`.
* `--fix [--out <file>]`: strip + repack with appimagetool + re-inspect
  strictly.
* `--self-test`: asserts the fixtures match the runtime guard's fatal regex
  and that the family matchers flag a synthetic bundle. Runs in release.yml
  before the real inspection; run it after editing the family table.

## Where releases are built — and why versions can drift
`.github/workflows/release.yml` linux job pins `ubuntu-22.04` today, but
older release tags may have been built on other runners; linuxdeploy copies
whatever the build host provides, so runner version bumps silently change
bundle contents. Always inspect a released AppImage with
`scripts/inspect-appimage.sh <file.AppImage> --strict` before shipping.

## The guard lives in CI, not locally
Windows dev hosts cannot build Linux AppImages; the Docker ubuntu-check
container lacks Rust/tauri prereqs. The regression guard therefore runs as
release.yml steps right after `tauri build` and before upload:

1. `Inspect AppImage ... (strict) and repack` — `inspect-appimage.sh
   --self-test`, then `--fix --strict` on the built artifact.
2. `Launch AppImage in stock Ubuntu 22.04 / 24.04 / 26.04 containers` —
   `docker/appimage-check/run-matrix.sh`, which runs the exact artifact in
   each stock image under xvfb and requires engine `/health` within 30 s,
   the process alive after 20 s, and no fatal pattern on stderr
   (`undefined symbol|Failed to load module|version .* not found|symbol
   lookup error|GStreamer-CRITICAL|WebKitWebProcess.*(crash|terminated)|
   Gdk-ERROR`). Per-version stderr is uploaded as the
   `appimage-matrix-logs` artifact.

What CAN run locally: the matrix against a downloaded release asset
(`pwsh scripts/appimage-matrix.ps1 <file.AppImage>`), and `--fix` inside a
container — see appimage-compat-matrix.md. Do not try to build the AppImage
locally.

## atk-bridge warning is cosmetic
The "atk-bridge get_device_revents unknown signature" warning comes from the
host accessibility bus; harmless. Do not chase it as a bundling bug. Same
for `libEGL warning: DRI3 error` under Xvfb.
