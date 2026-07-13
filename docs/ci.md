# Continuous Integration

ASRbox uses two GitHub Actions workflows.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

It verifies:

- Frozen frontend dependency installation and vulnerability audit.
- Application-version consistency and release-tool unit tests.
- Frontend and Web UI TypeScript typecheck.
- Web UI production build.
- Vendored FFmpeg checksums, GPL configuration, license, and source record.
- Backend test suite, excluding binary smoke tests.
- Tauri Rust `cargo check`.
- Tauri Rust `cargo test`.
- Browser smoke coverage for backend health and the core Web UI routes.

The CI workflow intentionally does not build the desktop DMG. Full desktop packaging is slower and belongs to release validation.

## Release

`.github/workflows/release.yml` runs when a `v*` tag is pushed or when manually triggered from GitHub Actions.

It requires a safe SemVer tag that exactly matches the application version, runs the CI gates, smoke-tests the frozen backend, validates release assets, creates a GitHub Release, and uploads:

- `ASRbox_*.dmg`
- `ASRbox-ffmpeg-source-8.1.2.tar.gz`
- `SHA256SUMS.txt`

## Recommended Branch Protection

Before making the repository public, configure GitHub branch protection for `main`:

- Require pull request reviews before merging.
- Require the `CI` workflow to pass.
- Require branches to be up to date before merging.
- Restrict force pushes.

Release tags should be created only after `CHANGELOG.md` has been updated and the current `main` branch is green.
