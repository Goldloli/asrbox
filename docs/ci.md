# Continuous Integration

ASRbox uses separate GitHub Actions workflows for pull-request/main checks and release packaging.

## CI Workflow

`.github/workflows/ci.yml` runs for pushes and pull requests targeting `main`. macOS validates the desktop/source stack; Ubuntu validates the Docker build and deployment path.

It performs:

1. Frozen Bun dependency installation.
2. Application-version consistency checks.
3. Release-tool unit tests.
4. Network dependency vulnerability audit.
5. Locked backend development dependency installation.
6. TypeScript typecheck.
7. Production Web build.
8. Bundled ffmpeg/ffprobe checksum, GPL configuration, license, and source-record verification.
9. Backend test suite, excluding the separately invoked frozen-binary smoke test.
10. Tauri `cargo check --locked` and `cargo test --locked`.
11. Playwright public-beta browser smoke test.
12. AI LLM provider and subtitle-proofreading browser regression tests.

The Ubuntu Docker job:

1. Builds `asrbox:local` with Buildx and GitHub Actions layer caching.
2. Starts Compose with a temporary project and named volume.
3. Verifies health, SPA root/deep links, API metadata, token-protected APIs, and missing MLX runtime.
4. Creates persisted state, removes/recreates the container, and confirms the state remains.
5. Runs Playwright against the container at desktop and mobile widths and confirms same-origin requests and session-only token storage.

CI uses the vendored Apple Silicon ffmpeg and ffprobe paths for backend tests. It does not download large ASR models or run private real-media fixtures.

## Local Repository Gate

Run the closest local equivalent before merge:

```bash
npm run check:open-source
```

The script runs frozen Bun installation, Python package health and compilation, version/release checks, third-party verification, TypeScript, Web build, backend tests, Cargo, browser smoke coverage, and the AI LLM browser regression suite.

The network dependency audit is intentionally separate locally:

```bash
npm run audit:dependencies
```

CI and Release always run that audit.

## Focused Checks

```bash
npm run typecheck
npm run build:web
npm run test:backend
npm run test:backend:contract
npm run test:backend:server
npm run test:e2e:smoke
npm run test:e2e:llm
npm run test:docker
bunx playwright test app/e2e/models-download-controls.spec.ts
cd tauri/src-tauri && cargo check --locked && cargo test --locked
```

Real-model, long-audio, benchmark, provider, and frozen-binary suites have dedicated package scripts. Real-model runs require predownloaded models and legally supplied media and are not a default pull-request gate.

## Release Workflow

`.github/workflows/release.yml` runs for a pushed `v*` tag or a manual workflow dispatch. The tag must exactly match the application version after the leading `v` is removed.

In addition to the CI-class checks, Release:

- Installs build-lock dependencies.
- Freezes and packages the backend sidecar.
- Builds the macOS Apple Silicon DMG.
- Smoke-tests the frozen backend.
- Creates the FFmpeg source archive required by the bundled GPL build.
- Generates and validates `SHA256SUMS.txt`.
- Publishes the DMG, FFmpeg source archive, and checksums to GitHub Releases.

Release also rebuilds and smoke-tests the Docker deployment, but the current workflow does not publish an image to a registry. Docker users build the tagged source locally.

Tags containing `-` are published as prereleases.

## Branch Protection

Recommended `main` protection:

- Require pull requests for normal contributions.
- Require the `CI` workflow to pass.
- Require branches to be up to date before merge.
- Restrict force pushes and branch deletion.
- Limit release-tag creation to maintainers.

The maintainer can perform an explicitly requested, locally verified direct merge, but `main` should still be green after the push.
