# Continuous Integration

ASRbox uses separate GitHub Actions workflows for pull-request/main checks and release packaging.

## CI Workflow

`.github/workflows/ci.yml` runs for pushes and pull requests targeting `main`. macOS validates the desktop/source stack; Windows validates the backend suite; Ubuntu validates the Docker build and deployment path.

It performs:

1. Frozen Bun dependency installation.
2. Application-version consistency checks.
3. Release-tool unit tests.
4. Network dependency vulnerability audit.
5. Locked backend development dependency installation.
6. TypeScript typecheck.
7. Maintained frontend unit tests through `test:frontend:unit`.
8. Production Web build.
9. Bundled ffmpeg/ffprobe checksum, GPL configuration, license, and source-record verification.
10. Backend test suite, excluding the separately invoked frozen-binary smoke test.
11. Tauri `cargo check --locked` and `cargo test --locked`.
12. The complete maintained Playwright suite through `test:e2e:maintained`, including public-beta, LLM proofreading, About/update, model-storage/download, and persisted transcript-editing scenarios.

The Ubuntu Docker job:

1. Builds `asrbox:local` with Buildx and GitHub Actions layer caching.
2. Starts Compose with a temporary project and named volume.
3. Verifies health, SPA root/deep links, API metadata, token-protected APIs, and missing MLX runtime.
4. Creates persisted state, removes/recreates the container, and confirms the state remains.
5. Runs Playwright against the container at desktop and mobile widths and confirms same-origin requests and session-only token storage.

CI uses the vendored Apple Silicon ffmpeg and ffprobe paths for backend tests. It does not download large ASR models or run private real-media fixtures.

The Windows job (`backend-windows`) runs the backend test suite against the vendored Windows ffmpeg/ffprobe on `windows-latest` (fetched at job start by `scripts/fetch-ffmpeg-windows.sh` — the executables exceed GitHub's 100MB file limit and are not committed), keeping the Windows desktop target regression-covered without duplicating the frontend and e2e gates. Windows jobs use `PYTHON_VERSION_WINDOWS` (3.14 — 3.11/3.13 on Windows exhibit asyncio proactor disconnect poisoning that hangs requests after a cancelled stream; macOS stays on `PYTHON_VERSION` 3.13) and install the dedicated `requirements-windows.lock` snapshot (the runtime lock is a macOS Apple Silicon snapshot whose `editdistance` transitive dependency has no Windows wheel for Python 3.13+); the Release `windows-x64` job adds `requirements-build-windows.lock` for PyInstaller.

## Local Repository Gate

Run the closest local equivalent before merge:

```bash
npm run check:open-source
```

The script runs frozen Bun installation, Python package health and compilation, version/release checks, third-party verification, TypeScript, maintained frontend unit tests, Web build, backend tests, Cargo, and the complete maintained browser suite.

The network dependency audit is intentionally separate locally:

```bash
npm run audit:dependencies
```

CI and Release always run that audit.

## Focused Checks

```bash
npm run typecheck
npm run build:web
npm run test:frontend:unit
npm run test:backend
npm run test:backend:contract
npm run test:backend:server
npm run test:release-tools
npm run test:e2e:smoke
npm run test:e2e:llm
npm run test:e2e:maintained
npm run test:docker
bunx playwright test app/e2e/models-download-controls.spec.ts
cd tauri/src-tauri && cargo check --locked && cargo test --locked
```

Focused browser commands remain useful during iteration, but a maintained user-flow spec is not release-covered until it is included by `test:e2e:maintained`. Real-model, long-audio, benchmark, provider, and frozen-binary suites have dedicated package scripts. Real-model runs require predownloaded models and legally supplied media and are not a default pull-request gate.

## Release Workflow

`.github/workflows/release.yml` runs for a pushed `v*` tag or a manual workflow dispatch. The tag must exactly match the application version after the leading `v` is removed.

In addition to the CI-class checks, Release:

- Installs build-lock dependencies.
- Freezes and packages the backend sidecar.
- Builds the macOS Apple Silicon DMG and, in a parallel `windows-x64` job, the Windows NSIS installer.
- Builds the optional Windows CUDA acceleration kit in a parallel `cuda-kit` job: installs the pinned cu128 torch tree from `requirements-windows-cuda.lock` via `scripts/build-cuda-kit.py`, replays the install path with `--verify-parts` (concat the byte-range parts, check the zip hash, extract, per-file SHA-256), and uploads the parts plus `cuda-kit-manifest.json`. The kit lock must keep the same torch base version as `requirements-windows.lock`; `check-versions.mjs` rejects drift.
- Smoke-tests the frozen backend on both platforms.
- Creates the FFmpeg source archive required by the bundled GPL builds.
- Merges both platform asset sets and the CUDA kit checksums, regenerates a combined `SHA256SUMS.txt`, and validates the full asset set in a final publish job.
- Publishes the DMG, NSIS installer, CUDA kit parts and manifest, FFmpeg source archive, and checksums to GitHub Releases.

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
