# release-readiness delta（windows-cuda-installer）

## MODIFIED Requirements

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
