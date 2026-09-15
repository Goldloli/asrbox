## MODIFIED Requirements

### Requirement: Verifiable release artifacts
Published desktop releases SHALL provide the expected application artifact for each maintained desktop target (macOS Apple Silicon DMG and Windows x64 NSIS installer), checksums covering every published artifact, and required bundled-FFmpeg source and licensing materials for each bundled platform binary; any future published container image SHALL provide immutable version identification and applicable distribution-package licensing information; and version tags SHALL match application version sources. After all platform artifacts have been collected, the release workflow SHALL generate one final `SHA256SUMS.txt`; every filename in that manifest SHALL be a release-root basename without absolute or relative directory components, and release verification SHALL prove that the maintained desktop updater contract can resolve exactly one checksum for each installer asset. An optional runtime acceleration kit distributed alongside a release SHALL be published as separate, clearly named assets (or an equivalently pinned trusted repository) whose file manifest and per-file SHA-256 hashes are fixed by the release metadata and covered by the published checksums, so the desktop backend can verify the kit without trusting the transport.

#### Scenario: Release artifacts are published
- **WHEN** a version tag produces a GitHub Release
- **THEN** users can verify artifact integrity and obtain the required third-party source and licensing materials for each published target

#### Scenario: macOS installer is published
- **WHEN** a version tag produces a GitHub Release containing the macOS Apple Silicon DMG
- **THEN** the DMG filename contains the application version, its SHA-256 digest is recorded under the exact DMG basename in `SHA256SUMS.txt`, and release verification confirms the desktop updater resolves that entry

#### Scenario: Windows installer is published
- **WHEN** a version tag produces a GitHub Release containing the Windows x64 NSIS installer
- **THEN** the installer filename contains the application version, its SHA-256 digest is recorded under the exact installer basename in `SHA256SUMS.txt`, release verification confirms the desktop updater resolves that entry, and the FFmpeg source and licensing materials cover the bundled Windows ffmpeg and ffprobe binaries

#### Scenario: Checksum manifest contains a path component
- **WHEN** a generated `SHA256SUMS.txt` names any published asset with `./`, another relative directory, parent traversal, or an absolute path
- **THEN** release asset verification fails before publication

#### Scenario: A maintained client downloads the next release
- **WHEN** a maintained macOS or Windows client checks a newer compatible Release for the same platform
- **THEN** the client can discover the expected installer, resolve its exact-basename checksum from the final `SHA256SUMS.txt`, download the installer, and complete SHA-256 verification

#### Scenario: Acceleration kit assets are published
- **WHEN** a release publishes an optional CUDA acceleration kit
- **THEN** the kit assets and their manifest appear in the release with per-file hashes pinned under their exact basenames in `SHA256SUMS.txt`, and release-asset verification asserts their presence
