## ADDED Requirements

### Requirement: Container storage lifecycle
Container application state SHALL reside under the persistent `/data` mount, SHALL survive ordinary container recreation, and SHALL be removed only when the operator explicitly deletes the associated volume or bind-mounted data.

#### Scenario: Compose service is removed without volumes
- **WHEN** an operator runs the documented stop or removal command without requesting volume deletion
- **THEN** the database, media, transcripts, settings, exports, caches, and downloaded models remain available for the next container

#### Scenario: Container data is backed up
- **WHEN** an operator archives or migrates the `/data` volume
- **THEN** the documentation treats the backup as sensitive because it can contain user media, transcripts, diagnostics, and locally stored provider credentials
