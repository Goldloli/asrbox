# release-readiness Specification

## Purpose
规定发布就绪标准：诚实的公开 beta 定位、发布验证门禁、可校验的发布产物、证据与承诺分离，以及有界的冷启动验证。

## Requirements

### Requirement: Honest public-beta positioning
Packaged ASRbox releases SHALL identify macOS Apple Silicon and Windows x64 as the maintained desktop targets, SHALL identify Docker as a Linux CPU Web deployment path, and SHALL disclose missing signing, notarization, automatic updates, native Linux desktop support, Intel Mac support, and built-in Internet-facing access control.

#### Scenario: Public beta is described
- **WHEN** a README, release note, download page, desktop package, or container guide describes the current release
- **THEN** it does not claim stable, signed, notarized, automatically updating, universally model-compatible, securely public-hosted, or native Linux desktop support

#### Scenario: Windows desktop package is described
- **WHEN** a README, release note, or download page describes the Windows desktop package
- **THEN** it identifies Windows x64 as the target and discloses that the installer is unsigned and may trigger SmartScreen

### Requirement: Release verification gate

A release SHALL pass version consistency across application package manifests, corresponding Bun and Cargo lock entries, backend, Tauri, Dockerfile defaults, Compose defaults, `.env.example`, maintained README release references, the current release guide, and a version-matched release-note file; locked dependency installation; vulnerability audit; TypeScript and Web build checks; maintained frontend unit tests; backend and contract tests on both macOS and Windows CI runners; Cargo checks and tests; the complete maintained browser suite; third-party verification covering every bundled platform binary; frozen-backend smoke; Docker build and runtime smoke; and release-asset verification applicable to each published target. Maintained frontend unit and browser specs SHALL have explicit runnable commands, and CI and release workflows SHALL invoke those maintained commands rather than duplicating a partial file list.

#### Scenario: Required release check fails

- **WHEN** an applicable release gate, version source, lock entry, current release document, maintained frontend unit test, or maintained browser scenario does not pass
- **THEN** the release workflow does not publish the affected artifacts as a verified release

#### Scenario: Release version is prepared

- **WHEN** a maintainer prepares a version for tagging
- **THEN** package manifests, generated lock entries, runtime surfaces, current README and release-guide references, and `docs/releases/<tag>.md` all identify that same version

#### Scenario: Windows release gate fails

- **WHEN** the Windows backend test run or the Windows installer build or asset verification fails for a release tag
- **THEN** the release workflow does not publish the Windows installer as a verified release artifact

### Requirement: Verifiable release artifacts
Published desktop releases SHALL provide the expected application artifact for each maintained desktop target (macOS Apple Silicon DMG and Windows x64 NSIS installer), checksums covering every published artifact, and required bundled-FFmpeg source and licensing materials for each bundled platform binary; any future published container image SHALL provide immutable version identification and applicable distribution-package licensing information; and version tags SHALL match application version sources. An optional runtime acceleration kit distributed alongside a release SHALL be published as separate, clearly named assets (or an equivalently pinned trusted repository) whose file manifest and per-file SHA-256 hashes are fixed by the release metadata and covered by the published checksums, so the desktop backend can verify the kit without trusting the transport.

#### Scenario: Release artifacts are published
- **WHEN** a version tag produces a GitHub Release
- **THEN** users can verify artifact integrity and obtain the required third-party source and licensing materials for each published target

#### Scenario: Windows installer is published
- **WHEN** a version tag produces a GitHub Release containing the Windows x64 NSIS installer
- **THEN** the installer filename contains the application version, its SHA-256 digest appears in the published `SHA256SUMS.txt`, and the FFmpeg source and licensing materials cover the bundled Windows ffmpeg and ffprobe binaries

#### Scenario: Acceleration kit assets are published
- **WHEN** a release publishes an optional CUDA acceleration kit
- **THEN** the kit assets and their manifest appear in the release with per-file hashes pinned in `SHA256SUMS.txt`, and release-asset verification asserts their presence

### Requirement: Evidence separated from promise
Real-model matrices, test counts, timings, screenshots, and manual verification results SHALL be recorded as dated evidence and SHALL NOT be presented as universal guarantees for every machine, media file, or upstream model revision.

#### Scenario: Real-model result is documented
- **WHEN** a maintainer publishes a successful local model run
- **THEN** the environment and evidence date are identifiable and the result is not treated as a permanent compatibility guarantee

### Requirement: Bounded cold-start verification
Backend process startup tests SHALL allow a documented bounded cold-start budget on maintained CI runners while still failing on early process exit, startup timeout, or incorrect recovery state.

#### Scenario: Hosted runner imports dependencies slowly
- **WHEN** a healthy backend starts within the maintained cold-start budget
- **THEN** recovery assertions run instead of failing at an unrealistically short timing threshold
