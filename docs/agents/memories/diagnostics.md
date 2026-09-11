# Diagnostics: logs, the snapshot package, the watchdog and the probes (v0.14.1 → v0.15.6)

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
- `probe.txt` (v0.15.6): the liveness thread's paint/loop readout, see
  below. `recover.request`: a pending recovery step written by
  `freeze-dump.sh recover`, consumed by the same thread.

## Triggers

- Rail → "Diagnostic snapshot" (above Settings): `takeSnapshot()` in
  `src/diagnostics/snapshot.ts` builds the page dump and invokes
  `diagnostic_snapshot`. In the browser (no shell) the dialog shows the
  dump text to copy instead.
- Watchdog: the page invokes `heartbeat` every 2 s (`useHeartbeat`), and
  since v0.14.2 each beat carries `frameAgeMs`: how long ago the page's
  one-animation-frame-per-beat request was painted (null while hidden).
  The shell checks every 5 s. Five stalls (`watchdog::Stall`):
    - `script`: 15 s without a beat → "webview unresponsive: no heartbeat
      for N s".
    - `paint`: beats arrive but no frame for 20 s while visible → "webview
      not painting: script beats but no frame for N s". **This is not the
      owner's Linux freeze**: in non-accelerated mode WebKit answers the
      page's frame request before GTK paints, so rAF kept firing (2.4 s)
      in both captured freezes and this stall never tripped. It catches a
      web process that stopped rendering, nothing about presentation.
    - `presentation` (v0.15.6): beats fresh, page frames fresh, but no GDK
      after-paint for 20 s while the window is mapped **and has native
      focus**, counted from the moment focus arrived (v0.15.7) → "window not
      painting: page frames fresh but no GTK paint for N s". This is the
      shape of the owner's freeze under hypothesis H1. Focus, not mapped,
      because on Wayland the compositor stops frame callbacks for a window
      hidden behind another one, so GTK legitimately paints nothing while
      the window stays mapped; v0.15.6 reported that as a stall 23 s after
      every focus loss and reloaded the page in the background.
    - `loop` (v0.15.6): no main-thread round-trip for 15 s → "main loop
      unresponsive: no round-trip for N s". Snapshot and incident are
      written from the liveness thread; never reload or restart-dialog
      (both need the loop). Outranks every other kind.
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
(v0.15.0; `POWERGIT_KEEP_COMPOSITING=1`).

### WebKitGTK ≥ 2.43.2: the compositing switch is a no-op

Since 2.43.2 the DMA-BUF renderer is the only accelerated backing store, so
`WEBKIT_DISABLE_DMABUF_RENDERER=1` alone forces non-accelerated mode
(`AcceleratedBackingStore::create` returns null). Ubuntu 24.04 ships
2.48.x. Consequence: every freeze from v0.14.3 on ran with no GL in the UI
process, and no `WebKitGPUProcess` should exist (`freeze-dump.sh` checks).

### Wayland is the default since v0.15.6; `POWERGIT_X11=1` opts out

