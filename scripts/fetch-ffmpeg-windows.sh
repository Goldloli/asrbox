#!/bin/bash
# Download and verify the vendored Windows x64 ffmpeg/ffprobe binaries.
#
# The binaries themselves are not committed to git (each exceeds GitHub's
# 100MB file limit); they are fetched from the pinned gyan.dev release archive
# and verified twice: archive SHA-256 on download, then per-file SHA-256
# against third_party/ffmpeg/checksums.sha256 after extraction.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FFMPEG_DIR="$ROOT/third_party/ffmpeg"
OUT_DIR="$FFMPEG_DIR/win32-x64"
ARCHIVE_URL="https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-full_build.7z"
ARCHIVE_SHA256="0fff188997a499b5382e0f66e845d4556c48c54f0113ebed4853d556dbdd7059"
ARCHIVE_ROOT="ffmpeg-8.1.2-full_build"

sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

verify_extracted() {
  (cd "$FFMPEG_DIR" && grep ' win32-x64/' checksums.sha256 | { sha256sum -c - 2>/dev/null || shasum -a 256 -c -; })
}

if [ -s "$OUT_DIR/ffmpeg.exe" ] && [ -s "$OUT_DIR/ffprobe.exe" ] && verify_extracted >/dev/null 2>&1; then
  echo "Windows ffmpeg/ffprobe already present and checksums match; nothing to do."
  exit 0
fi

SEVEN_Z=""
if command -v 7z >/dev/null 2>&1; then
  SEVEN_Z="7z"
elif [ -x "/c/Program Files/7-Zip/7z.exe" ]; then
  SEVEN_Z="/c/Program Files/7-Zip/7z.exe"
else
  echo "7-Zip is required to extract $ARCHIVE_URL (install 7-Zip or add 7z to PATH)." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading $ARCHIVE_URL ..."
for attempt in 1 2 3 4 5; do
  curl -fL --connect-timeout 30 -C - -o "$TMP_DIR/ffmpeg.7z" "$ARCHIVE_URL" && break
  echo "Download attempt $attempt failed; resuming..." >&2
  sleep 3
  [ "$attempt" = 5 ] && { echo "Download failed after 5 attempts." >&2; exit 1; }
done

actual="$(sha256 "$TMP_DIR/ffmpeg.7z")"
if [ "$actual" != "$ARCHIVE_SHA256" ]; then
  echo "Archive SHA-256 mismatch: expected $ARCHIVE_SHA256, got $actual" >&2
  exit 1
fi

"$SEVEN_Z" e -y -o"$TMP_DIR/extract" "$TMP_DIR/ffmpeg.7z" \
  "$ARCHIVE_ROOT/bin/ffmpeg.exe" "$ARCHIVE_ROOT/bin/ffprobe.exe" >/dev/null

mkdir -p "$OUT_DIR"
cp "$TMP_DIR/extract/ffmpeg.exe" "$OUT_DIR/ffmpeg.exe"
cp "$TMP_DIR/extract/ffprobe.exe" "$OUT_DIR/ffprobe.exe"

verify_extracted
echo "Vendored Windows ffmpeg/ffprobe 8.1.2 fetched and verified."
