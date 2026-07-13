#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FFMPEG_DIR="$ROOT/third_party/ffmpeg"
FFMPEG="$FFMPEG_DIR/darwin-arm64/ffmpeg"
FFPROBE="$FFMPEG_DIR/darwin-arm64/ffprobe"

test -x "$FFMPEG"
test -x "$FFPROBE"
test -s "$FFMPEG_DIR/LICENSE.GPLv3"
test -s "$FFMPEG_DIR/SOURCE.md"

(cd "$FFMPEG_DIR" && shasum -a 256 -c checksums.sha256)

ffmpeg_version="$($FFMPEG -version 2>&1)"
ffprobe_version="$($FFPROBE -version 2>&1)"

grep -Fq "ffmpeg version 8.1.2-https://www.martin-riedl.de" <<<"$ffmpeg_version"
grep -Fq "ffprobe version 8.1.2-https://www.martin-riedl.de" <<<"$ffprobe_version"
grep -Fq -- "--enable-gpl" <<<"$ffmpeg_version"
grep -Fq -- "--enable-version3" <<<"$ffmpeg_version"

echo "Verified FFmpeg 8.1.2 binaries, checksums, GPLv3 license, and source record."
