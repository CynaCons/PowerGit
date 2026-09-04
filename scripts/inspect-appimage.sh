#!/usr/bin/env bash
# PowerGit AppImage runtime-dep inspector.
#
# Why this exists: linuxdeploy copies whatever the build runner has into
# usr/lib, and the AppRun hook puts that directory first on LD_LIBRARY_PATH.
# Everything the HOST webkit2gtk stack drags in (GLib, util-linux, Wayland,
# GStreamer, ...) is then resolved partly from the bundle and partly from
# the host. Two copies of one ABI family in one process = load-time failure
# whenever the host copy is newer than the bundled one:
#
#   v0.9.x   bundled gvfs/dconf GIO modules   undefined symbol: g_task_set_static_name
#   v0.9.x   bundled libcurl-gnutls           undefined symbol (nghttp2)
#   v0.12.3  bundled libmount/libblkid        libmount.so.1: version `MOUNT_2_40' not found
#            (required by the HOST libgio-2.0.so.0 on Ubuntu 26.04)
#
# HOST-vs-BUNDLE POLICY — families that must NEVER be in the bundle.
# The host provides all of them on any distro that ships webkit2gtk-4.1
# (they are hard dependencies of libwebkit2gtk-4.1-0 / libgtk-3-0).
#
#   family      objects                                          why it breaks when bundled
#   ---------   ----------------------------------------------   -----------------------------------------------
#   glib        libglib-2.0 libgio-2.0 libgobject-2.0            host GIO modules (dconf, gvfs, libproxy) and
#               libgmodule-2.0 libgthread-2.0, gio/modules/*.so   host webkit resolve against the older bundled
#                                                                GLib -> undefined symbol / Failed to load module
#   utillinux   libmount libblkid libuuid                        host libgio needs MOUNT_2_40 (util-linux 2.40+);
#                                                                the bundled 2.37 copy shadows it -> version not found
#   wayland     libwayland-client/-cursor/-egl/-server           host GTK/WebKit/EGL bind to the host copies; a
#                                                                second copy breaks protocol/version negotiation
#   gstreamer   libgst*.so, gstreamer-1.0/ plugin dirs           host webkit's media backend loads host plugins
#                                                                against the bundled core -> GStreamer-CRITICAL /
#                                                                symbol lookup error
#   curl        libcurl* libnghttp2*                             bundled curl newer than host nghttp2 ->
#                                                                undefined symbol
#
# Everything else (GTK, WebKit itself, ICU, pango, cairo, pixbuf loaders,
# im-modules) stays bundled: those are what Tauri/linuxdeploy intend to
# ship, and the matrix (docker/appimage-check/run-matrix.sh) proves they
# start on 22.04/24.04/26.04.
#
# Usage:
#   scripts/inspect-appimage.sh <file.AppImage> [--fix] [--strict] [--out <file>]
#   scripts/inspect-appimage.sh --self-test [<fixtures dir>]
#
#   (default)  report prohibited families as WARN; FAIL (exit 1) only on
#              unresolved symbols (`ldd -r` against the bundle's own libs)
#              or a bundled GLib family.
#   --strict   any prohibited family present is a FAIL even when every
#              symbol resolves on the build host (the v0.12.3 libmount case
#              resolved fine on ubuntu-22.04 and broke on 26.04). CI runs
#              `--fix --strict`.
#   --fix      strip every prohibited family + anything with unresolved
#              symbols, repack with appimagetool, re-inspect. Writes over
#              the input unless --out is given.
#   --self-test  no AppImage needed: asserts the fixtures under
#              docker/appimage-check/fixtures/*.stderr.txt match the fatal
#              runtime patterns, and that the family matchers flag a
#              synthetic bundle. Run it in CI and after editing the table.
#
# Requirements: bash, squashfs-tools (unsquashfs), binutils (objdump),
# python3; for --fix: appimagetool on PATH or network access to fetch it.
# Runs unchanged inside a stock ubuntu container (no FUSE needed).
set -euo pipefail

# Runtime stderr patterns the container guard (docker/appimage-check/
# launch.sh) treats as fatal. Keep the two copies identical.
FATAL_RE='undefined symbol|Failed to load module|version .* not found|symbol lookup error|GStreamer-CRITICAL|WebKitWebProcess.*(crash|terminated)|Gdk-ERROR'

