# FFmpeg source and build information

ASRbox distributes `ffmpeg` and `ffprobe` binaries for the maintained desktop
targets in this directory: macOS Apple Silicon (`darwin-arm64/`) and Windows
x64 (`win32-x64/`). Both builds report FFmpeg version `8.1.2` and are licensed
under GPLv3.

## macOS Apple Silicon build (`darwin-arm64/`)

Published by Martin Riedl's FFmpeg Build Server on 2026-07-02.

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

## Windows x64 build (`win32-x64/`)

Published as the `ffmpeg-8.1.2-full_build` package by gyan.dev
(https://www.gyan.dev/ffmpeg/builds/). All gyan.dev builds are 64-bit, static,
and licensed as GPLv3.

The two executables exceed GitHub's 100MB file size limit, so they are **not
committed to git**. `scripts/fetch-ffmpeg-windows.sh` downloads the pinned
archive below, verifies the archive SHA-256, extracts `bin/ffmpeg.exe` and
`bin/ffprobe.exe` into `win32-x64/`, and re-verifies both against
`checksums.sha256`. CI and release Windows jobs run it before validation;
`scripts/build-server.sh` invokes it automatically when the files are missing.

- Downloaded archive: https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-full_build.7z
- Archive SHA-256: `0fff188997a499b5382e0f66e845d4556c48c54f0113ebed4853d556dbdd7059`
- Build scripts: https://github.com/GyanD/codexffmpeg, commit `46465995c991fe65c5de853fa79bddec09cd6c37`
- Build-script source: https://codeload.github.com/GyanD/codexffmpeg/tar.gz/46465995c991fe65c5de853fa79bddec09cd6c37
- Build-script SHA-256: `4ed599c5155d4b25906c26ca2ae10b4e300307cf4749b1e33a9be0d285e7e7fc`
- FFmpeg source: https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz
- FFmpeg source SHA-256: `464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c`

The build reports `--enable-gpl` and `--enable-version3`; therefore the bundled
programs are distributed under GPLv3. The complete license text is in
`LICENSE.GPLv3`.

## Release source materials

Run `scripts/prepare-ffmpeg-source.sh <output-directory>` to download and verify
the exact FFmpeg source and both platforms' build-script archives, then produce
`ASRbox-ffmpeg-source-8.1.2.tar.gz`. Every binary GitHub release must publish
that archive next to the desktop installers.

If an upstream archive becomes unavailable, do not publish a binary release.
First vendor the corresponding source archive in a durable release location and
update this document and the preparation script.
