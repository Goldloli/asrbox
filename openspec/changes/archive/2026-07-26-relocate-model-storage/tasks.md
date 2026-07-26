## 1. Storage Configuration Foundation

- [x] 1.1 Add focused backend tests for default-root compatibility, atomic persisted configuration, side-effect-free unavailable-path inspection, symlink rejection, allowlisted Docker roots, and removable/network filesystem metadata.
- [x] 1.2 Implement the versioned model-storage configuration and central resolver for the unified `models/` and provider-specific `cache/` layout without creating directories during reads.
- [x] 1.3 Add stable storage availability states and reason codes, candidate write validation, disk-capacity inspection, and startup recovery for interrupted relocation metadata.

## 2. Model and Cache Integration

- [x] 2.1 Update model inventory, compatibility, download, delete, cleanup, benchmark, and local-execution paths to use the resolver and fail with `MODEL_STORAGE_UNAVAILABLE` before writes when necessary.
- [x] 2.2 Route Hugging Face, ModelScope, Torch, XDG, pyannote, and other maintained model-cache consumers through resolved cache paths using explicit library arguments or runtime setters plus bootstrap environment compatibility.
- [x] 2.3 Add cache inventory for ASRbox-owned paths and separately identified default global shared caches with sizes, ownership warnings, and explicit opt-in state.
- [x] 2.4 Verify that online-provider transcription remains usable while local model storage is unavailable and that reconnection restores model inventory without resetting the path.

## 3. Typed Storage and Relocation API

- [x] 3.1 Extend backend response/request models and `GET /models/storage` with configured root, availability, reason, writability, layout, per-cache usage, capacity, platform actions, and Docker allowed roots.
- [x] 3.2 Add typed relocation-plan responses covering canonical target, model validation, incomplete entries, shared caches, conflicts, required bytes, free bytes, warnings, acknowledgements, and active-work blockers.
- [x] 3.3 Add one-at-a-time relocation job start, status/progress, and cancellation endpoints with stable phases and terminal error/cleanup states.
- [x] 3.4 Retain `/models/migrate` compatibility while removing destructive overwrite behavior and applying source-preserving verification safeguards.
- [x] 3.5 Regenerate or align the typed React client and extend backend contract tests for every maintained field, enum, route, and error code.

## 4. Transactional Move and Adoption

- [x] 4.1 Add failure-injection tests for conflict detection, insufficient space, copy errors, hash mismatch, cancellation, interrupted jobs, configuration-switch failure, target-readiness failure, and old-root cleanup failure.
- [x] 4.2 Implement relocation staging with byte progress, cooperative cancellation, streamed verification, no-overwrite target finalization, and transaction-owned staging cleanup.
- [x] 4.3 Implement atomic root activation, cache refresh, readiness verification, rollback to the intact source on activation failure, and source deletion only after successful activation.
- [x] 4.4 Implement adopt mode with per-model validation, valid-model reuse, incomplete-model reporting, no source mutation, and atomic root activation.
- [x] 4.5 Block relocation during downloads, local transcriptions, benchmarks, loaded-model use, or other model mutations, and block new local work while relocation is active.

## 5. Settings Experience and Desktop Capabilities

- [x] 5.1 Build the Settings > Storage and diagnostics model-storage section with full root path, availability message, model/cache usage, free space, refresh, migration warnings, and cleanup-required states.
- [x] 5.2 Add the desktop native folder-selection and file-manager reveal actions through the existing capability boundary, including unavailable-path and cancellation handling.
- [x] 5.3 Add Docker Web mount-point selection and copy-container-path behavior without exposing native picker or host file-manager claims.
- [x] 5.4 Add move-versus-adopt confirmation, target validation results, shared-global-cache opt-in warning, conflict/blocker display, progress, and safe cancellation controls.
- [x] 5.5 Add Chinese and English translations and ensure model pages consistently distinguish storage unavailable from not downloaded.

## 6. Docker Configuration and Documentation

- [x] 6.1 Add clear commented Compose examples for an optional host bind mount, its container mount point, model-storage allowed roots, ownership/permissions, and the default persistent `/data` behavior.
- [x] 6.2 Update `README.md`, `README.en.md`, `docs/docker.md`, and `docs/docker.en.md` with desktop and Docker path selection, unified layout, container-versus-host paths, cache handling, migration space, missing mounts, rollback, and manual duplicate cleanup.
- [x] 6.3 Update affected privacy and troubleshooting guidance without claiming network-filesystem guarantees or browser access to the Docker host filesystem.

## 7. Verification

- [x] 7.1 Run focused backend storage/model tests, `npm run test:backend`, and `npm run test:backend:contract`.
- [x] 7.2 Run `npm run typecheck`, `npm run build:web`, and focused Playwright coverage for desktop-capability and Docker Web storage flows at desktop and mobile widths.
- [x] 7.3 Run Cargo format/check/tests and a desktop launch check for native picker, file-manager reveal, migration progress, and external-volume disconnect/reconnect behavior.
- [x] 7.4 Run Docker Compose validation and Docker smoke coverage with default `/data`, an allowed bind mount, an absent mount, persistence across recreation, and cache placement assertions.
- [x] 7.5 Run `npm run check:open-source`, review the final diff against declared scope/non-goals, and record any environment-limited checks or residual risks.

## Verification Notes

- `npm run dev:desktop` compiled and launched the native application. The macOS folder-picker and file-manager system dialogs were not clicked by automation; their registered Tauri commands, capability boundary, Cargo checks, and shared UI states were verified.
- A physical external disk was not unplugged during the run. Unavailable/reconnected behavior was covered by backend tests, focused Playwright scenarios, and Docker smoke tests that removed and restored the configured bind mount.
