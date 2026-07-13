#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSET_DIR="${1:-$ROOT/release-assets}"
VERSION="$(node -p "require('$ROOT/package.json').version")"
SOURCE_ARCHIVE="ASRbox-ffmpeg-source-8.1.2.tar.gz"

test -d "$ASSET_DIR"
shopt -s nullglob
dmgs=("$ASSET_DIR"/ASRbox_*.dmg)
if [ "${#dmgs[@]}" -ne 1 ]; then
  echo "Expected exactly one ASRbox DMG in $ASSET_DIR, found ${#dmgs[@]}" >&2
  exit 1
fi

case "$(basename "${dmgs[0]}")" in
  *"$VERSION"*) ;;
  *) echo "DMG filename does not contain application version $VERSION" >&2; exit 1 ;;
esac

test -s "$ASSET_DIR/$SOURCE_ARCHIVE"
test -s "$ASSET_DIR/SHA256SUMS.txt"
test "$(wc -l < "$ASSET_DIR/SHA256SUMS.txt" | tr -d ' ')" -eq 2
grep -Fq "$(basename "${dmgs[0]}")" "$ASSET_DIR/SHA256SUMS.txt"
grep -Fq "$SOURCE_ARCHIVE" "$ASSET_DIR/SHA256SUMS.txt"
(cd "$ASSET_DIR" && shasum -a 256 -c SHA256SUMS.txt)
tar -tzf "$ASSET_DIR/$SOURCE_ARCHIVE" | grep -Fq "ffmpeg-8.1.2.tar.xz"
tar -tzf "$ASSET_DIR/$SOURCE_ARCHIVE" | grep -Fq "LICENSE.GPLv3"

echo "Verified release assets for ASRbox $VERSION."
