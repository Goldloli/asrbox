# Release Process

ASRbox publishes macOS Apple Silicon DMG builds through GitHub Releases.

## Release Types

- Public beta: `v0.1.0-beta.1`
- Patch release: `v0.1.1`
- Minor release: `v0.2.0`

Tags containing `-` are marked as prereleases by the Release workflow.

## Checklist

Before tagging:

```bash
npm run typecheck
npm run build:web
npm run test:backend
npm run audit:dependencies
npm run check:versions
npm run test:release-tools
npm run verify:third-party
npm run test:e2e:smoke
cd tauri/src-tauri && cargo check && cargo test
```

Then:

1. Update `CHANGELOG.md`.
2. Confirm `THIRD_PARTY_NOTICES.md` is current.
3. Confirm `third_party/ffmpeg/SOURCE.md` and checksums match the bundled binaries.
4. Confirm no test media, model weights, caches, `.venv`, or `node_modules` are staged.
5. Commit and push `main`.
6. Create and push a tag.

```bash
git tag v0.1.0-beta.1
git push origin main --tags
```

## GitHub Actions

The `Release` workflow will:

- Install Bun, Python, and Rust.
- Install frontend and backend dependencies.
- Verify dependency audit, version/tag consistency, vendored ffmpeg/ffprobe, and GPL source records.
- Run backend, Rust, and browser smoke tests.
- Build the Web UI.
- Freeze the backend sidecar.
- Smoke-test the frozen backend.
- Build the Tauri DMG.
- Generate and verify release checksums.
- Upload `ASRbox_*.dmg`, `ASRbox-ffmpeg-source-8.1.2.tar.gz`, and `SHA256SUMS.txt`.

## After Release

- Open the GitHub Release page.
- Confirm DMG and checksum assets are present.
- Confirm the FFmpeg source archive is present.
- Download the DMG and smoke test app launch.
- Confirm `/health` works after desktop launch.
- Confirm ffmpeg is available in runtime diagnostics.
- Confirm a simple media file can be preflighted and exported.

## Known MVP Limitation

Current macOS builds are not signed or notarized. Users may see macOS security warnings until signing and notarization are added.
