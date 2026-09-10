# The Ubuntu freeze

**Status: open. Root cause unknown.** Five releases have gone into it
(v0.14.1 → v0.15.4). Everything shipped so far is either instrumentation, a
mitigation borrowed from known WebKitGTK bugs, or a real defect found on the
way — none of it is proven to be the cause, and the owner has not confirmed
any of it made the freeze stop.

This document is the whole case file: what was reported, what the evidence
actually supports, what we changed, what we ruled out, and the one thing that
would settle it.

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

The shape is consistent across all of them:

- The **window** is alive — it moves, it resizes, the window manager is fine.
- The **picture** is dead — content frozen, areas going black and never
  repainting.
- **Native** UI still works — the GTK "Open repository" file picker opens.
- **In-app** buttons do nothing visible.

---

## 2. What the evidence actually supports

Two diagnostic snapshots were captured by the owner during real freezes.
They are the only hard data we have.

### `snapshot-2026-09-08T07-23-57` (v0.14.1)

- Three presses of the Diagnostic snapshot button **all reached the shell**.
- The page's heartbeat was **0.3 s old** at each one.
- The watchdog had logged nothing.
- The engine was idle at ~6 requests/minute, no long tasks, no errors.

So: the page's JavaScript was running normally and the Rust shell was
receiving its messages. Only the pixels were stale.

### `snapshot-2026-09-08T10-35-06` (v0.14.3, DMA-BUF already disabled)

- Heartbeat **0.4 s** old.
- **`requestAnimationFrame` callbacks still firing 2.4 s earlier.**
- Four button presses inside two seconds.
- Running under **XWayland** on a Wayland session (the AppImage's GTK
  packaging hook exports `GDK_BACKEND=x11` unconditionally).

### The sentence that moved the investigation

> "when the crash happens, even the developper panels does not refresh"

The WebKitGTK inspector is **a separate web view driven by the same GTK main
loop** as the application window. If the inspector also stops updating, the
web content is not what is stuck — **the UI process's main loop is**.

That single observation reframes everything above. Content alive, presentation
dead, is exactly what a stalled GTK main loop looks like from inside the page:
the web process keeps running JavaScript and keeps firing animation-frame
callbacks, and none of it ever reaches the screen because the process that
composites and presents is parked.

### The consequence, stated plainly

**No surface inside the app can diagnose this failure.** Not the Diagnostic
snapshot button, not the recovery panel, not v0.15.3's app log, not WebKit's
own inspector. They are all drawn by the loop that has stopped. Only two
channels survive a stalled main loop: **files already flushed to disk**, and
**other processes**.

Five releases of in-app instrumentation were built before this was understood.
That is the single most expensive mistake in this investigation.

---

## 3. What we have ruled out

| Ruled out | How |
|---|---|
| A stuck page / JavaScript deadlock | Heartbeat 0.3–0.4 s old and rAF callbacks firing during both captured freezes |
| The engine sidecar | Idle at 6 req/min, answering, no errors, in both snapshots |
| A web-process crash | `crash_hooks.rs` hooks WebKitGTK's `web-process-terminated`; it never fired |
| The DMA-BUF renderer alone | The second freeze happened with `WEBKIT_DISABLE_DMABUF_RENDERER=1` already set |
| A repository-size / layout stall | That is a **different, fixed** bug — see §6 |

**Caveat worth keeping honest:** a `requestAnimationFrame` callback proves the
page asked for a frame and was called back. It does **not** prove a frame was
rendered, and it certainly does not prove one was presented to the screen. So
"frames are firing" narrows the fault to rendering/presentation — it does not
locate it.

---

## 4. What we shipped, and what it is worth

### v0.14.1 — the diagnostic snapshot and the script watchdog

A snapshot button above Settings, plus a shell-side watchdog: the page beats
every 2 s, and 15 s of silence means the script is stuck → write the snapshot
automatically and record an incident for the next launch.

**Worth:** this is how we got any evidence at all. It did **not** catch the
freeze, because the script never stopped beating.

### v0.14.2 — the paint watchdog, self-recovery, DMA-BUF off

- Each heartbeat now carries `frameAgeMs`: how long ago the page's
  one-frame-per-beat request was actually painted.
- New **paint stall**: beats arriving with no frame for 20 s while visible.
- A recovery ladder: snapshot → reload the webview after 20 s → after another
  30 s, a **native** dialog offering "Restart PowerGit / Keep waiting" (native,
  because it paints without the webview).
