#!/usr/bin/env bash
# Capture a frozen PowerGit from outside itself (v0.15.6).
#
# What the two real captures proved (docs/ubuntu-freeze.md §2): during the
# owner's freezes the UI process's GLib main loop is ALIVE — heartbeats and
# snapshot presses are dispatched by that loop and they kept arriving. What
# dies is presentation of the main window. So the interesting evidence is on
# the presentation side: GDK backend, X11 frame sync, what mutter says about
# frame-drawn messages, the WebKitGTK/mutter versions, and the shell's own
# paint probe (`probe.txt`). This script collects all of it, beside the app.
#
#   Run it WHILE the window is frozen, from a terminal:
#     bash freeze-dump.sh
#
#   Ask the frozen shell to run one recovery step (IPC is alive; the shell's
#   liveness thread polls for this file every 2 s):
#     bash freeze-dump.sh recover 3          # hide+show
#     bash freeze-dump.sh recover new_window # same as 8
#
# It reads /proc and, if gdb or eu-stack is installed, takes backtraces. It
# never writes to the app, never kills anything, and needs no root — though
# thread backtraces usually do need one of the two debuggers, and may need
#   sudo sysctl -w kernel.yama.ptrace_scope=0
# for this session if your distro restricts attaching to non-child processes.
# Every other tool (xprop, xdotool, journalctl, dpkg, nvidia-smi, glxinfo) is
# optional; a missing one leaves a note in the tarball instead of a file.
#
# The result is one .tar.gz to send back.

set -uo pipefail

say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# The shell's log directory is Tauri's app_log_dir(); on Linux that is
# $XDG_DATA_HOME/com.cynacons.powergit/logs, default ~/.local/share/...
LOGDIR="${XDG_DATA_HOME:-$HOME/.local/share}/com.cynacons.powergit/logs"

# ------------------------------------------------------------ recover <step>
# Writes the step number to <log dir>/recover.request. The shell deletes the
# file and runs the step exactly as the `recover` command / Ctrl+Shift+Fn
# hotkey does, logging `recover #<n> <key>: requested (file)` in engine.log.
recover_step_number() {
  case "$1" in
    1|queue_draw) echo 1 ;;
    2|thaw) echo 2 ;;
    3|hide_show) echo 3 ;;
    4|resize) echo 4 ;;
    5|present) echo 5 ;;
    6|frame_sync_off_hide_show) echo 6 ;;
    7|reload) echo 7 ;;
    8|new_window) echo 8 ;;
    9|webview_snapshot) echo 9 ;;
    *) return 1 ;;
  esac
}

if [ "${1:-}" = "recover" ]; then
  if [ -z "${2:-}" ] || ! STEP=$(recover_step_number "$2"); then
    say "usage: bash freeze-dump.sh recover <1-9|key>"
    say "  1 queue_draw   2 thaw     3 hide_show   4 resize   5 present"
    say "  6 frame_sync_off_hide_show   7 reload   8 new_window   9 webview_snapshot"
    say "  (try 3, 6, 8 first; each press is logged in engine.log)"
    exit 2
  fi
  if [ ! -d "$LOGDIR" ]; then
    say "log directory not found at $LOGDIR (is PowerGit installed and has it run once?)"
    exit 1
  fi
  REQ="$LOGDIR/recover.request"
  printf '%s\n' "$STEP" > "$REQ.tmp" && mv -f "$REQ.tmp" "$REQ"
  say "wrote step $STEP to $REQ"
  say "the shell picks it up within ~2 s; watch: tail -f $LOGDIR/engine.log | grep 'recover #'"
  exit 0
fi

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
OUT="${TMPDIR:-/tmp}/powergit-freeze-$STAMP"
mkdir -p "$OUT"

say "PowerGit freeze dump -> $OUT"

# ---------------------------------------------------------------- processes
# The shell binary is `powergit`; the sidecar is `powergit-engine`; WebKitGTK
# splits into WebKitWebProcess / WebKitNetworkProcess, plus WebKitGPUProcess
# when accelerated compositing is on (it should NOT be there with the default
# WEBKIT_DISABLE_DMABUF_RENDERER=1). All are interesting: the question is
# which of them is still moving.
# Match the executables, not any command line that happens to mention the
# repository path -- and never this script or its own shell.
SELF=$$
mapfile -t PIDS < <(
  {
    pgrep -x 'powergit' 2>/dev/null
    pgrep -x 'powergit-engine' 2>/dev/null
    pgrep -x 'WebKitWebProcess' 2>/dev/null
    pgrep -x 'WebKitNetworkProcess' 2>/dev/null
    pgrep -x 'WebKitGPUProcess' 2>/dev/null
    # The AppImage runs from a mount point, so the binary may be named after
    # the image; match a full path ending in the app name too.
    pgrep -f '/PowerGit[^/]*\.AppImage' 2>/dev/null
  } | grep -vx "$SELF" | grep -vx "$PPID" | sort -un
)

