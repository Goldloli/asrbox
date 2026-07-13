#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM="$(rustc --print host-tuple 2>/dev/null || echo unknown)"

cd "$ROOT"

case "$PLATFORM" in
  aarch64-apple-darwin)
    FFMPEG_VENDOR="third_party/ffmpeg/darwin-arm64"
    FFMPEG_NAME="ffmpeg"
    FFPROBE_NAME="ffprobe"
    ;;
  x86_64-pc-windows-msvc|x86_64-pc-windows-gnu)
    FFMPEG_VENDOR="third_party/ffmpeg/win32-x64"
    FFMPEG_NAME="ffmpeg.exe"
    FFPROBE_NAME="ffprobe.exe"
    ;;
  *)
    FFMPEG_VENDOR=""
    FFMPEG_NAME="ffmpeg"
    FFPROBE_NAME="ffprobe"
    ;;
esac

if ! .venv/bin/python -c "import PyInstaller" 2>/dev/null; then
  echo "PyInstaller is missing. Install build dependencies with: .venv/bin/pip install -r requirements-build.lock" >&2
  exit 1
fi

.venv/bin/python backend/build_binary.py

mkdir -p tauri/src-tauri/binaries

rm -rf tauri/src-tauri/binaries/ffmpeg
mkdir -p tauri/src-tauri/binaries/ffmpeg
touch tauri/src-tauri/binaries/ffmpeg/.gitkeep
if [ -n "$FFMPEG_VENDOR" ]; then
  if [ ! -x "$FFMPEG_VENDOR/$FFMPEG_NAME" ] || [ ! -x "$FFMPEG_VENDOR/$FFPROBE_NAME" ]; then
    echo "ffmpeg vendor binaries are missing or not executable in $FFMPEG_VENDOR" >&2
    exit 1
  fi
  "$FFMPEG_VENDOR/$FFMPEG_NAME" -version >/dev/null
  "$FFMPEG_VENDOR/$FFPROBE_NAME" -version >/dev/null
  cp "$FFMPEG_VENDOR/$FFMPEG_NAME" tauri/src-tauri/binaries/ffmpeg/$FFMPEG_NAME
  cp "$FFMPEG_VENDOR/$FFPROBE_NAME" tauri/src-tauri/binaries/ffmpeg/$FFPROBE_NAME
  cp third_party/ffmpeg/LICENSE.GPLv3 tauri/src-tauri/binaries/ffmpeg/
  cp third_party/ffmpeg/SOURCE.md tauri/src-tauri/binaries/ffmpeg/
  cp third_party/ffmpeg/README.md tauri/src-tauri/binaries/ffmpeg/
  cp third_party/ffmpeg/checksums.sha256 tauri/src-tauri/binaries/ffmpeg/
  chmod +x tauri/src-tauri/binaries/ffmpeg/$FFMPEG_NAME tauri/src-tauri/binaries/ffmpeg/$FFPROBE_NAME
else
  echo "No vendored ffmpeg configured for ${PLATFORM}; desktop media tools will fall back to PATH." >&2
fi

rm -rf tauri/src-tauri/binaries/asrbox-server

if [ -d dist/asrbox-server ]; then
  cp -R dist/asrbox-server tauri/src-tauri/binaries/asrbox-server
  touch tauri/src-tauri/binaries/asrbox-server/.gitkeep
  if [ -f tauri/src-tauri/binaries/asrbox-server/asrbox-server ]; then
    chmod +x tauri/src-tauri/binaries/asrbox-server/asrbox-server
  elif [ -f tauri/src-tauri/binaries/asrbox-server/asrbox-server.exe ]; then
    chmod +x tauri/src-tauri/binaries/asrbox-server/asrbox-server.exe
  fi
elif [ -f dist/asrbox-server ]; then
  mkdir -p tauri/src-tauri/binaries/asrbox-server
  cp dist/asrbox-server tauri/src-tauri/binaries/asrbox-server/asrbox-server
  touch tauri/src-tauri/binaries/asrbox-server/.gitkeep
  chmod +x tauri/src-tauri/binaries/asrbox-server/asrbox-server
elif [ -f dist/asrbox-server.exe ]; then
  mkdir -p tauri/src-tauri/binaries/asrbox-server
  cp dist/asrbox-server.exe tauri/src-tauri/binaries/asrbox-server/asrbox-server.exe
  touch tauri/src-tauri/binaries/asrbox-server/.gitkeep
  chmod +x tauri/src-tauri/binaries/asrbox-server/asrbox-server.exe
else
  echo "asrbox-server binary not found in dist/" >&2
  exit 1
fi

echo "Built asrbox-server onedir resource for ${PLATFORM}"