- `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Linux — the documented fix for black,
  non-redrawing WebKitGTK views.
- The snapshot button shows its saved path in a native dialog when the page
  has not painted for 20 s.

**Worth:** the recovery ladder is genuinely useful and can bring a window
back. The DMA-BUF switch did not stop it — the next freeze happened with it on.

### v0.15.0 — compositing off, and the user as the detector

- `WEBKIT_DISABLE_COMPOSITING_MODE=1` on Linux.
- `POWERGIT_WAYLAND=1` drops the packaging hook's forced `GDK_BACKEND=x11`.
- **Pressing the snapshot button twice within 15 s** is treated as "the display
  is dead": the shell reloads the webview at once; a third press offers the
  restart dialog. This exists precisely because nothing the shell measures can
  see a GTK presentation failure — but the person looking at the screen can.

**Worth:** the double-press is the only detector we have that is not fooled by
a live-script/dead-picture freeze. Compositing-off is a mitigation, unproven.

### v0.15.2 — inspector and focus timeline

Release builds enable WebKit's inspector (Settings → Tools → Open developer
tools, or `POWERGIT_DEVTOOLS=1`). Native window focus changes are written to
`engine.log` independently of page JavaScript; page focus/visibility and
numbered refresh timings go to `frontend.log`.

**Worth:** the focus timeline is sound instrumentation. The inspector was a
dead end twice over — it silently failed to open on the owner's Ubuntu, and
even had it opened, §2 says it would have frozen too.

### v0.15.3 — the app log, without WebKit

The git console gained an **APP LOG** tab rendering the 200-entry diagnostic
ring live: errors, unhandled rejections, focus/visibility transitions, refresh
timings, long tasks, and every `console.*` call. No inspector needed.

**Worth:** a good feature that remains useful for every other class of bug.
For *this* bug it is useless, and we knew that the day after shipping it.

### v0.15.4 — get the main loop off the disk, and capture from outside

Two things:

1. **A real defect, fixed on evidence.** Every log line did `writeln!` +
   `flush()` while holding a `Mutex<Option<File>>`, **on whichever thread
   logged it** — and one of those callers is the `RunEvent` closure: the run
   loop, on the main thread, on **every window focus change**. Meanwhile the
   sidecar's stdout task took the same lock for every line the engine printed,
   and the engine printed one line per HTTP request. A focus change could
   therefore park the main loop behind another thread's disk flush.
   `logwriter.rs` moved both files to a dedicated writer thread; logging is now
   a channel send. Engine framework logging dropped to Warning, which removed
   ~9 000 lines/session of per-request churn behind all of it (measured: 11
   lines for a full boot, **0 new lines in 20 s** of a running app, previously
   ~60).

2. **`scripts/freeze-dump.sh`** — attached to every release. See §5.

**Worth:** the logging defect is real and was worth fixing, and it is the
closest thing to a plausible mechanism we have found — main-thread disk I/O on
focus change, in an app whose owner reports freezes on focus change. But:
**that code arrived in v0.15.2, and the freezes predate it.** It cannot be the
original cause. Do not write it up as the answer.

---

## 5. The one thing that would settle it

Next time the window freezes, **before killing it**, from a terminal:

```
bash freeze-dump.sh
```

It never kills or modifies anything and needs no root. It collects:

- `/proc/<pid>/task/*/` for every PowerGit process: each thread's state and
  its **`wchan`** — the kernel function it is parked in. No debugger required.
- Full backtraces if `eu-stack` or `gdb` is installed (`sudo apt install
  elfutils` beforehand is the single highest-value thing the owner can do).
- Whether the engine sidecar still answers `/health` — if it does, the freeze
  is confined to the UI process.
- The tails of both logs.

Read `threads.txt` first. **The main thread's `wchan` is the answer:**

| `wchan` | Meaning |
|---|---|
| `futex_wait_queue` | Waiting on a lock someone else holds |
| `wait_on_page_bit`, `io_schedule` | Blocked on disk |
| `poll_schedule_timeout`, `ep_poll` | Idle in the event loop — healthy |
| `do_wait`, `hrtimer_nanosleep` | Sleeping — healthy |

Tested on Ubuntu (WSL) against a process deliberately blocked on a mutex: it
correctly reported `futex_wait_queue` for the main thread and
`hrtimer_nanosleep` for the worker. **The debugger branch is untested** — no
debugger was installable in that environment.

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

**Known:**
- Linux AppImage / WebKitGTK / Ubuntu only.
- The page and the engine are both alive during the freeze.
- The UI process's GTK main loop is what stops — established from the
  inspector also freezing, and consistent with both snapshots.
- No in-app surface can ever report it.

**Unknown:**
- What parks the main loop. A lock, a blocking syscall, a GTK/WebKit
  interaction, or the XWayland path — the evidence does not choose between them.
- Whether v0.15.4's logging fix removed one real trigger. Plausible for
  focus-change freezes *since v0.15.2*, impossible for the earlier ones.
- Whether the DMA-BUF and compositing switches help at all.

**Never reproduced on our side.** The container launch matrix (Ubuntu 22.04 /
24.04 / 26.04) has always run with compositing off and has never shown a black
window. The 10-minute longevity gate on 26.04 does not reproduce it either.
Every piece of evidence we have came from the owner's machine.

**Next, in order:**

1. A `freeze-dump.sh` capture from a real freeze, with `elfutils` installed.
   This is worth more than anything else on the list, by a wide margin.
2. If the main thread shows `futex_wait_queue`, the backtrace names the lock
   and the investigation is essentially over.
3. If it shows a healthy idle state, the fault is below us — GTK, WebKit, or
   the compositor — and the next move is `POWERGIT_WAYLAND=1` to take XWayland
   out of the picture, plus the WebKitGTK version from `shell.txt`.

---

## See also

- `docs/agents/memories/diagnostics.md` — logs, the snapshot package, the
  watchdog ladder, how to read `shell.txt`, and how to simulate a freeze in dev
- `scripts/freeze-dump.sh` — the capture script itself
- `frontend/src-tauri/src/watchdog.rs` — the stall state machine (unit-tested)
- `frontend/src-tauri/src/logwriter.rs` — why logging left the main thread
- `docs/agents/memories/webkitgtk-css.md` — unrelated WebKitGTK rendering traps
  worth knowing about in this codebase
