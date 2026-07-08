# Continuous Integration

ASRbox uses two GitHub Actions workflows.

## CI

`.github/workflows/ci.yml` runs on pushes and pull requests targeting `main`.

It verifies:

- Frontend and Web UI TypeScript typecheck.
- Web UI production build.
- Backend test suite, excluding binary smoke tests.
- Tauri Rust `cargo check`.
- Tauri Rust `cargo test`.

The CI workflow intentionally does not build the desktop DMG. Full desktop packaging is slower and belongs to release validation.

## Release

`.github/workflows/release.yml` runs when a `v*` tag is pushed or when manually triggered from GitHub Actions.

It verifies the vendored macOS ffmpeg binaries, builds the backend sidecar, builds the Tauri desktop DMG, creates a GitHub Release, and uploads:

- `ASRbox_*.dmg`
- `SHA256SUMS.txt`

## Recommended Branch Protection

Before making the repository public, configure GitHub branch protection for `main`:

- Require pull request reviews before merging.
- Require the `CI` workflow to pass.
- Require branches to be up to date before merging.
- Restrict force pushes.

Release tags should be created only after `CHANGELOG.md` has been updated and the current `main` branch is green.
