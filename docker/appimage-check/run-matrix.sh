#!/usr/bin/env bash
# PowerGit AppImage release-compatibility matrix (host side, needs docker).
#
# Launches ONE AppImage — the exact artifact that will be uploaded — inside
# stock ubuntu:22.04, ubuntu:24.04 and ubuntu:26.04 containers with only the
# packages a desktop user has, under xvfb, and requires on every version:
#   * the sidecar engine answers GET /health within 30 s (first-paint proxy)
#   * the process is still alive after SMOKE_SECONDS (default 20)
#   * stderr matches none of the fatal patterns (undefined symbol, Failed to
#     load module, version ... not found, symbol lookup error,
#     GStreamer-CRITICAL, WebKitWebProcess crash/terminated, Gdk-ERROR)
# Per-version stderr, stdout and result land in <out-dir>/<version>/.
#
# Usage:
#   docker/appimage-check/run-matrix.sh <file.AppImage> [--out <dir>]
#         [--versions "22.04 24.04 26.04"] [--longevity <minutes>]
#
# --longevity N (one version at a time; combine with --versions to pick it)
#   keeps the app running N minutes, drives it with xdotool (Down every 2 s,
#   Ctrl+R every 60 s), samples RSS of the process tree + child count every
#   10 s into <out-dir>/<version>/rss.csv and fails on a WebKitWebProcess /
#   WebKitGPUProcess / powergit-engine exit or RSS > RSS_BUDGET_MB (1500).
#
# Env: SMOKE_SECONDS, RSS_BUDGET_MB, HEALTH_TIMEOUT, DOCKER (binary name),
#      DISPLAY_MODE=x11|wayland (longevity; weston headless), INJECT_FAILURE=1
#      (longevity; kills the engine halfway and requires the supervised
#      restart, >= v0.13.11 builds), API_BUDGET_S (max seconds per API read).
# Windows/Git Bash: run through scripts/appimage-matrix.ps1, or export
# MSYS_NO_PATHCONV=1 so "/app/..." mount targets are not rewritten.
set -uo pipefail

APPIMAGE=""; OUT=""; VERSIONS="22.04 24.04 26.04"; LONGEVITY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT=$2; shift 2 ;;
    --versions) VERSIONS=$2; shift 2 ;;
    --longevity) LONGEVITY=$2; shift 2 ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) APPIMAGE=$1; shift ;;
  esac
done
[ -n "$APPIMAGE" ] || { echo "usage: $0 <file.AppImage> [--out <dir>] [--versions \"22.04 24.04\"] [--longevity <min>]" >&2; exit 2; }
[ -f "$APPIMAGE" ] || { echo "no such file: $APPIMAGE" >&2; exit 2; }
DOCKER=${DOCKER:-docker}
command -v "$DOCKER" >/dev/null || { echo "docker not found" >&2; exit 2; }

HERE=$(cd "$(dirname "$0")" && pwd)
[ -n "$OUT" ] || OUT="$HERE/out"
mkdir -p "$OUT"
# Absolute, docker-friendly paths. On Git Bash `pwd -W` yields C:/... which
# Docker Desktop accepts; elsewhere it is a plain absolute path.
abs() {
  local d
  d=$(cd "$(dirname "$1")" && { pwd -W 2>/dev/null || pwd; })
  echo "$d/$(basename "$1")"
}
APP_ABS=$(abs "$APPIMAGE")
OUT_ABS=$(abs "$OUT")
# Stage the launcher with LF endings (Windows checkouts may carry CRLF).
tr -d '\r' <"$HERE/launch.sh" >"$OUT/launch.sh"
export MSYS_NO_PATHCONV=1

declare -A RESULT NOTE
overall=0
for v in $VERSIONS; do
  image="ubuntu:$v"
  vout="$OUT/$v"; rm -rf "$vout"; mkdir -p "$vout"
  echo
  echo "===== $image ====="
  args=()
  [ "$LONGEVITY" -gt 0 ] && args=(--longevity "$LONGEVITY")
  "$DOCKER" run --rm \
    -e SMOKE_SECONDS="${SMOKE_SECONDS:-20}" \
    -e RSS_BUDGET_MB="${RSS_BUDGET_MB:-1500}" \
    -e HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-30}" \
    -e DISPLAY_MODE="${DISPLAY_MODE:-x11}" \
    -e INJECT_FAILURE="${INJECT_FAILURE:-0}" \
    -e API_BUDGET_S="${API_BUDGET_S:-5}" \
    -v "$APP_ABS:/app/PowerGit.AppImage:ro" \
    -v "$OUT_ABS/launch.sh:/launch.sh:ro" \
    -v "$OUT_ABS/$v:/out" \
    "$image" bash /launch.sh "${args[@]}"
  rc=$?
  if [ $rc -eq 0 ]; then RESULT[$v]=PASS; else RESULT[$v]=FAIL; overall=1; fi
  NOTE[$v]=$(grep -E '^(SKIP|PASS|FAIL):' "$vout/result.txt" 2>/dev/null | paste -sd';' - | cut -c1-160)
  [ -n "${NOTE[$v]}" ] || NOTE[$v]="no result written (docker rc=$rc)"
done

echo
echo "===== AppImage compatibility matrix: $(basename "$APPIMAGE") ====="
printf '%-14s %-6s %s\n' "image" "result" "note"
for v in $VERSIONS; do
  printf '%-14s %-6s %s\n' "ubuntu:$v" "${RESULT[$v]}" "${NOTE[$v]}"
done
echo "stderr per version: $OUT/<version>/app.stderr.txt"
[ "$LONGEVITY" -gt 0 ] && echo "RSS samples: $OUT/<version>/rss.csv"
exit $overall