# --- family table ---------------------------------------------------------
# name|find -name globs (space separated)|reason
FAMILIES='
glib|libglib-2.0.so* libgio-2.0.so* libgobject-2.0.so* libgmodule-2.0.so* libgthread-2.0.so*|bundled GLib shadows the host GLib that webkit2gtk and every host GIO module were built against
utillinux|libmount.so* libblkid.so* libuuid.so*|host libgio-2.0 requires MOUNT_2_40 from util-linux >= 2.40; the bundled copy shadows it (v0.12.3 on Ubuntu 26.04)
wayland|libwayland-client.so* libwayland-cursor.so* libwayland-egl.so* libwayland-server.so*|host GTK/WebKit/EGL already bind to the host Wayland client libs; a second copy breaks version negotiation
gstreamer|libgst*.so*|host webkit media backend loads host GStreamer plugins against the bundled core (GStreamer-CRITICAL / symbol lookup error)
curl|libcurl*.so* libnghttp2*.so*|bundled libcurl built against a newer nghttp2 than the host provides (undefined symbol)
'
# Directories that belong to a family (whole tree is prohibited).
FAMILY_DIRS='
glib|gio/modules
gstreamer|gstreamer-1.0
'

family_reason() { echo "$FAMILIES" | awk -F'|' -v n="$1" '$1==n{print $3}'; }
family_names() { echo "$FAMILIES" | awk -F'|' 'NF{print $1}'; }

