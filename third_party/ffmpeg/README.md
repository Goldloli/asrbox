# FFmpeg vendor binaries

ASRbox desktop bundles `ffmpeg` and `ffprobe` so local media preflight and audio extraction work without requiring a system install.

Current macOS arm64 binaries:

- Source: Martin Riedl's FFmpeg Build Server
- Download URLs:
  - `https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffmpeg.zip`
  - `https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/ffprobe.zip`
- Version checked during vendoring: `8.1.2-https://www.martin-riedl.de`
- Last reviewed: 2026-07-08

Expected layout:

```text
third_party/ffmpeg/
|-- darwin-arm64/
|   |-- ffmpeg
|   `-- ffprobe
`-- README.md
```

When replacing binaries:

1. Download both `ffmpeg` and `ffprobe` for the same platform and source.
2. Verify `ffmpeg -version` and `ffprobe -version` work locally.
3. Confirm both files are executable.
4. Update the version, source, URL, and review date in this file.
5. Run `npm run build:desktop` and confirm the binaries are bundled under `ASRbox.app/Contents/Resources/binaries/ffmpeg/`.

FFmpeg licensing depends on the build configuration. Keep this file updated when replacing binaries, and verify redistribution requirements before public release. See `THIRD_PARTY_NOTICES.md` for the project-level notice.
