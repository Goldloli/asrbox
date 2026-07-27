## MODIFIED Requirements

### Requirement: Safe backup and restore

Backups and restores SHALL preserve supported application state, validate manifests and paths, reject unsafe archive traversal or incompatible input, and document that locally stored credentials may be included. Creating a backup of the active SQLite database SHALL use SQLite's online backup mechanism to archive a transactionally consistent snapshot rather than copying the live database file while writes may be in progress; temporary snapshots SHALL be removed after success or failure.

#### Scenario: Invalid backup is restored

- **WHEN** a backup is missing required metadata, is incompatible, or contains unsafe paths
- **THEN** restore is rejected without writing files outside the permitted data boundary

#### Scenario: Backup overlaps a database write

- **WHEN** a backup is created while another database connection commits application state
- **THEN** the archived `asrbox.db` is a valid SQLite snapshot whose integrity check passes and whose rows represent a consistent transaction boundary
