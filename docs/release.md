# Release Process

ASRbox currently publishes macOS Apple Silicon prereleases. Windows, Linux, Intel macOS, code signing, notarization, and automatic updates are not part of `0.1.0-beta.1`.

Current release: [`v0.1.0-beta.1`](https://github.com/Goldloli/asrbox/releases/tag/v0.1.0-beta.1). The Apple Silicon DMG is available from the Release assets and is not bundled with model weights.

## Version Sources

These values must match:

- `package.json`
- `app/package.json`
- `backend/__init__.py`
- `tauri/src-tauri/Cargo.toml`
- `tauri/src-tauri/tauri.conf.json`
- User-visible app version where checked by `scripts/check-versions.mjs`

Use Semantic Versioning prerelease tags such as `v0.1.0-beta.1`. A tag containing `-` becomes a GitHub prerelease.

## Before Tagging

1. Update `CHANGELOG.md` and both README files.
2. Confirm `THIRD_PARTY_NOTICES.md` is current.
3. Verify `third_party/ffmpeg/SOURCE.md`, licenses, configuration, and checksums.
4. Confirm no media, transcripts, model weights, caches, app data, `.venv`, `node_modules`, build output, or credentials are staged.
5. Run:

```bash
npm run check:open-source
npm run audit:dependencies
```

6. For model-runtime changes, record the real models and media characteristics tested. Do not publish private filenames or content.
7. Confirm `main` is clean, pushed, and matches `origin/main`.

## Create the Release

For version `0.1.0-beta.1`:

```bash
git tag -a v0.1.0-beta.1 -m "ASRbox v0.1.0-beta.1"
git push origin v0.1.0-beta.1
```

Alternatively, run the Release workflow manually and enter `v0.1.0-beta.1`. Manual dispatch still requires the tag text to match the source version.

Merging `main` alone does not create a release. Do not tag until the intended commit is on GitHub and all gates are green.

## Workflow Output

The Release workflow builds and publishes:

```text
ASRbox_0.1.0-beta.1_aarch64.dmg
ASRbox-ffmpeg-source-8.1.2.tar.gz
SHA256SUMS.txt
```

The DMG contains the Tauri app, frozen FastAPI sidecar, and ffmpeg/ffprobe. It does not contain ASR model weights.

Local build output is normally:

```text
tauri/src-tauri/target/release/bundle/macos/ASRbox.app
tauri/src-tauri/target/release/bundle/dmg/ASRbox_0.1.0-beta.1_aarch64.dmg
```

## Post-Build Verification

Before publishing or immediately after downloading the Release assets:

1. Verify `SHA256SUMS.txt` against the DMG and FFmpeg source archive.
2. Run `hdiutil verify` on the DMG.
3. Copy the app to a clean location and confirm the expected unsigned-app warning.
4. Launch with no manually running backend and wait for backend health.
5. Confirm runtime diagnostics find bundled ffmpeg and ffprobe.
6. Preflight a real MP4.
7. Download a small model, exercise pause/resume/stop/retry, and complete a transcription.
8. Export TXT, SRT, VTT, ASS, JSON, and Markdown.
9. Quit and confirm the backend releases port `17494`.

## Release Page Notes

Release notes must state:

- macOS Apple Silicon only.
- Prerelease status.
- Unsigned and unnotarized package.
- Checksum verification instructions.
- Models download separately and can require substantial disk and memory.
- Data persists after deleting the app.
- Known security/privacy limitations, especially plaintext provider keys.

## Rollback

Do not move or overwrite an existing tag. If an artifact is wrong, mark the Release as affected, remove unsafe assets if necessary, fix the source, increment the prerelease version, and publish a new tag.
