# Release Process

ASRbox currently publishes macOS Apple Silicon and Windows x64 desktop releases and supports source-built Linux CPU Docker deployment. It does not publish a container image. Native Linux desktop packages, Intel macOS, Windows arm64, code signing, notarization, automatic installation, and built-in public-hosting security are not part of `0.1.9`. The desktop app can check GitHub Releases and download a verified installer (DMG on macOS, NSIS executable on Windows), but the user must quit and replace the application manually.

Current release: [`v0.2.1`](https://github.com/Goldloli/asrbox/releases/tag/v0.2.1). The Apple Silicon DMG and the Windows x64 NSIS installer are available from the Release assets and are not bundled with model weights.

## Version Sources

These values must match:

- Root, app, Web, and Tauri `package.json` manifests.
- `backend/__init__.py`.
- `tauri/src-tauri/Cargo.toml` and `tauri/src-tauri/tauri.conf.json`.
- `Dockerfile`, `compose.yaml`, and `.env.example` defaults.
- App/Web/Tauri workspace entries in `bun.lock` and the ASRbox package entry in `Cargo.lock`.
- Current-version and Release references in both README files and this guide.
- `docs/releases/v<version>.md`, including the matching tag, DMG filename, and NSIS installer filename.

`npm run check:versions` enforces the list above, including `CHANGELOG.md` section and link-reference consistency for the current version. Use Semantic Versioning prerelease tags such as `v0.1.0-beta.1`. A tag containing `-` becomes a GitHub prerelease.

Run `npm run version:bump -- <X.Y.Z>` to update every version source, the README/release-guide anchors, and the `CHANGELOG.md` links in one step; it also promotes the `[Unreleased]` changelog section, creates a `docs/releases/v<X.Y.Z>.md` skeleton when missing, regenerates the Bun/Cargo lock entries when the toolchains are available, and reruns `check:versions` to prove consistency.

## Before Tagging

1. Run `npm run version:bump -- <version>`: it rewrites the package/runtime version sources, the README and release-guide anchors, and the `CHANGELOG.md` links, promotes the `[Unreleased]` changelog section, regenerates the Bun/Cargo lock entries when `bun`/`cargo` are available, and creates the release-notes skeleton. Then fill in the new version's `CHANGELOG.md` section content.
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
8. Confirm the release commit has passed the GitHub `CI` workflow on `main`; then confirm local `main` is clean, pushed, and matches `origin/main`.

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

Keep the notes useful to a downloader: supported platforms, direct DMG/NSIS/checksum links, installation warnings, highlights, verification evidence, known limitations, data location, and the full comparison link.

## Create the Release

For version `0.1.0-beta.1`:

```bash
git tag -a v0.1.0-beta.1 -m "ASRbox v0.1.0-beta.1"
git push origin v0.1.0-beta.1
```

Alternatively, run the Release workflow manually and enter `v0.1.0-beta.1`. Manual dispatch still requires the tag text to match the source version.

Merging `main` alone does not create a release. Do not tag until the intended commit is on GitHub and all gates are green.

## Workflow Output

The Release workflow builds the macOS DMG, Windows NSIS installer, and optional CUDA kit in parallel jobs. Those jobs upload assets only. After collecting every platform asset, the publish job generates the one final `SHA256SUMS.txt` in a deterministic order, verifies the full asset set, and publishes:

```text
ASRbox_0.1.0-beta.1_aarch64.dmg
ASRbox_0.1.0-beta.1_x64-setup.exe
ASRbox-ffmpeg-source-8.1.2.tar.gz
SHA256SUMS.txt
```

Every checksum filename must be the exact GitHub Release asset basename, with no `./`, directory, or absolute-path prefix. The release gate validates this format before hashing the files because the maintained desktop updater deliberately resolves the platform installer by exact basename. This keeps each new Release downloadable and verifiable by the previous maintained client instead of relying on platform-specific checksum output conventions.

The installers contain the Tauri app, frozen FastAPI sidecar, and ffmpeg/ffprobe. They do not contain ASR model weights.

The workflow also builds and smoke-tests `asrbox:local` from the tag. That image is verification evidence only and is not pushed to GHCR or attached to the GitHub Release. Publishing a container image requires a separate approved change, immutable tags/digests, architecture policy, and third-party package-license review.

Local build output is normally:

```text
tauri/src-tauri/target/release/bundle/macos/ASRbox.app
tauri/src-tauri/target/release/bundle/dmg/ASRbox_0.1.0-beta.1_aarch64.dmg
tauri/src-tauri/target/release/bundle/nsis/ASRbox_0.1.0-beta.1_x64-setup.exe
```

Local Docker packaging is the tagged image in the Docker engine:

```bash
docker compose build
docker image inspect asrbox:local
npm run test:docker
```

## Post-Build Verification

Before publishing or immediately after downloading the Release assets:

1. Confirm every `SHA256SUMS.txt` entry uses an exact Release asset basename, then verify it against the DMG, the NSIS installer, the FFmpeg source archive, and any CUDA kit assets.
2. Run `hdiutil verify` on the DMG (macOS).
3. Copy the app to a clean location and confirm the expected unsigned-app warning (Gatekeeper on macOS, SmartScreen on Windows).
4. Launch with no manually running backend and wait for backend health.
5. Confirm runtime diagnostics find bundled ffmpeg and ffprobe.
6. Preflight a real MP4.
7. Download a small model, exercise pause/resume/stop/retry, and complete a transcription.
8. Export TXT, SRT, VTT, ASS, JSON, and Markdown.
9. Quit and confirm the backend releases port `17494`.
10. From Settings → About, verify stable/prerelease selection, manual checking, the update-notification controls, and the expected new-version/no-update/error states.
11. For a release newer than the test build, download the installer in-app, verify progress/cancel/retry, confirm the final file matches `SHA256SUMS.txt`, and confirm “Open installer” and “Open file location” target the verified file.
12. Build the Docker image and verify health, persistence, same-origin routing, token handling, and mobile-width rendering.

## Release Page Notes

Release notes must state:

- Desktop platforms: macOS Apple Silicon and Windows x64.
- Prerelease status.
- Unsigned package (unnotarized on macOS, no Authenticode signature on Windows).
- Checksum verification instructions.
- In-app checking and download are optional conveniences; replacement remains manual and the Web build only links to Releases.
- Models download separately and can require substantial disk and memory.
- Data persists after deleting the app.
- Known security/privacy limitations, especially plaintext provider keys.
- Docker is Linux CPU only, excludes MLX, binds to loopback by default, and is not a public-Internet gateway.

## Rollback

Do not move or overwrite an existing tag. If an artifact is wrong, mark the Release as affected, remove unsafe assets if necessary, fix the source, increment the prerelease version, and publish a new tag.
