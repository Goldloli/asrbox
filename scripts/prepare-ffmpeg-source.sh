#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${1:-$ROOT/release-assets}"
WORK_DIR="$(mktemp -d)"
SOURCE_DIR="$WORK_DIR/ASRbox-ffmpeg-source-8.1.2"

trap 'rm -rf "$WORK_DIR"' EXIT
mkdir -p "$OUTPUT_DIR" "$SOURCE_DIR"

if command -v shasum >/dev/null 2>&1; then
  SHA256SUM="shasum -a 256"
else
  SHA256SUM="sha256sum"
fi

curl -fsSL https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz \
  -o "$SOURCE_DIR/ffmpeg-8.1.2.tar.xz"
curl -fsSL https://git.martin-riedl.de/ffmpeg/build-script/archive/bb1d6db29cee948f9685bcd69e6caf17d960662b.tar.gz \
  -o "$SOURCE_DIR/build-script-bb1d6db29cee948f9685bcd69e6caf17d960662b.tar.gz"
curl -fsSL "https://codeload.github.com/GyanD/codexffmpeg/tar.gz/46465995c991fe65c5de853fa79bddec09cd6c37" \
  -o "$SOURCE_DIR/codexffmpeg-46465995c991fe65c5de853fa79bddec09cd6c37.tar.gz"

echo "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c  $SOURCE_DIR/ffmpeg-8.1.2.tar.xz" | $SHA256SUM -c -
echo "b4bcb3aa69bb16304a5b69c62837ec01c167909136afe477df452e8c178e0d5f  $SOURCE_DIR/build-script-bb1d6db29cee948f9685bcd69e6caf17d960662b.tar.gz" | $SHA256SUM -c -
echo "4ed599c5155d4b25906c26ca2ae10b4e300307cf4749b1e33a9be0d285e7e7fc  $SOURCE_DIR/codexffmpeg-46465995c991fe65c5de853fa79bddec09cd6c37.tar.gz" | $SHA256SUM -c -

cp "$ROOT/third_party/ffmpeg/LICENSE.GPLv3" "$SOURCE_DIR/"
cp "$ROOT/third_party/ffmpeg/SOURCE.md" "$SOURCE_DIR/"
tar -C "$WORK_DIR" -czf "$OUTPUT_DIR/ASRbox-ffmpeg-source-8.1.2.tar.gz" "$(basename "$SOURCE_DIR")"

echo "Created $OUTPUT_DIR/ASRbox-ffmpeg-source-8.1.2.tar.gz"
