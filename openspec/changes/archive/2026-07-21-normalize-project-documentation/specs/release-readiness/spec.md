## ADDED Requirements

### Requirement: Honest public-beta positioning
Until a future approved change expands support, packaged ASRbox releases SHALL identify macOS Apple Silicon as the maintained desktop target and SHALL disclose missing signing, notarization, automatic updates, Windows, Linux, and Intel Mac support.

#### Scenario: Public beta is described
- **WHEN** a README, release note, download page, or package describes the current release
- **THEN** it does not claim stable, signed, notarized, automatically updating, or cross-platform support

### Requirement: Release verification gate
A release SHALL pass version consistency, locked dependency installation, vulnerability audit, TypeScript and Web build checks, backend and contract tests, Cargo checks and tests, browser smoke coverage, third-party verification, frozen-backend smoke, and release-asset verification applicable to the target.

#### Scenario: Required release check fails
- **WHEN** an applicable release gate does not pass
- **THEN** the release workflow does not publish the affected artifacts as a verified release

### Requirement: Verifiable release artifacts
Published desktop releases SHALL provide the expected application artifact, checksums, and required bundled-FFmpeg source and licensing materials, and version tags SHALL match application version sources.

#### Scenario: Release artifacts are published
- **WHEN** a version tag produces a GitHub Release
- **THEN** users can verify artifact integrity and obtain the required third-party source materials

### Requirement: Evidence separated from promise
Real-model matrices, test counts, timings, screenshots, and manual verification results SHALL be recorded as dated evidence and SHALL NOT be presented as universal guarantees for every machine, media file, or upstream model revision.

#### Scenario: Real-model result is documented
- **WHEN** a maintainer publishes a successful local model run
- **THEN** the environment and evidence date are identifiable and the result is not treated as a permanent compatibility guarantee
