# FFmpeg source and build information

ASRbox currently distributes the macOS Apple Silicon `ffmpeg` and `ffprobe`
binaries in this directory. They report version `8.1.2` and were published by
Martin Riedl's FFmpeg Build Server on 2026-07-02.

## Exact binary build

- Build detail: https://ffmpeg.martin-riedl.de/info/detail/macos/arm64/1783011502_8.1.2
- Build-script commit: `bb1d6db29cee948f9685bcd69e6caf17d960662b`
- Build-script source: https://git.martin-riedl.de/ffmpeg/build-script/archive/bb1d6db29cee948f9685bcd69e6caf17d960662b.tar.gz
- Build-script SHA-256: `b4bcb3aa69bb16304a5b69c62837ec01c167909136afe477df452e8c178e0d5f`
- FFmpeg source: https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz
- FFmpeg source SHA-256: `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`

The build reports `--enable-gpl` and `--enable-version3`; therefore the bundled
programs are distributed under GPLv3. The complete license text is in
`LICENSE.GPLv3`. The build script records the versions and download locations
of the statically linked codec and support-library sources.

## Release source materials

Run `scripts/prepare-ffmpeg-source.sh <output-directory>` to download and verify
the exact FFmpeg source and build-script archives, then produce
`ASRbox-ffmpeg-source-8.1.2.tar.gz`. Every binary GitHub release must publish
that archive next to the DMG.

If an upstream archive becomes unavailable, do not publish a binary release.
First vendor the corresponding source archive in a durable release location and
update this document and the preparation script.