tauri-bundler's GTK hook (linuxdeploy-plugin-gtk) exports `GDK_BACKEND=x11`
unconditionally, so every Ubuntu run before v0.15.6 was XWayland. Now, when
`WAYLAND_DISPLAY` is set and `POWERGIT_X11` is not, `main.rs` removes
`GDK_BACKEND` before GTK starts. `POWERGIT_WAYLAND=1` is still accepted and
redundant. Known risk: the frameless title bar's drag/resize under Wayland
(tauri #12361); that is what the opt-out is for.

### `POWERGIT_NO_FRAME_SYNC=1` (X11 only)

After the main window is realized, the shell calls
`gdkx11::X11Window::set_frame_sync_enabled(false)` on its GdkWindow and logs
`frame sync disabled (X11)` or `frame sync: not an X11 window`. Disables the
`_NET_WM_FRAME_DRAWN` wait that hypothesis H1 blames. Meaningless on Wayland.

### `POWERGIT_PROBE_PAINT=0` disables the paint probe and liveness thread

Default on. See "probe.txt" below.

### `shell.txt` display facts

Records the session type, Wayland display, GDK backend, the WEBKIT_* and
POWERGIT_* switches, the WebKitGTK version, LIBGL_ALWAYS_SOFTWARE, the
NVIDIA driver line, and since v0.15.6 the probe readout and probe.txt fields.

## probe.txt (v0.15.6)

`<log dir>/probe.txt`, written by the shell's `powergit-liveness` thread,
rewritten atomically (temp + rename) every 10 s and immediately when any age
crosses its threshold. One `key=value` per line; missing measurements print
`n/a`:

```
written=2026-09-10T22:14:03Z
loop_tauri_rtt_ms=0.4        loop_tauri_age_s=1.2
loop_glib_rtt_ms=0.3         loop_glib_age_s=1.2
gdk_after_paint_count=1834   gdk_after_paint_age_s=0.9
gdk_paint_requested_age_s=0.1
toplevel_draw_age_s=1.0      webview_draw_age_s=1.1
window_mapped=true
beat_age_s=0.3               frame_age_s=0.2
gdk_backend=x11              frame_sync=enabled
draw_thread_is_main=true
```

`loop_*_age_s` is the age of the last completed round-trip: a
`run_on_main_thread` closure (tauri) and a `glib::idle_add_full` source
(glib) sent every 2 s. Never `MainContext::invoke` — it runs on the caller
when the context has no owner. `gdk_after_paint_*` come from the toplevel's
`GdkFrameClock::after-paint`, reconnected on `map` (realize can hand out a
new clock); the shell requests a 1 px `queue_draw_area` every 2 s and the
page toggles a 1×1 px element's opacity per beat so there is always a frame
to paint. Thresholds: loop 15 s, GDK paint 20 s, webview draw 20 s.

Reading it: loop fresh + GDK stale = H1 (frozen frame clock); everything
fresh with a dead screen = H2 (compositor not presenting); loop stale = a
parked main loop (H4). `freeze-dump.sh` prints this verdict as its Quick
read.

### The `probe:` engine.log line

`probe: loop tauri 0.4ms/1.2s glib 0.3ms/1.2s | gdk paint 0.9s (req 0.1s)
n=1834 | toplevel draw 1.0s | webview draw 1.1s | mapped | beat 0.3s |
frame 0.2s` — every 30 s while healthy, every 5 s while any age exceeds
its threshold. The same text follows each recovery step 3 s later.

## Recovery ladder (v0.15.6)

`recover(step)` is a synchronous command (IPC is proven alive during the
freeze) that only enqueues a closure on the main thread. Steps and keys:
1 `queue_draw`, 2 `thaw`, 3 `hide_show`, 4 `resize`, 5 `present`,
6 `frame_sync_off_hide_show`, 7 `reload`, 8 `new_window` (second webview
window labelled `recovery-<n>`; `capabilities/default.json` allows
`recovery-*`), 9 `webview_snapshot` (`webkit_web_view_get_snapshot`, 5 s
timeout). Linux-only steps log `recover #<n> <key>: not available on this
platform` elsewhere.

### Hotkeys

`Ctrl+Shift+F1` … `Ctrl+Shift+F9` = steps 1–9, registered in
`frontend/src/hotkeys/`, every phase, capture phase, Tauri only. Each press
also `report()`s `recovery: step <n> requested` to the diagnostics ring.
Settings → Tools → "Recovery experiments" has one button per step. Try 3,
6, 8 first.

### engine.log lines

`recover #<n> <key>: requested` (or `requested (file)`), then from the
main-thread closure `recover #<n> <key>: done in <ms>ms` or `failed:
<why>`, then 3 s later `recover #<n> <key>: probe <readout>`. `<n>` is a
per-session counter from 1. Under H1 only 3, 6 and 8 should restore the
picture; which ones did is evidence.

### `<log dir>/recover.request`

`bash scripts/freeze-dump.sh recover <1-9|key>` writes the step number to
this file. The liveness thread polls it every 2 s, deletes it, and runs the
step exactly as the command does. Useful when the hotkeys do not reach a
frozen window.

## Capturing a freeze from outside: `scripts/freeze-dump.sh`

Run from a terminal **while the window is frozen**. Never kills anything,
needs no root. Collects per-thread state and `wchan` for every PowerGit
process, backtraces when `eu-stack`/`gdb` exist, engine `/health`, both log
tails, `probe.txt`, `incident.json`, the UI process's filtered
`/proc/<pid>/environ`, `xprop` on the window and root (`_NET_WM_STATE`,
`_NET_WM_SYNC_REQUEST_COUNTER`, whether `_NET_WM_FRAME_DRAWN` is
advertised), `journalctl --user -b | grep -i 'frame drawn'`, gnome-shell /
libwebkit2gtk / mutter / xwayland versions, the NVIDIA/Mesa line, and
`WebKitGPUProcess` presence. Every tool is optional and leaves a note when
missing. Ends with the Quick read from `probe.txt`.

A healthy main-thread `wchan` (`poll_schedule_timeout`, `ep_poll`,
`do_sys_poll`) is the **expected** result and settles nothing; `probe.txt`
is what to read.

## The user as detector (v0.15.0)

Until v0.15.6 nothing the shell measured could see a GTK presentation
failure, but the user can: they press the snapshot button again. `diagnostic_snapshot`
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

## What is proven about the owner's freeze (2026-09-10)

The case file is [docs/ubuntu-freeze.md](../../ubuntu-freeze.md); the
source citations are in
`docs/agents/context/ubuntu-freeze-taskforce-2026-09-10.md`. Facts only:

### The UI process's main loop is alive during the freeze

Proven for both captures (v0.14.1, v0.14.3). `heartbeat`, `log_frontend`
and `diagnostic_snapshot` were blocking `#[tauri::command] fn`s whose
bodies run inline in the WebKitGTK IPC callback, which GLib dispatches on
the default context that only tao's main thread iterates. "Heartbeat 0.4 s
old" and repeated snapshot presses therefore mean the main loop was
dispatching. The native file picker opening (rfd inside
`run_on_main_thread`) is the same proof. Inferred, not captured, for
v0.15.1–v0.15.5.

### What is dead is presentation of the main window

Nothing the shell measured before v0.15.6 touched the paint path, which is
why no in-app surface showed the freeze — not because the loop had stopped.
The snapshot button and `log_frontend` worked throughout; only their
rendering did not.

### The inspector sentence proves nothing

"Even the developer panels do not refresh": the inspector never opened on
the owner's machine, `developer tools open=true` is an unconditional
`AtomicBool`, and a docked inspector would share the toplevel's
`GdkFrameClock` anyway.

### The main-thread `wchan` is not the answer

With a live loop, `freeze-dump.sh`'s `threads.txt` shows the healthy idle
row. Read `probe.txt` instead (above).

### v0.15.4's flush-under-mutex fix is real but not the mechanism

Genuine parked-loop hazard, only possible for v0.15.2–v0.15.3; the captured
freezes predate it and the v0.15.5 report postdates the fix.

### What we changed in our own code (v0.15.4)

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

### Reading `threads.txt`

| wchan                              | meaning                                    |
| ---------------------------------- | ------------------------------------------ |
| `futex_wait_queue`                 | waiting on a lock -- someone else holds it |
| `wait_on_page_bit`, `io_schedule`  | blocked on disk                            |
| `poll_schedule_timeout`, `ep_poll`, `do_sys_poll` | idle in the event loop; healthy, and expected for this freeze |
| `do_wait`, `hrtimer_nanosleep`     | sleeping; healthy                          |

Tested on Ubuntu against a process deliberately blocked on a mutex: it
reported `futex_wait_queue` for the main thread. The debugger branch is
untested -- no debugger was installable in the test environment.

## Incident kinds

`incident.json` `kind` and `describeIncident` in
`frontend/src/diagnostics/snapshot.ts`: `script`, `paint`, `crash`,
`forced` (double snapshot press), and since v0.15.6 `presentation` ("the
window stopped painting while the page kept running") and `loop` ("the
shell's main loop stopped responding").

## Snapshot interpretation

Start with `shell.txt` (the probe readout: loop ages vs GDK paint age is
the H1/H2/H4 discriminator; last heartbeat vs last frame: a fresh beat with
an old frame is a paint stall; "webview stalled" says whether the watchdog
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