if [ "${#PIDS[@]}" -eq 0 ]; then
  say "No PowerGit process found. Is it running?"
  exit 1
fi

# The UI process: the first pid whose comm is `powergit` (the AppImage runtime
# execs the real binary, so the comm is right even under the mount point).
UIPID=""
for pid in "${PIDS[@]}"; do
  if [ "$(cat "/proc/$pid/comm" 2>/dev/null)" = "powergit" ]; then
    UIPID=$pid
    break
  fi
done
[ -z "$UIPID" ] && UIPID=${PIDS[0]}

{
  say "captured: $STAMP"
  say "host: $(uname -a)"
  say "session: XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-unset} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-unset} DISPLAY=${DISPLAY:-unset}"
  say "desktop: ${XDG_CURRENT_DESKTOP:-unset}"
  say "ui pid: $UIPID"
  say "ptrace_scope: $(cat /proc/sys/kernel/yama/ptrace_scope 2>/dev/null || echo 'n/a')"
  say "debuggers: gdb=$(have gdb && echo yes || echo no) eu-stack=$(have eu-stack && echo yes || echo no)"
  say "tools: xprop=$(have xprop && echo yes || echo no) xdotool=$(have xdotool && echo yes || echo no) journalctl=$(have journalctl && echo yes || echo no) dpkg=$(have dpkg && echo yes || echo no) nvidia-smi=$(have nvidia-smi && echo yes || echo no) glxinfo=$(have glxinfo && echo yes || echo no)"
} > "$OUT/host.txt" 2>&1

say "processes: ${PIDS[*]}"
ps -o pid,ppid,stat,etime,pcpu,pmem,rss,wchan:32,comm,args -p "${PIDS[@]}" > "$OUT/processes.txt" 2>&1
if pgrep -x 'WebKitGPUProcess' >/dev/null 2>&1; then
  say "WebKitGPUProcess: present (accelerated compositing is ON — not the default)" >> "$OUT/processes.txt"
else
  say "WebKitGPUProcess: absent (expected with WEBKIT_DISABLE_DMABUF_RENDERER=1: non-accelerated mode)" >> "$OUT/processes.txt"
fi

# ------------------------------------------------------------------ threads
# `stat` field 3 is the thread state and `wchan` is the kernel function it is
# parked in. Given a live main loop, the expected (and uninformative) result
# for the main thread is poll_schedule_timeout / ep_poll / do_sys_poll. A
# futex or a page wait would be news.
for pid in "${PIDS[@]}"; do
  comm=$(cat "/proc/$pid/comm" 2>/dev/null || echo unknown)
  {
    say "=== pid $pid ($comm) ==="
    say "--- status ---"
    grep -E '^(Name|State|Threads|VmRSS|voluntary|nonvoluntary)' "/proc/$pid/status" 2>/dev/null
    say "--- threads (tid state wchan name) ---"
    for task in /proc/$pid/task/*; do
      tid=${task##*/}
      tname=$(cat "$task/comm" 2>/dev/null || echo '?')
      tstate=$(awk '{print $3}' "$task/stat" 2>/dev/null || echo '?')
      twchan=$(cat "$task/wchan" 2>/dev/null || echo '?')
      printf '%-8s %-3s %-34s %s\n' "$tid" "$tstate" "${twchan:-0}" "$tname"
    done
  } >> "$OUT/threads.txt" 2>&1
done

# -------------------------------------------------------------- environment
# What the UI process actually runs with (not what this terminal has): the
# GDK backend decides whether the X11 frame-sync path (hypothesis H1) is even
# in play, and the WEBKIT_*/POWERGIT_* switches say which experiment this is.
if [ -r "/proc/$UIPID/environ" ]; then
  tr '\0' '\n' < "/proc/$UIPID/environ" 2>/dev/null \
    | grep -E '^(GDK_BACKEND|WAYLAND_DISPLAY|DISPLAY|XDG_SESSION_TYPE|WEBKIT_|POWERGIT_|LIBGL_)' \
    | sort > "$OUT/environ.txt" 2>&1
  [ -s "$OUT/environ.txt" ] || say "(none of the interesting variables set)" > "$OUT/environ.txt"
else
  say "/proc/$UIPID/environ not readable (different user? try with sudo -E)" > "$OUT/environ.txt"
fi

# --------------------------------------------------------------- backtraces
# Definitive when available: where every thread actually is.
for pid in "${PIDS[@]}"; do
  comm=$(cat "/proc/$pid/comm" 2>/dev/null || echo unknown)
  if have eu-stack; then
    say "  eu-stack $pid ($comm)"
    eu-stack -p "$pid" > "$OUT/stack-$comm-$pid.txt" 2>&1
  elif have gdb; then
    say "  gdb $pid ($comm)"
    timeout 60 gdb -p "$pid" -batch \
      -ex 'set pagination off' \
      -ex 'thread apply all bt' \
      > "$OUT/stack-$comm-$pid.txt" 2>&1
  fi
