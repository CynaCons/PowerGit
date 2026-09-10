# Diagnostics: logs, the snapshot package and the watchdog (v0.14.1)

> The Ubuntu freeze itself — every report, what the evidence supports,
> what each release changed and what is still unknown — is written up in
> [docs/ubuntu-freeze.md](../../ubuntu-freeze.md). This file is the
> reference for the machinery.

Owner report: "sometimes after a while the app freezes. Can't click on
anything. When that's the case, I don't have a way to bring back the logs."

## Where things live

The shell's log directory is Tauri's `app_log_dir()`:
`%LOCALAPPDATA%\com.cynacons.powergit\logs` on Windows,
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

`main.rs` sets, before WebKit starts and unless the variable is already
set: `WEBKIT_DISABLE_DMABUF_RENDERER=1` (v0.14.2; keep the default with
`POWERGIT_KEEP_DMABUF=1`) and `WEBKIT_DISABLE_COMPOSITING_MODE=1`
(v0.15.0; `POWERGIT_KEEP_COMPOSITING=1`). The second one came from the
snapshot of 2026-09-08 10:35: v0.14.3, DMA-BUF already off, heartbeat
0.4 s, **animation callbacks still firing 2.4 s ago**, four button presses in two
seconds. This suggests a presentation failure, but a requestAnimationFrame
callback does not prove pixels were rendered or presented. The container
harness (docker/appimage-check/launch.sh) has
always run with compositing mode off and never showed a black window.

The AppImage runs through XWayland on a Wayland session: tauri-bundler's
GTK hook (linuxdeploy-plugin-gtk) exports `GDK_BACKEND=x11`
unconditionally. `POWERGIT_WAYLAND=1` removes it (only when
`WAYLAND_DISPLAY` is set) so GTK talks Wayland directly; opt-in because
the frameless title bar's drag/resize under Wayland is unverified.

`shell.txt` records the session type, Wayland display, GDK backend, the
WEBKIT_* switches, the POWERGIT_* switches, the WebKitGTK version,
LIBGL_ALWAYS_SOFTWARE and the NVIDIA driver line.

## The user as detector (v0.15.0)

Nothing the shell measures can see a GTK presentation failure, but the
user can: they press the snapshot button again. `diagnostic_snapshot`
keeps the press times; a second press within 15 s logs "snapshot button
pressed N times ...: treating the display as dead", `watchdog::force`
records a _forced_ stall and reloads the webview at once, and the saved
path is shown natively from the second press on. A third press while the
forced stall stands shows the native restart dialog. The forced stall
expires 60 s after its reload (the measurements cannot confirm or deny it).

## Focus-loss investigation (2026-09-09, v0.15.2)

Owner: "whenever the windows loses focus on my ubuntu, it usually end up in a freeze."
This is a trigger to investigate, not a confirmed root cause or fixed defect.
Native window focus changes are flushed to engine.log independently of page
JavaScript. Page focus/blur/visibility changes and numbered refresh start/end
durations are sent immediately to frontend.log and printed in the console.
Focus regain triggers a full repository refresh; focus loss itself does not.

Release builds enable the platform inspector: Settings → Tools → Open developer
tools, or launch `POWERGIT_DEVTOOLS=1 ./PowerGit_0.15.2_amd64.AppImage`
(substitute the actual downloaded filename). Use the inspector's docking controls
to select the right side if supported by the installed WebKitGTK, or detach it.
Docking is platform-controlled, not forced by PowerGit. Open Console and enable
preserving logs before switching to another window. Inspect engine.log and
frontend.log even if the console remains silent. Existing automatic watchdog
recovery remains enabled and can reload the page while investigating.

## The app log (v0.15.3)

