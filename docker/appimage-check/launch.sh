#!/usr/bin/env bash
# Runs INSIDE a stock ubuntu:<version> container (see run-matrix.sh for the
# host side). Installs the packages a real desktop user has, launches the
# mounted AppImage headless and decides pass/fail:
#
#   1. engine health   GET http://127.0.0.1:7733/health answers within
#                      HEALTH_TIMEOUT seconds (default 30) — the sidecar
#                      only starts once the Tauri shell got past its GTK/
#                      WebKit init, so this is the first-paint proxy;
#   2. alive           the process is still running after SMOKE_SECONDS
#                      (default 20);
#   3. stderr clean    none of the fatal regexes below matched.
#
# --longevity <minutes> keeps the app up for N minutes, drives it with
# xdotool (Down every 2 s, Ctrl+R every 60 s), samples RSS of the process
# tree + child count every 10 s into $OUT/rss.csv and fails on any
# WebKitWebProcess / WebKitGPUProcess / powergit-engine exit or when RSS
# exceeds RSS_BUDGET_MB (default 1500).
#
# Env: APPIMAGE (default /app/PowerGit.AppImage), OUT (default /out),
#      SMOKE_SECONDS, HEALTH_TIMEOUT, RSS_BUDGET_MB, ENGINE_PORT (7733).
set -uo pipefail

APPIMAGE=${APPIMAGE:-/app/PowerGit.AppImage}
OUT=${OUT:-/out}
SMOKE_SECONDS=${SMOKE_SECONDS:-20}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-30}
RSS_BUDGET_MB=${RSS_BUDGET_MB:-1500}
ENGINE_PORT=${ENGINE_PORT:-7733}
LONGEVITY=0
SKIP_INSTALL=${SKIP_INSTALL:-0}

while [ $# -gt 0 ]; do
  case "$1" in
    --longevity) LONGEVITY=$2; shift 2 ;;
    --no-install) SKIP_INSTALL=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Patterns the guard treats as fatal. Keep in sync with
# scripts/inspect-appimage.sh --self-test and the memory file.
FATAL_RE='undefined symbol|Failed to load module|version .* not found|symbol lookup error|GStreamer-CRITICAL|WebKitWebProcess.*(crash|terminated)|Gdk-ERROR'

mkdir -p "$OUT"
ERR="$OUT/app.stderr.txt"
STDOUT="$OUT/app.stdout.txt"
: >"$ERR"; : >"$STDOUT"

fail() { echo "FAIL: $*" | tee -a "$OUT/result.txt" >&2; cleanup; exit 1; }
pass() { echo "PASS: $*" | tee -a "$OUT/result.txt"; }

if [ "$SKIP_INSTALL" != 1 ]; then
  echo "== apt: $(. /etc/os-release; echo "$PRETTY_NAME") =="
  apt-get update -qq >/dev/null
  pkgs="libwebkit2gtk-4.1-0 libgtk-3-0 libayatana-appindicator3-1 librsvg2-2 \
        xvfb ca-certificates xdg-utils curl git procps"
  [ "$LONGEVITY" -gt 0 ] && pkgs="$pkgs xdotool"
  # shellcheck disable=SC2086
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends $pkgs >/dev/null \
    || fail "apt-get install failed"
fi
echo "== host libs: $(dpkg-query -W -f='${Package} ${Version}\n' libglib2.0-0t64 libglib2.0-0 libmount1 libwebkit2gtk-4.1-0t64 libwebkit2gtk-4.1-0 2>/dev/null | tr '\n' ';') =="

export NO_AT_BRIDGE=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export DISPLAY=:99
chmod +x "$APPIMAGE" 2>/dev/null || true