done
if ! have eu-stack && ! have gdb; then
  say "  (no gdb or eu-stack: thread states in threads.txt only)"
  say "install one for full backtraces: sudo apt install elfutils   # or gdb" > "$OUT/stack-MISSING.txt"
fi

# ------------------------------------------------------------------- engine
# The sidecar is a SEPARATE process. If it still answers while the window is
# frozen, the freeze is confined to the UI process.
{
  say "engine on 127.0.0.1:7733:"
  if have curl; then
    curl -sS -m 5 -o - -w '\nHTTP %{http_code} in %{time_total}s\n' \
      http://127.0.0.1:7733/health 2>&1 || say "no answer"
  else
    say "(curl not installed)"
  fi
} > "$OUT/engine-health.txt" 2>&1

# ---------------------------------------------------------------- X11 window
# Under X11/XWayland, GTK3 freezes the toplevel's frame clock after every
# frame until the window manager answers with _NET_WM_FRAME_DRAWN; if mutter
# stops sending it, GTK stops painting while everything else keeps running
# (H1). These properties say whether that protocol is in use for this window.
{
  if [ -z "${DISPLAY:-}" ]; then
    say "DISPLAY unset in this terminal: no X11 queries (on a pure Wayland run this is expected)"
  elif ! have xprop; then
    say "xprop not installed: sudo apt install x11-utils"
  else
    say "--- root _NET_SUPPORTED: FRAME_DRAWN entries (0 = WM does not advertise it, frame sync inactive) ---"
    { xprop -root _NET_SUPPORTED 2>/dev/null || true; } | grep -c FRAME_DRAWN || true
    WIN=""
    if have xdotool; then
      WIN=$(xdotool search --pid "$UIPID" 2>/dev/null | head -1)
      [ -z "$WIN" ] && WIN=$(xdotool search --name '^PowerGit' 2>/dev/null | head -1)
    else
      say "xdotool not installed (sudo apt install xdotool): trying xprop -name PowerGit"
    fi
    if [ -n "$WIN" ]; then
      say "--- window $WIN (by pid/name) ---"
      xprop -id "$WIN" _NET_WM_STATE _NET_WM_SYNC_REQUEST_COUNTER _NET_WM_PID WM_CLASS 2>&1
      if have xdotool; then
        say "--- geometry ---"
        xdotool getwindowgeometry "$WIN" 2>&1
      fi
      say "--- xwininfo ---"
      if have xwininfo; then xwininfo -id "$WIN" 2>&1 | grep -E 'Map State|Width|Height|Absolute'; else say "(xwininfo not installed)"; fi
    else
      say "--- window by name ---"
      xprop -name PowerGit _NET_WM_STATE _NET_WM_SYNC_REQUEST_COUNTER _NET_WM_PID 2>&1 || say "no window named PowerGit found"
    fi
  fi
} > "$OUT/x11-window.txt" 2>&1

# ----------------------------------------------------------------- journal
# mutter logs "Frame has assigned frame counter but no frame drawn time" when
# it drops the frame-drawn message for an XWayland window.
{
  if have journalctl; then
    say "--- journalctl --user -b | grep -i 'frame drawn' | tail -n 20 ---"
    journalctl --user -b --no-pager 2>/dev/null | grep -i 'frame drawn' | tail -n 20 || true
    say "--- journalctl --user -b | grep -iE 'gnome-shell|mutter|xwayland' | tail -n 40 ---"
    journalctl --user -b --no-pager 2>/dev/null | grep -iE 'gnome-shell|mutter|xwayland' | tail -n 40 || true
  else
    say "journalctl not installed: no compositor log"
  fi
} > "$OUT/journal.txt" 2>&1

# ------------------------------------------------------------------- versions
{
  say "--- gnome-shell ---"
  if have gnome-shell; then gnome-shell --version 2>&1; else say "(gnome-shell not installed / not GNOME)"; fi
  say "--- packages ---"
  if have dpkg; then
    { dpkg -l 'libwebkit2gtk*' 'mutter*' 'xwayland' 'libgtk-3-0*' 2>/dev/null || true; } | grep -E '^ii' || say "(none of the packages installed via dpkg)"
  else
    say "(dpkg not installed: not a Debian/Ubuntu system)"
  fi
  say "--- GPU ---"
  if have nvidia-smi; then
    nvidia-smi --query-gpu=name,driver_version --format=csv 2>&1
  else
    say "(nvidia-smi not installed)"
  fi
  if have glxinfo; then
    glxinfo -B 2>/dev/null | grep -E 'OpenGL (vendor|renderer|version)' || say "(glxinfo gave nothing)"
  else
    say "(glxinfo not installed: sudo apt install mesa-utils)"
  fi
  if [ -r /proc/modules ]; then
    say "--- GPU kernel modules ---"
    grep -E '^(nvidia|amdgpu|i915|xe|nouveau|radeon) ' /proc/modules 2>/dev/null | awk '{print $1}' || say "(none matched)"
  fi
} > "$OUT/versions.txt" 2>&1

