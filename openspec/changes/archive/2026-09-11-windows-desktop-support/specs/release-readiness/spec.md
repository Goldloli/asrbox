# release-readiness Delta（windows-desktop-support）

## MODIFIED Requirements

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
Published desktop releases SHALL provide the expected application artifact for each maintained desktop target (macOS Apple Silicon DMG and Windows x64 NSIS installer), checksums covering every published artifact, and required bundled-FFmpeg source and licensing materials for each bundled platform binary; any future published container image SHALL provide immutable version identification and applicable distribution-package licensing information; and version tags SHALL match application version sources.

#### Scenario: Release artifacts are published
- **WHEN** a version tag produces a GitHub Release
- **THEN** users can verify artifact integrity and obtain the required third-party source and licensing materials for each published target

#### Scenario: Windows installer is published
- **WHEN** a version tag produces a GitHub Release containing the Windows x64 NSIS installer
- **THEN** the installer filename contains the application version, its SHA-256 digest appears in the published `SHA256SUMS.txt`, and the FFmpeg source and licensing materials cover the bundled Windows ffmpeg and ffprobe binaries
