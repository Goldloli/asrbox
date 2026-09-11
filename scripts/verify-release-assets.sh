#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSET_DIR="${1:-$ROOT/release-assets}"
VERSION="$(cd "$ROOT" && node -p "require('./package.json').version")"
SOURCE_ARCHIVE="ASRbox-ffmpeg-source-8.1.2.tar.gz"

if command -v shasum >/dev/null 2>&1; then
  SHA256=(shasum -a 256)
else
  SHA256=(sha256sum)
fi

test -d "$ASSET_DIR"
shopt -s nullglob
dmgs=("$ASSET_DIR"/ASRbox_*.dmg)
if [ "${#dmgs[@]}" -ne 1 ]; then
  echo "Expected exactly one ASRbox DMG in $ASSET_DIR, found ${#dmgs[@]}" >&2
  exit 1
fi
installers=("$ASSET_DIR"/ASRbox_*_x64-setup.exe)
if [ "${#installers[@]}" -ne 1 ]; then
  echo "Expected exactly one ASRbox NSIS installer in $ASSET_DIR, found ${#installers[@]}" >&2
  exit 1
fi

for artifact in "${dmgs[0]}" "${installers[0]}"; do
  case "$(basename "$artifact")" in
    *"$VERSION"*) ;;
    *) echo "$(basename "$artifact") filename does not contain application version $VERSION" >&2; exit 1 ;;
  esac
done

test -s "$ASSET_DIR/$SOURCE_ARCHIVE"
KIT_MANIFEST="cuda-kit-manifest.json"
KIT_PARTS=("$ASSET_DIR"/asrbox-cuda-kit-windows-x64.zip.part*)
if [ "${#KIT_PARTS[@]}" -lt 1 ]; then
  echo "Expected at least one CUDA kit part in $ASSET_DIR" >&2
  exit 1
fi
GITHUB_ASSET_LIMIT=$((2 * 1024 * 1024 * 1024))
for part in "${KIT_PARTS[@]}"; do
  test -s "$part"
  part_size="$(stat -c %s "$part" 2>/dev/null || stat -f %z "$part")"
  if [ "$part_size" -gt "$GITHUB_ASSET_LIMIT" ]; then
    echo "$(basename "$part") exceeds the 2 GiB GitHub asset limit" >&2
    exit 1
  fi
done
test -s "$ASSET_DIR/$KIT_MANIFEST"
test -s "$ASSET_DIR/SHA256SUMS.txt"
test "$(wc -l < "$ASSET_DIR/SHA256SUMS.txt" | tr -d ' ')" -eq $((3 + ${#KIT_PARTS[@]} + 1))
grep -Fq "$(basename "${dmgs[0]}")" "$ASSET_DIR/SHA256SUMS.txt"
grep -Fq "$(basename "${installers[0]}")" "$ASSET_DIR/SHA256SUMS.txt"
grep -Fq "$SOURCE_ARCHIVE" "$ASSET_DIR/SHA256SUMS.txt"
for part in "${KIT_PARTS[@]}"; do
  grep -Fq "$(basename "$part")" "$ASSET_DIR/SHA256SUMS.txt"
done
grep -Fq "$KIT_MANIFEST" "$ASSET_DIR/SHA256SUMS.txt"
(cd "$ASSET_DIR" && "${SHA256[@]}" -c SHA256SUMS.txt)
# 先取完整清单再匹配：tar | grep -q 在 pipefail 下会因 grep 提前退出给 tar 发 SIGPIPE（141）。
archive_listing="$(tar -tzf "$ASSET_DIR/$SOURCE_ARCHIVE")"
grep -Fq "ffmpeg-8.1.2.tar.xz" <<<"$archive_listing"
grep -Fq "LICENSE.GPLv3" <<<"$archive_listing"

echo "Verified release assets for ASRbox $VERSION."
