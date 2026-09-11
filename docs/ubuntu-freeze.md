# The Ubuntu freeze

**Status: open; leading hypothesis H1; discriminating test shipped in
v0.15.6.** Six releases have gone into it (v0.14.1 → v0.15.6). Until
v0.15.6 everything shipped was instrumentation aimed at the wrong place, a
mitigation borrowed from known WebKitGTK bugs, or a real defect found on the
way. v0.15.6 ships the first change that targets the leading hypothesis
(native Wayland by default) and the first probe that can actually see the
freeze. The owner has not yet confirmed any of it made the freeze stop.

This document is the whole case file: what was reported, what the evidence
proves, what it was wrongly read as, the ranked hypotheses, what v0.15.6
ships, and exactly what the owner does next time.

The 2026-09-10 taskforce report that produced the corrections below is
`docs/agents/context/ubuntu-freeze-taskforce-2026-09-10.md`; it cites the
vendored crate and GTK/WebKit sources line by line.

---

## 1. The reports

Every one is from the owner, on the **Linux AppImage, Ubuntu, WebKitGTK**.
Nothing equivalent has been reported on Windows.

| Date | What the owner said | Release in hand |
|---|---|---|
| 2026-09-07 | "sometimes after a while the app freezes. Can't click on anything. When that's the case, I don't have a way to bring back the logs." | v0.14.0 |
| 2026-09-08 | "the app froze while I wasn't using it. None of the buttons work, the only responsive thing is Open repository (system picker). The window moves and resizes, the content is frozen, some areas are black and not redrawn. Can't use the Diagnostic snapshot button." | v0.14.1 |
| 2026-09-08 | Second freeze, same shape, after DMA-BUF was already disabled | v0.14.3 |
| 2026-09-09 | "whenever the windows loses focus on my ubuntu, it usually end up in a freeze." | v0.15.1 |
| 2026-09-09 | "when the crash happens, even the developper panels does not refresh!!!" | v0.15.3 |
| 2026-09-10 | Same shape on v0.15.5 (no capture) | v0.15.5 |

The shape is consistent across all of them:

- The **window** is alive — it moves, it resizes, the window manager is fine.
- The **picture** is dead — content frozen, areas going black and never
  repainting.
- **Native** UI still works — the GTK "Open repository" file picker opens.
- **In-app** buttons do nothing visible.

---

## 2. What the evidence proves

Two diagnostic snapshots were captured by the owner during real freezes
(`snapshot-2026-09-08T07-23-57`, v0.14.1, and `snapshot-2026-09-08T10-35-06`,
v0.14.3 with DMA-BUF already off). They are the only hard data we have, and
until 2026-09-10 this file read them wrong.

**The UI process's main loop was alive in both captures.** The chain, every
link in code:

- `heartbeat`, `log_frontend` and `diagnostic_snapshot` were bare
  `#[tauri::command] fn`, i.e. `ExecutionContext::Blocking`: the Rust body
  runs **inline inside the WebKitGTK callback that delivered the IPC**, with
  no runtime hop.
- On Linux both IPC transports — the `ipc://` URI-scheme handler and
  `script-message-received` — are GLib callbacks of the UI process,
  dispatched on `g_main_context_default()`, which only tao's `run_return`
  iterates, on the main thread.
- So "last heartbeat 0.3 s / 0.4 s" means the main loop dispatched a WebKit
  IPC callback within 0.4 s of the press; three and four snapshot presses
  mean it did so repeatedly, and each time ran `write_snapshot` on the main
  thread: log sync, up to 3 s of blocking HTTP per engine JSON, zip, write.
  The "engine idle at 6 req/min" fact was fetched by the main thread
  *during* the freeze.
- "Only Open repository works" is the strongest evidence of all: the dialog
  plugin runs rfd inside `run_on_main_thread`, drained only by tao's loop.
  The picker appearing means tao's loop cycled **and** a fresh GTK toplevel
  painted on the same display connection.

Two refutation passes tried to break this chain and could not.

**What the evidence does not prove:** anything about GDK's frame clock, GTK
`draw` on the main toplevel, X11 frame sync, or WebKit's UI-side backing
store. Nothing the shell measured before v0.15.6 touched the paint path. The
correct statement is: *the default GLib context and tao's main thread were
cycling; what is dead is presentation of the main window's WebKitWebView.*

