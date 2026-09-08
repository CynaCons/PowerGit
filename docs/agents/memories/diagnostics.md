# Diagnostics: logs, the snapshot package and the watchdog (v0.14.1)

Owner report: "sometimes after a while the app freezes. Can't click on
anything. When that's the case, I don't have a way to bring back the logs."

## Where things live

The shell's log directory is Tauri's `app_log_dir()`:
`%APPDATA%\com.cynacons.powergit\logs` on Windows,
`$XDG_DATA_HOME/com.cynacons.powergit/logs` (default `~/.local/share/...`)
on Linux. Settings → Tools → "Open logs folder" opens it. Files:

- `engine.log` (+ `.1`): sidecar stderr, exits and restarts, what the shell
  logs itself (`log_line` in lib.rs), including watchdog transitions and
  every snapshot written.
- `frontend.log` (+ `.1`): every `report()` line from `src/diagnostics.ts`,
  streamed through the `log_frontend` command every 2 s, plus `[perf]`
  long tasks (>200 ms, with the current `setActivity` label) and a
  `[sample]` line every 60 s (JS heap, rows, phase).
- `snapshot-<timestamp>.zip`: the package. `shell.txt` (version, OS, pids,
  uptime, engine port, restarts, last heartbeat age, unresponsive-for),
  `frontend.json` (the page's dump: state, diagnostics ring, long tasks,
  engine health/sessions/recents/jobs as the page saw them; empty when the
  watchdog wrote it), both logs, and `engine/*.json` fetched by the shell
  itself over `tinyhttp.rs` (works while the page is frozen).
- `incident.json`: written by the watchdog with the snapshot path; read
  and deleted by `last_incident` on the next launch, which shows the
  banner (`IncidentBanner.tsx`).

## Triggers

- Rail → "Diagnostic snapshot" (above Settings): `takeSnapshot()` in
  `src/diagnostics/snapshot.ts` builds the page dump and invokes
  `diagnostic_snapshot`. In the browser (no shell) the dialog shows the
  dump text to copy instead.
- Watchdog: the page invokes `heartbeat` every 2 s (`useHeartbeat`), and
  since v0.14.2 each beat carries `frameAgeMs`: how long ago the page's
  one-animation-frame-per-beat request was painted (null while hidden).
  The shell checks every 5 s. Three stalls (`watchdog::Stall`):
  - `script`: 15 s without a beat → "webview unresponsive: no heartbeat
    for N s".
  - `paint`: beats arrive but no frame for 20 s while visible → "webview
    not painting: script beats but no frame for N s". This is the owner's
    Linux freeze (2026-09-08): window moves, page reacts, picture frozen
    and black.
  - `crash`: the platform said so (`crash_hooks.rs`: WebKitGTK
    `web-process-terminated`, WebView2 `ProcessFailed`) → "webview
    process crashed".
  Every stall writes the automatic snapshot and `incident.json` with a
  `kind`. Then the recovery ladder: 20 s into the stall (at once for a
  crash) "watchdog: reloading the webview" (`WebviewWindow::reload`,
  the engine session survives); 30 s after a reload that did not bring
  frames back, a native dialog "Restart PowerGit / Keep waiting"
  (`ask_restart`, drawn by the OS so it shows over a black webview;
  `AppHandle::restart` on yes). Recovery logs "webview responsive again
  after N s (<kind> stall)". A page that never beat (still booting) is
  not an incident. `watchdog.rs::step` is the pure state machine.
- Snapshot button with a dead picture: `diagnostic_snapshot` shows the
  saved path in a native dialog when the page has not painted for 20 s,
  because its own dialog would never appear (the owner pressed the
  button three times on 2026-09-08 and every press wrote a zip).

## Linux display stack

`main.rs` sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` before WebKit starts
(unless already set, or `POWERGIT_KEEP_DMABUF=1`). Black or frozen
WebKitGTK views after idle on NVIDIA and some Wayland sessions are the
documented symptom of that renderer, and this is its documented switch.
`shell.txt` records the session type, Wayland display, GDK backend, the
WEBKIT_* switches, LIBGL_ALWAYS_SOFTWARE and the NVIDIA driver line so a
report says which stack the freeze happened on. Next step if a paint
stall still appears with DMA-BUF off: `WEBKIT_DISABLE_COMPOSITING_MODE=1`.

## Reading a snapshot

Start with `shell.txt` (last heartbeat vs last frame: a fresh beat with an
old frame is a paint stall; "webview stalled" says whether the watchdog
saw it and how far the recovery ladder went; "web process crash"; the
display facts), then the tail of `frontend.log` (the last `[perf]` and
`[sample]` lines say what the page was doing and how big it was), then
`engine/sessions.json` (busy sessions, watcher counts) and the jobs files.

## Simulating a freeze in dev

In the dev app's devtools console: `const t = Date.now(); while (Date.now() - t < 20000) {}`.
Twenty seconds later engine.log has the watchdog lines and a snapshot; the
next launch shows the banner.

A paint stall: `window.requestAnimationFrame = () => 0` in the console.
Frames stop, beats continue; ~25 s later engine.log has "webview not
painting", the snapshot, then "reloading the webview", and the reloaded
page recovers ("responsive again ... (paint stall)").