The inspector is not the only way to read the console any more, and on the
owner's Ubuntu it was not a way at all: `Settings -> Tools -> Open developer
tools` shipped in v0.15.2 with Tauri's `devtools` feature compiled in, and
the WebKitGTK inspector still did not appear. The command returned `()`, so
nothing reported why.

Now: the git console panel has two tabs, **GIT** and **APP LOG**. The app tab
renders the diagnostic ring live -- errors, unhandled rejections, focus and
visibility transitions, numbered refresh start/end timings, long tasks, and
every `console.*` call. `Settings -> Tools -> Open app log` opens it, so does
Ctrl+Shift+backtick. It needs no inspector and works identically on every
platform.

Two things to know if you touch this:

- `captureConsole()` snapshots the console methods **at install time**, not at
  module load, and `report` echoes errors through that snapshot. Echoing
  through the replacement would report every entry for ever. Undo restores the
  raw functions it found, not bound copies, so a spy around it still
  recognises its own.
- `diagnosticsSnapshot()` returns a **fresh array whenever the ring changes**.
  It used to return the live `entries`, which is mutated in place -- and since
  `useSyncExternalStore` and `useMemo` both compare by reference, the panel
  rendered once and froze (four entries held, one shown). Do not "optimise"
  that copy away.

`open_devtools` still asks for the inspector, logs `developer tools requested`,
and 1.5 s later logs `developer tools open=true|false`. The check is late and
only logged on purpose: WebKitGTK attaches asynchronously, so reading it
inline would report a failure on machines where it merely had not finished,
and a wrong error is worse than the silence it replaces.

## The freeze is in the UI process, not the page (v0.15.4)

Owner, 2026-09-09: "when the crash happens, even the developper panels does
not refresh!!!" That is the most informative sentence we have about this bug.

The WebKitGTK inspector is a **separate web view driven by the same GTK main
loop** as the window. If the inspector also stops updating, the web content
is not what is stuck -- the UI process's main loop is. This fits everything
else: black areas that never repaint when the window is moved, and the
snapshot of 2026-09-08 showing the page still firing animation-frame
callbacks 2.4 s earlier. Content alive, presentation dead.

**Consequence: no in-app surface can diagnose this.** Not the snapshot
button, not the recovery panel, not v0.15.3's app log. They all render
through the loop that has stopped. Only two channels survive: files already
flushed to disk, and other processes.

### What we changed in our own code

Logging used to do `writeln!` + `flush()` while holding `Mutex<Option<File>>`,
on whichever thread called it -- and one caller is the `RunEvent` closure,
i.e. the run loop, on the main thread, on **every window focus change**
(added in v0.15.2, in the code investigating focus freezes). The sidecar's
stdout task takes the same lock for every line the engine prints, and the
engine printed a line per HTTP request. So a focus change could park the main
loop behind another thread's flush.

`logwriter.rs` now owns both files on its own thread; `log_line` is a channel
send. Nothing that logs touches the disk on the caller's thread. `sync()` is
the only blocking call and exists for snapshots and shutdown -- never call it
from the main loop. The engine's framework logging also drops to Warning
(`POWERGIT_LOG_LEVEL=Information` restores it), which removed the per-request
churn behind all of it.

This is a real defect fixed on the evidence. It is **not** proven to be the
owner's freeze, which predates v0.15.2 -- do not write it up as the cause.

### Capturing the next one

`scripts/freeze-dump.sh`, run from a terminal **while the window is frozen**.
It reads `/proc` for every PowerGit process: per-thread state and `wchan`,
which needs no debugger and no root, plus backtraces when `eu-stack` or `gdb`
is present, whether the sidecar still answers `/health`, and the log tails.

Read `threads.txt` first. The main thread's `wchan` is the answer:

| wchan                              | meaning                                    |
| ---------------------------------- | ------------------------------------------ |
| `futex_wait_queue`                 | waiting on a lock -- someone else holds it |
| `wait_on_page_bit`, `io_schedule`  | blocked on disk                            |
| `poll_schedule_timeout`, `ep_poll` | idle in the event loop; healthy            |
| `do_wait`, `hrtimer_nanosleep`     | sleeping; healthy                          |

If the engine still answers while the window is dead, the freeze is confined
to the UI process. Tested on Ubuntu against a process deliberately blocked on
a mutex: it reported `futex_wait_queue` for the main thread. The debugger
branch is untested -- no debugger was installable in the test environment.

## Snapshot interpretation

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
