# FFmpeg vendor binaries

ASRbox desktop bundles `ffmpeg` and `ffprobe` so local media preflight and audio extraction work without requiring a system install.

Current macOS arm64 binaries:

- Source: Martin Riedl's FFmpeg Build Server
- Download URLs:
  - `https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip`
  - `https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffprobe.zip`
- Version checked during vendoring: `8.1.2-https://www.martin-riedl.de`

FFmpeg licensing depends on the build configuration. Keep this file updated when replacing binaries, and verify redistribution requirements before public release.