cleanup() {
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null
  pkill -f "$APPIMAGE" 2>/dev/null
  pkill -f powergit-engine 2>/dev/null
  pkill Xvfb 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT

echo "== launch =="
xvfb-run -n 99 -s "-screen 0 1280x800x24" "$APPIMAGE" --appimage-extract-and-run \
  >"$STDOUT" 2>"$ERR" &
APP_PID=$!
START=$(date +%s)

health_ok=0
for _ in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -fsS "http://127.0.0.1:$ENGINE_PORT/health" >"$OUT/health.json" 2>/dev/null; then
    health_ok=1; break
  fi
  if ! kill -0 "$APP_PID" 2>/dev/null; then break; fi
  sleep 1
done
if ! kill -0 "$APP_PID" 2>/dev/null; then
  wait "$APP_PID"; rc=$?
  echo "== app stderr =="; cat "$ERR"
  fail "process exited (rc=$rc) after $(( $(date +%s) - START )) s, before the smoke interval"
fi
[ "$health_ok" = 1 ] || { echo "== app stderr =="; cat "$ERR"; fail "engine health not answering within ${HEALTH_TIMEOUT} s"; }
echo "engine health after $(( $(date +%s) - START )) s: $(cat "$OUT/health.json")"

# Process tree helpers (from /proc, no ps dependency at sample time).
descendants() { # $1 = root pid; prints root + all descendants
  local p=$1 c
  echo "$p"
  for c in $(cat "/proc/$p/task/"*/children 2>/dev/null); do descendants "$c"; done
}
tree_rss_kb() {
  local total=0 p kb
  for p in $(descendants "$APP_PID"); do
    kb=$(awk '/^VmRSS:/{print $2}' "/proc/$p/status" 2>/dev/null || echo 0)
    total=$((total + ${kb:-0}))
  done
  echo "$total"
}
tree_count() { descendants "$APP_PID" | wc -l; }
has_proc() { pgrep -f "$1" >/dev/null 2>&1; }

if [ "$LONGEVITY" -gt 0 ]; then
  echo "== longevity: ${LONGEVITY} min, RSS budget ${RSS_BUDGET_MB} MB =="
  CSV="$OUT/rss.csv"
  echo "elapsed_s,rss_mb,procs,webproc,gpuproc,engine" >"$CSV"
  sleep 5
  WIN=$(xdotool search --onlyvisible --name PowerGit 2>/dev/null | head -n1 || true)
  [ -z "$WIN" ] && WIN=$(xdotool search --name PowerGit 2>/dev/null | head -n1 || true)
  echo "window: ${WIN:-none found}"
  [ -n "$WIN" ] && xdotool windowfocus "$WIN" 2>/dev/null || true
  seen_web=0; seen_gpu=0
  END=$((START + LONGEVITY * 60)); tick=0
  while [ "$(date +%s)" -lt "$END" ]; do
    kill -0 "$APP_PID" 2>/dev/null || fail "app exited during longevity run at $(( $(date +%s) - START )) s"
    if [ -n "$WIN" ]; then
      xdotool key --window "$WIN" Down 2>/dev/null || true
      if [ $((tick % 30)) -eq 0 ] && [ "$tick" -gt 0 ]; then xdotool key --window "$WIN" ctrl+r 2>/dev/null || true; fi
    fi
    if [ $((tick % 5)) -eq 0 ]; then
      web=0; gpu=0; eng=0
      has_proc WebKitWebProcess && web=1
      has_proc WebKitGPUProcess && gpu=1
      has_proc powergit-engine && eng=1
      rss_mb=$(( $(tree_rss_kb) / 1024 ))
      n=$(tree_count)
      el=$(( $(date +%s) - START ))
      echo "$el,$rss_mb,$n,$web,$gpu,$eng" >>"$CSV"
      echo "  t=${el}s rss=${rss_mb}MB procs=$n web=$web gpu=$gpu engine=$eng"
      [ "$web" = 1 ] && seen_web=1
      [ "$gpu" = 1 ] && seen_gpu=1
      [ "$seen_web" = 1 ] && [ "$web" = 0 ] && fail "WebKitWebProcess exited at ${el} s"
      [ "$seen_gpu" = 1 ] && [ "$gpu" = 0 ] && fail "WebKitGPUProcess exited at ${el} s"
      [ "$eng" = 0 ] && fail "powergit-engine exited at ${el} s"
      [ "$rss_mb" -gt "$RSS_BUDGET_MB" ] && fail "RSS ${rss_mb} MB exceeds budget ${RSS_BUDGET_MB} MB at ${el} s"
      if grep -Eq "$FATAL_RE" "$ERR"; then echo "== app stderr =="; grep -E "$FATAL_RE" "$ERR"; fail "fatal pattern on stderr at ${el} s"; fi
    fi
    sleep 2; tick=$((tick + 1))
  done
else
  sleep "$SMOKE_SECONDS"
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    wait "$APP_PID"; rc=$?
    echo "== app stderr =="; cat "$ERR"
    fail "process exited (rc=$rc) before the ${SMOKE_SECONDS} s smoke interval ended"
  fi
  echo "alive after ${SMOKE_SECONDS} s: procs=$(tree_count) rss=$(( $(tree_rss_kb) / 1024 ))MB"
fi

echo "== app stderr (tail) =="; tail -n 40 "$ERR"
if grep -Eq "$FATAL_RE" "$ERR"; then
  echo "== fatal lines =="; grep -E "$FATAL_RE" "$ERR"
  fail "runtime dependency / crash pattern on stderr"
fi
pass "healthy, alive, stderr clean"
