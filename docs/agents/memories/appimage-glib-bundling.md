# AppImage GLib/GIO bundling mismatches

## The owner-reported errors map to one root-cause family
`undefined symbol: g_task_set_static_name` (gvfs) and
`g_assertion_message_cmpint` (dconf) need GLib >= 2.76; the libcurl-gnutls
error needs nghttp2 >= ~1.50. Bundled objects were built against newer
GLib/nghttp2 than what they resolve against at runtime (host stack pulled in
via webkit2gtk). Non-fatal but noisy and degrades native file dialogs /
settings persistence. 2026-08-24.

## Where releases are built — and why versions can drift
`.github/workflows/release.yml` linux job pins `ubuntu-22.04` today, but
older release tags may have been built on other runners; linuxdeploy copies
whatever the build host provides, so runner version bumps silently change
bundle contents. Always inspect a released AppImage with
`scripts/inspect-appimage.sh <file.AppImage>` before shipping.

## The guard lives in CI, not locally
Windows dev hosts cannot build Linux AppImages; the Docker ubuntu-check
container lacks Rust/tauri prereqs. The regression guard therefore runs as a
release.yml step (`Inspect AppImage ...`, runs inspect-appimage.sh --fix)
right after `tauri build` and before upload. Don't try to reproduce locally.

## Two-layer guard since v0.10.0
inspect-appimage.sh now reports ANY unresolved symbol (`ldd -r` against the
bundle's own libs), not a hard-coded symbol list. After it, release.yml
launches the repacked AppImage headless (xvfb) inside a stock ubuntu:22.04
Docker container — real user package versions, not the runner's updated
stack — and fails on `undefined symbol|Failed to load module` in stderr.
Both verify only on the next tagged release; treat the first post-v0.10.0
tag's linux job as the acceptance run.

## atk-bridge warning is cosmetic
The "atk-bridge get_device_revents unknown signature" warning comes from the
host accessibility bus; harmless. Do not chase it as a bundling bug.
