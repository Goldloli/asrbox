# ASRbox Open-Source MVP Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver ten focused hardening iterations that make the existing macOS Apple Silicon MVP suitable for a public beta.

**Architecture:** Preserve the current React/FastAPI/Tauri layout. Add strict request validation and bounded streaming at the FastAPI boundary, a process-scoped token shared by Tauri and the sidecar, and release checks around the existing build rather than introducing new services.

**Tech Stack:** Python 3.13, pytest, FastAPI, React 18, TypeScript, Vite, Playwright, Rust, Tauri 2, GitHub Actions.

---

### Task 1: Strict transcription selection

**Files:** `backend/routes/transcriptions.py`, `backend/services/tasks.py`, `backend/services/transcribe.py`, `backend/tests/test_api.py`

- [ ] Add API tests asserting unsupported `backend`, missing local model, unknown local model, missing provider, and disabled provider return 422 and create no task.
- [ ] Run each test and confirm it fails because the route currently accepts the request.
- [ ] Add one route-level validation helper returning a validated backend/model/provider tuple.
- [ ] Remove `transcribe_placeholder` and replace unreachable task fallbacks with explicit errors.
- [ ] Run the targeted tests and the full backend suite.
- [ ] Commit as `fix: reject invalid transcription selections`.

### Task 2: Loopback API token

**Files:** `backend/app.py`, `backend/tests/test_api_auth.py`, `app/src/lib/api.ts`, `app/src/lib/desktopCapabilities.ts`, `tauri/src-tauri/src/main.rs`

- [ ] Add tests proving configured tokens reject missing/wrong bearer values, accept the correct value, and leave `/health` public.
- [ ] Run the tests and confirm the protected request currently succeeds.
- [ ] Add minimal ASGI middleware that reads `ASRBOX_API_TOKEN` once per request and uses constant-time comparison.
- [ ] Generate a token in the Tauri process, pass it to the sidecar, and return it with the server connection payload.
- [ ] Store the token in memory only and attach it to frontend API requests.
- [ ] Run backend tests, TypeScript checks, Cargo tests, and commit as `feat: protect the loopback api`.

### Task 3: Browser and desktop boundary

**Files:** `backend/app.py`, `backend/tests/test_api_auth.py`, `tauri/src-tauri/tauri.conf.json`, `tauri/src-tauri/capabilities/default.json`

- [ ] Add a CORS test proving `Origin: null` is not allowed and known development origins still work.
- [ ] Run it and confirm the opaque origin currently receives an allow-origin header.
- [ ] Remove the opaque origin, define an explicit CSP, and replace broad filesystem permissions with the permissions used by current commands.
- [ ] Run backend, TypeScript, and Cargo checks; commit as `security: tighten desktop boundaries`.

### Task 4: Upload resource limits

**Files:** `backend/routes/transcriptions.py`, `backend/services/uploads.py`, `backend/tests/test_upload_limits.py`

- [ ] Add tests for an oversized single upload, excessive batch count, excessive batch total, partial-file cleanup, and a valid streamed upload.
- [ ] Run tests and confirm limit cases currently succeed.
- [ ] Add a focused streaming helper with 4 MiB chunks, 20 GiB single-file limit, 32-file batch limit, and 40 GiB batch-total limit.
- [ ] Use the helper for preflight, transcription, batch transcription, and provider test uploads.
- [ ] Run targeted and full backend tests; commit as `feat: bound media uploads`.

### Task 5: Frontend dependency audit

**Files:** `app/package.json`, `web/package.json`, `bun.lock`, `package.json`, `.github/workflows/ci.yml`

- [ ] Run `bun audit` and save the current advisory set in the iteration notes.
- [ ] Upgrade Vite and its React/Tailwind adapters to patched compatible releases.
- [ ] Add `audit:dependencies` and run it in CI.
- [ ] Run install, audit, typecheck, and Web build; commit as `build: update audited frontend tooling`.

### Task 6: Reproducible Python dependencies

**Files:** `requirements.in`, `requirements-dev.in`, `requirements-build.in`, `requirements.txt`, `docs/ci.md`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`

- [ ] Record direct runtime requirements separately from test and packaging tools.
- [ ] Generate an exact Python 3.13 lock with `pip freeze`-compatible pins, retaining the required Transformers commit.
- [ ] Make CI install runtime plus dev requirements and release install runtime plus build requirements.
- [ ] Build a clean temporary virtual environment and import the backend.
- [ ] Commit as `build: make python environments reproducible`.

### Task 7: FFmpeg distribution compliance

**Files:** `third_party/ffmpeg/LICENSE.GPLv3`, `third_party/ffmpeg/SOURCE.md`, `third_party/ffmpeg/checksums.sha256`, `THIRD_PARTY_NOTICES.md`, `scripts/verify-third-party.sh`, `tauri/src-tauri/tauri.conf.json`

- [ ] Capture checksums and the complete build configuration from both bundled binaries.
- [ ] Add the GPLv3 license and a source/build offer that identifies the exact corresponding FFmpeg source release.
- [ ] Add a verifier for executable bits, checksums, version parity, license, and source metadata.
- [ ] Bundle the compliance files as Tauri resources and run the verifier.
- [ ] Commit as `docs: complete ffmpeg distribution notices`.

### Task 8: Release gates

**Files:** `.github/workflows/release.yml`, `scripts/check-versions.mjs`, `scripts/verify-release-assets.sh`, `package.json`

- [ ] Add a version checker covering root, app, web, Tauri package, Cargo, Tauri config, backend version, and release tag.
- [ ] Confirm it fails on a temporary mismatched fixture and passes on the repository.
- [ ] Run backend tests, Cargo tests, dependency audit, third-party verification, binary smoke, and version checks before packaging.
- [ ] Verify DMG name, non-zero size, SHA256 file format, and bundled compliance files.
- [ ] Commit as `ci: enforce release gates`.

### Task 9: Honest public-beta documentation

**Files:** `README.md`, `README.en.md`, `docs/privacy.md`, `docs/release.md`, `docs/troubleshooting.md`, `CHANGELOG.md`, `backend/MATURITY_REPORT.md`

- [ ] Mark the product as an Apple Silicon public beta and document unsigned-app friction without presenting it as a stable release.
- [ ] Explain plaintext provider credential storage, backup implications, remote provider data flow, full uninstall, and data deletion.
- [ ] Update test counts and release instructions to match automated gates.
- [ ] Run link/path checks and commit as `docs: prepare public beta guidance`.

### Task 10: Critical-path smoke and readiness command

**Files:** `playwright.config.ts`, `app/e2e/public-beta-smoke.spec.ts`, `scripts/check-open-source-readiness.sh`, `package.json`, `docs/release.md`

- [ ] Add a Playwright smoke test that loads the built Web UI with a controlled backend, confirms navigation, health state, transcription entry, model page, provider page, tasks page, and settings page.
- [ ] Run it once against the old readiness command and confirm the command/test entry is missing.
- [ ] Add `test:e2e:smoke` and `check:open-source` scripts composing the audited automated gates.
- [ ] Run the smoke test and readiness command; commit as `test: add public beta release smoke`.

### Final Verification and Delivery

**Files:** all files changed by Tasks 1-10

- [ ] Run `npm run check:open-source` and inspect every exit code.
- [ ] Build/start the desktop app and use Computer Use to verify startup, backend health, navigation, and transcription UI.
- [ ] Review `git diff main...HEAD`, scan tracked files and reachable history for secrets, and confirm the worktree is clean.
- [ ] Push `codex/open-source-mvp-hardening` to `origin` and report the branch and verification evidence.