Scope caveat, kept honest: "loop alive" is **proven** for the two captures
(v0.14.1, v0.14.3) and **inferred** for v0.15.1–v0.15.5 (same shape, no
capture).

### What this file used to claim, and why each claim was wrong

- **"The UI process's GTK main loop is what stops."** Contradicted by the
  two snapshots it relied on (above). Deleted.
- **The inspector argument** ("even the developer panels do not refresh" ⇒
  the loop is stuck) is a non sequitur resting on an event that never
  happened: the inspector never opened on the owner's machine (v0.15.2 and
  v0.15.3), and `developer tools open=true` is an `AtomicBool` wry sets
  unconditionally, so it proves nothing. If "developer panels" meant the APP
  LOG tab, the sentence says only "the page does not repaint". Even a real
  docked inspector shares the toplevel's `GdkFrameClock`; it freezing would
  not implicate the loop.
- **"Can't use the Diagnostic snapshot button" / "the app log is useless."**
  The button worked every time and produced the only hard data; only its
  on-screen result dialog failed. The app log's data reaches `frontend.log`
  via `log_frontend`, which works during the freeze; only the rendering is
  dead.
- **"A web-process crash is ruled out: `crash_hooks` never fired."** The
  hooks shipped in v0.14.2; the v0.14.1 capture had none. Valid for the
  second capture only.
- **The paint watchdog is blind to this freeze by construction.** In
  non-accelerated mode WebKit's `DrawingAreaProxyCoordinatedGraphics::update()`
  sends `DisplayDidRefresh` immediately after incorporating the update —
  **before GTK paints** — so the web process keeps rendering and
  `requestAnimationFrame` keeps firing whether or not pixels reach the
  screen. rAF fired 2.4 s before the second capture, so the 20 s "paint
  stall" never tripped and cannot see this freeze. `frameAgeMs` is not a
  presentation measurement.
- **v0.15.0's `WEBKIT_DISABLE_COMPOSITING_MODE=1` was a no-op** on top of
  v0.14.2's `WEBKIT_DISABLE_DMABUF_RENDERER=1`: since WebKitGTK 2.43.2 the
  DMA-BUF renderer is the only accelerated backing store, so disabling it
  alone forces non-accelerated mode. Ubuntu 24.04 is on 2.48.x. Every freeze
  from v0.14.3 on happened with **no GL in the UI process at all**, which is
  why GL/NVIDIA/DMA-BUF hypotheses rank low.
- **"The main thread's `wchan` is the answer."** Given a live loop, a
  healthy `poll_schedule_timeout` / `ep_poll` / `do_sys_poll` is the
  **expected** result of `freeze-dump.sh` and settles nothing. The v0.15.4
  script captured none of the presentation-side state; v0.15.6's does.
- **"Never reproduced on our side."** The container harness runs
  Xvfb/weston-headless with no mutter, no occlusion, no idle, no GPU. Its
  result is not evidence for or against any presentation hypothesis and
  should not have motivated compositing-off. The same holds for the
  2026-09-10 WSLg attempt (Weston, no mutter).
- **v0.15.4's flush-under-mutex defect** is a genuine parked-loop mechanism,
  but only for v0.15.2–v0.15.3 focus freezes; the captured freezes predate
  it and the v0.15.5 report postdates the fix. Keep the fix; stop treating
  it as the mechanism.

---

## 3. Ranked hypotheses

