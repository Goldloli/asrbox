## MODIFIED Requirements

### Requirement: Local application data boundary
Desktop user media, extracted audio, transcripts, settings, model files, exports, backups, diagnostics, and the SQLite database SHALL be stored under documented user-controlled application data, export, or explicitly selected model-storage locations rather than inside the source repository or application bundle.

#### Scenario: Desktop task produces data
- **WHEN** the desktop application imports media or creates task artifacts
- **THEN** those artifacts are written to documented application data locations outside the repository and packaged application

#### Scenario: User selects separate model storage
- **WHEN** a user relocates model weights and framework caches to an eligible root
- **THEN** non-model application data remains under the stable application data directory while model data remains within the documented selected root

## ADDED Requirements

### Requirement: Recoverable model-storage relocation
Model-storage relocation SHALL preserve the configured source and its original data until a verified target is active, SHALL isolate temporary writes, and SHALL provide a recoverable outcome for failure, cancellation, interruption, or post-switch cleanup failure.

#### Scenario: Relocation terminates before target activation
- **WHEN** relocation fails, is cancelled, or is interrupted before the target root becomes active
- **THEN** the original root remains configured and intact and only transaction-owned staging data is eligible for cleanup

#### Scenario: Duplicate source remains after successful activation
- **WHEN** old-root deletion fails after a verified target becomes active
- **THEN** ASRbox identifies both paths and requires explicit cleanup rather than automatically deleting either verified copy
