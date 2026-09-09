#!/usr/bin/env bash
# Capture a frozen PowerGit from outside itself (v0.15.4).
#
# Owner, 2026-09-09: "when the crash happens, even the developper panels does
# not refresh!!!" The WebKit inspector is a separate web view driven by the
# SAME GTK main loop as the window, so an inspector that also stops updating
# means the main loop is stuck, not the page. Nothing running inside the app
# can report that — including its own log panel. This runs beside it.
#
#   Run it WHILE the window is frozen, from a terminal:
#     bash freeze-dump.sh
#
# It reads /proc and, if gdb or eu-stack is installed, takes backtraces. It
# never writes to the app, never kills anything, and needs no root — though
# thread backtraces usually do need one of the two debuggers, and may need
#   sudo sysctl -w kernel.yama.ptrace_scope=0
# for this session if your distro restricts attaching to non-child processes.
#
# The result is one .tar.gz to send back.

set -uo pipefail

STAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
OUT="${TMPDIR:-/tmp}/powergit-freeze-$STAMP"
mkdir -p "$OUT"

say() { printf '%s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

say "PowerGit freeze dump -> $OUT"

# ---------------------------------------------------------------- processes
# The shell binary is `powergit`; the sidecar is `powergit-engine`; WebKitGTK
# splits into WebKitWebProcess / WebKitNetworkProcess. All are interesting:
# the question is which of them is still moving.
# Match the executables, not any command line that happens to mention the
# repository path -- and never this script or its own shell.
SELF=$$
mapfile -t PIDS < <(
  {
    pgrep -x 'powergit' 2>/dev/null
    pgrep -x 'powergit-engine' 2>/dev/null
    pgrep -x 'WebKitWebProcess' 2>/dev/null
    pgrep -x 'WebKitNetworkProcess' 2>/dev/null
    # The AppImage runs from a mount point, so the binary may be named after
    # the image; match a full path ending in the app name too.
    pgrep -f '/PowerGit[^/]*\.AppImage' 2>/dev/null
  } | grep -vx "$SELF" | grep -vx "$PPID" | sort -un
)

if [ "${#PIDS[@]}" -eq 0 ]; then
  say "No PowerGit process found. Is it running?"
  exit 1
fi

{
  say "captured: $STAMP"
  say "host: $(uname -a)"
  say "session: XDG_SESSION_TYPE=${XDG_SESSION_TYPE:-unset} WAYLAND_DISPLAY=${WAYLAND_DISPLAY:-unset} DISPLAY=${DISPLAY:-unset}"
  say "desktop: ${XDG_CURRENT_DESKTOP:-unset}"
  say "ptrace_scope: $(cat /proc/sys/kernel/yama/ptrace_scope 2>/dev/null || echo 'n/a')"
  say "debuggers: gdb=$(have gdb && echo yes || echo no) eu-stack=$(have eu-stack && echo yes || echo no)"
} > "$OUT/host.txt" 2>&1

say "processes: ${PIDS[*]}"
ps -o pid,ppid,stat,etime,pcpu,pmem,rss,wchan:32,comm,args -p "${PIDS[@]}" > "$OUT/processes.txt" 2>&1

# ------------------------------------------------------------------ threads
# `stat` field 3 is the thread state and `wchan` is the kernel function it is
# parked in. This is the cheapest possible answer to "what is the main loop
# waiting on": no debugger, no root, no ptrace. A main thread sitting in a
# futex means it is waiting on a lock; in a write/page-wait means disk.
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
# frozen, the freeze is confined to the UI process — which is the single most
# useful bit of evidence this script collects.
{
  say "engine on 127.0.0.1:7733:"
  if have curl; then
    curl -sS -m 5 -o - -w '\nHTTP %{http_code} in %{time_total}s\n' \
      http://127.0.0.1:7733/health 2>&1 || say "no answer"
  else
    say "(curl not installed)"
  fi
} > "$OUT/engine-health.txt" 2>&1

# --------------------------------------------------------------------- logs
LOGDIR="${XDG_DATA_HOME:-$HOME/.local/share}/com.cynacons.powergit/logs"
if [ -d "$LOGDIR" ]; then
  say "logs: $LOGDIR"
  mkdir -p "$OUT/logs"
  # Tails only: engine.log runs to tens of thousands of lines.
  for f in engine.log frontend.log; do
    [ -f "$LOGDIR/$f" ] && tail -n 2000 "$LOGDIR/$f" > "$OUT/logs/$f" 2>&1
  done
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
grep -E '^[0-9]+ +[A-Z]' "$OUT/threads.txt" 2>/dev/null | head -5
if grep -q 'HTTP 200' "$OUT/engine-health.txt" 2>/dev/null; then
  say "  engine still answering -> the freeze is in the UI process, not the engine"
else
  say "  engine did NOT answer -> check engine-health.txt"
fi
