#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FFMPEG_DIR="$ROOT/third_party/ffmpeg"

test -s "$FFMPEG_DIR/LICENSE.GPLv3"
test -s "$FFMPEG_DIR/SOURCE.md"

# Checksums cover every committed platform binary on every checkout. The
# Windows x64 binaries exceed GitHub's file size limit and are fetched on
# demand by scripts/fetch-ffmpeg-windows.sh; verify them when present.
COMMITTED_CHECKS="$(grep -v ' win32-x64/' "$FFMPEG_DIR/checksums.sha256")"
WINDOWS_CHECKS="$(grep ' win32-x64/' "$FFMPEG_DIR/checksums.sha256" || true)"
if command -v shasum >/dev/null 2>&1; then
  (cd "$FFMPEG_DIR" && shasum -a 256 -c <<<"$COMMITTED_CHECKS")
  if [ -f "$FFMPEG_DIR/win32-x64/ffmpeg.exe" ]; then
    (cd "$FFMPEG_DIR" && shasum -a 256 -c <<<"$WINDOWS_CHECKS")
  fi
else
  (cd "$FFMPEG_DIR" && sha256sum -c <<<"$COMMITTED_CHECKS")
  if [ -f "$FFMPEG_DIR/win32-x64/ffmpeg.exe" ]; then
    (cd "$FFMPEG_DIR" && sha256sum -c <<<"$WINDOWS_CHECKS")
  fi
fi

# Version assertions only apply to binaries the current platform can execute.
case "$(uname -s)" in
  Darwin)
    FFMPEG="$FFMPEG_DIR/darwin-arm64/ffmpeg"
    FFPROBE="$FFMPEG_DIR/darwin-arm64/ffprobe"
    EXPECTED_MARKER="ffmpeg version 8.1.2-https://www.martin-riedl.de"
    EXPECTED_PROBE_MARKER="ffprobe version 8.1.2-https://www.martin-riedl.de"
    ;;
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    FFMPEG="$FFMPEG_DIR/win32-x64/ffmpeg.exe"
    FFPROBE="$FFMPEG_DIR/win32-x64/ffprobe.exe"
    EXPECTED_MARKER="ffmpeg version 8.1.2-full_build-www.gyan.dev"
    EXPECTED_PROBE_MARKER="ffprobe version 8.1.2-full_build-www.gyan.dev"
    if [ ! -f "$FFMPEG" ] || [ ! -f "$FFPROBE" ]; then
      echo "Windows ffmpeg binaries are not committed (GitHub size limit); fetch them with scripts/fetch-ffmpeg-windows.sh" >&2
      exit 1
    fi
    ;;
  *)
    echo "No vendored ffmpeg for $(uname -s); skipping executable verification (checksums already verified)." >&2
    exit 0
    ;;
esac

test -x "$FFMPEG"
test -x "$FFPROBE"

ffmpeg_version="$("$FFMPEG" -version 2>&1)"
ffprobe_version="$("$FFPROBE" -version 2>&1)"

grep -Fq "$EXPECTED_MARKER" <<<"$ffmpeg_version"
grep -Fq "$EXPECTED_PROBE_MARKER" <<<"$ffprobe_version"
grep -Fq -- "--enable-gpl" <<<"$ffmpeg_version"
grep -Fq -- "--enable-version3" <<<"$ffmpeg_version"

echo "Verified FFmpeg 8.1.2 binaries, checksums, GPLv3 license, and source record."
