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
# --longevity <minutes> keeps the app up for N minutes and drives it two
# ways at once (v0.13.11 task 7): xdotool on X11 (Down every 2 s, Ctrl+R
# every 60 s) and, on every backend, the sidecar's own HTTP API with the
# token read from the engine process environment — rapid revision reads,
# large blob/diff loads, a repository switch and back, and a network job
# against a local bare remote. RSS of the process tree, child count and the
# session/watcher counts are sampled every 10 s into $OUT/rss.csv; it fails
# on any WebKitWebProcess / WebKitGPUProcess / powergit-engine exit, RSS
# above RSS_BUDGET_MB (default 1500), a stalled API (a read taking longer
# than API_BUDGET_S, default 5 s) or a fatal stderr pattern.
#
# DISPLAY_MODE=x11 (default, Xvfb) or wayland (weston headless backend;
# no xdotool there, the API drive still runs). INJECT_FAILURE=1 kills the
# engine halfway through and requires the supervised restart (>= v0.13.11
# builds: health back within 20 s and "sidecar exited"/"sidecar started" in
# the app's engine.log under XDG_DATA_HOME/com.cynacons.powergit/logs).
#
# Env: APPIMAGE (default /app/PowerGit.AppImage), OUT (default /out),
#      SMOKE_SECONDS, HEALTH_TIMEOUT, RSS_BUDGET_MB, ENGINE_PORT (7733),
#      DISPLAY_MODE, INJECT_FAILURE, API_BUDGET_S.
set -uo pipefail

APPIMAGE=${APPIMAGE:-/app/PowerGit.AppImage}
OUT=${OUT:-/out}
SMOKE_SECONDS=${SMOKE_SECONDS:-20}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-30}
RSS_BUDGET_MB=${RSS_BUDGET_MB:-1500}
ENGINE_PORT=${ENGINE_PORT:-7733}
LONGEVITY=0
SKIP_INSTALL=${SKIP_INSTALL:-0}
DISPLAY_MODE=${DISPLAY_MODE:-x11}
INJECT_FAILURE=${INJECT_FAILURE:-0}
API_BUDGET_S=${API_BUDGET_S:-5}

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
  [ "$DISPLAY_MODE" = wayland ] && pkgs="$pkgs weston"
  # shellcheck disable=SC2086
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends $pkgs >/dev/null \
    || fail "apt-get install failed"
fi
echo "== host libs: $(dpkg-query -W -f='${Package} ${Version}\n' libglib2.0-0t64 libglib2.0-0 libmount1 libwebkit2gtk-4.1-0t64 libwebkit2gtk-4.1-0 2>/dev/null | tr '\n' ';') =="

export NO_AT_BRIDGE=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export XDG_DATA_HOME=/tmp/pg-data
export XDG_RUNTIME_DIR=/tmp/pg-runtime
mkdir -p "$XDG_DATA_HOME" "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR"
chmod +x "$APPIMAGE" 2>/dev/null || true

cleanup() {
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null
  pkill -f "$APPIMAGE" 2>/dev/null
  pkill -f powergit-engine 2>/dev/null
  pkill Xvfb 2>/dev/null
  pkill weston 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT

echo "== launch ($DISPLAY_MODE) =="
if [ "$DISPLAY_MODE" = wayland ]; then
  # Headless Wayland: weston's headless backend, no X at all. GTK must be
  # told to use its wayland backend or it falls back to X and dies.
  export WAYLAND_DISPLAY=wl-pg
  export GDK_BACKEND=wayland
  weston --backend=headless-backend.so --socket="$WAYLAND_DISPLAY" --width=1280 --height=800 \
    >"$OUT/weston.log" 2>&1 &
  for _ in $(seq 1 20); do [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] && break; sleep 0.5; done
  [ -S "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY" ] || fail "weston headless did not come up ($(tail -n 5 "$OUT/weston.log"))"
  "$APPIMAGE" --appimage-extract-and-run >"$STDOUT" 2>"$ERR" &
else
  export DISPLAY=:99
  # xvfb-run generates an X auth cookie; without sharing it, xdotool (and any
  # other client we start) gets "Authorization required" and finds no window.
  export XAUTHORITY=/tmp/Xauthority.appimage-check
  xvfb-run -n 99 -f "$XAUTHORITY" -s "-screen 0 1280x800x24" "$APPIMAGE" --appimage-extract-and-run \
    >"$STDOUT" 2>"$ERR" &
fi
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

# --- API drive helpers (longevity) -----------------------------------------
# The sidecar wants the per-launch bearer token the Tauri shell generated;
# inside the container we are root, so it can be read from the engine's
# environment. Builds before v0.13.0 have no token: requests go unauthenticated.
engine_token() {
  local pid
  pid=$(pgrep -f powergit-engine | head -n1) || return 1
  tr '\0' '\n' <"/proc/$pid/environ" 2>/dev/null | sed -n 's/^POWERGIT_ENGINE_TOKEN=//p' | head -n1
}
api() { # $1 = method, $2 = path, $3 = json body (optional); prints body; nonzero on http error or slow
  local method=$1 path=$2 body=${3:-} t0 t1 code
  t0=$(date +%s%N)
  if [ -n "$body" ]; then
    code=$(curl -s -o "$OUT/api.body" -w '%{http_code}' -m "$API_BUDGET_S" -X "$method" \
      -H "Authorization: Bearer ${TOKEN:-}" -H 'Content-Type: application/json' -d "$body" "http://127.0.0.1:$ENGINE_PORT$path")
  else
    code=$(curl -s -o "$OUT/api.body" -w '%{http_code}' -m "$API_BUDGET_S" -X "$method" \
      -H "Authorization: Bearer ${TOKEN:-}" "http://127.0.0.1:$ENGINE_PORT$path")
  fi
  t1=$(date +%s%N)
  API_MS=$(( (t1 - t0) / 1000000 ))
  cat "$OUT/api.body"
  case "$code" in 2*|409) return 0 ;; *) return 1 ;; esac
}
json_field() { sed -n "s/.*\"$1\":\"\\([^\"]*\\)\".*/\\1/p" | head -n1; }