**H1 (high) — GTK3 X11 frame-sync stall under XWayland.** The toplevel's
`GdkFrameClock` is frozen waiting for a `_NET_WM_FRAME_DRAWN` that mutter
never sends. Mechanism: `gdk_x11_window_end_frame` sets `frame_pending` and
`_gdk_frame_clock_freeze()` after every frame whenever the WM advertises
`_NET_WM_FRAME_DRAWN` (gtk-3-24 `gdk/x11/gdkwindow-x11.c`); the clock thaws
only on that ClientMessage or on UnmapNotify, with no timeout
(`gdkdisplay-x11.c`). A frozen clock skips every paint phase while all other
GSources — IPC, timers, input, other toplevels' clocks — keep dispatching.
Mutter drops that message for XWayland actors it does not paint:
off-workspace, occluded, minimised, other monitor, mixed refresh/VRR
(mutter #1577, #2772; PrusaSlicer #15007; and the near-twin **Tauri** case
opencode #11939: GNOME/NVIDIA, forced `GDK_BACKEND=x11`, same `WEBKIT_*`
switches, Rust and UI heartbeats alive, gnome-shell logging "Frame has
assigned frame counter but no frame drawn time", fixed by native Wayland).
The forced x11 comes from tauri-bundler's GTK hook (tauri #15781).
Fit: every symptom — loop alive; picker paints (own toplevel, own clock, own
sync counter); window moves/resizes (mutter does that) but exposed regions
stay black (GTK never paints them); "background then come back" and "loses
focus" are exactly when mutter stops painting the actor; `WEBKIT_*` switches
irrelevant; rAF keeps firing (non-AC, above); container harness cannot show
it.
Discriminating test: **native Wayland for a week of normal use** (the
v0.15.6 default). Corroboration on the next freeze: `journalctl --user -b |
grep -i 'frame drawn'`, and `probe.txt` showing the GDK after-paint counter
stopped while the loop round-trips continue.

**H2 (medium) — mutter/XWayland stops presenting the window's buffers
although GTK paints** (unredirected XWayland windows not updated, windows
hidden after screen reconfiguration, mutter #4133; NVIDIA stale-frame
presentation). Same trigger set, same invisibility to the shell; fits black
exposed regions less well. Discriminator: `probe.txt`'s after-paint counter
**keeps advancing** while the screen is dead (H1: it stops). Same
mitigation: leave XWayland.

**H3 (low) — WebKit UI-side GL/DMA-BUF fault** (NVIDIA import, EGL after
suspend; WebKit bug 261874). Excluded as root cause for v0.14.3+ (non-AC, no
UI-process GL); could only explain the v0.14.1 capture, which had the
identical shape. Test: `POWERGIT_KEEP_DMABUF=1 POWERGIT_KEEP_COMPOSITING=1`
— in AC mode `FrameDone` is only sent from the GTK draw handler, so a frozen
clock would stop rAF and trip the paint watchdog; a shape change there is
informative for H1.

**H4 (very low) — parked main loop** (this file's former conclusion).
Refuted by §2 for the captures. Residual: rfd's `GtkGlobalThread` spawns, on
the first native dialog, a thread that iterates the **default** context
forever, contending with tao's; an unverified thread-affinity hazard, not a
parked loop. `probe.txt`'s `draw_thread_is_main` and the dialog history in
`engine.log` test it.

**H5 (very low) — page/WebKit "hidden" state never resumed.** `frontend.log`
visibility lines and non-null `frameAgeMs` already argue against it; check
the last `visibilitychange` before a freeze is `visible` and stop.

Prediction for the owner's next `freeze-dump.sh` from an X11 run: main
thread in `do_sys_poll`/`ep_poll`, engine 200, `loop alive`, `gdk frozen`.
Do not read the first two as "settled".

---

## 4. What we shipped, and what it is worth

### v0.14.1 — the diagnostic snapshot and the script watchdog

A snapshot button above Settings, plus a shell-side watchdog: the page beats
every 2 s, and 15 s of silence means the script is stuck → write the snapshot
automatically and record an incident for the next launch.

**Worth:** this is how we got any evidence at all. It did **not** catch the
freeze, because the script never stopped beating.

### v0.14.2 — the paint watchdog, self-recovery, DMA-BUF off

- Each heartbeat carries `frameAgeMs`: how long ago the page's
  one-frame-per-beat request was called back.
- New **paint stall**: beats arriving with no frame for 20 s while visible.
- A recovery ladder: snapshot → reload the webview after 20 s → after another
  30 s, a **native** dialog offering "Restart PowerGit / Keep waiting".
- `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux.

**Worth:** the ladder is useful for script stalls. The paint stall is blind
to this freeze (§2: rAF fires before GTK paints in non-AC mode). The DMA-BUF
switch did not stop it — and it took the UI process's GL out of the picture,
which is what makes H3 unlikely.

### v0.15.0 — compositing off, and the user as the detector

- `WEBKIT_DISABLE_COMPOSITING_MODE=1` on Linux: a no-op on WebKitGTK
  ≥ 2.43.2 given the DMA-BUF switch (§2). Kept because it is harmless.
- `POWERGIT_WAYLAND=1` drops the packaging hook's forced `GDK_BACKEND=x11`.
  This was the right lever, shipped opt-in and never tried by the owner.
- **Pressing the snapshot button twice within 15 s** is treated as "the
  display is dead": the shell reloads the webview at once; a third press
  offers the restart dialog.

**Worth:** the double-press was the only detector not fooled by a
live-script/dead-picture freeze until v0.15.6. Under H1 a
`WebviewWindow::reload` cannot thaw a frozen frame clock, so expect it not
to restore the picture.

### v0.15.2 — inspector and focus timeline

Release builds enable WebKit's inspector (Settings → Tools → Open developer
tools, or `POWERGIT_DEVTOOLS=1`). Native window focus changes are written to
`engine.log` independently of page JavaScript; page focus/visibility and
numbered refresh timings go to `frontend.log`.

**Worth:** the focus timeline is sound. The inspector never opened on the
owner's Ubuntu, and nothing about it would have located the fault.

### v0.15.3 — the app log, without WebKit

The git console gained an **APP LOG** tab rendering the 200-entry diagnostic
ring live. No inspector needed.

**Worth:** a good feature for every other class of bug. During this freeze
its data still reaches `frontend.log`; only its rendering is dead.

### v0.15.4 — get the main loop off the disk, and capture from outside

1. **A real defect, fixed on evidence.** Every log line did `writeln!` +
   `flush()` while holding a `Mutex<Option<File>>` on whichever thread
   logged it — including the `RunEvent` closure on the main thread on every
   focus change, contending with the sidecar's stdout task. `logwriter.rs`
   moved both files to a dedicated writer thread. Engine framework logging
   dropped to Warning (~9 000 lines/session gone).
2. **`scripts/freeze-dump.sh`** — attached to every release.

**Worth:** the logging defect is real and worth fixing. It arrived in
v0.15.2; the captured freezes predate it. It is not the mechanism.

### v0.15.5 — Browse-diff reset

Unrelated to the freeze; the owner reported one more freeze on it (no
capture).

### v0.15.6 — aim at H1, and a probe that can see the freeze

- **Native Wayland by default.** When `WAYLAND_DISPLAY` is set and
  `POWERGIT_X11` is not, the shell removes the hook's `GDK_BACKEND=x11`
  before GTK starts. `POWERGIT_X11=1` keeps XWayland; `POWERGIT_WAYLAND=1`
  is still accepted and now redundant. This is the discriminating test for
  H1: the Wayland backend uses `wl_surface` frame callbacks and the frozen
  X11 code path does not run.
- **`POWERGIT_NO_FRAME_SYNC=1`** (X11 only): after the main window is
  realized the shell calls `gdk_x11_window_set_frame_sync_enabled(false)`
  on its GdkWindow and logs `frame sync disabled (X11)` or `frame sync: not
  an X11 window`. The fallback experiment for owners who must stay on X11.
- **Paint and liveness probes** (`probe.rs`, opt-out `POWERGIT_PROBE_PAINT=0`):
  the shell counts `GdkFrameClock::after-paint`, toplevel `draw` and
  WebKitWebView `draw`, tracks `mapped`, and sends a 1 px `queue_draw_area`
  stimulus every 2 s; the page toggles a 1×1 px element's opacity per beat
  so it produces a real frame each time. A `powergit-liveness` thread sends
  a `run_on_main_thread` closure and a GLib idle source every 2 s and
  records their round-trip. Results go to `<log dir>/probe.txt`
  (rewritten atomically every 10 s and on any threshold crossing), to a
  `probe:` line in `engine.log` (every 30 s healthy, every 5 s when stale),
  and to `shell.txt` in every snapshot. The four readable outcomes: loop
  alive/GDK frozen (H1), GDK paints/webview does not, everything paints and
  the screen is dead (H2), loop stalled (H4).
- **Two watchdog kinds that fit the evidence.** `Stall::Presentation`:
  beats fresh and page frames fresh but no GTK after-paint for 20 s while
  mapped → "window not painting: page frames fresh but no GTK paint for
  Ns", snapshot, incident kind `presentation`, then the normal ladder.
  `Stall::Loop`: no main-thread round-trip for 15 s → "main loop
  unresponsive: no round-trip for Ns", snapshot and incident kind `loop`
  written from the liveness thread, never reload or restart-dialog (they
  need the loop); outranks every other kind.
- **A recovery ladder the owner can drive during the freeze**, because IPC
  is proven alive. `recover(step)` enqueues one main-thread closure per
  step. Hotkeys `Ctrl+Shift+F1`…`F9`, Settings → Tools → Recovery
  experiments, or `bash freeze-dump.sh recover <1-9|key>` from a terminal
  (writes `<log dir>/recover.request`, polled every 2 s by the liveness
  thread).

  | step | key | action |
  |---|---|---|
  | 1 | `queue_draw` | `gtk_window.queue_draw()` |
  | 2 | `thaw` | `thaw_updates()` / `thaw_toplevel_updates()` on the toplevel GdkWindow |
  | 3 | `hide_show` | `window.hide()` then `window.show()` |
  | 4 | `resize` | inner width +1 px then back |
  | 5 | `present` | `gtk_window.present()` |
  | 6 | `frame_sync_off_hide_show` | `set_frame_sync_enabled(false)` if X11, then hide+show |
  | 7 | `reload` | `WebviewWindow::reload()` |
  | 8 | `new_window` | a second webview window `recovery-<n>` at the same URL and size |
  | 9 | `webview_snapshot` | `webkit_web_view_get_snapshot` of the visible region, 5 s timeout |

  Each logs `recover #<n> <key>: requested`, `done in <ms>ms` (or `failed:
  <why>`), and 3 s later a `probe` readout. Expected under H1: only 3, 6 and
  8 restore the picture (hide/show unmaps, which thaws the clock; a new
  toplevel gets a new clock); `queue_draw`, `resize` and `reload` cannot
  thaw a frozen clock. Which steps work is itself evidence.
- `diagnostic_snapshot` is now `#[tauri::command(async)]`, so a press no
  longer blocks the main thread on log sync, HTTP and zip.
- `freeze-dump.sh` collects the presentation side (§5).

**Worth:** the first release that can distinguish H1 from H2 from H4 on the
owner's machine, and the first that changes the code path H1 lives in.

---

## 5. What the owner does next time it freezes

Before killing anything, from a terminal (once: `sudo apt install xdotool
x11-utils elfutils`):

```
bash freeze-dump.sh
```

v0.15.6's script collects, beside the v0.15.4 thread states, backtraces,
engine health and log tails: `probe.txt`; the UI process's real environment
(`GDK_BACKEND`, `WAYLAND_DISPLAY`, `DISPLAY`, `XDG_SESSION_TYPE`,
`WEBKIT_*`, `POWERGIT_*`, `LIBGL_*`); `xprop -id <win> _NET_WM_STATE
_NET_WM_SYNC_REQUEST_COUNTER` and whether the WM advertises
`_NET_WM_FRAME_DRAWN`; `journalctl --user -b | grep -i 'frame drawn'`;
gnome-shell, libwebkit2gtk, mutter and xwayland versions; the NVIDIA/Mesa
line; whether a `WebKitGPUProcess` exists. Every tool is optional. It ends
with a **Quick read**: `loop alive|stalled`, `gdk painting|frozen`,
`webview drawing|frozen` from `probe.txt` (thresholds 15 s / 20 s / 20 s).

If you want the raw commands instead:

```
W=$(xdotool search --name '^PowerGit$' | head -1)
xprop -id $W _NET_WM_STATE _NET_WM_SYNC_REQUEST_COUNTER
xprop -root _NET_SUPPORTED | grep -c FRAME_DRAWN
journalctl --user -b | grep -i 'frame drawn' | tail -n 20
cat ~/.local/share/com.cynacons.powergit/logs/probe.txt
gnome-shell --version; dpkg -l | grep libwebkit2gtk; nvidia-smi --query-gpu=driver_version --format=csv
```

Then, **in order, noting after each whether the picture comes back**:

1. Resize by dragging a corner.
2. Minimise and restore (Super+H, then click the dock icon).
3. `xdotool windowunmap $W; sleep 1; xdotool windowmap $W`
4. `Ctrl+Shift+F3` (hide/show) — or `bash freeze-dump.sh recover 3`.
5. `Ctrl+Shift+F6` (frame sync off + hide/show) — or `recover 6`.
6. `Ctrl+Shift+F8` (new window) — or `recover 8`.
7. Press the Diagnostic snapshot button twice.

Send the freeze tarball, the snapshot zip, and the list of what recovered.

### Preventive plan: one variable a day

Run for a week with the usual background-then-return usage and report
"froze / did not freeze" per day:

1. **v0.15.6 as is** (native Wayland; `shell.txt` must show
   `GDK_BACKEND=wayland`). If the frameless title bar will not drag or
   resize, say so — that is the known Wayland risk, and the opt-out is
   `POWERGIT_X11=1`.
2. If it still freezes on Wayland: `POWERGIT_X11=1 POWERGIT_NO_FRAME_SYNC=1
   ./PowerGit_*.AppImage` — back on X11 with the frame-sync path disabled.
3. If it still freezes: `POWERGIT_KEEP_DMABUF=1 POWERGIT_KEEP_COMPOSITING=1`
   (H3 test; a shape change is informative).

A week without a freeze on Wayland closes the case on evidence.

---

## 6. The other freeze — fixed, and not the same bug

Do not confuse the two.

**v0.13.20 (2026-09-07), field report on a 10 000-revision repository:** every
refresh froze the UI although the engine answered in ~300 ms.

Root cause found and fixed: `reloadHistory` rebuilt page 0 through
`toRevision`, so no row kept its object identity, the layout effect's append
check never held, and every refresh — SSE, F5, or returning focus to the
window — posted a full reset to the layout worker: `structuredClone` of 10k
rows plus a complete lane layout. `historyMerge.ts` now reuses the existing
`Revision` object when nothing about it changed and reports `unchanged`, so a
no-op refresh costs one fetch and a compare.

**Owner-ticked as fixed.** That was a genuine main-thread JavaScript stall,
platform-neutral, and entirely unrelated to the WebKitGTK presentation freeze
this document is about. It is worth remembering only because "the app froze"
described both.

---

## 7. Where the investigation stands

**Proven (two captures):**
- Linux AppImage / WebKitGTK / Ubuntu only, always under XWayland so far.
- The page, the engine, **and the UI process's main loop** are alive during
  the freeze. What is dead is presentation of the main window.

**Leading hypothesis:** H1, the GTK3 X11 frame-sync stall (§3). v0.15.6
removes that code path by default and ships a probe that would show the
stall directly if it happens again on X11.

**Unknown:**
- Whether native Wayland stops it (the owner's week-long run answers this).
- H1 vs H2 on a real freeze (`probe.txt`'s after-paint counter decides).
- Whether the frameless title bar behaves under Wayland on the owner's
  machine.

**Never reproduced on our side**, and the harnesses we have cannot: neither
the container matrix nor WSLg runs mutter. A faithful reproduction needs a
GNOME Wayland VM with an XWayland client left occluded/minimised across
workspace switches.

**Next, in order:**

1. The owner's day-by-day report from §5.
2. On the next freeze, the v0.15.6 `freeze-dump.sh` tarball plus which
   recovery steps worked.
3. Only if Wayland also freezes with `probe.txt` saying `gdk painting`:
   H2/H4 become the working hypotheses and `draw_thread_is_main` and the
   journal are read next.

---

## See also

- `docs/agents/context/ubuntu-freeze-taskforce-2026-09-10.md` — the
  taskforce report, with the source citations behind §2 and §3
- `docs/agents/memories/diagnostics.md` — logs, the snapshot package, the
  watchdog ladder, `probe.txt`, the recovery ladder, how to read `shell.txt`,
  and how to simulate a freeze in dev
- `scripts/freeze-dump.sh` — the capture script and `recover` subcommand
- `frontend/src-tauri/src/watchdog.rs` — the stall state machine (unit-tested)
- `frontend/src-tauri/src/probe.rs`, `recovery.rs` — the v0.15.6 probes and
  ladder
- `frontend/src-tauri/src/logwriter.rs` — why logging left the main thread
- `docs/agents/memories/webkitgtk-css.md` — unrelated WebKitGTK rendering traps
  worth knowing about in this codebase
