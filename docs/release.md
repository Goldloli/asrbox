# Release Process

ASRbox currently publishes macOS Apple Silicon desktop prereleases and supports source-built Linux CPU Docker deployment. It does not publish a container image. Native Windows/Linux desktop packages, Intel macOS, code signing, notarization, automatic updates, and built-in public-hosting security are not part of `0.1.3`.

Current release: [`v0.1.3`](https://github.com/Goldloli/asrbox/releases/tag/v0.1.3). The Apple Silicon DMG is available from the Release assets and is not bundled with model weights.

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
2. Create `docs/releases/<tag>.md`, for example `docs/releases/v0.1.0-beta.2.md`. Start from the previous version, then update the GIF URL, downloads, highlights, verification, limitations, and changelog comparison.
3. Confirm `THIRD_PARTY_NOTICES.md` is current.
4. Verify `third_party/ffmpeg/SOURCE.md`, licenses, configuration, and checksums.
5. Confirm no media, transcripts, model weights, caches, app data, `.venv`, `.env*`, `node_modules`, build output, or credentials are staged.
6. Run:

```bash
npm run check:open-source
npm run audit:dependencies
npm run test:docker
```

7. For model-runtime changes, record the real models and media characteristics tested. Do not publish private filenames or content.
8. Confirm `main` is clean, pushed, and matches `origin/main`.

## Release Notes

The Release workflow requires a versioned Markdown file at:

```text
docs/releases/<tag>.md
```

`softprops/action-gh-release` publishes that file as the GitHub Release body. The workflow fails before building if the file is missing, so every version must have deliberate notes instead of only an automatically generated changelog.

Use an absolute, tag-pinned raw GitHub URL for screenshots or GIFs so the media remains tied to the released source:

```markdown
![ASRbox demo](https://raw.githubusercontent.com/Goldloli/asrbox/<tag>/assets/asrbox-demo.gif)
```

Keep the notes useful to a downloader: supported platform, direct DMG/checksum links, installation warning, highlights, verification evidence, known limitations, data location, and the full comparison link.

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

The workflow also builds and smoke-tests `asrbox:local` from the tag. That image is verification evidence only and is not pushed to GHCR or attached to the GitHub Release. Publishing a container image requires a separate approved change, immutable tags/digests, architecture policy, and third-party package-license review.

Local build output is normally:

```text
tauri/src-tauri/target/release/bundle/macos/ASRbox.app
tauri/src-tauri/target/release/bundle/dmg/ASRbox_0.1.0-beta.1_aarch64.dmg
```

Local Docker packaging is the tagged image in the Docker engine:

```bash
docker compose build
docker image inspect asrbox:local
npm run test:docker
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
10. Build the Docker image and verify health, persistence, same-origin routing, token handling, and mobile-width rendering.

## Release Page Notes

Release notes must state:

- macOS Apple Silicon only.
- Prerelease status.
- Unsigned and unnotarized package.
- Checksum verification instructions.
- Models download separately and can require substantial disk and memory.
- Data persists after deleting the app.
- Known security/privacy limitations, especially plaintext provider keys.
- Docker is Linux CPU only, excludes MLX, binds to loopback by default, and is not a public-Internet gateway.

## Rollback

Do not move or overwrite an existing tag. If an artifact is wrong, mark the Release as affected, remove unsafe assets if necessary, fix the source, increment the prerelease version, and publish a new tag.