seed_repos() {
  # Two repositories plus a local bare remote so a fetch job completes offline.
  git config --global user.email seed@powergit.test; git config --global user.name Seed
  rm -rf /tmp/seed-a /tmp/seed-b /tmp/seed-bare
  git init -q -b main /tmp/seed-a
  ( cd /tmp/seed-a
    for i in $(seq 1 40); do printf 'line %s\n' "$(seq 1 3000)" >"big$i.txt"; echo "$i" >>log.txt; git add -A; git commit -qm "commit $i"; done
    head -c 3000000 /dev/urandom | base64 >huge.txt; git add -A; git commit -qm "huge blob (3 MB, past MaxBlobBytes)"
    git init -q --bare /tmp/seed-bare; git remote add origin /tmp/seed-bare; git push -q origin main )
  git init -q -b other /tmp/seed-b
  ( cd /tmp/seed-b; echo b >b.txt; git add -A; git commit -qm "other repo" )
}

if [ "$LONGEVITY" -gt 0 ]; then
  echo "== longevity: ${LONGEVITY} min, RSS budget ${RSS_BUDGET_MB} MB, display $DISPLAY_MODE, inject=$INJECT_FAILURE =="
  CSV="$OUT/rss.csv"
  echo "elapsed_s,rss_mb,procs,webproc,gpuproc,engine,sessions,watchers,api_ms" >"$CSV"
  WIN=""
  if [ "$DISPLAY_MODE" = x11 ]; then
    for _ in $(seq 1 15); do
      WIN=$(xdotool search --onlyvisible --name PowerGit 2>/dev/null | head -n1 || true)
      [ -n "$WIN" ] || WIN=$(xdotool search --onlyvisible --class powergit 2>/dev/null | head -n1 || true)
      [ -n "$WIN" ] && break
      sleep 1
    done
    echo "window: ${WIN:-none found} $( [ -n "$WIN" ] && xdotool getwindowname "$WIN" 2>/dev/null )"
    [ -n "$WIN" ] || fail "no PowerGit window visible on $DISPLAY after 15 s (nothing to drive)"
    xdotool windowfocus "$WIN" 2>/dev/null || true
  fi

  TOKEN=$(engine_token || true); echo "engine token: ${TOKEN:+present}${TOKEN:-none}"
  seed_repos
  SID_A=$(api POST /repos/open '{"path":"/tmp/seed-a"}' | json_field id); echo "session A: $SID_A"
  SID_B=$(api POST /repos/open '{"path":"/tmp/seed-b"}' | json_field id); echo "session B: $SID_B"
  [ -n "$SID_A" ] || fail "could not open the seed repository through the API (${API_MS}ms)"
  HEAD_A=$(git -C /tmp/seed-a rev-parse HEAD)
  api_ms=0; drive_n=0; job_done=0; injected=0; injected_at=0
  seen_web=0; seen_gpu=0
  END=$((START + LONGEVITY * 60)); tick=0
  while [ "$(date +%s)" -lt "$END" ]; do
    kill -0 "$APP_PID" 2>/dev/null || fail "app exited during longevity run at $(( $(date +%s) - START )) s"
    if [ -n "$WIN" ]; then
      xdotool key --window "$WIN" Down 2>/dev/null || true
      if [ $((tick % 30)) -eq 0 ] && [ "$tick" -gt 0 ]; then xdotool key --window "$WIN" ctrl+r 2>/dev/null || true; fi
    fi
    # API drive every 2 s: rapid reads + one expensive item on a rota.
    drive_n=$((drive_n + 1))
    case $((drive_n % 8)) in
      1) api GET "/repos/$SID_A/revisions?max=200&skip=$((drive_n % 30))" >/dev/null || fail "revisions read failed/slow (${API_MS}ms)";;
      2) api GET "/repos/$SID_A/commits/$HEAD_A/blob?path=huge.txt" | grep -q '"truncated":true' || fail "capped blob did not come back truncated (${API_MS}ms)";;
      3) api GET "/repos/$SID_A/commits/$HEAD_A/diff?path=big1.txt&context=3" >/dev/null || fail "diff read failed/slow (${API_MS}ms)";;
      4) api GET "/repos/$SID_B/status" >/dev/null || fail "repo switch (B) failed (${API_MS}ms)";;
      5) api GET "/repos/$SID_A/status" >/dev/null || fail "repo switch (A) failed (${API_MS}ms)";;
      6) if [ "$job_done" = 0 ]; then
           jid=$(api POST "/repos/$SID_A/fetch" '{"remote":"origin"}' | json_field id)
           for _ in $(seq 1 30); do st=$(api GET "/repos/$SID_A/jobs/$jid" | json_field status); [ "$st" != running ] && break; sleep 1; done
           [ "$st" = completed ] && job_done=1 || echo "  note: fetch job status '$st' (bare remote at /tmp/seed-bare)"
         fi;;
      *) api GET "/repos/$SID_A/commits/$HEAD_A" >/dev/null || fail "commit read failed/slow (${API_MS}ms)";;
    esac
    api_ms=$API_MS
    # Injected failure halfway: kill the engine, demand the supervised restart.
    now=$(date +%s)
    if [ "$INJECT_FAILURE" = 1 ] && [ "$injected" = 0 ] && [ "$now" -ge $((START + LONGEVITY * 30)) ]; then
      echo "  injecting engine failure at $((now - START)) s"
      pkill -9 -f powergit-engine; injected=1; injected_at=$now
      for _ in $(seq 1 20); do sleep 1; curl -fsS "http://127.0.0.1:$ENGINE_PORT/health" >/dev/null 2>&1 && break; done
      curl -fsS "http://127.0.0.1:$ENGINE_PORT/health" >/dev/null 2>&1 || fail "engine did not come back within 20 s after the injected kill"
      TOKEN=$(engine_token || true)
      LOG=$(ls "$XDG_DATA_HOME"/com.cynacons.powergit/logs/engine.log 2>/dev/null | head -n1)
      [ -n "$LOG" ] && grep -q "sidecar exited" "$LOG" && grep -c "sidecar started" "$LOG" | grep -qv '^1$' \
        || fail "engine.log under $XDG_DATA_HOME does not record the exit + restart"
      echo "  restart recorded in $LOG"
      SID_A=$(api POST /repos/open '{"path":"/tmp/seed-a"}' | json_field id); SID_B=$(api POST /repos/open '{"path":"/tmp/seed-b"}' | json_field id)
    fi
    if [ $((tick % 5)) -eq 0 ]; then
      web=0; gpu=0; eng=0
      has_proc WebKitWebProcess && web=1
      has_proc WebKitGPUProcess && gpu=1
      has_proc powergit-engine && eng=1
      rss_mb=$(( $(tree_rss_kb) / 1024 ))
      n=$(tree_count)
      el=$(( $(date +%s) - START ))
      sess=$(api GET /repos/sessions | grep -o '"id"' | wc -l)
      watchers=$(api GET /repos/sessions | grep -o '"watchers":[0-9]*' | cut -d: -f2 | paste -sd+ | bc 2>/dev/null || echo 0)
      echo "$el,$rss_mb,$n,$web,$gpu,$eng,$sess,$watchers,$api_ms" >>"$CSV"
      echo "  t=${el}s rss=${rss_mb}MB procs=$n web=$web gpu=$gpu engine=$eng sessions=$sess watchers=$watchers api=${api_ms}ms"
      [ "$web" = 1 ] && seen_web=1
      [ "$gpu" = 1 ] && seen_gpu=1
      [ "$seen_web" = 1 ] && [ "$web" = 0 ] && fail "WebKitWebProcess exited at ${el} s"
      [ "$seen_gpu" = 1 ] && [ "$gpu" = 0 ] && fail "WebKitGPUProcess exited at ${el} s"
      [ "$eng" = 0 ] && [ "$injected" = 0 ] && fail "powergit-engine exited at ${el} s"
      [ "$rss_mb" -gt "$RSS_BUDGET_MB" ] && fail "RSS ${rss_mb} MB exceeds budget ${RSS_BUDGET_MB} MB at ${el} s"
      [ "$sess" -gt 4 ] && fail "session count grew to $sess (expected the two seeds + the app's own)"
      if grep -Eq "$FATAL_RE" "$ERR"; then echo "== app stderr =="; grep -E "$FATAL_RE" "$ERR"; fail "fatal pattern on stderr at ${el} s"; fi
    fi
    sleep 2; tick=$((tick + 1))
  done
  [ "$job_done" = 1 ] || echo "note: the fetch job never completed (pre-v0.13.10 builds send jobs to unprefixed routes)"
  echo "$(( $(date +%s) - START )),$(( $(tree_rss_kb) / 1024 )),$(tree_count),-,-,-,-,-,$api_ms" >>"$CSV"
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
