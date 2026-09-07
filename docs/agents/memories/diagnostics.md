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
- Watchdog: the page invokes `heartbeat` every 2 s (`useHeartbeat`). The
  shell checks every 5 s; 15 s without a beat → "webview unresponsive"
  in engine.log, an automatic snapshot, `incident.json`. Beats resuming →
  "webview responsive again after N s". A page that never beat (still
  booting) is not an incident. `watchdog.rs::step` is the pure decision.

## Reading a snapshot

Start with `shell.txt` (was the page unresponsive, for how long, did the
engine restart), then the tail of `frontend.log` (the last `[perf]` and
`[sample]` lines say what the page was doing and how big it was), then
`engine/sessions.json` (busy sessions, watcher counts) and the jobs files.

## Simulating a freeze in dev

In the dev app's devtools console: `const t = Date.now(); while (Date.now() - t < 20000) {}`.
Twenty seconds later engine.log has the watchdog lines and a snapshot; the
next launch shows the banner.