# find_family <root> <name>  -> prints matching paths (files and dirs)
find_family() {
  local root=$1 name=$2 globs g args=() d
  globs=$(echo "$FAMILIES" | awk -F'|' -v n="$name" '$1==n{print $2}')
  for g in $globs; do args+=(-o -name "$g"); done
  [ ${#args[@]} -gt 0 ] && find "$root" \( "${args[@]:1}" \) 2>/dev/null || true
  for d in $(echo "$FAMILY_DIRS" | awk -F'|' -v n="$name" '$1==n{print $2}'); do
    find "$root" -type d -path "*/$d" 2>/dev/null || true
  done
}

# --- self-test -------------------------------------------------------------
self_test() {
  local dir=${1:-} here rc=0 f n
  here=$(cd "$(dirname "$0")" && pwd)
  [ -n "$dir" ] || dir="$here/../docker/appimage-check/fixtures"
  echo "== self-test: fixtures in $dir =="
  n=0
  for f in "$dir"/*.stderr.txt; do
    [ -f "$f" ] || continue
    n=$((n + 1))
    if grep -Eq "$FATAL_RE" "$f"; then
      echo "  ok   $(basename "$f"): $(grep -Eo "$FATAL_RE" "$f" | sort -u | tr '\n' ',' | sed 's/,$//')"
    else
      echo "  FAIL $(basename "$f"): no fatal pattern matched" >&2; rc=1
    fi
  done
  [ "$n" -gt 0 ] || { echo "  FAIL no fixtures found" >&2; rc=1; }
  # The v0.12.3 fixture is the libmount case: it must trip the `version ...
  # not found` pattern specifically, and NOT only the older two patterns the
  # pre-v0.13 guard knew about (which let v0.12.3 ship).
  f="$dir/v0.12.3-ubuntu-26.04.stderr.txt"
  if [ -f "$f" ]; then
    if grep -Eq 'libmount\.so\.1: version .MOUNT_2_40. not found' "$f"; then
      echo "  ok   v0.12.3 fixture carries the MOUNT_2_40 line"
    else
      echo "  FAIL v0.12.3 fixture lost its MOUNT_2_40 line" >&2; rc=1
    fi
    if grep -Eq 'undefined symbol|Failed to load module' "$f"; then
      echo "  FAIL v0.12.3 fixture matches the OLD guard regex; the fixture no longer proves the gap" >&2; rc=1
    else
      echo "  ok   v0.12.3 fixture is invisible to the old guard regex (undefined symbol|Failed to load module)"
    fi
  fi

  echo "== self-test: family matchers on a synthetic bundle =="
  local w
  w=$(mktemp -d); trap 'rm -rf "$w"' RETURN
  mkdir -p "$w/usr/lib/x86_64-linux-gnu/gio/modules" "$w/usr/lib/gstreamer-1.0"
  for s in libglib-2.0.so.0 libgio-2.0.so.0 libgobject-2.0.so.0 libgmodule-2.0.so.0 libgthread-2.0.so.0 \
           libmount.so.1 libblkid.so.1 libuuid.so.1 \
           libwayland-client.so.0 libwayland-cursor.so.0 libwayland-egl.so.1 libwayland-server.so.0 \
           libgstreamer-1.0.so.0 libgstbase-1.0.so.0 libgstvideo-1.0.so.0 \
           libcurl-gnutls.so.4 libnghttp2.so.14 \
           libgtk-3.so.0 libwebkit2gtk-4.1.so.0 libicuuc.so.70; do
    : >"$w/usr/lib/$s"
  done
  : >"$w/usr/lib/x86_64-linux-gnu/gio/modules/libgvfsdbus.so"
  : >"$w/usr/lib/gstreamer-1.0/libgstcoreelements.so"
  local expect_glib=6 expect_util=3 expect_way=4 expect_gst=5 expect_curl=2 c
  for spec in "glib:$expect_glib" "utillinux:$expect_util" "wayland:$expect_way" "gstreamer:$expect_gst" "curl:$expect_curl"; do
    local name=${spec%%:*} want=${spec##*:}
    c=$(find_family "$w" "$name" | wc -l)
    if [ "$c" -eq "$want" ]; then echo "  ok   $name: $c object(s) flagged"
    else echo "  FAIL $name: flagged $c, expected $want" >&2; find_family "$w" "$name" >&2; rc=1; fi
  done
  # Allowed libs must not be caught by any family.
  for name in $(family_names); do
    if find_family "$w" "$name" | grep -Eq 'libgtk-3|libwebkit2gtk|libicuuc'; then
      echo "  FAIL $name matcher flags an allowed library" >&2; rc=1
    fi
  done
  [ "$rc" -eq 0 ] && echo "SELF-TEST OK" || echo "SELF-TEST FAILED" >&2
  return $rc
}

# --- args ------------------------------------------------------------------
APPIMAGE=""; FIX=0; STRICT=0; OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --self-test) shift; self_test "${1:-}"; exit $? ;;
    --fix) FIX=1; shift ;;
    --strict) STRICT=1; shift ;;
    --out) OUT=$2; shift 2 ;;
    -h|--help) sed -n '2,60p' "$0"; exit 0 ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) APPIMAGE=$1; shift ;;
  esac
done
[ -n "$APPIMAGE" ] || { echo "usage: $0 <file.AppImage> [--fix] [--strict] [--out <file>] | --self-test" >&2; exit 2; }
# Resolve before cd'ing into the temp workdir — callers pass relative paths.
APPIMAGE=$(readlink -f "$APPIMAGE")
[ -f "$APPIMAGE" ] || { echo "no such file: $APPIMAGE" >&2; exit 2; }
[ -n "$OUT" ] && OUT=$(readlink -f "$(dirname "$OUT")")/$(basename "$OUT")
command -v unsquashfs >/dev/null || { echo "unsquashfs not found (apt-get install squashfs-tools)" >&2; exit 2; }
command -v objdump >/dev/null || { echo "objdump not found (apt-get install binutils)" >&2; exit 2; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# --- extraction ------------------------------------------------------------
# The type-2 runtime's own --appimage-extract needs no FUSE, but CI runners
# sometimes hand us a non-executable file or refuse to exec it. Fallback:
# the squashfs image starts right after the ELF runtime (end of the section
# header table), so compute that from the ELF header instead of grepping for
# "hsqs" (the runtime binary itself contains that string).
squashfs_offset() {
  python3 - "$1" <<'EOF'
import struct, sys
p = sys.argv[1]
with open(p, "rb") as f:
    h = f.read(64)
    e_shoff = struct.unpack_from("<Q", h, 0x28)[0]
    e_shentsize, e_shnum = struct.unpack_from("<HH", h, 0x3A)
    off = e_shoff + e_shentsize * e_shnum
    f.seek(off)
    if f.read(4) == b"hsqs":
        print(off); sys.exit(0)
    # Fallback: scan for a superblock magic that unsquashfs accepts.
    f.seek(0); data = f.read()
    i = 0
    while True:
        i = data.find(b"hsqs", i)
        if i < 0: break
        if i > 0x10000: print(i); sys.exit(0)
        i += 4
print(-1)
EOF
}
extract() { # $1 = appimage, extracts into ./squashfs-root
  rm -rf squashfs-root
  local src=./input.AppImage
  cp "$1" "$src"; chmod +x "$src" 2>/dev/null || true
  if ! "$src" --appimage-extract >/dev/null 2>&1; then
    echo "runtime self-extract unavailable; extracting via squashfs offset"
    local offset; offset=$(squashfs_offset "$src")
    [ -n "$offset" ] && [ "$offset" -ge 0 ] || { echo "no squashfs superblock found" >&2; exit 2; }
    unsquashfs -q -o "$offset" -d squashfs-root "$src" >/dev/null
  fi
  rm -f "$src"
}

extract "$APPIMAGE"
ROOT=squashfs-root
echo "== AppImage: $(basename "$APPIMAGE") =="

# Generic unresolved-symbol check: resolve the object against the bundle's
# own libs first (mirrors runtime), and report ANY undefined symbol — not a
# hard-coded list, so a runner-image bump introducing a new mismatch is
# caught the same way the known ones were.
check_unresolved() {
  local so=$1
  LD_LIBRARY_PATH="$ROOT/usr/lib:$ROOT/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}" \
    ldd -r "$so" 2>&1 | grep -E "undefined symbol|version .* not found" || true
}

# scan: fills PROHIBITED (paths), BROKEN (paths with unresolved symbols),
# problems/warnings counters. Called before and after --fix.
scan() {
  problems=0; warnings=0; PROHIBITED=""; BROKEN=""
  local name reason paths p unresolved sev
  echo "== prohibited families (host-provided via webkit2gtk) =="
  for name in $(family_names); do
    paths=$(find_family "$ROOT" "$name")
    [ -n "$paths" ] || { echo "  $name: none bundled"; continue; }
    reason=$(family_reason "$name")
    if [ "$STRICT" = 1 ] || [ "$name" = glib ]; then sev=FAIL; else sev=WARN; fi
    echo "  $name: $sev — $reason"
    for p in $paths; do
      echo "    $p"
      PROHIBITED="$PROHIBITED $p"
    done
    if [ "$sev" = FAIL ]; then problems=$((problems + 1)); else warnings=$((warnings + 1)); fi
  done

  echo "== unresolved symbols (ldd -r against the bundle's own libs) =="
  # Scope: plugin-style modules that load into a host process plus the curl
  # family; INSPECT_ALL=1 widens it to every bundled shared object.
  local scope
  if [ "${INSPECT_ALL:-0}" = 1 ]; then
    scope=$(find "$ROOT" -name '*.so*' -type f 2>/dev/null || true)
  else
    scope=$(find "$ROOT" \( -path '*gio/modules/*.so' -o -name 'libcurl*.so*' -o -name 'libnghttp2*.so*' -o -path '*gstreamer-1.0/*.so' \) -type f 2>/dev/null || true)
  fi
  local n=0
  for p in $scope; do
    n=$((n + 1))
    unresolved=$(check_unresolved "$p")
    if [ -n "$unresolved" ]; then
      echo "  MISMATCH: $p"; echo "$unresolved" | sed 's/^/      /'
      BROKEN="$BROKEN $p"; problems=$((problems + 1))
    fi
  done
  echo "  checked $n object(s)"
}

scan
if [ "$problems" -eq 0 ] && { [ "$warnings" -eq 0 ] || [ "$FIX" = 0 ]; }; then
  if [ "$warnings" -gt 0 ]; then
    echo "OK (with $warnings prohibited-family warning(s); run with --strict to fail on them, --fix to strip them)."
  else
    echo "OK: no prohibited families, no version mismatches."
  fi
  exit 0
fi

[ "$problems" -gt 0 ] && echo "FOUND $problems problem(s), $warnings warning(s)."
if [ "$FIX" = 0 ]; then
  echo "Run with --fix to strip them and repack."
  exit 1
fi

# --- fix: strip offending pieces and repack --------------------------------
echo "== fixing =="
for p in $PROHIBITED $BROKEN; do
  [ -e "$p" ] || continue
  echo "  rm $p"; rm -rf "$p"
done

if ! command -v appimagetool >/dev/null 2>&1; then
  echo "Downloading appimagetool..."
  arch=${ARCH:-x86_64}
  curl -fsSL -o appimagetool "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${arch}.AppImage"
  chmod +x appimagetool
  APPIMAGETOOL="./appimagetool --appimage-extract-and-run"
else
  APPIMAGETOOL="appimagetool"
fi

REPACK="$(pwd)/fixed.AppImage"
ARCH=${ARCH:-x86_64} $APPIMAGETOOL "$ROOT" "$REPACK" >/dev/null
DEST=${OUT:-$APPIMAGE}
mv "$REPACK" "$DEST"
chmod +x "$DEST" 2>/dev/null || true
echo "Repacked -> $DEST"

# Re-inspect (strict) to prove cleanliness: no family left, nothing broken.
echo "== re-inspecting repacked bundle =="
STRICT=1
extract "$DEST"
scan
if [ "$problems" -ne 0 ]; then
  echo "still dirty after fix" >&2
  exit 1
fi
echo "FIXED: bundle is clean."
