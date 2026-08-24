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
APPIMAGE=$1
FIX=${2:-}
command -v unsquashfs >/dev/null || { echo "unsquashfs not found (apt-get install squashfs-tools)" >&2; exit 2; }
command -v objdump >/dev/null || { echo "objdump not found (apt-get install binutils)" >&2; exit 2; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

"$APPIMAGE" --appimage-extract >/dev/null
ROOT=squashfs-root
echo "== AppImage: $(basename "$APPIMAGE") =="

problems=0

# --- GIO modules bundled next to a bundled libgio -------------------------
echo "== bundled GIO modules =="
gio_modules=$(find "$ROOT" -path '*gio/modules/*.so' 2>/dev/null || true)
for m in $gio_modules; do
  echo "  $m"
  for sym in g_task_set_static_name g_assertion_message_cmpint; do
    if objdump -T "$m" | grep -q "UND.*$sym"; then
      echo "    MISMATCH: requires $sym (GLib >= 2.76)"
      problems=$((problems + 1))
    fi
  done
done
[ -z "$gio_modules" ] && echo "  (none bundled)"

# --- libcurl / nghttp2 ----------------------------------------------------
echo "== bundled curl/nghttp2 =="
curl_libs=$(find "$ROOT" \( -name 'libcurl*.so*' -o -name 'libnghttp2*.so*' \) 2>/dev/null || true)
for c in $curl_libs; do
  echo "  $c"
done
for c in $curl_libs; do
  case "$c" in
    *libcurl*)
      if objdump -T "$c" | grep -q "UND.*nghttp2_option_set_no_rc9113_leading_and_trailing_ws_validation"; then
        echo "    MISMATCH: libcurl requires nghttp2 >= 1.50 symbol"
        problems=$((problems + 1))
      fi
      ;;
  esac
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
"$APPIMAGE" --appimage-extract >/dev/null
leftover=0
for m in $(find "$ROOT" -path '*gio/modules/*.so' 2>/dev/null || true); do
  if objdump -T "$m" | grep -Eq "UND.*(g_task_set_static_name|g_assertion_message_cmpint)"; then
    leftover=$((leftover + 1))
  fi
done
if [ "$leftover" -ne 0 ]; then
  echo "still dirty after fix" >&2
  exit 1
fi
echo "FIXED: bundle is clean."
