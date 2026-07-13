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
|-- LICENSE.GPLv3
|-- SOURCE.md
|-- checksums.sha256
`-- README.md
```

When replacing binaries:

1. Download both `ffmpeg` and `ffprobe` for the same platform and source.
2. Verify `ffmpeg -version` and `ffprobe -version` work locally.
3. Confirm both files are executable.
4. Update the version, source, URL, and review date in this file.
5. Update `checksums.sha256` and `SOURCE.md`.
6. Run `npm run verify:third-party`.
7. Run `npm run build:desktop` and confirm the binaries and compliance files are bundled under `ASRbox.app/Contents/Resources/binaries/ffmpeg/`.

This build enables GPLv3 components. Keep the license and corresponding source
materials updated when replacing binaries. See `SOURCE.md` and
`THIRD_PARTY_NOTICES.md`.
