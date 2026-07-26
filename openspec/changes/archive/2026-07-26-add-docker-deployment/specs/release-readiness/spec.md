## MODIFIED Requirements

### Requirement: Honest public-beta positioning
Until a future approved change expands support, packaged ASRbox releases SHALL identify macOS Apple Silicon as the maintained desktop target, SHALL identify Docker as a Linux CPU Web deployment path, and SHALL disclose missing signing, notarization, automatic updates, native Windows/Linux desktop support, Intel Mac support, and built-in Internet-facing access control.

#### Scenario: Public beta is described
- **WHEN** a README, release note, download page, desktop package, or container guide describes the current release
- **THEN** it does not claim stable, signed, notarized, automatically updating, universally model-compatible, securely public-hosted, or native cross-platform desktop support

### Requirement: Release verification gate
A release SHALL pass version consistency, locked dependency installation, vulnerability audit, TypeScript and Web build checks, backend and contract tests, Cargo checks and tests, browser smoke coverage, third-party verification, frozen-backend smoke, Docker build and runtime smoke, and release-asset verification applicable to the target.

#### Scenario: Required release check fails
- **WHEN** an applicable release gate does not pass
- **THEN** the release workflow does not publish the affected artifacts as a verified release

### Requirement: Verifiable release artifacts
Published desktop releases SHALL provide the expected application artifact, checksums, and required bundled-FFmpeg source and licensing materials; any future published container image SHALL provide immutable version identification and applicable distribution-package licensing information; and version tags SHALL match application version sources.

#### Scenario: Release artifacts are published
- **WHEN** a version tag produces a GitHub Release
- **THEN** users can verify artifact integrity and obtain the required third-party source and licensing materials for each published target
