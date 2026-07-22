## ADDED Requirements

### Requirement: Local application data boundary
Desktop user media, extracted audio, transcripts, settings, model files, exports, backups, diagnostics, and the SQLite database SHALL be stored under documented user-controlled application data or export locations rather than inside the source repository or application bundle.

#### Scenario: Desktop task produces data
- **WHEN** the desktop application imports media or creates task artifacts
- **THEN** those artifacts are written to documented application data locations outside the repository and packaged application

### Requirement: Local and online processing distinction
The product SHALL distinguish local model processing from online provider processing and SHALL NOT describe online provider data as remaining exclusively on the user's device.

#### Scenario: User reviews privacy behavior
- **WHEN** the user consults product privacy information
- **THEN** local processing, third-party transfer, credential persistence, backups, diagnostics, deletion, and uninstall behavior are described accurately

### Requirement: Safe backup and restore
Backups and restores SHALL preserve supported application state, validate manifests and paths, reject unsafe archive traversal or incompatible input, and document that locally stored credentials may be included.

#### Scenario: Invalid backup is restored
- **WHEN** a backup is missing required metadata, is incompatible, or contains unsafe paths
- **THEN** restore is rejected without writing files outside the permitted data boundary

### Requirement: Sensitive data exclusion
Private media, transcripts, credentials, model weights, local databases, backups, and unredacted diagnostics SHALL be excluded from source control, routine logs, test output, and release artifacts unless an explicitly licensed and sanitized fixture is approved.

#### Scenario: Repository verification runs
- **WHEN** tests, diagnostics, or release packaging complete
- **THEN** real user content and secrets are not added to tracked output or published artifacts