# --------------------------------------------------------------------- logs
if [ -d "$LOGDIR" ]; then
  say "logs: $LOGDIR"
  mkdir -p "$OUT/logs"
  # Tails only: engine.log runs to tens of thousands of lines.
  for f in engine.log frontend.log; do
    [ -f "$LOGDIR/$f" ] && tail -n 2000 "$LOGDIR/$f" > "$OUT/logs/$f" 2>&1
  done
  # The shell's paint/liveness probe, rewritten every 10 s by its own thread.
  if [ -f "$LOGDIR/probe.txt" ]; then
    cp "$LOGDIR/probe.txt" "$OUT/probe.txt" 2>/dev/null
  else
    say "probe.txt not found in $LOGDIR (needs v0.15.6+, POWERGIT_PROBE_PAINT not 0)" > "$OUT/probe-MISSING.txt"
  fi
  [ -f "$LOGDIR/incident.json" ] && cp "$LOGDIR/incident.json" "$OUT/logs/incident.json" 2>/dev/null
  ls -la "$LOGDIR" > "$OUT/logs/listing.txt" 2>&1
else
  say "log directory not found at $LOGDIR" > "$OUT/logs-MISSING.txt"
fi

# ------------------------------------------------------------------ archive
ARCHIVE="$OUT.tar.gz"
tar -czf "$ARCHIVE" -C "$(dirname "$OUT")" "$(basename "$OUT")" 2>/dev/null

say ""
say "Done. Send this file:"
say "  $ARCHIVE"
say ""
say "Quick read while it is still frozen:"
grep -E '^[0-9]+ +[A-Z]' "$OUT/threads.txt" 2>/dev/null | head -3
if grep -q 'HTTP 200' "$OUT/engine-health.txt" 2>/dev/null; then
  say "  engine still answering -> the freeze is in the UI process, not the engine"
else
  say "  engine did NOT answer -> check engine-health.txt"
fi

# probe.txt ages: loop (tauri round-trip) 15 s, GDK after-paint 20 s,
# WebKitWebView draw 20 s -- the watchdog's own thresholds.
probe_val() { grep -E "^$1=" "$OUT/probe.txt" 2>/dev/null | head -1 | cut -d= -f2-; }
probe_verdict() {
  # $1 value, $2 threshold, $3 ok word, $4 bad word
  case "$1" in
    ''|n/a) echo "unknown" ;;
    *) awk -v v="$1" -v t="$2" -v ok="$3" -v bad="$4" 'BEGIN { if (v + 0 >= t + 0) print bad; else print ok }' ;;
  esac
}
if [ -f "$OUT/probe.txt" ]; then
  written=$(probe_val written)
  loop=$(probe_val loop_tauri_age_s)
  paint=$(probe_val gdk_after_paint_age_s)
  webview=$(probe_val webview_draw_age_s)
  say "  probe.txt written $written (backend $(probe_val gdk_backend), frame sync $(probe_val frame_sync), mapped $(probe_val window_mapped))"
  say "  loop $(probe_verdict "$loop" 15 alive stalled) (tauri round-trip ${loop:-n/a} s ago)"
  say "  gdk $(probe_verdict "$paint" 20 painting frozen) (after-paint ${paint:-n/a} s ago, requested $(probe_val gdk_paint_requested_age_s) s ago)"
  say "  webview $(probe_verdict "$webview" 20 drawing frozen) (draw ${webview:-n/a} s ago)"
  say "  beat $(probe_val beat_age_s) s, page frame $(probe_val frame_age_s) s"
  say "  expected under H1 (X11 frame-sync stall): loop alive, gdk frozen, webview frozen, beat fresh"
else
  say "  no probe.txt (v0.15.6+ writes it): loop/paint state unknown from outside"
fi
if grep -q '^GDK_BACKEND=x11' "$OUT/environ.txt" 2>/dev/null; then
  say "  running on X11/XWayland -> next run try without POWERGIT_X11 (native Wayland), or POWERGIT_NO_FRAME_SYNC=1"
fi
say ""
say "Recovery, in order, noting what brings the picture back:"
say "  Ctrl+Shift+F3 (hide+show), Ctrl+Shift+F6 (frame sync off + hide+show), Ctrl+Shift+F8 (new window)"
say "  or from here: bash freeze-dump.sh recover 3   (then 6, then 8)"
