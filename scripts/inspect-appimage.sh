#!/usr/bin/env bash
# PowerGit AppImage runtime-dep inspector.
#
# Owner report (GitHub release AppImage, Ubuntu): bundled GIO modules
# (gvfs, dconf) failed with "undefined symbol: g_task_set_static_name"
# (GLib >= 2.76) and bundled libcurl-gnutls failed on a missing nghttp2
# symbol. Both mean: bundled modules/libs newer than the GLib/nghttp2 they
# bind to at runtime.
#
# This script extracts the AppImage and fails (exit 1) if any bundled
# shared object references GLib/nghttp2 symbols that the bundle's own
# libraries do not provide — i.e. exactly the class of error seen at
# runtime — so bad bundles never reach a release.
#
# Usage:
#   scripts/inspect-appimage.sh <file.AppImage> [--fix]
#
# With --fix, offending bundled GIO modules (and libcurl/libnghttp2) are
# removed and the AppImage is repacked with appimagetool. The removed
# pieces are host-provided on any distro that ships webkit2gtk, and our UI
# does not need remote-volume mounts or dconf.
#
# Requirements: squashfs-tools (unsquashfs), binutils (objdump),
# and for --fix: appimagetool on PATH or network access to download it.
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: $0 <file.AppImage> [--fix]" >&2; exit 2; }
# Resolve before cd'ing into the temp workdir — callers pass relative paths.
APPIMAGE=$(readlink -f "$1")
[ -f "$APPIMAGE" ] || { echo "no such file: $1" >&2; exit 2; }
FIX=${2:-}
command -v unsquashfs >/dev/null || { echo "unsquashfs not found (apt-get install squashfs-tools)" >&2; exit 2; }
command -v objdump >/dev/null || { echo "objdump not found (apt-get install binutils)" >&2; exit 2; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

# CI runners may hand us a non-executable file; the type-2 runtime also
# sometimes fails to exec in restricted environments. Fall back to
# locating the squashfs magic and extracting with unsquashfs directly.
chmod +x "$APPIMAGE" 2>/dev/null || true
if ! "$APPIMAGE" --appimage-extract >/dev/null 2>&1; then
  echo "runtime self-extract unavailable; extracting via squashfs offset"
  offset=$(python3 - "$APPIMAGE" <<'EOF'
import sys
with open(sys.argv[1], "rb") as f:
    head = f.read(2 * 1024 * 1024)
print(head.find(b"hsqs"))
EOF
)
  [ -n "$offset" ] && [ "$offset" -ge 0 ] || { echo "no squashfs magic found" >&2; exit 2; }
  unsquashfs -o "$offset" -d squashfs-root "$APPIMAGE" >/dev/null
fi
ROOT=squashfs-root
echo "== AppImage: $(basename "$APPIMAGE") =="

problems=0

# Generic unresolved-symbol check: resolve the object against the bundle's
# own libs first (mirrors runtime), and report ANY undefined symbol — not a
# hard-coded list, so a runner-image bump introducing a new GLib/nghttp2
# mismatch is caught the same way the known ones were.
check_unresolved() {
  local so=$1
  LD_LIBRARY_PATH="$ROOT/usr/lib:$ROOT/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}" \
    ldd -r "$so" 2>&1 | grep "undefined symbol" || true
}

# --- GIO modules bundled next to a bundled libgio -------------------------
echo "== bundled GIO modules =="
gio_modules=$(find "$ROOT" -path '*gio/modules/*.so' 2>/dev/null || true)
for m in $gio_modules; do
  echo "  $m"
  unresolved=$(check_unresolved "$m")
  if [ -n "$unresolved" ]; then
    echo "$unresolved" | sed 's/^/    MISMATCH: /'
    problems=$((problems + 1))
  fi
done
[ -z "$gio_modules" ] && echo "  (none bundled)"

# --- bundled GLib family --------------------------------------------------
# A bundled libglib/libgio/libgobject/libgmodule is loaded instead of the
# host's, so every HOST GIO module (dconf settings backend, gvfs, libproxy)
# resolves against an older GLib and fails to load: no dconf means WebKitGTK
# cannot read the desktop's font antialias/hinting/rgba settings (blurry,
# light text) and the GTK file chooser loses gvfs. webkit2gtk from the host
# already pulls in the host GLib, so these copies are never needed.
echo "== bundled GLib family =="
glib_libs=$(find "$ROOT" \( -name 'libglib-2.0.so*' -o -name 'libgio-2.0.so*' -o -name 'libgobject-2.0.so*' -o -name 'libgmodule-2.0.so*' -o -name 'libgthread-2.0.so*' \) 2>/dev/null || true)
for g in $glib_libs; do
  echo "  MISMATCH: $g (bundled GLib shadows the host's; strip it)"
  problems=$((problems + 1))
done
[ -z "$glib_libs" ] && echo "  (none bundled)"

# --- libcurl / nghttp2 ----------------------------------------------------
echo "== bundled curl/nghttp2 =="
curl_libs=$(find "$ROOT" \( -name 'libcurl*.so*' -o -name 'libnghttp2*.so*' \) 2>/dev/null || true)
for c in $curl_libs; do
  echo "  $c"
  unresolved=$(check_unresolved "$c")
  if [ -n "$unresolved" ]; then
    echo "$unresolved" | sed 's/^/    MISMATCH: /'
    problems=$((problems + 1))
  fi
done
# nghttp2 bundled alongside a curl that does NOT need it is dead weight but
# harmless; only report.
[ -z "$curl_libs" ] && echo "  (none bundled)"

if [ "$problems" -eq 0 ]; then
  echo "OK: no GLib/nghttp2 version mismatches detected."
  exit 0
fi

echo "FOUND $problems version-mismatched bundled object(s)."

if [ "$FIX" != "--fix" ]; then
  echo "Run with --fix to strip them and repack."
  exit 1
fi

# --- fix: strip offending pieces and repack --------------------------------
echo "== fixing =="
for m in $gio_modules; do rm -f "$m"; done
for c in $curl_libs; do rm -f "$c"; done
for g in $glib_libs; do rm -f "$g"; done

if ! command -v appimagetool >/dev/null 2>&1; then
  echo "Downloading appimagetool..."
  arch=${ARCH:-x86_64}
  curl -fsSL -o appimagetool "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${arch}.AppImage"
  chmod +x appimagetool
  APPIMAGETOOL="./appimagetool --appimage-extract-and-run"
else
  APPIMAGETOOL="appimagetool"
fi

OUT="$(pwd)/fixed.AppImage"
ARCH=${ARCH:-x86_64} $APPIMAGETOOL "$ROOT" "$OUT"
mv "$OUT" "$APPIMAGE"
echo "Repacked $APPIMAGE without mismatched objects."

# Re-inspect to prove cleanliness.
rm -rf "$ROOT"
if ! "$APPIMAGE" --appimage-extract >/dev/null 2>&1; then
  offset=$(python3 - "$APPIMAGE" <<'EOF'
import sys
with open(sys.argv[1], "rb") as f:
    head = f.read(2 * 1024 * 1024)
print(head.find(b"hsqs"))
EOF
)
  unsquashfs -o "$offset" -d squashfs-root "$APPIMAGE" >/dev/null
fi
leftover=0
for m in $(find "$ROOT" -path '*gio/modules/*.so' 2>/dev/null || true); do
  if [ -n "$(check_unresolved "$m")" ]; then
    leftover=$((leftover + 1))
  fi
done
glib_left=$(find "$ROOT" \( -name 'libglib-2.0.so*' -o -name 'libgio-2.0.so*' -o -name 'libgobject-2.0.so*' -o -name 'libgmodule-2.0.so*' \) 2>/dev/null || true)
[ -n "$glib_left" ] && leftover=$((leftover + 1))
if [ "$leftover" -ne 0 ]; then
  echo "still dirty after fix" >&2
  exit 1
fi
echo "FIXED: bundle is clean."
